# Privacy policy update — draft (2026-11-19)

Additions for https://cococlimbing.github.io/COCO-Climbing/privacy-policy, to cover the
Friends page update (suggestions, Gym/Crag matching, QR codes). Each block says where it goes.
Wording matches the current policy's tone. Not legal advice — have someone review if you can.

---

## 1. Header

Change the date:

> Last updated: November 19, 2026

---

## 2. "What We Collect" — add one bullet after "Climbing data"

> - **Approximate location of your sessions:** when you add a gym or crag to a session, COCO saves rough map coordinates for that place, rounded to about 100 metres. If you tap "Use my location", your phone's location is used once to find the place you're at. We only store the rounded coordinates of the session's location — we don't track your location over time or in the background.

---

## 3. "How We Use Your Data" — add one bullet

> - To suggest climbers you might want to follow: people who follow you, people followed by people you follow, and climbers who log sessions at the same gyms or crags as you

---

## 4. "Who Can See Your Data" — add two paragraphs at the end

> **Suggestions:** if your account is public, you may be suggested to other users who follow the same people you do, or who climb at the same gyms or crags. We show them a short reason, such as "Followed by Alex" or "Climbs at" one of *their own* gyms, but never your session locations or coordinates. Private accounts are never suggested to anyone. Session coordinates are never shown to other users; they're only used by our servers to find matches.
>
> **Profile QR code:** your profile QR code contains a link with your username. Anyone who scans it can open your profile in COCO, and what they can see follows your privacy settings, the same as finding you in search.

---

## 5. New section "Third-Party Services" — add after "Data Storage"

The current policy only names Supabase. These are the services the app actually sends data to
(checked in the code on 2026-11-19); keep the ones you're comfortable listing, but OpenStreetMap
is the one this update adds.

> **Third-Party Services**
>
> We use a small number of services to run COCO. None of them receive your data for advertising.
>
> - **Supabase** — stores your account and climbing data.
> - **Cloudflare** — stores the photos you upload.
> - **OpenStreetMap (Nominatim)** — when you search for a place, or when COCO looks up the coordinates of a gym or crag you typed, the place name is sent to OpenStreetMap's search service. Your name, email and account aren't sent with it, though like any web request it can see your device's IP address. See the OpenStreetMap Foundation's privacy policy.
> - **Sentry** — receives crash reports and performance data so we can fix bugs. Reports include device and app information and may include your account ID.
> - **Expo** — delivers push notifications to your device.

---

## 6. "Your Rights" — extend the delete bullet

> - You can delete your account and all associated data from Settings → Delete Account. This includes the approximate coordinates saved for your sessions.

(True as built: `session_coords` rows are deleted automatically when the session or account is deleted.)

---

## Also outside the policy page

- **App Store Connect → App Privacy:** declare **Precise Location**, *linked to the user*, used
  for *App Functionality*, not for tracking. Apple counts coordinates with 3+ decimal places as
  precise, and COCO stores 3. If Location is already declared there, check it's "Precise", not
  only "Coarse".
- The iOS permission text in `app.json` ("COCO uses your location to tag your climbing sessions
  with the gym or crag you're at.") is still accurate; no change needed.
