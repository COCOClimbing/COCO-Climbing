import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function deleteAllInBucket(bucket: string) {
  const { data: folders, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (error) { console.error(`Failed to list ${bucket}:`, error.message); return; }
  for (const folder of folders ?? []) {
    const { data: files, error: filesErr } = await supabase.storage.from(bucket).list(folder.name, { limit: 1000 });
    if (filesErr) { console.error(filesErr.message); continue; }
    if (!files?.length) continue;
    const paths = files.map(f => `${folder.name}/${f.name}`);
    const { error: delErr } = await supabase.storage.from(bucket).remove(paths);
    if (delErr) console.error('Delete failed:', delErr.message);
    else console.log(`Deleted ${paths.length} file(s) from ${bucket}/${folder.name}`);
  }
}

async function main() {
  await deleteAllInBucket('climbs');
  await deleteAllInBucket('avatars');
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
