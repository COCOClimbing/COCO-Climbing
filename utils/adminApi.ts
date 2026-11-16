import { supabase } from './supabase';
import { isDeadMediaUrl } from './cloudSync';
import { getGradeDifficulty } from './theme';
import { trainingKind, climbCount, sessionStartTime } from './sessionHelpers';
import { isSessionFinished, lastClimbAtBySession, SessionSummary, SessionLike, SessionComment } from './friendsApi';

// One post in the admin feed: the card's summary plus everything the card
// would otherwise fetch itself, preloaded by the admin_feed RPC (which reads
// past RLS, so private accounts' sessions show up too).
export type AdminFeedEntry = {
  summary: SessionSummary;
  climbs: any[];
  likes: SessionLike[];
  comments: SessionComment[];
  commentLikes: Record<string, string[]>;
  isPrivate: boolean;
};

export type AdminFeedCursor = { date: string; id: string } | null;

const PAGE_SIZE = 20;
const normDate = (d: string) => (d ?? '').slice(0, 10);

function toSummary(row: any): SessionSummary {
  const s = row.session;
  const climbs: any[] = row.climbs ?? [];
  const graded = climbs
    .filter(c => (c.outcome === 'send' || c.outcome === 'flash') && c.grade && c.grade_system)
    .sort((a, b) => getGradeDifficulty(b.grade, b.grade_system) - getGradeDifficulty(a.grade, a.grade_system));
  const live = (u: string) => typeof u === 'string' && u.startsWith('http') && !isDeadMediaUrl(u);
  const photos = [
    ...((s.media_uris ?? []) as string[]).filter(live),
    ...climbs.flatMap(c => (c.media_uris ?? (c.media_uri ? [c.media_uri] : [])) as string[]).filter(live),
  ];
  const partners = ((row.partners ?? []) as any[]).filter(p => p.id && p.id !== s.user_id);
  const profile = row.profile ?? {};
  return {
    friend: {
      id: s.user_id,
      name: profile.name ?? 'Unknown',
      username: profile.username ?? '',
      avatar_url: profile.avatar_url ?? null,
      is_private: profile.is_private ?? false,
    },
    sessionDate: normDate(s.date),
    sessionTime: sessionStartTime(s.started_at, climbs),
    climbCount: climbs.reduce((sum, c) => sum + climbCount(c), 0),
    sends: climbs.filter(c => (c.outcome === 'send' || c.outcome === 'flash') && c.type !== 'hangboard' && c.type !== 'lift').length,
    flashes: climbs.filter(c => c.outcome === 'flash').length,
    hardestGrade: graded[0]?.grade ?? null,
    hardestGradeSystem: graded[0]?.grade_system ?? null,
    environment: s.environment ?? 'indoor',
    climbType: graded[0]?.type ?? climbs[0]?.type ?? undefined,
    training: trainingKind(climbs),
    sessionPhotos: photos.length > 0 ? photos : undefined,
    sessionId: s.id,
    partners: partners.length > 0 ? row.partners : undefined,
    notes: s.notes ?? undefined,
    title: s.title ?? undefined,
    location: s.location ?? undefined,
  };
}

// One page of every user's sessions, newest first. Sessions still in progress
// or with no climbs are left out, same as the normal feed, so a page can hold
// fewer than PAGE_SIZE posts; `nextCursor` is null once there are no more.
export async function getAdminFeedPage(cursor: AdminFeedCursor): Promise<{ entries: AdminFeedEntry[]; nextCursor: AdminFeedCursor }> {
  const { data, error } = await supabase.rpc('admin_feed', {
    p_before_date: cursor?.date ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  const rows: any[] = data ?? [];
  const last = rows[rows.length - 1]?.session;
  const nextCursor = rows.length === PAGE_SIZE && last ? { date: last.date, id: last.id } : null;

  const entries = rows
    .filter(r => {
      const climbs = r.climbs ?? [];
      if (climbs.length === 0) return false;
      return isSessionFinished(r.session, lastClimbAtBySession(climbs).get(r.session.id));
    })
    .map(r => {
      const comments: SessionComment[] = (r.comments ?? []).map(({ liked_by, ...c }: any) => c);
      const commentLikes: Record<string, string[]> = {};
      for (const c of r.comments ?? []) commentLikes[c.id] = c.liked_by ?? [];
      return {
        summary: toSummary(r),
        climbs: r.climbs ?? [],
        likes: r.likes ?? [],
        comments,
        commentLikes,
        isPrivate: r.profile?.is_private ?? false,
      };
    });
  return { entries, nextCursor };
}
