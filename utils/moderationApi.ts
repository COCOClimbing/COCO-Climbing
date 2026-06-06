import { supabase } from './supabase';

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  // Record the block
  await supabase.from('blocked_users').upsert({ blocker_id: blockerId, blocked_id: blockedId });
  // Remove all friendship rows in both directions so they disappear from feed immediately
  await supabase.from('friendships')
    .delete()
    .or(`and(sender_id.eq.${blockerId},receiver_id.eq.${blockedId}),and(sender_id.eq.${blockedId},receiver_id.eq.${blockerId})`);
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await supabase.from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
}

export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', userId);
  return (data ?? []).map((r: any) => r.blocked_id);
}

export interface BlockedUser {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
}

export async function getBlockedUsers(userId: string): Promise<BlockedUser[]> {
  const { data } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', userId);
  if (!data || data.length === 0) return [];
  const ids = data.map((r: any) => r.blocked_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, username, avatar_url')
    .in('id', ids);
  return (profiles ?? []) as BlockedUser[];
}

// Returns IDs of users who have blocked the given user
export async function getBlockedByUserIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .eq('blocked_id', userId);
  return (data ?? []).map((r: any) => r.blocker_id);
}

export async function reportContent(
  reporterId: string,
  reportedUserId: string,
  contentType: 'session' | 'comment' | 'user',
  contentId: string,
  reason: string,
): Promise<void> {
  await supabase.from('content_reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    content_type: contentType,
    content_id: contentId,
    reason,
  });
}
