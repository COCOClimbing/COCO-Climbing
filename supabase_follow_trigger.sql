-- ─── Follow Count Trigger ────────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor.
-- It replaces the old RPC-based approach with a trigger that automatically
-- keeps following_count / followers_count in sync on every insert/update/delete.

-- Drop the old functions if they exist (no longer needed)
DROP FUNCTION IF EXISTS increment_follow_counts(uuid, uuid);
DROP FUNCTION IF EXISTS decrement_follow_counts(uuid, uuid);

-- Drop old trigger if re-running
DROP TRIGGER IF EXISTS friendships_follow_counts ON public.friendships;
DROP FUNCTION IF EXISTS sync_follow_counts();

-- Create the trigger function
CREATE FUNCTION sync_follow_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- ── INSERT ──────────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'accepted' THEN
      UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.sender_id;
      UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.receiver_id;
    END IF;
    RETURN NEW;

  -- ── UPDATE (status changed) ──────────────────────────────────────────────
  ELSIF TG_OP = 'UPDATE' THEN
    -- pending → accepted: increment
    IF OLD.status <> 'accepted' AND NEW.status = 'accepted' THEN
      UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.sender_id;
      UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.receiver_id;
    -- accepted → something else: decrement
    ELSIF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
      UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = NEW.sender_id;
      UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = NEW.receiver_id;
    END IF;
    RETURN NEW;

  -- ── DELETE ──────────────────────────────────────────────────────────────────
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'accepted' THEN
      UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.sender_id;
      UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.receiver_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$;

-- Attach the trigger to the friendships table
CREATE TRIGGER friendships_follow_counts
AFTER INSERT OR UPDATE OF status OR DELETE
ON public.friendships
FOR EACH ROW EXECUTE FUNCTION sync_follow_counts();

-- ─── Reset existing counts to match reality ──────────────────────────────────
-- This recalculates counts from scratch based on current friendship data.
UPDATE profiles p SET
  following_count = (
    SELECT COUNT(*) FROM friendships f
    WHERE f.sender_id = p.id AND f.status = 'accepted'
  ),
  followers_count = (
    SELECT COUNT(*) FROM friendships f
    WHERE f.receiver_id = p.id AND f.status = 'accepted'
  );
