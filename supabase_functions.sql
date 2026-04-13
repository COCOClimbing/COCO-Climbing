-- ─── Follow Count Functions ───────────────────────────────────────────────────
-- Run these in the Supabase SQL editor to create/update the functions.

CREATE OR REPLACE FUNCTION increment_follow_counts(sender uuid, receiver uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = sender;
  UPDATE profiles SET followers_count = COALESCE(followers_count, 0) + 1 WHERE id = receiver;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_follow_counts(sender uuid, receiver uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0) WHERE id = sender;
  UPDATE profiles SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0) WHERE id = receiver;
END;
$$;
