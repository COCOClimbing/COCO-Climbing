-- COCO: let the receiver of a pending follow request see the requester's profile row.
-- Applied to production 2026-10-05.
-- Needed so the Requests list shows the requester's name/photo and tapping the
-- follow-request notification opens their profile (with Accept), even when the
-- requester's own account is private.
-- Climbs/sessions stay accepted-only; this only affects the profiles table.

begin;

drop policy if exists "Users can view own, public, or accepted-connection profiles" on public.profiles;

create policy "Users can view own, public, accepted-connection, or requester profiles"
on public.profiles for select
using (
  auth.uid() = profiles.id
  or profiles.is_private = false
  or exists (
    select 1 from public.friendships f
    where (
        f.status = 'accepted'
        and ((f.sender_id = auth.uid() and f.receiver_id = profiles.id)
          or (f.receiver_id = auth.uid() and f.sender_id = profiles.id))
      )
      or (
        -- someone who asked to follow me: I can see their profile to decide
        f.status = 'pending'
        and f.receiver_id = auth.uid()
        and f.sender_id = profiles.id
      )
  )
);

commit;
