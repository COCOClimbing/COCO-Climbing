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

function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)/);
  if (!match) return null;
  return { bucket: match[1], path: match[2] };
}

async function migrateUrl(supabaseUrl: string): Promise<string> {
  if (supabaseUrl.startsWith(R2_PUBLIC_BASE_URL)) return supabaseUrl;

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
