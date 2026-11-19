// Rough coordinates for session locations, used by Find Friends → "Climbers at
// your gyms" (supabase_climbers_at_my_gyms.sql). Locations are typed names, so
// matching is by distance: "Ascend PB" and the gym's street address land on the
// same building.
//
// Coordinates come from, in order:
//   1. the Location picker (a map search result or "use my location") — cached
//      here by name the moment a place is picked;
//   2. a one-off OpenStreetMap lookup of the name, for anything typed by hand
//      and for sessions logged before this existed.
// Vague places (a city, a state) are ignored: "Pittsburgh" would match a whole
// city. Coordinates are rounded to ~100 m and uploaded to an owner-only table.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getAllSessions } from './storage';

// v2: v1 accepted loose name lookups (a made-up "Other Wall" matched a trail sign)
const CACHE_KEY = 'coco_location_coords_v2';
// Names that looked up as vague/unknown are retried after this long
const MISS_RETRY_MS = 14 * 24 * 60 * 60 * 1000;
// OpenStreetMap allows one lookup a second; keep each sync short
const MAX_LOOKUPS_PER_SYNC = 15;

type Coords = { lat: number; lng: number };
type CacheEntry = Coords | { miss: number };
type Cache = Record<string, CacheEntry>;

function key(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000; // ~110 m
}

async function readCache(): Promise<Cache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeCache(cache: Cache) {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// Called by the Location picker when the saved name came from a map result or GPS
export async function rememberLocationCoords(name: string, lat: number, lng: number) {
  const k = key(name);
  if (!k || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const cache = await readCache();
  cache[k] = { lat: round(lat), lng: round(lng) };
  await writeCache(cache);
}

// OpenStreetMap categories a gym or crag can be
const PLACE_CATEGORIES = new Set(['leisure', 'sport', 'amenity', 'building', 'shop', 'club', 'natural', 'office']);

function words(t: string): string[] {
  return t.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
}

// Is this search hit really the place that was typed? Typed names are loose
// (a made-up "Other Wall" found a trail sign describing a wall), so:
//  - an address (has a street number) must come back as a house/building;
//  - a name must come back as a gym-like place whose own name either holds
//    all the typed words (and not many more) or is contained in what was
//    typed ("Bouldering Project Tempe" -> "Bouldering Project").
function trustworthy(query: string, hit: any): boolean {
  const head = query.split(',')[0];
  if (/\d/.test(head)) return (hit.category === 'place' && hit.type === 'house') || hit.category === 'building';
  if (!PLACE_CATEGORIES.has(hit.category)) return false;
  const want = words(head);
  const got = words(`${hit.name ?? ''}`);
  if (want.length === 0 || got.length === 0) return false;
  const gotSet = new Set(got), wantSet = new Set(want);
  const typedInName = want.every(w => gotSet.has(w)) && got.length <= want.length + 2;
  const nameInTyped = got.length >= 2 && got.every(w => wantSet.has(w));
  return typedInName || nameInTyped;
}

async function lookUp(name: string): Promise<Coords | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=jsonv2&limit=3`;
  const res = await fetch(url, { headers: { 'User-Agent': 'COCO-ClimbingApp/1.0' } });
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  const hits: any[] = await res.json();
  const hit = hits.find(h => trustworthy(name, h));
  if (!hit) return null;
  const lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: round(lat), lng: round(lng) } : null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let running: Promise<void> | null = null;

// Makes the server's session_coords match this phone's sessions. Runs after the
// launch sync; safe to call repeatedly (overlapping calls share one run).
export function syncSessionCoords(userId: string): Promise<void> {
  if (!running) running = runSync(userId).finally(() => { running = null; });
  return running;
}

async function runSync(userId: string) {
  const sessions = (await getAllSessions()).filter(s => s.location?.trim());
  if (sessions.length === 0) return;

  const { data: remoteRows, error } = await supabase
    .from('session_coords')
    .select('session_id, lat, lng')
    .eq('user_id', userId);
  if (error) return; // table not created yet, or offline
  const remote = new Map((remoteRows ?? []).map(r => [r.session_id as string, r as { lat: number; lng: number }]));

  const cache = await readCache();
  let lookups = 0;
  let cacheChanged = false;
  const upserts: { session_id: string; user_id: string; lat: number; lng: number; updated_at: string }[] = [];
  const deletes: string[] = [];

  for (const s of sessions) {
    const k = key(s.location!);
    let entry = cache[k];
    const stale = entry && 'miss' in entry && Date.now() - entry.miss > MISS_RETRY_MS;
    if ((!entry || stale) && lookups < MAX_LOOKUPS_PER_SYNC) {
      if (lookups > 0) await sleep(1100);
      lookups++;
      try {
        const found = await lookUp(s.location!.trim());
        entry = found ?? { miss: Date.now() };
        cache[k] = entry;
        cacheChanged = true;
      } catch {
        // offline or rate-limited: try again next sync
      }
    }

    const have = remote.get(s.id);
    if (entry && !('miss' in entry)) {
      if (!have || have.lat !== entry.lat || have.lng !== entry.lng) {
        upserts.push({ session_id: s.id, user_id: userId, lat: entry.lat, lng: entry.lng, updated_at: new Date().toISOString() });
      }
    } else if (entry && have) {
      // Location was changed to something vague: drop the old coordinates
      deletes.push(s.id);
    }
  }

  if (cacheChanged) await writeCache(cache);
  if (upserts.length > 0) {
    // Upsert one by one so a session that hasn't reached the server yet
    // (insert policy needs the session row) doesn't block the rest.
    for (const row of upserts) {
      await supabase.from('session_coords').upsert(row, { onConflict: 'session_id' });
    }
  }
  if (deletes.length > 0) {
    await supabase.from('session_coords').delete().eq('user_id', userId).in('session_id', deletes);
  }
}
