-- Run this in the Supabase SQL Editor.
-- Allows users to delete their own account from the app without needing
-- a service role key in client code.

DROP FUNCTION IF EXISTS delete_my_account();

CREATE FUNCTION delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
