import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verifies the caller actually has a relationship that justifies notifying
// each recipient, so an authenticated caller can't push-spam or falsely
// attribute a notification to themselves for someone they have no
// connection to. Returns the subset of recipientIds that are legitimate for
// this notification type, plus the sessionId that should actually be used
// downstream (for comment_like, this is looked up server-side from the
// comment itself rather than trusted from the client — otherwise a caller
// could pass a real, liked commentId alongside an unrelated sessionId to
// point the recipient's notification-tap deep link at a session they may
// not have permission to view). adminClient bypasses RLS (needed
// regardless, since it's already used to read push tokens), so this check
// is the only thing standing between "authenticated" and "can notify
// anyone."
async function verifyRecipientsAllowed(
  adminClient: ReturnType<typeof createClient>,
  type: string,
  callerId: string,
  recipientIds: string[],
  sessionId: string | undefined,
  commentId: string | undefined,
): Promise<{ ids: string[]; sessionId: string | undefined }> {
  if (type === 'session_tag') {
    if (!sessionId) return { ids: [], sessionId }
    const { data: session } = await adminClient
      .from('sessions')
      .select('user_id, friends')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session || session.user_id !== callerId) return { ids: [], sessionId }
    const taggedIds = new Set((session.friends ?? []).map((f: any) => f.id))
    return { ids: recipientIds.filter(id => taggedIds.has(id)), sessionId }
  }

  if (type === 'like' || type === 'comment') {
    if (!sessionId) return { ids: [], sessionId }
    const { data: session } = await adminClient
      .from('sessions')
      .select('user_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session) return { ids: [], sessionId }
    // The recipient must be the session's owner — like/comment only ever
    // notify a session owner about activity on their own session.
    const owned = recipientIds.filter(id => id === session.user_id)
    if (!owned.length) return { ids: [], sessionId }
    if (session.user_id === callerId) return { ids: owned, sessionId } // liking/commenting your own session
    const { data: friendship } = await adminClient
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(`and(sender_id.eq.${callerId},receiver_id.eq.${session.user_id}),and(sender_id.eq.${session.user_id},receiver_id.eq.${callerId})`)
      .maybeSingle()
    return { ids: friendship ? owned : [], sessionId }
  }

  if (type === 'comment_like') {
    // Unlike like/comment, the recipient here is the COMMENT's author, who
    // is frequently a different person than the session owner — e.g. friend
    // B comments on friend A's session, then A (or friend C) likes B's
    // comment; recipient = B, not A. Verify against the actual comment and
    // an actual like row rather than assuming session ownership, and derive
    // sessionId from the comment itself rather than trusting the client.
    if (!commentId) return { ids: [], sessionId: undefined }
    const { data: comment } = await adminClient
      .from('session_comments')
      .select('user_id, session_id')
      .eq('id', commentId)
      .maybeSingle()
    if (!comment || !recipientIds.includes(comment.user_id)) return { ids: [], sessionId: undefined }
    const { data: likeRow } = await adminClient
      .from('comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', callerId)
      .maybeSingle()
    return { ids: likeRow ? [comment.user_id] : [], sessionId: comment.session_id }
  }

  if (type === 'follow_request') {
    const { data: rows } = await adminClient
      .from('friendships')
      .select('receiver_id')
      .eq('sender_id', callerId)
      .eq('status', 'pending')
      .in('receiver_id', recipientIds)
    return { ids: (rows ?? []).map((r: any) => r.receiver_id), sessionId }
  }

  if (type === 'new_follower') {
    const { data: rows } = await adminClient
      .from('friendships')
      .select('receiver_id')
      .eq('sender_id', callerId)
      .eq('status', 'accepted')
      .in('receiver_id', recipientIds)
    return { ids: (rows ?? []).map((r: any) => r.receiver_id), sessionId }
  }

  if (type === 'follow_request_accepted') {
    const { data: rows } = await adminClient
      .from('friendships')
      .select('sender_id')
      .eq('receiver_id', callerId)
      .eq('status', 'accepted')
      .in('sender_id', recipientIds)
    return { ids: (rows ?? []).map((r: any) => r.sender_id), sessionId }
  }

  return { ids: [], sessionId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Verify caller is authenticated
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Service role client — bypasses RLS to read push tokens
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { type, recipientId, recipientIds, sessionId: requestedSessionId, commentId } = await req.json()

    if (!type) {
      return new Response(JSON.stringify({ error: 'Missing type' }), { status: 400, headers: corsHeaders })
    }

    // The sender is always the authenticated caller — never trust a
    // client-supplied senderId, which would let a caller attribute a
    // notification (and its "from" identity) to anyone they choose.
    const effectiveSenderId = user.id

    // Look up sender name
    const { data: profile } = await adminClient
      .from('profiles')
      .select('name')
      .eq('id', effectiveSenderId)
      .single()
    const senderName = profile?.name ?? 'Someone'

    // Support single recipientId or batch recipientIds (for tag notifications)
    const requestedIds: string[] = recipientIds ?? (recipientId ? [recipientId] : [])
    if (!requestedIds.length) {
      return new Response(JSON.stringify({ error: 'Missing recipientId(s)' }), { status: 400, headers: corsHeaders })
    }

    // Only notify recipients the caller has an actual relationship-based
    // reason to notify — see verifyRecipientsAllowed for the per-type rules.
    // sessionId is re-bound to whatever the check determined should actually
    // be used (server-derived for comment_like, passed through otherwise).
    const { ids, sessionId } = await verifyRecipientsAllowed(adminClient, type, effectiveSenderId, requestedIds, requestedSessionId, commentId)
    if (!ids.length) {
      return new Response(JSON.stringify({ sent: false, reason: 'not_authorized' }), { headers: corsHeaders })
    }

    // Filter recipients who have opted out of this notification type
    const prefKey: string | null =
      type === 'session_tag'    ? 'session_tag'    :
      type === 'like'           ? 'likes'          :
      type === 'comment'        ? 'comments'       :
      type === 'new_follower'            ? 'new_follower' :
      type === 'follow_request_accepted' ? 'new_follower' :
      type === 'follow_request'          ? 'new_follower' :
      null

    let filteredIds = ids
    if (prefKey) {
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, notification_prefs')
        .in('id', ids)

      if (profiles?.length) {
        filteredIds = ids.filter(id => {
          const profile = profiles.find((p: any) => p.id === id)
          const prefs = profile?.notification_prefs
          if (!prefs) return true // default on
          return prefs[prefKey] !== false
        })
      }
    }

    if (!filteredIds.length) {
      return new Response(JSON.stringify({ sent: false, reason: 'opted_out' }), { headers: corsHeaders })
    }

    const { data: tokenRows } = await adminClient
      .from('push_tokens')
      .select('token')
      .in('user_id', filteredIds)

    if (!tokenRows?.length) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_tokens' }), { headers: corsHeaders })
    }

    let title: string
    let body: string
    let data: object

    switch (type) {
      case 'session_tag':
        title = 'You were tagged in a session'
        body = `${senderName} tagged you in a climbing session`
        data = { sessionId, type }
        break
      case 'like':
        title = 'New like'
        body = `${senderName} liked your session`
        data = { sessionId, type }
        break
      case 'comment':
        title = 'New comment'
        body = `${senderName} commented on your session`
        data = { sessionId, type }
        break
      case 'follow_request':
        title = 'New follow request'
        body = `${senderName} wants to follow you`
        data = { senderId: effectiveSenderId, type }
        break
      case 'new_follower':
        title = 'New follower'
        body = `${senderName} is now following you`
        data = { followerId: effectiveSenderId, type }
        break
      case 'follow_request_accepted':
        title = 'Follow request accepted'
        body = `${senderName} accepted your follow request`
        data = { senderId: effectiveSenderId, type }
        break
      case 'comment_like':
        title = 'Comment liked'
        body = `${senderName} liked your comment`
        data = { sessionId, type }
        break
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), { status: 400, headers: corsHeaders })
    }

    // Store notification rows for each recipient
    await adminClient.from('notifications').insert(
      filteredIds.map(rid => ({
        recipient_id: rid,
        sender_id: effectiveSenderId !== rid ? effectiveSenderId : null,
        type,
        session_id: sessionId ?? null,
        title,
        body,
      }))
    )

    const messages = tokenRows.map(({ token }) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default',
    }))

    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    })

    const result = await expoRes.json()
    return new Response(JSON.stringify({ sent: true, count: messages.length, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-notification error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
