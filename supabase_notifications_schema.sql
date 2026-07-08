-- ─── Push tokens (one per user, upserted on login) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
  user_id    uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text NOT NULL DEFAULT 'ios',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only write their own token; friends can read tokens to send notifications
CREATE POLICY "Users can manage own push token"
  ON public.push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Friends can read push tokens to send notifications"
  ON public.push_tokens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.sender_id = auth.uid() AND f.receiver_id = user_id)
          OR
          (f.receiver_id = auth.uid() AND f.sender_id = user_id)
        )
    )
  );

-- ─── Add friends column to sessions (stores tagged climbing partners) ─────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS friends jsonb;

-- ─── In-app notifications (one row per recipient per push, written by the ────
-- send-notification edge function via the service role, read by AppHeader) ───
-- type is one of: session_tag, likes, comments, new_follower
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  sender_id    uuid REFERENCES auth.users ON DELETE SET NULL,
  type         text NOT NULL,
  session_id   text,
  title        text NOT NULL,
  body         text NOT NULL,
  read         boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Rows are inserted by the send-notification edge function using the service
-- role key, which bypasses RLS — no INSERT policy is needed for normal users.
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);
