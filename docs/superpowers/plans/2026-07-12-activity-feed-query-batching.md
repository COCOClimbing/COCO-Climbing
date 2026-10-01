# Activity Feed Query Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the Activity feed's query count from O(followed friends + tagged sessions) round-trips down to a fixed ~5 queries total, without changing the feed's output, sort order, or dedup behavior.

**Architecture:** Add two new batched fetch functions to `utils/friendsApi.ts` (`getFriendsRecentClimbsBatch`, `getFriendsRecentSessionsBatch`) that use `.in('user_id', friendIds)` instead of firing one `.eq('user_id', friendId)` query per friend. Restructure `loadFeed` in `app/friends.tsx` to call these once for all followed friends, batch the tagged-sessions climb fetch into one `.in('session_id', ids)` query, and batch every session's partner-profile lookup into a single `.in('id', allPartnerIds)` query up front — then run the existing per-session grouping/photo/dedup logic unchanged, reading from in-memory maps instead of firing new queries.

**Tech Stack:** React Native / Expo, TypeScript, Supabase (PostgREST client).

---

### Task 1: Add batched fetch functions to `friendsApi.ts`

**Files:**
- Modify: `utils/friendsApi.ts`

- [ ] **Step 1: Add the two batched functions**

Find `getFriendRecentSessions` (ends at line 319, right before the `getTaggedSessions` comment):

```ts
// Get a friend's recent sessions from the last `daysBack` days (for media)
export async function getFriendRecentSessions(friendId: string, daysBack: number): Promise<any[]> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('sessions')
    .select('id, date, started_at, media_uris, media_types, friends, notes, title, location')
    .eq('user_id', friendId)
    .gte('date', cutoff)
    .not('ended_at', 'is', null);
  return data ?? [];
}

// Get ended sessions from the last `daysBack` days where userId was tagged, with the session owner's profile
export async function getTaggedSessions(userId: string, daysBack: number): Promise<{ session: any; profile: any }[]> {
```

Replace with (adds the two new functions between them):

```ts
// Get a friend's recent sessions from the last `daysBack` days (for media)
export async function getFriendRecentSessions(friendId: string, daysBack: number): Promise<any[]> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('sessions')
    .select('id, date, started_at, media_uris, media_types, friends, notes, title, location')
    .eq('user_id', friendId)
    .gte('date', cutoff)
    .not('ended_at', 'is', null);
  return data ?? [];
}

// Same as getFriendRecentClimbs, but for every friend id in one query instead of
// one query per friend. RLS still filters per-row against each row's own user_id,
// so this returns exactly the union of what N individual calls would have returned.
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

// Same as getFriendRecentSessions, but for every friend id in one query instead of
// one query per friend. Includes user_id (unlike getFriendRecentSessions) so callers
// can group the flat result back per friend.
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

// Get ended sessions from the last `daysBack` days where userId was tagged, with the session owner's profile
export async function getTaggedSessions(userId: string, daysBack: number): Promise<{ session: any; profile: any }[]> {
```

- [ ] **Step 2: Type-check**

Run `npx tsc --noEmit`. This is a self-contained addition — confirm no new errors anywhere (compare against the current baseline, which as of this plan is 25 total `error TS` lines across the repo, none in `utils/friendsApi.ts`).

- [ ] **Step 3: Commit**

```bash
git add utils/friendsApi.ts
git commit -m "Add batched friend climbs/sessions fetch functions"
```

---

### Task 2: Restructure `loadFeed` to use batched queries

**Files:**
- Modify: `app/friends.tsx`

- [ ] **Step 1: Import the two new functions**

Find (in the `../utils/friendsApi` import block):

```ts
  getFriendRecentClimbs,
  getFriendRecentSessions,
  getFriendAllClimbs,
```

Replace with:

```ts
  getFriendRecentClimbs,
  getFriendRecentSessions,
  getFriendsRecentClimbsBatch,
  getFriendsRecentSessionsBatch,
  getFriendAllClimbs,
```

`getFriendRecentClimbs`/`getFriendRecentSessions` stay imported and unchanged — they're still used by the on-demand "view climbs" fetch elsewhere in this file (search confirms call sites around lines 1352 and 1402), only `loadFeed` itself is being restructured.

- [ ] **Step 2: Replace the tagged-sessions loop and the followed-friends loop**

This is one large, contiguous replacement inside `loadFeed`. Find the block starting at the tagged-sessions comment and ending at the closing of the followed-friends `Promise.all` (this is everything between the "own recent sessions" block above it and the `summaries.sort(...)` call below it):

```ts
      // Add sessions where the current user was tagged (even if not following the poster)
      const taggedSessions = await getTaggedSessions(user.id, days);
      for (const { session: s, profile } of taggedSessions) {
        if (!profile || allExcluded.includes(s.user_id) || s.user_id === user.id) continue;
        const { data: sessionClimbs } = await supabase
          .from('climbs')
          .select('*')
          .eq('session_id', s.id);
        const climbs = sessionClimbs ?? [];
        if (climbs.length === 0) continue;
        const sends = climbs.filter((c: any) => c.outcome === 'send' || c.outcome === 'flash').length;
        const flashes = climbs.filter((c: any) => c.outcome === 'flash').length;
        const gradedClimbs = climbs.filter((c: any) => (c.outcome === 'send' || c.outcome === 'flash') && c.grade && c.grade_system);
        let hardestGrade: string | null = null;
        let hardestGradeSystem: string | null = null;
        if (gradedClimbs.length > 0) {
          gradedClimbs.sort((a: any, b: any) => getGradeDifficulty(b.grade, b.grade_system) - getGradeDifficulty(a.grade, a.grade_system));
          hardestGrade = gradedClimbs[0].grade;
          hardestGradeSystem = gradedClimbs[0].grade_system;
        }
        const sessionPhotos = [
          ...((s.media_uris ?? []) as string[]).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u)),
          ...climbs.flatMap((c: any) => (c.media_uris ?? (c.media_uri ? [c.media_uri] : [])) as string[]).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u)),
        ];
        const rawFriends: { id: string; name: string }[] = s.friends ?? [];
        const partnerIds = rawFriends.map((f: any) => f.id).filter((id: string) => id !== s.user_id);
        let partners: { id: string; name: string; avatar_url: string | null }[] | undefined;
        if (partnerIds.length > 0) {
          const { data: partnerProfiles } = await supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', partnerIds);
          const profileMap = new Map((partnerProfiles ?? []).map((p: any) => [p.id, p]));
          partners = rawFriends.map((f: any) => ({
            id: f.id,
            name: profileMap.get(f.id)?.name ?? f.name,
            avatar_url: profileMap.get(f.id)?.avatar_url ?? null,
          }));
        }
        summaries.push({
          friend: profile,
          sessionDate: normDate(s.date),
          sessionTime: s.started_at ?? undefined,
          climbCount: climbs.reduce((sum: number, c: any) => { if (c.type === 'hangboard' || c.type === 'lift') return sum; if (c.outcome === 'flash' || c.outcome === 'hang') return sum + 1; return sum + (c.attempts ?? 1); }, 0),
          sends,
          flashes,
          hardestGrade,
          hardestGradeSystem,
          environment: s.environment ?? 'indoor',
          climbType: climbs[0]?.type ?? undefined,
          sessionPhotos: sessionPhotos.length > 0 ? sessionPhotos : undefined,
          sessionId: s.id,
          partners,
          notes: s.notes ?? undefined,
          title: s.title ?? undefined,
          location: s.location ?? undefined,
        });
      }

      // Add friends' recent sessions
      await Promise.all(
        acceptedFiltered.map(async (f) => {
          try {
            const [climbs, friendSessions] = await Promise.all([
              getFriendRecentClimbs(f.id, days),
              getFriendRecentSessions(f.id, days),
            ]);
            const sessionMediaMap = new Map<string, string[]>(
              friendSessions.map((s: any) => [s.id, (s.media_uris ?? []).filter((u: string) => u.startsWith('http'))])
            );
            const sessionFriendsMap = new Map<string, any[]>(
              friendSessions.map((s: any) => [s.id, s.friends ?? []])
            );
            const sessionNotesMap = new Map<string, string>(
              friendSessions.filter((s: any) => s.notes).map((s: any) => [s.id, s.notes])
            );
            const sessionTitleMap = new Map<string, string>(
              friendSessions.filter((s: any) => s.title).map((s: any) => [s.id, s.title])
            );
            const sessionLocationMap = new Map<string, string>(
              friendSessions.filter((s: any) => s.location).map((s: any) => [s.id, s.location])
            );
            const sessionDateMap = new Map<string, string>(
              friendSessions.filter((s: any) => s.date).map((s: any) => [s.id, normDate(s.date)])
            );
            const sessionStartedAtMap = new Map<string, string>(
              friendSessions.filter((s: any) => s.started_at).map((s: any) => [s.id, s.started_at])
            );

            // friendSessions only contains sessions with ended_at set. Climbs whose
            // session_id isn't in that set belong to a session still in progress —
            // exclude them so open sessions don't leak into the activity feed.
            const endedSessionIds = new Set(friendSessions.map((s: any) => s.id));
            const eligibleClimbs = climbs.filter((c: any) => !c.session_id || endedSessionIds.has(c.session_id));
            if (eligibleClimbs.length === 0) return;

            // Build a date→sessionId lookup from the fetched sessions so climbs
            // that are missing session_id can still be bucketed into the right session.
            const sessionIdByDate = new Map<string, string>(
              friendSessions.map((s: any) => [normDate(s.date), s.id])
            );

            const sessionGroups = new Map<string, any[]>();
            for (const c of eligibleClimbs) {
              const key = c.session_id ?? sessionIdByDate.get(normDate(c.date)) ?? normDate(c.date);
              if (!sessionGroups.has(key)) sessionGroups.set(key, []);
              sessionGroups.get(key)!.push(c);
            }

            for (const sessionClimbs of sessionGroups.values()) {
              const sends = sessionClimbs.filter((c: any) => c.outcome === 'send' || c.outcome === 'flash').length;
              const flashes = sessionClimbs.filter((c: any) => c.outcome === 'flash').length;
              let hardestGrade: string | null = null;
              let hardestGradeSystem: string | null = null;
              let hardestClimb: any = sessionClimbs[0];
              const gradedClimbs = sessionClimbs.filter((c: any) => (c.outcome === 'send' || c.outcome === 'flash') && c.grade && c.grade_system);
              if (gradedClimbs.length > 0) {
                gradedClimbs.sort((a: any, b: any) => getGradeDifficulty(b.grade, b.grade_system) - getGradeDifficulty(a.grade, a.grade_system));
                hardestGrade = gradedClimbs[0].grade;
                hardestGradeSystem = gradedClimbs[0].grade_system;
                hardestClimb = gradedClimbs[0];
              }
              const friendSessionId = sessionClimbs[0]?.session_id ?? undefined;
              // Use the session record's date (local date when created) rather than the
              // first climb's UTC timestamp, which can cross a date boundary for users
              // in non-UTC timezones.
              const sessionDate = (friendSessionId ? sessionDateMap.get(friendSessionId) : undefined) ?? normDate(sessionClimbs[0].date);
              const environment = sessionClimbs[0]?.environment ?? 'indoor';
              const firstClimbTime = (friendSessionId ? sessionStartedAtMap.get(friendSessionId) : undefined) ?? sessionClimbs[0]?.date ?? undefined;
              const climbType = hardestClimb?.type ?? undefined;
              const climbPhotos = sessionClimbs.flatMap((c: any) => c.media_uris ?? (c.media_uri ? [c.media_uri] : [])).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u));
              const sessionLevelPhotos = (friendSessionId ? (sessionMediaMap.get(friendSessionId) ?? []) : []).filter((u: string) => !isDeadMediaUrl(u));
              const sessionPhotos = [...sessionLevelPhotos, ...climbPhotos];
              const rawFriends: { id: string; name: string }[] = friendSessionId ? (sessionFriendsMap.get(friendSessionId) ?? []) : [];
              const partnerIds = rawFriends.map((p: any) => p.id).filter((id: string) => id !== f.id);
              let partners: { id: string; name: string; avatar_url: string | null }[] | undefined;
              if (partnerIds.length > 0) {
                const { data: partnerProfiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', partnerIds);
                const profileMap = new Map((partnerProfiles ?? []).map((p: any) => [p.id, p]));
                partners = rawFriends.map((p: any) => ({ id: p.id, name: profileMap.get(p.id)?.name ?? p.name, avatar_url: profileMap.get(p.id)?.avatar_url ?? null }));
              }
              const sessionNotes = friendSessionId ? (sessionNotesMap.get(friendSessionId) ?? undefined) : undefined;
              const sessionTitle = friendSessionId ? (sessionTitleMap.get(friendSessionId) ?? undefined) : undefined;
              const sessionLocation = friendSessionId ? (sessionLocationMap.get(friendSessionId) ?? undefined) : undefined;
              summaries.push({ friend: f, sessionDate, sessionTime: firstClimbTime, climbCount: sessionClimbs.reduce((sum: number, c: any) => { if (c.type === 'hangboard' || c.type === 'lift') return sum; if (c.outcome === 'flash' || c.outcome === 'hang') return sum + 1; return sum + (c.attempts ?? 1); }, 0), sends, flashes, hardestGrade, hardestGradeSystem, environment, climbType, sessionPhotos: sessionPhotos.length > 0 ? sessionPhotos : undefined, sessionId: friendSessionId, partners, notes: sessionNotes, title: sessionTitle, location: sessionLocation });
            }
          } catch {}
        })
      );
```

Replace the entire block above with:

```ts
      // Add sessions where the current user was tagged (even if not following the poster)
      const taggedSessions = await getTaggedSessions(user.id, days);
      const validTagged = taggedSessions.filter(({ session: s, profile }) => profile && !allExcluded.includes(s.user_id) && s.user_id !== user.id);

      // Batch-fetch climbs for every valid tagged session in one query instead of one per session
      const taggedSessionIds = validTagged.map(({ session: s }) => s.id);
      const { data: taggedClimbsRaw } = taggedSessionIds.length > 0
        ? await supabase.from('climbs').select('*').in('session_id', taggedSessionIds)
        : { data: [] as any[] };
      const taggedClimbsMap = new Map<string, any[]>();
      (taggedClimbsRaw ?? []).forEach((c: any) => {
        if (!taggedClimbsMap.has(c.session_id)) taggedClimbsMap.set(c.session_id, []);
        taggedClimbsMap.get(c.session_id)!.push(c);
      });

      // Batch-fetch followed friends' climbs + sessions in one query each, instead of 2 per friend
      const followedIds = acceptedFiltered.map(f => f.id);
      const [friendsClimbsRaw, friendsSessionsRaw] = await Promise.all([
        getFriendsRecentClimbsBatch(followedIds, days),
        getFriendsRecentSessionsBatch(followedIds, days),
      ]);
      const climbsByFriend = new Map<string, any[]>();
      friendsClimbsRaw.forEach((c: any) => {
        if (!climbsByFriend.has(c.user_id)) climbsByFriend.set(c.user_id, []);
        climbsByFriend.get(c.user_id)!.push(c);
      });
      const sessionsByFriend = new Map<string, any[]>();
      friendsSessionsRaw.forEach((s: any) => {
        if (!sessionsByFriend.has(s.user_id)) sessionsByFriend.set(s.user_id, []);
        sessionsByFriend.get(s.user_id)!.push(s);
      });

      // Batch-fetch every partner profile referenced by any tagged session or any followed
      // friend's session in one query, instead of one query per session
      const allPartnerIds = new Set<string>();
      validTagged.forEach(({ session: s }) => {
        (s.friends ?? []).forEach((f: any) => allPartnerIds.add(f.id));
      });
      friendsSessionsRaw.forEach((s: any) => {
        (s.friends ?? []).forEach((f: any) => allPartnerIds.add(f.id));
      });
      let partnerProfileMap = new Map<string, any>();
      if (allPartnerIds.size > 0) {
        const { data: partnerProfiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', [...allPartnerIds]);
        partnerProfileMap = new Map((partnerProfiles ?? []).map((p: any) => [p.id, p]));
      }

      for (const { session: s, profile } of validTagged) {
        const climbs = taggedClimbsMap.get(s.id) ?? [];
        if (climbs.length === 0) continue;
        const sends = climbs.filter((c: any) => c.outcome === 'send' || c.outcome === 'flash').length;
        const flashes = climbs.filter((c: any) => c.outcome === 'flash').length;
        const gradedClimbs = climbs.filter((c: any) => (c.outcome === 'send' || c.outcome === 'flash') && c.grade && c.grade_system);
        let hardestGrade: string | null = null;
        let hardestGradeSystem: string | null = null;
        if (gradedClimbs.length > 0) {
          gradedClimbs.sort((a: any, b: any) => getGradeDifficulty(b.grade, b.grade_system) - getGradeDifficulty(a.grade, a.grade_system));
          hardestGrade = gradedClimbs[0].grade;
          hardestGradeSystem = gradedClimbs[0].grade_system;
        }
        const sessionPhotos = [
          ...((s.media_uris ?? []) as string[]).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u)),
          ...climbs.flatMap((c: any) => (c.media_uris ?? (c.media_uri ? [c.media_uri] : [])) as string[]).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u)),
        ];
        const rawFriends: { id: string; name: string }[] = s.friends ?? [];
        const partnerIds = rawFriends.map((f: any) => f.id).filter((id: string) => id !== s.user_id);
        let partners: { id: string; name: string; avatar_url: string | null }[] | undefined;
        if (partnerIds.length > 0) {
          partners = rawFriends.map((f: any) => ({
            id: f.id,
            name: partnerProfileMap.get(f.id)?.name ?? f.name,
            avatar_url: partnerProfileMap.get(f.id)?.avatar_url ?? null,
          }));
        }
        summaries.push({
          friend: profile,
          sessionDate: normDate(s.date),
          sessionTime: s.started_at ?? undefined,
          climbCount: climbs.reduce((sum: number, c: any) => { if (c.type === 'hangboard' || c.type === 'lift') return sum; if (c.outcome === 'flash' || c.outcome === 'hang') return sum + 1; return sum + (c.attempts ?? 1); }, 0),
          sends,
          flashes,
          hardestGrade,
          hardestGradeSystem,
          environment: s.environment ?? 'indoor',
          climbType: climbs[0]?.type ?? undefined,
          sessionPhotos: sessionPhotos.length > 0 ? sessionPhotos : undefined,
          sessionId: s.id,
          partners,
          notes: s.notes ?? undefined,
          title: s.title ?? undefined,
          location: s.location ?? undefined,
        });
      }

      // Add friends' recent sessions
      for (const f of acceptedFiltered) {
        const climbs = climbsByFriend.get(f.id) ?? [];
        const friendSessions = sessionsByFriend.get(f.id) ?? [];
        const sessionMediaMap = new Map<string, string[]>(
          friendSessions.map((s: any) => [s.id, (s.media_uris ?? []).filter((u: string) => u.startsWith('http'))])
        );
        const sessionFriendsMap = new Map<string, any[]>(
          friendSessions.map((s: any) => [s.id, s.friends ?? []])
        );
        const sessionNotesMap = new Map<string, string>(
          friendSessions.filter((s: any) => s.notes).map((s: any) => [s.id, s.notes])
        );
        const sessionTitleMap = new Map<string, string>(
          friendSessions.filter((s: any) => s.title).map((s: any) => [s.id, s.title])
        );
        const sessionLocationMap = new Map<string, string>(
          friendSessions.filter((s: any) => s.location).map((s: any) => [s.id, s.location])
        );
        const sessionDateMap = new Map<string, string>(
          friendSessions.filter((s: any) => s.date).map((s: any) => [s.id, normDate(s.date)])
        );
        const sessionStartedAtMap = new Map<string, string>(
          friendSessions.filter((s: any) => s.started_at).map((s: any) => [s.id, s.started_at])
        );

        // friendSessions only contains sessions with ended_at set. Climbs whose
        // session_id isn't in that set belong to a session still in progress —
        // exclude them so open sessions don't leak into the activity feed.
        const endedSessionIds = new Set(friendSessions.map((s: any) => s.id));
        const eligibleClimbs = climbs.filter((c: any) => !c.session_id || endedSessionIds.has(c.session_id));
        if (eligibleClimbs.length === 0) continue;

        // Build a date→sessionId lookup from the fetched sessions so climbs
        // that are missing session_id can still be bucketed into the right session.
        const sessionIdByDate = new Map<string, string>(
          friendSessions.map((s: any) => [normDate(s.date), s.id])
        );

        const sessionGroups = new Map<string, any[]>();
        for (const c of eligibleClimbs) {
          const key = c.session_id ?? sessionIdByDate.get(normDate(c.date)) ?? normDate(c.date);
          if (!sessionGroups.has(key)) sessionGroups.set(key, []);
          sessionGroups.get(key)!.push(c);
        }

        for (const sessionClimbs of sessionGroups.values()) {
          const sends = sessionClimbs.filter((c: any) => c.outcome === 'send' || c.outcome === 'flash').length;
          const flashes = sessionClimbs.filter((c: any) => c.outcome === 'flash').length;
          let hardestGrade: string | null = null;
          let hardestGradeSystem: string | null = null;
          let hardestClimb: any = sessionClimbs[0];
          const gradedClimbs = sessionClimbs.filter((c: any) => (c.outcome === 'send' || c.outcome === 'flash') && c.grade && c.grade_system);
          if (gradedClimbs.length > 0) {
            gradedClimbs.sort((a: any, b: any) => getGradeDifficulty(b.grade, b.grade_system) - getGradeDifficulty(a.grade, a.grade_system));
            hardestGrade = gradedClimbs[0].grade;
            hardestGradeSystem = gradedClimbs[0].grade_system;
            hardestClimb = gradedClimbs[0];
          }
          const friendSessionId = sessionClimbs[0]?.session_id ?? undefined;
          // Use the session record's date (local date when created) rather than the
          // first climb's UTC timestamp, which can cross a date boundary for users
          // in non-UTC timezones.
          const sessionDate = (friendSessionId ? sessionDateMap.get(friendSessionId) : undefined) ?? normDate(sessionClimbs[0].date);
          const environment = sessionClimbs[0]?.environment ?? 'indoor';
          const firstClimbTime = (friendSessionId ? sessionStartedAtMap.get(friendSessionId) : undefined) ?? sessionClimbs[0]?.date ?? undefined;
          const climbType = hardestClimb?.type ?? undefined;
          const climbPhotos = sessionClimbs.flatMap((c: any) => c.media_uris ?? (c.media_uri ? [c.media_uri] : [])).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u));
          const sessionLevelPhotos = (friendSessionId ? (sessionMediaMap.get(friendSessionId) ?? []) : []).filter((u: string) => !isDeadMediaUrl(u));
          const sessionPhotos = [...sessionLevelPhotos, ...climbPhotos];
          const rawFriends: { id: string; name: string }[] = friendSessionId ? (sessionFriendsMap.get(friendSessionId) ?? []) : [];
          const partnerIds = rawFriends.map((p: any) => p.id).filter((id: string) => id !== f.id);
          let partners: { id: string; name: string; avatar_url: string | null }[] | undefined;
          if (partnerIds.length > 0) {
            partners = rawFriends.map((p: any) => ({ id: p.id, name: partnerProfileMap.get(p.id)?.name ?? p.name, avatar_url: partnerProfileMap.get(p.id)?.avatar_url ?? null }));
          }
          const sessionNotes = friendSessionId ? (sessionNotesMap.get(friendSessionId) ?? undefined) : undefined;
          const sessionTitle = friendSessionId ? (sessionTitleMap.get(friendSessionId) ?? undefined) : undefined;
          const sessionLocation = friendSessionId ? (sessionLocationMap.get(friendSessionId) ?? undefined) : undefined;
          summaries.push({ friend: f, sessionDate, sessionTime: firstClimbTime, climbCount: sessionClimbs.reduce((sum: number, c: any) => { if (c.type === 'hangboard' || c.type === 'lift') return sum; if (c.outcome === 'flash' || c.outcome === 'hang') return sum + 1; return sum + (c.attempts ?? 1); }, 0), sends, flashes, hardestGrade, hardestGradeSystem, environment, climbType, sessionPhotos: sessionPhotos.length > 0 ? sessionPhotos : undefined, sessionId: friendSessionId, partners, notes: sessionNotes, title: sessionTitle, location: sessionLocation });
        }
      }
```

Key behavioral notes for the engineer making this change:
- `validTagged` replaces the old inline `if (!profile || ...) continue;` guard at the top of the tagged-sessions `for` loop — same three conditions, just extracted into a `.filter()` so the ids can be collected before the batch climbs query runs.
- The per-friend loop is no longer wrapped in `Promise.all(... async ...)` or a `try/catch` — it's a plain synchronous `for...of` now, since there are no more awaits inside it (the only awaits were the per-friend/per-session fetches, which are now done once, up front, outside the loop). Removing the `try/catch` is safe: the only thing that could throw inside the old loop body was the per-session partner-profile fetch, which no longer exists inside the loop — the one remaining fetch (the batched partner-profile query) is now outside the loop, at the top level of `loadFeed`, which is already wrapped in `loadFeed`'s own outer `try/catch`.
- `partnerProfileMap` is shared across both the tagged-sessions loop and the friends loop — build it once, use it in both places.
- Do not change anything after this block (`summaries.sort(...)`, the dedup logic, the photo-width prefetch, `setActivityFeed`, or the likes/comments loading) — none of that needs to change.

- [ ] **Step 3: Type-check**

Run `npx tsc --noEmit`. Confirm no new errors beyond the current baseline (25 total `error TS` lines repo-wide as of this plan). This change touches a function with real type inference (`.filter`, `.map`, `Map` construction) — pay attention to any new errors specifically inside `loadFeed`, since that would indicate a mismatch between what the batch functions return and what the grouping logic expects.

- [ ] **Step 4: Commit**

```bash
git add app/friends.tsx
git commit -m "Batch Activity feed's per-friend and per-session queries in loadFeed"
```

---

### Task 3: Manual verification

**Files:** none (verification only)

This is a native Expo app — verification must happen in a simulator or on a physical device, not a browser preview.

- [ ] **Step 1: Open the Friends/Activity tab** on an account that follows at least 2-3 people with a mix of recent sessions (some with partners tagged, some solo, some with photos, some with notes/title/location, some without).

- [ ] **Step 2: Compare the feed's contents before and after** — same sessions, same order (most recent date first), same stats (climb count, sends, flashes, hardest grade), same photos, same partner chips, same notes/title/location, same likes/comment counts. There should be zero visible difference from before this change.

- [ ] **Step 3: If you have an account that has tagged sessions from someone you don't follow**, confirm those still show up in the feed with the correct owner profile, stats, and partners.

- [ ] **Step 4: Test the zero-friends edge case** — an account following nobody should still load the feed (showing only own sessions / tagged sessions) without an error or infinite spinner.

- [ ] **Step 5: Test the zero-tagged-sessions edge case** — an account with no tagged sessions should load normally.

- [ ] **Step 6: Pull-to-refresh / scroll-to-paginate** (loads more days via `daysLoaded`) still works and shows more sessions without duplicates or errors.

- [ ] **Step 7: Check Supabase logs or a network debugger** for the account used in Step 1 — confirm `loadFeed` now fires roughly 5 queries (own sessions/climbs media lookup aside) instead of one-per-friend, to verify the round-trip reduction actually happened rather than just refactoring in place.

- [ ] **Step 8: Report results.** Do not check this task off as complete until actually exercised in a simulator/device.
