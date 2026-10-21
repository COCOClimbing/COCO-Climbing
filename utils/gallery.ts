import { supabase } from './supabase';
import { getAllSessions, getAllClimbs } from './storage';
import * as FileSystem from 'expo-file-system/legacy';
import { isDeadMediaUrl } from './cloudSync';

// Photos for a profile's Gallery tab: every session photo plus every climb
// photo, newest session first. Videos are left out.

// Media fields are parallel arrays (uri i has type i), with a single legacy
// uri/type pair on older records.
function photosOf(uris: string[] | null | undefined, types: (string | null)[] | null | undefined, legacyUri?: string | null, legacyType?: string | null): string[] {
  if (uris && uris.length > 0) return uris.filter((_, i) => types?.[i] !== 'video');
  if (legacyUri && legacyType !== 'video') return [legacyUri];
  return [];
}

function dedupe(uris: string[]): string[] {
  return [...new Set(uris)];
}

// The signed-in user's photos, from local storage (so they include photos
// that haven't finished uploading yet).
export async function getMyGalleryPhotos(): Promise<string[]> {
  const [sessions, climbs] = await Promise.all([getAllSessions(), getAllClimbs()]);
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const uris = sorted.flatMap(s => [
    ...photosOf(s.mediaUris, s.mediaTypes, s.mediaUri, s.mediaType),
    ...climbs
      .filter(c => c.sessionId === s.id)
      .flatMap(c => photosOf(c.mediaUris, c.mediaTypes, c.mediaUri, c.mediaType)),
  ]);
  // Local file:// paths can outlive their file (e.g. image-picker cache
  // cleared, or a reinstall), so drop any that no longer exist.
  const candidates = dedupe(uris.filter(u => !isDeadMediaUrl(u)));
  const exists = await Promise.all(candidates.map(u =>
    u.startsWith('file:')
      ? FileSystem.getInfoAsync(u).then(i => i.exists).catch(() => false)
      : Promise.resolve(true),
  ));
  return candidates.filter((_, i) => exists[i]);
}

// Another user's photos. `climbs` is their full climb list (already loaded by
// the profile view); sessions are fetched here, ended ones only, matching
// what the activity feed shows. Only uploaded (http) media is visible to others.
export async function getFriendGalleryPhotos(friendId: string, climbs: any[]): Promise<string[]> {
  const { data } = await supabase
    .from('sessions')
    .select('id, date, started_at, media_uris, media_types')
    .eq('user_id', friendId)
    .not('ended_at', 'is', null)
    .order('date', { ascending: false });
  const sessions = data ?? [];
  const climbsBySession = new Map<string, any[]>();
  for (const c of climbs) {
    if (!c.session_id) continue;
    if (!climbsBySession.has(c.session_id)) climbsBySession.set(c.session_id, []);
    climbsBySession.get(c.session_id)!.push(c);
  }
  const uris = sessions.flatMap((s: any) => [
    ...photosOf(s.media_uris, s.media_types),
    ...(climbsBySession.get(s.id) ?? []).flatMap((c: any) => photosOf(c.media_uris, c.media_types, c.media_uri, c.media_type)),
  ]);
  return dedupe(uris.filter(u => u.startsWith('http') && !isDeadMediaUrl(u)));
}
