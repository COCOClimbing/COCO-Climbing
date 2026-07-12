# Activity Feed Query Batching Design

## Problem

`loadFeed` in `app/friends.tsx` builds the Activity feed by fetching each
followed friend's recent climbs/sessions separately, and separately again
for each session tagged with the current user:

- **Followed-friends loop** (`app/friends.tsx:1066-1154`): for every
  followed friend, `Promise.all([getFriendRecentClimbs(f.id, days),
  getFriendRecentSessions(f.id, days)])` — 2 queries per friend. Inside
  that, each session with partners fires its own
  `profiles.select(...).in('id', partnerIds)` query.
- **Tagged-sessions loop** (`app/friends.tsx:1007-1063`): for every session
  the user was tagged in, a separate `climbs.select('*').eq('session_id',
  s.id)` query, plus (again) a per-session partner-profile query.

A user following 200 people triggers 400-600+ round-trips to open the feed.
This was flagged during the pre-launch safety audit's performance pass —
the DB indexes already shipped
(`supabase_prelaunch_perf_indexes.sql`) speed up each individual query, but
don't address the round-trip count itself.

## Goal

Cut the query count from O(friends + tagged sessions) to a fixed handful,
regardless of how many people the user follows, without changing the
feed's output or any of the existing per-session grouping/photo/dedup
logic.

## Non-goals

- No RLS/policy changes. `climbs`/`sessions` RLS checks are evaluated
  per-row against the row's own `user_id`, so switching from `.eq('user_id',
  friendId)` to `.in('user_id', friendIds)` is filtered identically —
  each row is still checked against the requesting user's friendship with
  *that row's* owner.
- No change to `getFriendRecentClimbs`, `getFriendRecentSessions`, or
  `getFriendSessionSummaries` — they're used elsewhere (on-demand "view
  climbs" fetch, friend profile view) and stay as-is.
- No change to the feed's visual output, sort order, or dedup behavior.
- No change to `daysLoaded`/pagination (shipped earlier) — batching applies
  within whatever window is currently being fetched.

## Design

### New batched fetch functions (`utils/friendsApi.ts`)

Two new exports, siblings of the existing single-friend versions:

```ts
export async function getFriendsRecentClimbsBatch(friendIds: string[], daysBack: number): Promise<any[]> {
  if (friendIds.length === 0) return [];
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];
  const { data } = await supabase
    .from('climbs')
    .select('*')
    .in('user_id', friendIds)
    .gte('date', cutoff)
    .order('date', { ascending: false });
  return data ?? [];
}

export async function getFriendsRecentSessionsBatch(friendIds: string[], daysBack: number): Promise<any[]> {
  if (friendIds.length === 0) return [];
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];
  const { data } = await supabase
    .from('sessions')
    .select('id, date, started_at, media_uris, media_types, friends, notes, title, location, user_id')
    .in('user_id', friendIds)
    .gte('date', cutoff)
    .not('ended_at', 'is', null);
  return data ?? [];
}
```

Note the sessions batch adds `user_id` to the select list (the single-friend
version doesn't need it since the caller already knows whose sessions they
are — the batched version does, to group results back per friend).

### Restructuring the followed-friends loop

Replace the `Promise.all(acceptedFiltered.map(async f => ...))` fan-out
with:

1. One call each to `getFriendsRecentClimbsBatch(acceptedFiltered.map(f =>
   f.id), days)` and `getFriendsRecentSessionsBatch(...)`.
2. Group the flat results into `Map<friendId, climb[]>` and
   `Map<friendId, session[]>` using `climb.user_id` / `session.user_id`.
3. Iterate `acceptedFiltered` synchronously (no longer `async`, no longer
   inside `Promise.all`) and for each friend, run the *existing*
   per-session grouping logic (lines 1073-1150 today) unchanged, reading
   from the two maps built in step 2 instead of from a fresh fetch.

### Restructuring the tagged-sessions loop

1. Collect all tagged session ids up front:
   `taggedSessions.map(({ session }) => session.id)`.
2. One batched query:
   `climbs.select('*').in('session_id', taggedSessionIds)`.
3. Group into `Map<sessionId, climb[]>`.
4. The existing per-tagged-session loop (lines 1008-1062) reads climbs from
   this map instead of firing `.eq('session_id', s.id)` per iteration.

### Batching partner-profile lookups

Today, both loops independently fire a `profiles.select('id, name,
avatar_url').in('id', partnerIds)` query per session, as soon as that
session is processed. Instead:

1. After building the friend-climbs/friend-sessions maps and the
   tagged-session-climbs map (but before the per-session grouping loops
   that build `summaries`), do one pass over every session about to be
   processed (all followed-friend sessions + all tagged sessions) and
   collect every partner id referenced in any session's `friends` array
   into one `Set<string>`.
2. One query: `profiles.select('id, name, avatar_url').in('id',
   [...allPartnerIds])` if the set is non-empty.
3. Build one `Map<id, profile>` and have both per-session loops read
   partner names/avatars from it instead of querying.

### Net query count

Before: `2 * followedFriends + (1 + ~1) * taggedSessions` (climbs, sessions,
one partner query per session with partners in both loops).

After: 2 (friends' climbs + sessions batch) + 1 (tagged-session climbs
batch) + 1 (all partner profiles) = **4 queries total**, regardless of
follow count or tagged-session count. (Plus the unrelated existing queries
for own sessions/climbs and `getFollowing`, which aren't part of this fix.)

## Testing

No test framework in this repo. Manual verification:

- Activity feed shows the same sessions, in the same order, with the same
  stats/photos/partners/notes as before the change, for an account
  following multiple people with mixed session data (some with partners,
  some without; some with photos; some tagged).
- An account following zero people still loads the feed without error
  (empty-array guard in the batch functions).
- An account with zero tagged sessions still loads without error.
- Own recent sessions and other feed sections (unaffected by this change)
  still render correctly.
- Compare network request count before/after in a debugger or Supabase
  logs for an account following 10+ people, to confirm the round-trip
  reduction actually happened.
