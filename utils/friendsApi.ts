import { supabase } from './supabase';
import { Image } from 'react-native';
import { isDeadMediaUrl } from './cloudSync';
import { getGradeDifficulty } from './theme';

export interface FriendProfile {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  hometown?: string | null;
  is_private?: boolean;
}

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  profile: FriendProfile; // the OTHER person's profile
}

export interface FriendActivity {
  friend: FriendProfile;
  recentClimbs: any[]; // climbs from last 30 days
}

export interface FriendCounts {
  followers: number;
  following: number;
}

export type SessionSummary = {
  friend: FriendProfile;
  sessionDate: string;
  sessionId?: string;
  sessionTime?: string;
  climbCount: number;
  sends: number;
  flashes: number;
  hardestGrade: string | null;
  hardestGradeSystem: string | null;
  environment?: string;
  climbType?: string;
  partners?: { id: string; name: string; avatar_url?: string | null }[];
  sessionPhotos?: string[];
  photoWidths?: Record<string, number>;
  notes?: string;
  title?: string;
  location?: string;
};

const SUMMARY_PHOTO_HEIGHT = 220;

// Build one friend's session_id-grouped, paginated activity summaries for the
// last `daysBack` days. Mirrors the per-friend grouping logic in
// app/friends.tsx's loadFeed (the main Activity feed), but as a standalone
// call for a single friend instead of a Promise.all over every friend —
// used by a friend's profile view, which only ever needs this one person's
// sessions. Deliberately duplicated rather than shared with loadFeed to
// avoid any risk of regressing the already-shipped main feed.
export async function getFriendSessionSummaries(friend: FriendProfile, daysBack: number): Promise<SessionSummary[]> {
  const normDate = (d: string) => (d ?? '').slice(0, 10);
  const summaries: SessionSummary[] = [];

  const [climbs, friendSessions] = await Promise.all([
    getFriendRecentClimbs(friend.id, daysBack),
    getFriendRecentSessions(friend.id, daysBack),
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

  const endedSessionIds = new Set(friendSessions.map((s: any) => s.id));
  const eligibleClimbs = climbs.filter((c: any) => !c.session_id || endedSessionIds.has(c.session_id));
  if (eligibleClimbs.length === 0) return [];

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
    const sessionDate = (friendSessionId ? sessionDateMap.get(friendSessionId) : undefined) ?? normDate(sessionClimbs[0].date);
    const environment = sessionClimbs[0]?.environment ?? 'indoor';
    const firstClimbTime = (friendSessionId ? sessionStartedAtMap.get(friendSessionId) : undefined) ?? sessionClimbs[0]?.date ?? undefined;
    const climbType = hardestClimb?.type ?? undefined;
    const climbPhotos = sessionClimbs.flatMap((c: any) => c.media_uris ?? (c.media_uri ? [c.media_uri] : [])).filter((u: string) => u.startsWith('http') && !isDeadMediaUrl(u));
    const sessionLevelPhotos = (friendSessionId ? (sessionMediaMap.get(friendSessionId) ?? []) : []).filter((u: string) => !isDeadMediaUrl(u));
    const sessionPhotos = [...sessionLevelPhotos, ...climbPhotos];
    const rawFriends: { id: string; name: string }[] = friendSessionId ? (sessionFriendsMap.get(friendSessionId) ?? []) : [];
    const partnerIds = rawFriends.map((p: any) => p.id).filter((id: string) => id !== friend.id);
    let partners: { id: string; name: string; avatar_url: string | null }[] | undefined;
    if (partnerIds.length > 0) {
      const { data: partnerProfiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', partnerIds);
      const profileMap = new Map((partnerProfiles ?? []).map((p: any) => [p.id, p]));
      partners = rawFriends.map((p: any) => ({ id: p.id, name: profileMap.get(p.id)?.name ?? p.name, avatar_url: profileMap.get(p.id)?.avatar_url ?? null }));
    }
    const sessionNotes = friendSessionId ? (sessionNotesMap.get(friendSessionId) ?? undefined) : undefined;
    const sessionTitle = friendSessionId ? (sessionTitleMap.get(friendSessionId) ?? undefined) : undefined;
    const sessionLocation = friendSessionId ? (sessionLocationMap.get(friendSessionId) ?? undefined) : undefined;
    summaries.push({ friend, sessionDate, sessionTime: firstClimbTime, climbCount: sessionClimbs.reduce((sum: number, c: any) => { if (c.type === 'hangboard' || c.type === 'lift') return sum; if (c.outcome === 'flash' || c.outcome === 'hang') return sum + 1; return sum + (c.attempts ?? 1); }, 0), sends, flashes, hardestGrade, hardestGradeSystem, environment, climbType, sessionPhotos: sessionPhotos.length > 0 ? sessionPhotos : undefined, sessionId: friendSessionId, partners, notes: sessionNotes, title: sessionTitle, location: sessionLocation });
  }

  summaries.sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());

  // Pre-fetch photo dimensions so NaturalPhoto renders at the correct size immediately
  const allUris = [...new Set(summaries.flatMap(e => e.sessionPhotos ?? []))];
  const widthCache: Record<string, number> = {};
  await Promise.all(
    allUris.map(uri => new Promise<void>(resolve => {
      Image.getSize(uri, (w, h) => { widthCache[uri] = Math.round(SUMMARY_PHOTO_HEIGHT * w / h); resolve(); }, () => resolve());
    }))
  );
  return summaries.map(e => ({
    ...e,
    photoWidths: e.sessionPhotos ? Object.fromEntries(e.sessionPhotos.filter(u => widthCache[u]).map(u => [u, widthCache[u]])) : undefined,
  }));
}

// Search users by username (partial match, exclude self and existing friends)
export async function searchByUsername(query: string, currentUserId: string, excludeIds: string[] = []): Promise<FriendProfile[]> {
  if (!query.trim()) return [];
  let q = supabase
    .from('profiles')
    .select('id, name, username, avatar_url, hometown, is_private')
    .ilike('username', `%${query.trim()}%`)
    .neq('id', currentUserId);
  if (excludeIds.length > 0) q = q.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await q.limit(10);
  if (error || !data) return [];
  return data as FriendProfile[];
}

export async function getProfileById(id: string): Promise<FriendProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, hometown, is_private')
    .eq('id', id)
    .single();
  return data ?? null;
}

// Follow a user. Public profiles are auto-accepted; private profiles create a pending request.
export async function sendFriendRequest(senderId: string, receiverId: string, isPrivate = false): Promise<{ error: string | null }> {
  // Reject if either party has blocked the other
  const { data: block } = await supabase
    .from('blocked_users')
    .select('id')
    .or(`and(blocker_id.eq.${senderId},blocked_id.eq.${receiverId}),and(blocker_id.eq.${receiverId},blocked_id.eq.${senderId})`)
    .limit(1);
  if (block && block.length > 0) return { error: 'Unable to follow this user.' };

  const { error } = await supabase.from('friendships').insert({
    sender_id: senderId,
    receiver_id: receiverId,
    status: isPrivate ? 'pending' : 'accepted',
  });
  if (error) return { error: error.message };
  return { error: null };
}

// Get pending incoming requests for a user
export async function getPendingRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, sender_id, receiver_id, status, created_at')
    .eq('receiver_id', userId)
    .eq('status', 'pending');
  if (error || !data) return [];

  // Fetch sender profiles
  const senderIds = data.map(r => r.sender_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, hometown')
    .in('id', senderIds);

  return data.map(r => ({
    ...r,
    profile: (profiles ?? []).find(p => p.id === r.sender_id) ?? { id: r.sender_id, name: 'Unknown', username: '', avatar_url: null },
  })) as FriendRequest[];
}

// Get users this person is following (sender)
export async function getFollowing(userId: string): Promise<FriendProfile[]> {
  const { data, error } = await supabase.rpc('get_following', { target_user_id: userId });
  if (error || !data) return [];
  return data as FriendProfile[];
}

// Get users who follow this person (receiver)
export async function getFollowers(userId: string): Promise<FriendProfile[]> {
  const { data, error } = await supabase.rpc('get_followers', { target_user_id: userId });
  if (error || !data) return [];
  return data as FriendProfile[];
}

// Get accepted friends list
export async function getAcceptedFriends(userId: string): Promise<FriendProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('sender_id, receiver_id')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (error || !data) return [];

  const friendIds = data.map(r => r.sender_id === userId ? r.receiver_id : r.sender_id);
  if (friendIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, hometown')
    .in('id', friendIds);

  return (profiles ?? []) as FriendProfile[];
}

// Accept a friend request
export async function acceptFriendRequest(requestId: string): Promise<void> {
  await supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId);
}

// Decline a friend request
export async function declineFriendRequest(requestId: string): Promise<void> {
  await supabase.from('friendships').update({ status: 'declined' }).eq('id', requestId);
}

// Unfollow: only removes the row where userId is the sender (directional)
export async function removeFriend(userId: string, friendId: string): Promise<void> {
  await supabase.from('friendships')
    .delete()
    .eq('sender_id', userId)
    .eq('receiver_id', friendId);
}

// Get a friend's session IDs from the last 14 days
export async function getFriendEndedSessionIds(friendId: string): Promise<Set<string>> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', friendId)
    .gte('date', cutoff);
  return new Set((data ?? []).map((s: any) => s.id));
}

// Get a friend's climbs from the last `daysBack` days
export async function getFriendRecentClimbs(friendId: string, daysBack: number): Promise<any[]> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('climbs')
    .select('*')
    .eq('user_id', friendId)
    .gte('date', cutoff)
    .order('date', { ascending: false });

  return data ?? [];
}

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
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - daysBack);
  const cutoff = daysAgo.toISOString().split('T')[0];

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('date', cutoff)
    .not('ended_at', 'is', null)
    .contains('friends', [{ id: userId }]);

  if (!sessions || sessions.length === 0) return [];

  const ownerIds = [...new Set(sessions.map((s: any) => s.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, hometown, is_private')
    .in('id', ownerIds);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return sessions.map((s: any) => ({ session: s, profile: profileMap.get(s.user_id) ?? null }));
}

// Get ALL of a friend's climbs (for their profile view)
export async function getFriendAllClimbs(friendId: string): Promise<any[]> {
  const { data } = await supabase
    .from('climbs')
    .select('*')
    .eq('user_id', friendId)
    .order('date', { ascending: false });
  return data ?? [];
}

// Get friendship status between two users (directional: from userId's perspective)
// 'accepted'         = userId is following otherId
// 'pending_sent'     = userId sent a follow request to otherId (private account), awaiting approval
// 'pending_received' = otherId sent a follow request to userId, awaiting userId's approval
// 'none'             = userId is not following otherId (otherId may still follow userId)
export async function getFriendshipStatus(userId: string, otherId: string): Promise<'none' | 'pending_sent' | 'pending_received' | 'accepted'> {
  const { data } = await supabase
    .from('friendships')
    .select('sender_id, status')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`);

  if (!data || data.length === 0) return 'none';

  for (const row of data) {
    if (row.sender_id === userId && row.status === 'accepted') return 'accepted';
    if (row.sender_id === userId && row.status === 'pending')  return 'pending_sent';
    if (row.sender_id === otherId && row.status === 'pending') return 'pending_received';
  }
  return 'none';
}

export async function getFriendCounts(userId: string): Promise<FriendCounts> {
  // Read from profile columns instead of counting friendships rows directly —
  // the friendships RLS only exposes rows the viewer is party to, which gives
  // wrong counts for other users.
  const { data } = await supabase
    .from('profiles')
    .select('followers_count, following_count')
    .eq('id', userId)
    .single();
  return {
    followers: data?.followers_count ?? 0,
    following: data?.following_count ?? 0,
  };
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export interface SessionLike {
  id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  profile?: { name: string; avatar_url: string | null };
}

export async function getSessionLikes(sessionId: string): Promise<SessionLike[]> {
  const { data } = await supabase
    .from('session_likes')
    .select('*')
    .eq('session_id', sessionId);
  if (!data || data.length === 0) return [];
  const userIds = data.map((l: SessionLike) => l.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);
  return data.map((l: SessionLike) => ({
    ...l,
    profile: (profiles ?? []).find((p: any) => p.id === l.user_id) ?? { name: 'Unknown', avatar_url: null },
  }));
}

export async function likeSession(sessionId: string, userId: string): Promise<void> {
  await supabase.from('session_likes').insert({ session_id: sessionId, user_id: userId });
}

export async function unlikeSession(sessionId: string, userId: string): Promise<void> {
  await supabase.from('session_likes')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface SessionComment {
  id: string;
  session_id: string;
  user_id: string;
  text: string;
  created_at: string;
  profile?: { name: string; username: string; avatar_url: string | null };
}

export async function getSessionComments(sessionId: string): Promise<SessionComment[]> {
  const { data } = await supabase
    .from('session_comments')
    .select('id, session_id, user_id, text, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (!data || data.length === 0) return [];

  const userIds = [...new Set(data.map(c => c.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url')
    .in('id', userIds);

  return data.map(c => ({
    ...c,
    profile: (profiles ?? []).find(p => p.id === c.user_id) ?? { name: 'Unknown', username: '', avatar_url: null },
  }));
}

export async function addSessionComment(sessionId: string, userId: string, text: string): Promise<void> {
  const { error } = await supabase.from('session_comments').insert({ session_id: sessionId, user_id: userId, text });
  if (error) throw new Error(error.message);
}

export async function deleteSessionComment(commentId: string): Promise<void> {
  await supabase.from('session_comments').delete().eq('id', commentId);
}

// ─── Comment Likes ────────────────────────────────────────────────────────────

export async function getCommentLikes(commentIds: string[]): Promise<Record<string, string[]>> {
  if (commentIds.length === 0) return {};
  const { data } = await supabase
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds);
  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    if (!map[row.comment_id]) map[row.comment_id] = [];
    map[row.comment_id].push(row.user_id);
  }
  return map;
}

export async function likeComment(commentId: string, userId: string): Promise<void> {
  await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId });
}

export async function unlikeComment(commentId: string, userId: string): Promise<void> {
  await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
}

// ─── Username ─────────────────────────────────────────────────────────────────

// Check if a username is available
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', { check_username: username });
  if (error) throw new Error(error.message);
  return data === true;
}
