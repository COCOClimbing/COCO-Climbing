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
  // Throws on failure so callers show an error instead of a false
  // "Report Submitted".
  const { data, error } = await supabase.from('content_reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    content_type: contentType,
    content_id: contentId,
    reason,
  }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Report was not saved');

  // Alert the admins. The report is already saved, so a failed alert isn't
  // the reporter's problem — it still shows in the admin Reports list.
  supabase.functions.invoke('send-notification', { body: { type: 'report', reportId: data.id } })
    .then(({ error: fnError, data: res }) => {
      if (fnError) console.warn('[reports] admin alert failed:', fnError.message);
      else if (res && !res.sent) console.warn('[reports] admin alert not sent:', res.reason);
    })
    .catch(() => {});
}
