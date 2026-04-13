-- ─── COCO Complete Schema ────────────────────────────────────────────────────
-- 1. Run supabase_drop_all.sql first
-- 2. Then run this file
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id              uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name            text,
  username        text UNIQUE,
  avatar_url      text,
  hometown        text,
  bio             text,
  is_private      boolean NOT NULL DEFAULT false,
  following_count int NOT NULL DEFAULT 0,
  followers_count int NOT NULL DEFAULT 0,
  updated_at      timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_idx ON public.profiles (lower(username));

CREATE TABLE public.sessions (
  id          text PRIMARY KEY,
  user_id     uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date        text NOT NULL,
  environment text NOT NULL DEFAULT 'indoor',
  location    text,
  notes       text,
  synced_at   timestamptz DEFAULT now()
);

CREATE TABLE public.climbs (
  id           text PRIMARY KEY,
  user_id      uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  session_id   text,
  date         text,
  type         text,
  outcome      text,
  styles       jsonb DEFAULT '[]',
  environment  text,
  grade        text,
  grade_system text,
  route_name   text,
  location     text,
  notes        text,
  attempts     int DEFAULT 1,
  media_uri    text,
  media_type   text,
  project_id   text,
  project_name text,
  synced_at    timestamptz DEFAULT now()
);

CREATE TABLE public.projects (
  id               text PRIMARY KEY,
  user_id          uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name             text NOT NULL,
  grade            text,
  type             text,
  styles           jsonb DEFAULT '[]',
  created_at_local text,
  send_date        text,
  notes            text,
  location         text,
  media_uri        text,
  media_type       text,
  synced_at        timestamptz DEFAULT now()
);

CREATE TABLE public.friendships (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT unique_friendship UNIQUE (sender_id, receiver_id)
);

CREATE TABLE public.session_likes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_session_like UNIQUE (session_id, user_id)
);

CREATE TABLE public.session_comments (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  text       text NOT NULL,
  created_at timestamptz DEFAULT now()
);


-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.climbs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_comments ENABLE ROW LEVEL SECURITY;


-- ─── Profiles policies ────────────────────────────────────────────────────────

-- Anyone (including unauthenticated) can read profiles
-- Needed for username availability checks during signup
CREATE POLICY "Anyone can read profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);


-- ─── Sessions policies ────────────────────────────────────────────────────────

CREATE POLICY "Users can manage own sessions"
  ON public.sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Friends can view sessions"
  ON public.sessions FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.sender_id = auth.uid() AND f.receiver_id = user_id)
          OR (f.receiver_id = auth.uid() AND f.sender_id = user_id))
    )
  );


-- ─── Climbs policies ─────────────────────────────────────────────────────────

CREATE POLICY "Users can manage own climbs"
  ON public.climbs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Friends can view climbs"
  ON public.climbs FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.sender_id = auth.uid() AND f.receiver_id = user_id)
          OR (f.receiver_id = auth.uid() AND f.sender_id = user_id))
    )
  );


-- ─── Projects policies ───────────────────────────────────────────────────────

CREATE POLICY "Users can manage own projects"
  ON public.projects FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ─── Friendships policies ────────────────────────────────────────────────────

CREATE POLICY "Users can view own friendships"
  ON public.friendships FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update friendships they are part of"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can delete their own friendships"
  ON public.friendships FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);


-- ─── Likes & Comments policies ───────────────────────────────────────────────

CREATE POLICY "Anyone can view likes"         ON public.session_likes    FOR SELECT USING (true);
CREATE POLICY "Users can like"                ON public.session_likes    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike"              ON public.session_likes    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view comments"      ON public.session_comments FOR SELECT USING (true);
CREATE POLICY "Users can comment"             ON public.session_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.session_comments FOR DELETE USING (auth.uid() = user_id);


-- ─── Follow Count Trigger ────────────────────────────────────────────────────
-- Automatically keeps following_count / followers_count in sync whenever a
-- friendship row is inserted, updated (status change), or deleted.

CREATE FUNCTION sync_follow_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'accepted' THEN
      UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.sender_id;
      UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.receiver_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'accepted' AND NEW.status = 'accepted' THEN
      UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.sender_id;
      UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.receiver_id;
    ELSIF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
      UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = NEW.sender_id;
      UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = NEW.receiver_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'accepted' THEN
      UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.sender_id;
      UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.receiver_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER friendships_follow_counts
AFTER INSERT OR UPDATE OF status OR DELETE
ON public.friendships
FOR EACH ROW EXECUTE FUNCTION sync_follow_counts();


-- ─── Account Deletion ────────────────────────────────────────────────────────
-- Allows a signed-in user to delete their own auth account without needing a
-- service role key in the client app.

CREATE FUNCTION delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


-- ─── Realtime ────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
