# R2 Media Storage Migration

**Date:** 2026-06-06  
**Status:** Approved

## Problem

COCO is exceeding Supabase Storage egress limits. Every photo load (climb feed, session feed, friend avatars) burns egress. Cloudflare R2 has zero egress charges.

## Scope

Move all media storage (climb photos, session photos, avatar photos) from Supabase Storage to Cloudflare R2. Supabase Postgres is unchanged — only the URLs stored in it change.

## Architecture

Three pieces:

### 1. R2 Bucket (`coco-media`)
- Public bucket — files served directly from Cloudflare CDN
- No Worker involvement for reads
- URLs: `https://pub-{hash}.r2.dev/{path}` (custom domain can be added later)
- Same path structure as Supabase Storage:
  - Climb photos: `{userId}/{climbId}_{index}.jpg`
  - Session photos: `{userId}/session_{sessionId}_{index}.jpg`
  - Avatars: `{userId}/avatar.jpg`

### 2. Cloudflare Worker (`coco-media`)
Handles uploads and deletes only. Two endpoints:

- `POST /upload?path={path}` — receives photo as `multipart/form-data`, writes to R2, returns `{ url: string }`
- `DELETE /delete?path={path}` — deletes a file from R2 (used during account deletion); same JWT auth and userId prefix validation as uploads

**Auth:** App sends Supabase JWT in `Authorization: Bearer {token}` header. Worker verifies the JWT signature locally using `SUPABASE_JWT_SECRET` (set as a Worker secret via `wrangler secret put`). No network call to Supabase on each request. The `userId` extracted from the verified JWT must match the prefix of the upload path — users cannot overwrite each other's files. Invalid or missing JWT returns 401.

**Worker secrets:**
- `SUPABASE_JWT_SECRET` — Supabase project JWT secret (from Supabase dashboard → Settings → API)

**R2 binding:** `BUCKET` → `coco-media`

### 3. Migration Script (`scripts/migrate-to-r2.ts`)
One-time Node.js script run locally:
1. List all files in Supabase Storage `climbs` and `avatars` buckets using the Supabase service role key
2. Download each file
3. Upload to R2 at the same path using the R2 REST API (authenticated with an R2 API token, not the Worker)
4. Update all `media_uris` / `media_uri` columns in `climbs` table and `avatar_url` in `profiles` table with new R2 URLs
5. Idempotent — safe to re-run (skips files that already have R2 URLs)

## App Changes

All upload logic currently lives in three places:
- `utils/cloudSync.ts` — `uploadClimbMedia`, `syncSessionToCloud` media block, `reuploadMissingMedia`
- `app/account.tsx` — avatar upload block

**New file: `utils/mediaUpload.ts`**
Single exported function:
```ts
uploadMedia(uri: string, path: string, accessToken: string): Promise<string>
```
POSTs the file to the Worker `/upload?path={path}` endpoint and returns the R2 public URL. Replaces every Supabase Storage `fetch(...)` + `getPublicUrl(...)` call across all three existing locations.

**Modified: `utils/AuthContext.tsx`**
Account deletion flow: swap `supabase.storage.from('avatars').remove(paths)` for a `DELETE /delete?path=` Worker call per file.

No DB schema changes. No new columns. No changes to how URLs are stored or read.

## Error Handling

- Upload fails: same behavior as today — local URI is kept, `reuploadMissingMedia` retries on next login
- Worker 401: treated as upload failure, local URI retained
- Migration script: logs failures per-file and continues; failed files can be re-run

## Out of Scope

- Video uploads (not currently supported)
- Custom R2 domain (can be added later without app changes)
- Deleting old Supabase Storage files after migration (manual cleanup after confirming R2 URLs are live)
