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
    // Mutual follows create two separate accepted rows (A→B and B→A), so this
    // can legitimately match more than one row — .maybeSingle() would error
    // on that (returning data: null) and silently drop the notification.
    const { data: friendship } = await adminClient
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(`and(sender_id.eq.${callerId},receiver_id.eq.${session.user_id}),and(sender_id.eq.${session.user_id},receiver_id.eq.${callerId})`)
      .limit(1)
    return { ids: (friendship && friendship.length > 0) ? owned : [], sessionId }
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

  if (type === 'mention') {
    // Someone was @mentioned in a comment. The caller must have written the
    // comment, each recipient's username must really appear in it, and each
    // recipient must be able to see the post (same rule as sessions RLS) with
    // no block either way. sessionId comes from the comment, not the client.
    if (!commentId) return { ids: [], sessionId: undefined }
    const { data: comment } = await adminClient
      .from('session_comments')
      .select('user_id, session_id, text')
      .eq('id', commentId)
      .maybeSingle()
    if (!comment || comment.user_id !== callerId) return { ids: [], sessionId: undefined }
    const mentioned = new Set(
      [...String(comment.text ?? '').matchAll(/(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g)]
        .map(m => m[2].toLowerCase())
    )
    if (!mentioned.size) return { ids: [], sessionId: comment.session_id }
    const { data: people } = await adminClient
      .from('profiles')
      .select('id, username')
      .in('id', recipientIds.slice(0, 10))
    const candidates = (people ?? [])
      .filter((p: any) => p.id !== callerId && p.username && mentioned.has(String(p.username).toLowerCase()))
      .map((p: any) => p.id as string)
    if (!candidates.length) return { ids: [], sessionId: comment.session_id }

    const { data: session } = await adminClient
      .from('sessions')
      .select('user_id, deleted_at')
      .eq('id', comment.session_id)
      .maybeSingle()
    if (!session || session.deleted_at) return { ids: [], sessionId: comment.session_id }
    const ownerId: string = session.user_id
    const { data: owner } = await adminClient.from('profiles').select('is_private').eq('id', ownerId).maybeSingle()
    const ownerPublic = owner ? owner.is_private === false : false

    const allowed: string[] = []
    for (const id of candidates) {
      const { data: blockedWithCaller } = await adminClient.rpc('is_blocked', { a: callerId, b: id })
      if (blockedWithCaller) continue
      if (id === ownerId) { allowed.push(id); continue }
      const { data: blockedWithOwner } = await adminClient.rpc('is_blocked', { a: id, b: ownerId })
      if (blockedWithOwner) continue
      if (ownerPublic) { allowed.push(id); continue }
      const { data: follows } = await adminClient
        .from('friendships')
        .select('id')
        .eq('sender_id', id)
        .eq('receiver_id', ownerId)
        .eq('status', 'accepted')
        .limit(1)
      if (follows && follows.length > 0) allowed.push(id)
    }
    return { ids: allowed, sessionId: comment.session_id }
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

// A user filed a content report: tell every admin (public.admins). The
// recipients come from the admins table, never from the client, and the
// report must be the caller's own, filed in the last few minutes, and not
// already announced — so this can't be used to spam admins with old reports.
async function handleReport(
  adminClient: ReturnType<typeof createClient>,
  callerId: string,
  reportId: string | undefined,
): Promise<Response> {
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (!reportId) return json({ error: 'Missing reportId' }, 400)

  const { data: report } = await adminClient
    .from('content_reports')
    .select('id, reporter_id, reported_user_id, content_type, reason, created_at')
    .eq('id', reportId)
    .maybeSingle()
  if (!report || report.reporter_id !== callerId) return json({ sent: false, reason: 'not_authorized' })
  if (Date.now() - new Date(report.created_at).getTime() > 10 * 60 * 1000) return json({ sent: false, reason: 'too_old' })

  const { count: already } = await adminClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId)
  if ((already ?? 0) > 0) return json({ sent: true, count: 0, reason: 'already_notified' })

  // Reports are free to file, so cap how many alerts one person can trigger.
  // Extra reports are still saved and show in the admin Reports list.
  const { count: recentReports } = await adminClient
    .from('content_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', callerId)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if ((recentReports ?? 0) > 5) return json({ sent: false, reason: 'rate_limited' })

  const { data: admins } = await adminClient.from('admins').select('user_id')
  const adminIds: string[] = (admins ?? []).map((a: any) => a.user_id)
  if (!adminIds.length) return json({ sent: false, reason: 'no_admins' })

  const { data: people } = await adminClient
    .from('profiles')
    .select('id, name, username')
    .in('id', [report.reporter_id, report.reported_user_id])
  const label = (id: string) => {
    const p = (people ?? []).find((x: any) => x.id === id)
    return p?.username ? `@${p.username}` : (p?.name ?? 'Someone')
  }
  const what = report.content_type === 'session' ? "'s session" : report.content_type === 'comment' ? "'s comment" : ''
  const title = 'New report'
  const body = `${label(report.reporter_id)} reported ${label(report.reported_user_id)}${what}: ${report.reason}`

  // In-app rows go in even for admins without a push token.
  await adminClient.from('notifications').insert(
    adminIds.map(rid => ({
      recipient_id: rid,
      sender_id: callerId !== rid ? callerId : null,
      type: 'report',
      report_id: reportId,
      title,
      body,
    }))
  )

  const { data: tokenRows } = await adminClient.from('push_tokens').select('token').in('user_id', adminIds)
  if (!tokenRows?.length) return json({ sent: true, count: 0, reason: 'no_tokens' })
  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokenRows.map(({ token }: any) => ({
      to: token, title, body, data: { type: 'report', reportId }, sound: 'default',
    }))),
  })
  return json({ sent: true, count: tokenRows.length, result: await expoRes.json() })
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

    const { type, recipientId, recipientIds, sessionId: requestedSessionId, commentId, reportId } = await req.json()

    if (!type) {
      return new Response(JSON.stringify({ error: 'Missing type' }), { status: 400, headers: corsHeaders })
    }

    if (type === 'report') {
      return await handleReport(adminClient, user.id, reportId)
    }

    // The sender is always the authenticated caller — never trust a
    // client-supplied senderId, which would let a caller attribute a
    // notification (and its "from" identity) to anyone they choose.
    const effectiveSenderId = user.id

    // Rate limit: cap how many notifications a single sender can cause in a
    // short window. Counts actual notification rows created by this sender
    // recently (not edge-function calls), so a legitimate burst — tagging a
    // dozen friends in one session, or quickly liking several sessions while
    // scrolling the feed — stays well under the limit, while a scripted
    // rapid-fire loop (e.g. repeatedly liking/unliking the same session to
    // spam one recipient with pushes) gets cut off.
    const RATE_LIMIT_WINDOW_SECONDS = 60
    const RATE_LIMIT_MAX = 30
    const { count: recentCount } = await adminClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', effectiveSenderId)
      .gte('created_at', new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString())
    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return new Response(JSON.stringify({ sent: false, reason: 'rate_limited' }), { headers: corsHeaders })
    }

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
    const verified = await verifyRecipientsAllowed(adminClient, type, effectiveSenderId, requestedIds, requestedSessionId, commentId)
    const { sessionId } = verified
    let ids = verified.ids
    if (!ids.length) {
      return new Response(JSON.stringify({ sent: false, reason: 'not_authorized' }), { headers: corsHeaders })
    }

    // A tag is only ever announced once per person per session. The server's
    // end_idle_sessions job may already have sent it (if the owner's phone
    // ended the session late), so skip anyone with an existing row. Reported
    // as sent so the app records them as done and stops retrying.
    if (type === 'session_tag' && sessionId) {
      const { data: existing } = await adminClient
        .from('notifications')
        .select('recipient_id')
        .eq('type', 'session_tag')
        .eq('session_id', sessionId)
        .in('recipient_id', ids)
      const done = new Set((existing ?? []).map((r: any) => r.recipient_id))
      ids = ids.filter(id => !done.has(id))
      if (!ids.length) {
        return new Response(JSON.stringify({ sent: true, count: 0, reason: 'already_notified' }), { headers: corsHeaders })
      }
    }

    // Filter recipients who have opted out of this notification type
    const prefKey: string | null =
      type === 'session_tag'    ? 'session_tag'    :
      type === 'like'           ? 'likes'          :
      type === 'comment'        ? 'comments'       :
      type === 'mention'        ? 'comments'       :
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
      case 'mention':
        title = 'You were mentioned'
        body = `${senderName} mentioned you in a comment`
        data = { sessionId, type }
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
