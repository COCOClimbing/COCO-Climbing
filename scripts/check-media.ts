import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  // Check total row count first (no filters, no RLS)
  const { count, error: countErr } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true });
  if (countErr) { console.error('sessions count error:', countErr.message, countErr.code); }
  else console.log(`Total sessions in DB: ${count}`);

  const { count: climbCount, error: climbCountErr } = await supabase
    .from('climbs')
    .select('*', { count: 'exact', head: true });
  if (climbCountErr) { console.error('climbs count error:', climbCountErr.message, climbCountErr.code); }
  else console.log(`Total climbs in DB: ${climbCount}`);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('id, user_id, date, media_uris')
    .gte('date', cutoffStr)
    .order('date', { ascending: false })
    .limit(20);
  if (sessErr) console.error('sessions query error:', sessErr.message);

  console.log('\n=== Sessions (last 30 days) ===');
  if (!sessions?.length) { console.log('None.'); }
  for (const s of sessions ?? []) {
    const uris = s.media_uris ?? [];
    console.log(`Session ${s.id} (${s.date}, user ${s.user_id}):  ${uris.length} photo(s)`);
    for (const u of uris) console.log(`  ${u}`);
  }

  const sessionIds = (sessions ?? []).map(s => s.id);
  if (sessionIds.length === 0) { return; }

  const { data: climbs } = await supabase
    .from('climbs')
    .select('id, session_id, media_uri, media_uris')
    .in('session_id', sessionIds);

  console.log('\n=== Climbs with media ===');
  for (const c of climbs ?? []) {
    const uris = c.media_uris ?? (c.media_uri ? [c.media_uri] : []);
    if (uris.length === 0) continue;
    console.log(`Climb ${c.id} (session ${c.session_id}):`);
    for (const u of uris) console.log(`  ${u}`);
  }

  const climbsWithMedia = (climbs ?? []).filter(c =>
    (c.media_uris?.length > 0) || c.media_uri
  );
  console.log(`\nTotal climbs with media: ${climbsWithMedia.length} of ${climbs?.length ?? 0}`);
}

main().catch(e => { console.error(e); process.exit(1); });
