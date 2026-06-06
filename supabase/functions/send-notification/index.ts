import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { type, recipientId, recipientIds, senderId, sessionId } = await req.json()

    if (!type) {
      return new Response(JSON.stringify({ error: 'Missing type' }), { status: 400, headers: corsHeaders })
    }

    // Look up sender name
    const { data: profile } = await adminClient
      .from('profiles')
      .select('name')
      .eq('id', senderId ?? user.id)
      .single()
    const senderName = profile?.name ?? 'Someone'

    // Support single recipientId or batch recipientIds (for tag notifications)
    const ids: string[] = recipientIds ?? (recipientId ? [recipientId] : [])
    if (!ids.length) {
      return new Response(JSON.stringify({ error: 'Missing recipientId(s)' }), { status: 400, headers: corsHeaders })
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
        data = { senderId: senderId ?? user.id, type }
        break
      case 'new_follower':
        title = 'New follower'
        body = `${senderName} is now following you`
        data = { followerId: senderId ?? user.id, type }
        break
      case 'follow_request_accepted':
        title = 'Follow request accepted'
        body = `${senderName} accepted your follow request`
        data = { senderId: senderId ?? user.id, type }
        break
      case 'comment_like':
        title = 'Comment liked'
        body = `${senderName} liked your comment`
        data = { sessionId, type }
        break
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), { status: 400, headers: corsHeaders })
    }

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
