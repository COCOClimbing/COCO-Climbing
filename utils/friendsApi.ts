import { supabase } from './supabase';

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
  const { data, error } = await supabase
    .from('friendships')
    .select('receiver_id')
    .eq('sender_id', userId)
    .eq('status', 'accepted');
  if (error || !data || data.length === 0) return [];
  const ids = data.map(r => r.receiver_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, hometown, is_private')
    .in('id', ids);
  return (profiles ?? []) as FriendProfile[];
}

// Get users who follow this person (receiver)
export async function getFollowers(userId: string): Promise<FriendProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('sender_id')
    .eq('receiver_id', userId)
    .eq('status', 'accepted');
  if (error || !data || data.length === 0) return [];
  const ids = data.map(r => r.sender_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url, hometown, is_private')
    .in('id', ids);
  return (profiles ?? []) as FriendProfile[];
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

// Get a friend's climbs from the last 14 days
export async function getFriendRecentClimbs(friendId: string): Promise<any[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('climbs')
    .select('*')
    .eq('user_id', friendId)
    .gte('date', cutoff)
    .order('date', { ascending: false });

  return data ?? [];
}

// Get a friend's recent sessions from the last 14 days (for media)
export async function getFriendRecentSessions(friendId: string): Promise<any[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('sessions')
    .select('id, date, started_at, media_uris, media_types, friends, notes, title, location')
    .eq('user_id', friendId)
    .gte('date', cutoff);
  return data ?? [];
}

// Get ended sessions from the last 14 days where userId was tagged, with the session owner's profile
export async function getTaggedSessions(userId: string): Promise<{ session: any; profile: any }[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split('T')[0];

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('date', cutoff)
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .limit(1);
  if (error) throw new Error(error.message);
  return !data || data.length === 0;
}
