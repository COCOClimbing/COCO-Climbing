# R2 Media Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all media storage (climb photos, session photos, avatars) from Supabase Storage to Cloudflare R2 to eliminate egress charges.

**Architecture:** A Cloudflare Worker validates Supabase JWTs and proxies photo uploads to an R2 bucket. The R2 bucket is public so reads bypass the Worker entirely and are served from Cloudflare's CDN at zero cost. A one-time migration script downloads all existing files from Supabase Storage and re-uploads them to R2, then updates the URLs stored in Postgres.

**Tech Stack:** Cloudflare Workers (TypeScript), Cloudflare R2, Wrangler CLI, Node.js migration script with `@aws-sdk/client-s3` (R2 S3-compatible API), React Native app changes.

---

## File Map

**Create:**
- `worker/src/index.ts` — Cloudflare Worker: JWT auth, upload proxy, delete endpoint
- `worker/wrangler.toml` — Worker config: R2 binding, public base URL var
- `worker/package.json` — Worker dev dependencies (wrangler, typescript)
- `worker/tsconfig.json` — TypeScript config for the Worker
- `utils/mediaUpload.ts` — App helper: `uploadMedia(uri, path, token)` and `deleteMedia(path, token)`
- `scripts/migrate-to-r2.ts` — One-time migration: download from Supabase, upload to R2, update DB URLs

**Modify:**
- `utils/cloudSync.ts` — Replace all 4 Supabase Storage upload blocks with `uploadMedia`
- `app/account.tsx:309-326` — Replace avatar upload block with `uploadMedia`
- `utils/AuthContext.tsx:214-217` — Replace `supabase.storage.remove` with `deleteMedia`

---

## Task 1: Create R2 Bucket and Enable Public Access

**Files:** None (Cloudflare dashboard steps)

- [ ] **Step 1: Open Cloudflare dashboard**

  Go to https://dash.cloudflare.com → R2 Object Storage → Create bucket.
  Name: `coco-media`, Region: automatic. Click Create.

- [ ] **Step 2: Enable public access**

  Inside the `coco-media` bucket → Settings tab → Public Access → Allow Access.
  Cloudflare assigns a public URL like `https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev`.
  **Copy this URL — you'll need it in Task 2 and Task 9.**

- [ ] **Step 3: Create an R2 API token for the migration script**

  Cloudflare dashboard → R2 → Manage R2 API Tokens → Create API Token.
  Permissions: Object Read & Write, apply to `coco-media` bucket only.
  Save the **Access Key ID** and **Secret Access Key** — shown once.

---

## Task 2: Create and Configure the Worker Project

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`

- [ ] **Step 1: Scaffold the Worker project**

  ```bash
  mkdir -p worker/src
  cd worker
  npm init -y
  npm install --save-dev wrangler typescript
  ```

- [ ] **Step 2: Create `worker/tsconfig.json`**

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022"],
      "module": "ES2022",
      "moduleResolution": "bundler",
      "strict": true,
      "noEmit": true
    },
    "include": ["src/**/*.ts"]
  }
  ```

- [ ] **Step 3: Create `worker/wrangler.toml`**

  Replace `pub-REPLACE_ME` with the public URL you copied in Task 1 Step 2.
  Replace `YOUR_CLOUDFLARE_ACCOUNT_ID` with your account ID (found at dash.cloudflare.com → top-right).

  ```toml
  name = "coco-media"
  main = "src/index.ts"
  compatibility_date = "2024-09-23"

  [[r2_buckets]]
  binding = "BUCKET"
  bucket_name = "coco-media"

  [vars]
  R2_PUBLIC_BASE_URL = "https://pub-REPLACE_ME.r2.dev"
  ```

- [ ] **Step 4: Add a dev script to `worker/package.json`**

  Open `worker/package.json` and add a `scripts` section:

  ```json
  {
    "name": "coco-media-worker",
    "version": "1.0.0",
    "private": true,
    "scripts": {
      "dev": "wrangler dev",
      "deploy": "wrangler deploy"
    },
    "devDependencies": {
      "typescript": "^5.0.0",
      "wrangler": "^3.0.0"
    }
  }
  ```

---

## Task 3: Implement the Worker

**Files:**
- Create: `worker/src/index.ts`

- [ ] **Step 1: Create `worker/src/index.ts`**

  ```typescript
  interface Env {
    BUCKET: R2Bucket;
    SUPABASE_JWT_SECRET: string;
    R2_PUBLIC_BASE_URL: string;
  }

  function base64urlToBytes(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  }

  async function verifyJWT(token: string, secret: string): Promise<string | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts;

      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const valid = await crypto.subtle.verify(
        'HMAC',
        key,
        base64urlToBytes(signature),
        new TextEncoder().encode(`${header}.${payload}`)
      );
      if (!valid) return null;

      const claims = JSON.parse(
        new TextDecoder().decode(base64urlToBytes(payload))
      );
      if (claims.exp && claims.exp < Date.now() / 1000) return null;
      return claims.sub ?? null;
    } catch {
      return null;
    }
  }

  export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      const path = url.searchParams.get('path');
      if (!path) return new Response('Missing path', { status: 400 });

      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401 });
      }

      const userId = await verifyJWT(auth.slice(7), env.SUPABASE_JWT_SECRET);
      if (!userId) return new Response('Unauthorized', { status: 401 });
      if (!path.startsWith(`${userId}/`)) {
        return new Response('Forbidden', { status: 403 });
      }

      if (request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) return new Response('Missing file', { status: 400 });

        await env.BUCKET.put(path, file.stream(), {
          httpMetadata: { contentType: 'image/jpeg' },
        });

        return Response.json({ url: `${env.R2_PUBLIC_BASE_URL}/${path}` });
      }

      if (request.method === 'DELETE') {
        await env.BUCKET.delete(path);
        return new Response(null, { status: 204 });
      }

      return new Response('Method not allowed', { status: 405 });
    },
  };
  ```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

  ```bash
  cd worker && npx tsc --noEmit
  ```

  Expected: no errors.

---

## Task 4: Deploy the Worker and Set Secrets

**Files:** None

- [ ] **Step 1: Authenticate wrangler with your Cloudflare account**

  ```bash
  cd worker && npx wrangler login
  ```

  This opens a browser window. Log in and approve.

- [ ] **Step 2: Set the Supabase JWT secret as a Worker secret**

  Find your JWT secret: Supabase Dashboard → your project → Settings → API → JWT Secret (the long string under "JWT Settings").

  ```bash
  cd worker && npx wrangler secret put SUPABASE_JWT_SECRET
  ```

  Paste the secret when prompted. Press Enter.

- [ ] **Step 3: Deploy the Worker**

  ```bash
  cd worker && npm run deploy
  ```

  Expected output ends with:
  ```
  Published coco-media (X.XX sec)
    https://coco-media.YOUR_SUBDOMAIN.workers.dev
  ```

  **Copy the Worker URL** — you'll need it in Task 5.

- [ ] **Step 4: Smoke-test the Worker rejects unauthenticated requests**

  ```bash
  curl -X POST "https://coco-media.YOUR_SUBDOMAIN.workers.dev/upload?path=test/test.jpg" -v
  ```

  Expected: `401 Unauthorized`

---

## Task 5: Create `utils/mediaUpload.ts`

**Files:**
- Create: `utils/mediaUpload.ts`

- [ ] **Step 1: Create `utils/mediaUpload.ts`**

  Replace `https://coco-media.YOUR_SUBDOMAIN.workers.dev` with the URL from Task 4 Step 3.

  ```typescript
  const WORKER_URL = 'https://coco-media.YOUR_SUBDOMAIN.workers.dev';

  export async function uploadMedia(
    uri: string,
    path: string,
    accessToken: string
  ): Promise<string> {
    const formData = new FormData();
    formData.append('file', { uri, name: 'upload.jpg', type: 'image/jpeg' } as any);

    const res = await fetch(`${WORKER_URL}/upload?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const { url } = await res.json();
    return url as string;
  }

  export async function deleteMedia(
    path: string,
    accessToken: string
  ): Promise<void> {
    await fetch(`${WORKER_URL}/delete?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add worker/ utils/mediaUpload.ts
  git commit -m "feat: add Cloudflare Worker and mediaUpload helper for R2 storage"
  ```

---

## Task 6: Update `utils/cloudSync.ts`

There are 4 upload blocks in this file. All follow the same pattern — build a FormData, POST to Supabase Storage, call `getPublicUrl`. Replace each with a single `uploadMedia` call.

**Files:**
- Modify: `utils/cloudSync.ts`

- [ ] **Step 1: Add the import at the top of `utils/cloudSync.ts`**

  Add this line after the existing imports:

  ```typescript
  import { uploadMedia } from './mediaUpload';
  ```

- [ ] **Step 2: Replace the upload block in `uploadClimbMedia` (around line 151–179)**

  Find this block (inside the `for` loop, after the `if (uri.startsWith('http'))` branch):

  ```typescript
    try {
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const path = `${userId}/${climb.id}_${i}.${ext}`;
        const formData = new FormData();
        formData.append('file', { uri, name: `climb.${ext}`, type: type === 'video' ? 'video/mp4' : 'image/jpeg' } as any);
        const res = await fetch(
          `https://oexaqytotrxqbxmzqabu.supabase.co/storage/v1/object/climbs/${path}`,
          { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'x-upsert': 'true' }, body: formData }
        );
        if (res.ok) {
          const { data: { publicUrl } } = supabase.storage.from('climbs').getPublicUrl(path);
          newUris.push(publicUrl);
          newTypes.push(type);
          changed = true;
        } else {
          newUris.push(uri);
          newTypes.push(type);
        }
      } catch {
        newUris.push(uri);
        newTypes.push(type);
      }
  ```

  Replace with:

  ```typescript
    try {
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const path = `${userId}/${climb.id}_${i}.${ext}`;
        const url = await uploadMedia(uri, path, session.access_token);
        newUris.push(url);
        newTypes.push(type);
        changed = true;
      } catch {
        newUris.push(uri);
        newTypes.push(type);
      }
  ```

- [ ] **Step 3: Replace the upload block in `syncSessionToCloud` (around line 216–229)**

  Find this block (inside the `for` loop, after the `if (uri.startsWith('http'))` branch):

  ```typescript
        try {
          const ext = type === 'video' ? 'mp4' : 'jpg';
          const path = `${userId}/session_${session.id}_${i}.${ext}`;
          const formData = new FormData();
          formData.append('file', { uri, name: `session.${ext}`, type: type === 'video' ? 'video/mp4' : 'image/jpeg' } as any);
          const res = await fetch(
            `https://oexaqytotrxqbxmzqabu.supabase.co/storage/v1/object/climbs/${path}`,
            { method: 'POST', headers: { Authorization: `Bearer ${authSession.access_token}`, 'x-upsert': 'true' }, body: formData }
          );
          if (res.ok) {
            const { data: { publicUrl } } = supabase.storage.from('climbs').getPublicUrl(path);
            newUris.push(publicUrl); newTypes.push(type); changed = true;
          } else { newUris.push(uri); newTypes.push(type); }
        } catch { newUris.push(uri); newTypes.push(type); }
  ```

  Replace with:

  ```typescript
        try {
          const ext = type === 'video' ? 'mp4' : 'jpg';
          const path = `${userId}/session_${session.id}_${i}.${ext}`;
          const url = await uploadMedia(uri, path, authSession.access_token);
          newUris.push(url); newTypes.push(type); changed = true;
        } catch { newUris.push(uri); newTypes.push(type); }
  ```

- [ ] **Step 4: Replace the upload block in `reuploadMissingMedia` — climb loop (around line 412–429)**

  Find this block (inside the climb `for` loop, after the `if (uri.startsWith('http'))` branch):

  ```typescript
      try {
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const path = `${userId}/${climb.id}_${i}.${ext}`;
        const formData = new FormData();
        formData.append('file', { uri, name: `climb.${ext}`, type: type === 'video' ? 'video/mp4' : 'image/jpeg' } as any);
        const res = await fetch(
          `https://oexaqytotrxqbxmzqabu.supabase.co/storage/v1/object/climbs/${path}`,
          { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'x-upsert': 'true' }, body: formData }
        );
        if (res.ok) {
          const { data: { publicUrl } } = supabase.storage.from('climbs').getPublicUrl(path);
          newUris.push(publicUrl);
          newTypes.push(type);
          changed = true;
        } else {
          newUris.push(uri);
          newTypes.push(type);
        }
      } catch {
        newUris.push(uri);
        newTypes.push(type);
      }
  ```

  Replace with:

  ```typescript
      try {
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const path = `${userId}/${climb.id}_${i}.${ext}`;
        const url = await uploadMedia(uri, path, session.access_token);
        newUris.push(url);
        newTypes.push(type);
        changed = true;
      } catch {
        newUris.push(uri);
        newTypes.push(type);
      }
  ```

- [ ] **Step 5: Replace the upload block in `reuploadMissingMedia` — session loop (around line 479–491)**

  Find this block (inside the session `for` loop, after the `if (uri.startsWith('http'))` branch):

  ```typescript
      try {
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const path = `${userId}/session_${s.id}_${i}.${ext}`;
        const formData = new FormData();
        formData.append('file', { uri, name: `session.${ext}`, type: type === 'video' ? 'video/mp4' : 'image/jpeg' } as any);
        const res = await fetch(
          `https://oexaqytotrxqbxmzqabu.supabase.co/storage/v1/object/climbs/${path}`,
          { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'x-upsert': 'true' }, body: formData }
        );
        if (res.ok) {
          const { data: { publicUrl } } = supabase.storage.from('climbs').getPublicUrl(path);
          newUris.push(publicUrl); newTypes.push(type); changed = true;
        } else { newUris.push(uri); newTypes.push(type); }
      } catch { newUris.push(uri); newTypes.push(type); }
  ```

  Replace with:

  ```typescript
      try {
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const path = `${userId}/session_${s.id}_${i}.${ext}`;
        const url = await uploadMedia(uri, path, session.access_token);
        newUris.push(url); newTypes.push(type); changed = true;
      } catch { newUris.push(uri); newTypes.push(type); }
  ```

- [ ] **Step 6: Remove the now-unused `getPublicUrl` reference check**

  Search `utils/cloudSync.ts` for any remaining references to `supabase.storage.from('climbs')` — there should be none left after the above replacements. Verify:

  ```bash
  grep -n "supabase.storage" utils/cloudSync.ts
  ```

  Expected: no output.

- [ ] **Step 7: Commit**

  ```bash
  git add utils/cloudSync.ts
  git commit -m "feat: route climb and session media uploads through R2 Worker"
  ```

---

## Task 7: Update `app/account.tsx`

**Files:**
- Modify: `app/account.tsx`

- [ ] **Step 1: Add import at the top of `app/account.tsx`**

  Add after the existing imports:

  ```typescript
  import { uploadMedia } from '../utils/mediaUpload';
  ```

- [ ] **Step 2: Replace the upload block in `handleConfirmAvatar` (lines 309–326)**

  Find:

  ```typescript
      const path = `${user.id}/avatar.jpg`;
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('file', { uri: avatarUri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
      const uploadResponse = await fetch(
        `https://oexaqytotrxqbxmzqabu.supabase.co/storage/v1/object/avatars/${path}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-upsert': 'true',
          },
          body: formData,
        }
      );
      if (!uploadResponse.ok) throw new Error(await uploadResponse.text());
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await upsertProfile(user.id, profileName ?? '', publicUrl);
  ```

  Replace with:

  ```typescript
      const path = `${user.id}/avatar.jpg`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const publicUrl = await uploadMedia(avatarUri, path, session.access_token);
      await upsertProfile(user.id, profileName ?? '', publicUrl);
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/account.tsx
  git commit -m "feat: route avatar uploads through R2 Worker"
  ```

---

## Task 8: Update `utils/AuthContext.tsx`

**Files:**
- Modify: `utils/AuthContext.tsx`

- [ ] **Step 1: Add import at the top of `utils/AuthContext.tsx`**

  Add after the existing imports:

  ```typescript
  import { deleteMedia } from './mediaUpload';
  ```

- [ ] **Step 2: Replace the avatar delete block in `deleteAccount` (lines 214–217)**

  Find:

  ```typescript
      // Delete avatar files from storage (not covered by DB cascade)
      const { data: avatarFiles } = await supabase.storage.from('avatars').list(uid);
      if (avatarFiles && avatarFiles.length > 0) {
        const paths = avatarFiles.map(f => `${uid}/${f.name}`);
        await supabase.storage.from('avatars').remove(paths);
      }
  ```

  Replace with:

  ```typescript
      // Delete avatar from R2 (not covered by DB cascade)
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (authSession) {
        await deleteMedia(`${uid}/avatar.jpg`, authSession.access_token);
      }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add utils/AuthContext.tsx
  git commit -m "feat: route avatar deletion through R2 Worker"
  ```

---

## Task 9: Write the Migration Script

**Files:**
- Create: `scripts/migrate-to-r2.ts`

- [ ] **Step 1: Install dependencies needed for the script**

  ```bash
  npm install --save-dev @aws-sdk/client-s3 tsx
  ```

- [ ] **Step 2: Create `scripts/migrate-to-r2.ts`**

  ```typescript
  import { createClient } from '@supabase/supabase-js';
  import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_BASE_URL,
  } = process.env as Record<string, string>;

  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE_URL']) {
    if (!process.env[key]) { console.error(`Missing env var: ${key}`); process.exit(1); }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  const R2_BUCKET = 'coco-media';

  // Extracts bucket name and path from a Supabase Storage public URL.
  // e.g. https://xxx.supabase.co/storage/v1/object/public/climbs/userId/climbId_0.jpg
  //   -> { bucket: 'climbs', path: 'userId/climbId_0.jpg' }
  function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
    const match = url.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)/);
    if (!match) return null;
    return { bucket: match[1], path: match[2] };
  }

  async function migrateUrl(supabaseUrl: string): Promise<string> {
    if (supabaseUrl.startsWith(R2_PUBLIC_BASE_URL)) return supabaseUrl; // already migrated

    const parsed = parseSupabaseStorageUrl(supabaseUrl);
    if (!parsed) {
      console.warn(`  Skipping unrecognised URL: ${supabaseUrl}`);
      return supabaseUrl;
    }

    const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) {
      console.error(`  FAILED to download: ${parsed.path} — ${error?.message}`);
      return supabaseUrl;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: parsed.path,
      Body: buffer,
      ContentType: 'image/jpeg',
    }));

    const r2Url = `${R2_PUBLIC_BASE_URL}/${parsed.path}`;
    console.log(`  ✓ ${parsed.path}`);
    return r2Url;
  }

  async function main() {
    console.log('=== R2 Migration ===\n');

    // ── Climb media ───────────────────────────────────────────────────────────
    console.log('Migrating climb media...');
    const { data: climbs, error: climbsErr } = await supabase
      .from('climbs')
      .select('id, media_uris, media_uri')
      .not('media_uris', 'is', null);
    if (climbsErr) { console.error('Failed to fetch climbs:', climbsErr.message); process.exit(1); }

    for (const climb of climbs ?? []) {
      const uris: string[] = climb.media_uris ?? [];
      if (uris.every((u: string) => u.startsWith(R2_PUBLIC_BASE_URL))) continue;
      console.log(`Climb ${climb.id} (${uris.length} photo(s)):`);
      const newUris = await Promise.all(uris.map(migrateUrl));
      await supabase.from('climbs').update({ media_uris: newUris, media_uri: newUris[0] }).eq('id', climb.id);
    }

    // ── Session media ─────────────────────────────────────────────────────────
    console.log('\nMigrating session media...');
    const { data: sessions, error: sessionsErr } = await supabase
      .from('sessions')
      .select('id, media_uris, media_uri')
      .not('media_uris', 'is', null);
    if (sessionsErr) { console.error('Failed to fetch sessions:', sessionsErr.message); process.exit(1); }

    for (const session of sessions ?? []) {
      const uris: string[] = session.media_uris ?? [];
      if (uris.every((u: string) => u.startsWith(R2_PUBLIC_BASE_URL))) continue;
      console.log(`Session ${session.id} (${uris.length} photo(s)):`);
      const newUris = await Promise.all(uris.map(migrateUrl));
      await supabase.from('sessions').update({ media_uris: newUris, media_uri: newUris[0] }).eq('id', session.id);
    }

    // ── Avatar photos ─────────────────────────────────────────────────────────
    console.log('\nMigrating avatars...');
    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .not('avatar_url', 'is', null)
      .ilike('avatar_url', '%supabase%');
    if (profilesErr) { console.error('Failed to fetch profiles:', profilesErr.message); process.exit(1); }

    for (const profile of profiles ?? []) {
      console.log(`Profile ${profile.id}:`);
      const newUrl = await migrateUrl(profile.avatar_url);
      if (newUrl !== profile.avatar_url) {
        await supabase.from('profiles').update({ avatar_url: newUrl }).eq('id', profile.id);
      }
    }

    console.log('\n=== Migration complete ===');
  }

  main().catch(e => { console.error(e); process.exit(1); });
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add scripts/migrate-to-r2.ts package.json package-lock.json
  git commit -m "feat: add R2 migration script"
  ```

---

## Task 10: Run the Migration and Verify

**Files:** None

- [ ] **Step 1: Gather your environment variables**

  You need:
  - `SUPABASE_URL` — your Supabase project URL (e.g. `https://oexaqytotrxqbxmzqabu.supabase.co`)
  - `SUPABASE_SERVICE_KEY` — Supabase Dashboard → Settings → API → `service_role` key (secret, not `anon`)
  - `R2_ACCOUNT_ID` — Cloudflare Dashboard → right sidebar → Account ID
  - `R2_ACCESS_KEY_ID` — the key you created in Task 1 Step 3
  - `R2_SECRET_ACCESS_KEY` — the secret from Task 1 Step 3
  - `R2_PUBLIC_BASE_URL` — the `https://pub-xxx.r2.dev` URL from Task 1 Step 2

- [ ] **Step 2: Run the migration script**

  ```bash
  SUPABASE_URL="https://oexaqytotrxqbxmzqabu.supabase.co" \
  SUPABASE_SERVICE_KEY="your-service-role-key" \
  R2_ACCOUNT_ID="your-account-id" \
  R2_ACCESS_KEY_ID="your-r2-access-key-id" \
  R2_SECRET_ACCESS_KEY="your-r2-secret-access-key" \
  R2_PUBLIC_BASE_URL="https://pub-xxx.r2.dev" \
  npx tsx scripts/migrate-to-r2.ts
  ```

  Expected: a line per file showing `✓ userId/climbId_0.jpg`, ending with `=== Migration complete ===`.

- [ ] **Step 3: Verify a sample URL in the database**

  Open Supabase Dashboard → Table Editor → `climbs` table. Pick any row with a `media_uris` value. The URLs should now start with `https://pub-xxx.r2.dev/` instead of `https://oexaqytotrxqbxmzqabu.supabase.co/`.

- [ ] **Step 4: Verify an image loads from R2**

  Copy one of the new R2 URLs from the database and open it in a browser. The image should load.

- [ ] **Step 5: Test a new upload in the app**

  Run the app (`npx expo start`), log in, log a new climb with a photo. Check the Supabase `climbs` table — the new `media_uris` entry should start with `https://pub-xxx.r2.dev/`.

- [ ] **Step 6: Final commit**

  ```bash
  git add -A
  git commit -m "chore: complete R2 migration — all media now served from Cloudflare"
  ```

---

## Post-Migration Cleanup (Optional, do after confirming everything works)

Once you've confirmed the app is working fully on R2, you can delete the old files from Supabase Storage to stop them counting against your storage quota:

- Supabase Dashboard → Storage → `climbs` bucket → select all → delete
- Supabase Dashboard → Storage → `avatars` bucket → select all → delete

Don't do this until you're confident the migration is complete and the app is healthy.
