import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getAllClimbs, getAllSessions, getAllNamedProjects, bulkSaveClimbs, bulkSaveSessions, bulkSaveNamedProjects, NamedProject, triggerClimbsRefresh, triggerFeedRefresh } from './storage';
import { uploadMedia } from './mediaUpload';

const SUPABASE_STORAGE_HOST = 'oexaqytotrxqbxmzqabu.supabase.co/storage';
const R2_MIGRATION_FLAG = 'coco_r2_migration_v3';

// Returns true if a URL points to deleted Supabase Storage (bucket was wiped)
export function isDeadMediaUrl(url: string): boolean {
  return url.includes(SUPABASE_STORAGE_HOST);
}

export async function migrateLocalMediaUrls(): Promise<boolean> {
  const done = await AsyncStorage.getItem(R2_MIGRATION_FLAG);
  if (done) return false;

  const [climbs, sessions] = await Promise.all([getAllClimbs(), getAllSessions()]);

  const migratedClimbs = climbs.map(c => {
    const uris = c.mediaUris ?? (c.mediaUri ? [c.mediaUri] : []);
    const liveUris = uris.filter(u => !isDeadMediaUrl(u));
    if (liveUris.length === uris.length) return c;
    return { ...c, mediaUris: liveUris.length > 0 ? liveUris : undefined, mediaUri: liveUris[0] };
  });

  const migratedSessions = sessions.map(s => {
    const uris = s.mediaUris ?? (s.mediaUri ? [s.mediaUri] : []);
    const liveUris = uris.filter(u => !isDeadMediaUrl(u));
    if (liveUris.length === uris.length) return s;
    return { ...s, mediaUris: liveUris.length > 0 ? liveUris : undefined, mediaUri: liveUris[0] };
  });

  await Promise.all([
    bulkSaveClimbs(migratedClimbs),
    bulkSaveSessions(migratedSessions),
  ]);

  await AsyncStorage.setItem(R2_MIGRATION_FLAG, '1');
  triggerClimbsRefresh();
  triggerFeedRefresh();
  return true;
}
import { Climb, Session } from './theme';

// ─── Upload all local data to Supabase ───────────────────────────────────────
export async function uploadAllLocalData(userId: string): Promise<void> {
  const [climbs, sessions, projects] = await Promise.all([
    getAllClimbs(),
    getAllSessions(),
    getAllNamedProjects(),
  ]);

  if (sessions.length > 0) {
    const rows = sessions.map(s => {
      const uris = (s.mediaUris ?? (s.mediaUri ? [s.mediaUri] : [])).filter(u => u.startsWith('http'));
      const types = uris.map((_, i) => s.mediaTypes?.[i] ?? s.mediaType ?? 'photo');
      // Omit media_uris entirely when local has none — undefined is stripped from
      // JSON, so the DB's existing R2 URL is preserved rather than overwritten with null.
      return {
        id: s.id,
        user_id: userId,
        date: s.date,
        environment: s.environment,
        location: s.location ?? null,
        notes: s.notes ?? null,
        title: s.title ?? null,
        friends: s.friends ?? null,
        ...(uris.length > 0 ? { media_uris: uris, media_types: types } : {}),
        ended_at: s.endedAt ?? null,
      };
    });
    const { error: sessErr } = await supabase.from('sessions').upsert(rows, { onConflict: 'id' });
    if (sessErr) console.warn('[uploadAllLocalData] sessions upsert failed:', sessErr.message, sessErr.code);
  }

  if (climbs.length > 0) {
    const rows = climbs.map(c => {
      const httpUris = (c.mediaUris ?? (c.mediaUri ? [c.mediaUri] : [])).filter(u => u.startsWith('http'));
      const httpTypes = httpUris.map((_, i) => c.mediaTypes?.[i] ?? c.mediaType ?? 'photo');
      const base = climbToRow(c, userId);
      if (httpUris.length > 0) {
        // Sync the http URIs explicitly
        return { ...base, media_uris: httpUris, media_uri: httpUris[0], media_types: httpTypes, media_type: httpTypes[0] };
      }
      // No http media locally: omit media fields so the DB's existing R2 URL is preserved.
      const { media_uris, media_uri, media_type, media_types, ...rest } = base;
      return rest;
    });
    const { error: climbErr } = await supabase.from('climbs').upsert(rows, { onConflict: 'id' });
    if (climbErr) console.warn('[uploadAllLocalData] climbs upsert failed:', climbErr.message, climbErr.code);
  }

  if (projects.length > 0) {
    const rows = projects.map(p => ({
      id: p.id,
      user_id: userId,
      name: p.name,
      grade: p.grade,
      type: p.type,
      styles: p.styles ?? [],
      created_at_local: p.createdAt,
    }));
    await supabase.from('projects').upsert(rows, { onConflict: 'id' });
  }
}

// ─── Pull all cloud data and overwrite local ──────────────────────────────────
export async function pullCloudData(userId: string): Promise<void> {
  const [sessionsRes, climbsRes, projectsRes] = await Promise.all([
    supabase.from('sessions').select('*').eq('user_id', userId),
    supabase.from('climbs').select('*').eq('user_id', userId),
    supabase.from('projects').select('*').eq('user_id', userId),
  ]);

  if (sessionsRes.data) {
    await bulkSaveSessions(sessionsRes.data.map(rowToSession));
  }

  if (climbsRes.data) {
    await bulkSaveClimbs(climbsRes.data.map(rowToClimb));
  }

  if (projectsRes.data) {
    await bulkSaveNamedProjects(projectsRes.data.map(rowToProject));
  }
}

// ─── Merge local + cloud by ID union (no data loss) ──────────────────────────
// Records with the same ID are the same record (IDs are device-generated UUIDs).
// Records only on one side are copied to the other. Nothing is ever deleted.
export async function mergeData(userId: string): Promise<void> {
  const [localClimbs, localSessions, localProjects] = await Promise.all([
    getAllClimbs(),
    getAllSessions(),
    getAllNamedProjects(),
  ]);

  const [sessionsRes, climbsRes, projectsRes] = await Promise.all([
    supabase.from('sessions').select('*').eq('user_id', userId),
    supabase.from('climbs').select('*').eq('user_id', userId),
    supabase.from('projects').select('*').eq('user_id', userId),
  ]);

  const cloudSessions = sessionsRes.data ?? [];
  const cloudClimbs   = climbsRes.data   ?? [];
  const cloudProjects = projectsRes.data ?? [];

  // Remove local climbs whose session was deleted (orphans from prior bug)
  const localSessionIds = new Set(localSessions.map(s => s.id));
  const cleanedLocalClimbs = localClimbs.filter(c => !c.sessionId || localSessionIds.has(c.sessionId));
  if (cleanedLocalClimbs.length < localClimbs.length) {
    await AsyncStorage.setItem('coco_climbs', JSON.stringify(cleanedLocalClimbs));
  }

  const localClimbIds   = new Set(cleanedLocalClimbs.map(c => c.id));
  const localProjectIds = new Set(localProjects.map(p => p.id));

  // Records that exist in cloud but not locally — pull them in
  const newSessions = cloudSessions.filter(r => !localSessionIds.has(r.id)).map(rowToSession);
  const newClimbs   = cloudClimbs.filter(r => !localClimbIds.has(r.id)).map(rowToClimb);
  const newProjects = cloudProjects.filter(r => !localProjectIds.has(r.id)).map(rowToProject);

  // For records that exist in both, backfill media URLs from DB into local when
  // local has none (e.g. after migrateLocalMediaUrls stripped dead Supabase URLs
  // but the DB still has the R2 URL from the migration script or a prior sync).
  const cloudSessionById = new Map(cloudSessions.map(r => [r.id, r]));
  const cloudClimbById   = new Map(cloudClimbs.map(r => [r.id, r]));

  const sessionsNeedingMedia = localSessions.filter(s => {
    if (s.mediaUris?.length) return false;
    const cloud = cloudSessionById.get(s.id);
    return cloud?.media_uris?.some((u: string) => u.startsWith('https://') && !isDeadMediaUrl(u));
  });
  const climbsNeedingMedia = cleanedLocalClimbs.filter(c => {
    if (c.mediaUris?.length) return false;
    const cloud = cloudClimbById.get(c.id);
    return cloud?.media_uris?.some((u: string) => u.startsWith('https://') && !isDeadMediaUrl(u));
  });

  const mergedSessions = sessionsNeedingMedia.length > 0
    ? localSessions.map(s => {
        const cloud = cloudSessionById.get(s.id);
        if (!s.mediaUris?.length && cloud?.media_uris?.length) {
          const uris = (cloud.media_uris as string[]).filter(u => u.startsWith('https://') && !isDeadMediaUrl(u));
          if (uris.length) return { ...s, mediaUris: uris, mediaUri: uris[0] };
        }
        return s;
      })
    : localSessions;

  const mergedClimbs = climbsNeedingMedia.length > 0
    ? cleanedLocalClimbs.map(c => {
        const cloud = cloudClimbById.get(c.id);
        if (!c.mediaUris?.length && cloud?.media_uris?.length) {
          const uris = (cloud.media_uris as string[]).filter(u => u.startsWith('https://') && !isDeadMediaUrl(u));
          if (uris.length) return { ...c, mediaUris: uris, mediaUri: uris[0] };
        }
        return c;
      })
    : cleanedLocalClimbs;

  const allSessions = [...mergedSessions, ...newSessions];
  const allClimbs   = [...mergedClimbs,   ...newClimbs];

  if (newSessions.length > 0 || sessionsNeedingMedia.length > 0) await bulkSaveSessions(allSessions);
  if (newClimbs.length > 0 || climbsNeedingMedia.length > 0) await bulkSaveClimbs(allClimbs);
  if (newProjects.length > 0) await bulkSaveNamedProjects([...localProjects, ...newProjects]);

  // If new cloud data was pulled into local storage, reload the activity feed
  if (newSessions.length > 0 || newClimbs.length > 0 || sessionsNeedingMedia.length > 0 || climbsNeedingMedia.length > 0) triggerFeedRefresh();

  // Upload everything local to cloud (covers records only on device)
  await uploadAllLocalData(userId);
}

// ─── Single-item sync (called after each save) ───────────────────────────────
export async function syncClimbToCloud(climb: Climb, userId: string): Promise<void> {
  const uris = climb.mediaUris ?? (climb.mediaUri ? [climb.mediaUri] : []);
  const hasLocalMedia = uris.some(u => !u.startsWith('http'));

  if (hasLocalMedia) {
    // Upload local photos to Storage first, then sync the updated climb
    await uploadClimbMedia(climb, userId);
    return;
  }

  // Retry up to 3 times with backoff in case the parent session sync hasn't
  // completed yet — the session_id FK constraint will reject the climb insert
  // if the session row doesn't exist in Supabase yet (race condition).
  const row = climbToRow(climb, userId);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1000));
    const { error } = await supabase.from('climbs').upsert(row, { onConflict: 'id' });
    if (!error || (error as any).code !== '23503') return;
  }
}

async function uploadClimbMedia(climb: Climb, userId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await supabase.from('climbs').upsert(climbToRow(climb, userId), { onConflict: 'id' });
    return;
  }

  const uris = climb.mediaUris ?? (climb.mediaUri ? [climb.mediaUri] : []);
  const types = climb.mediaTypes ?? (climb.mediaType ? [climb.mediaType] : uris.map(() => 'photo' as const));
  const newUris: string[] = [];
  const newTypes: ('photo' | 'video')[] = [];
  let changed = false;

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const type: 'photo' | 'video' = types[i] ?? 'photo';
    if (uri.startsWith('http')) {
      newUris.push(uri);
      newTypes.push(type);
      continue;
    }
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
  }

  const updatedClimb: Climb = changed
    ? { ...climb, mediaUris: newUris, mediaTypes: newTypes, mediaUri: newUris[0], mediaType: newTypes[0] }
    : climb;

  if (changed) {
    const { saveClimb } = await import('./storage');
    await saveClimb(updatedClimb);
  }

  await supabase.from('climbs').upsert(climbToRow(updatedClimb, userId), { onConflict: 'id' });
}

export async function deleteClimbFromCloud(id: string): Promise<void> {
  await supabase.from('climbs').delete().eq('id', id);
}

export async function syncSessionToCloud(session: Session, userId: string): Promise<void> {
  const uris = session.mediaUris ?? (session.mediaUri ? [session.mediaUri] : []);
  const hasLocalMedia = uris.some(u => !u.startsWith('http'));

  let mediaUris = uris;
  let mediaTypes = session.mediaTypes ?? (session.mediaType ? [session.mediaType] : uris.map(() => 'photo' as const));

  if (hasLocalMedia) {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (authSession) {
      const newUris: string[] = [];
      const newTypes: ('photo' | 'video')[] = [];
      let changed = false;
      for (let i = 0; i < uris.length; i++) {
        const uri = uris[i];
        const type: 'photo' | 'video' = mediaTypes[i] ?? 'photo';
        if (uri.startsWith('http')) { newUris.push(uri); newTypes.push(type); continue; }
        try {
          const ext = type === 'video' ? 'mp4' : 'jpg';
          const path = `${userId}/session_${session.id}_${i}.${ext}`;
          const url = await uploadMedia(uri, path, authSession.access_token);
          newUris.push(url); newTypes.push(type); changed = true;
        } catch { newUris.push(uri); newTypes.push(type); }
      }
      if (changed) {
        mediaUris = newUris;
        mediaTypes = newTypes;
        const { saveSession } = await import('./storage');
        await saveSession({ ...session, mediaUris: newUris, mediaTypes: newTypes, mediaUri: newUris[0], mediaType: newTypes[0] });
      }
    }
  }

  const finalUris = mediaUris.filter(u => u.startsWith('http'));
  await supabase.from('sessions').upsert({
    id: session.id,
    user_id: userId,
    date: session.date,
    environment: session.environment,
    location: session.location ?? null,
    notes: session.notes ?? null,
    title: session.title ?? null,
    friends: session.friends ?? null,
    media_uris: finalUris.length > 0 ? finalUris : null,
    media_types: finalUris.length > 0 ? mediaTypes.filter((_, i) => mediaUris[i]?.startsWith('http')) : null,
    ended_at: session.endedAt ?? null,
  }, { onConflict: 'id' });

  // Notify newly tagged friends only after session has ended
  if (session.friends?.length && session.endedAt) {
    import('./notifications').then(({ sendTagNotificationsIfNeeded }) =>
      sendTagNotificationsIfNeeded(session.id, session.friends!, userId).catch(() => {})
    );
  }
}

export async function deleteSessionFromCloud(id: string): Promise<void> {
  await Promise.all([
    supabase.from('climbs').delete().eq('session_id', id),
    supabase.from('sessions').delete().eq('id', id),
  ]);
}

export async function syncProjectToCloud(project: NamedProject, userId: string): Promise<void> {
  await supabase.from('projects').upsert({
    id: project.id,
    user_id: userId,
    name: project.name,
    grade: project.grade,
    type: project.type,
    styles: project.styles ?? [],
    created_at_local: project.createdAt,
  }, { onConflict: 'id' });
}

export async function deleteProjectFromCloud(id: string): Promise<void> {
  await supabase.from('projects').delete().eq('id', id);
}

export async function getCloudProfile(userId: string): Promise<{ name: string; avatar_url: string | null; username?: string | null; hometown?: string | null; onboarded?: boolean } | null> {
  const { data } = await supabase.from('profiles').select('name, avatar_url, username, hometown, onboarded').eq('id', userId).single();
  return data ?? null;
}

export async function upsertProfile(userId: string, name: string, avatarUrl?: string, username?: string, hometown?: string, bio?: string, isPrivate?: boolean, onboarded?: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    name,
    avatar_url: avatarUrl ?? null,
    ...(username ? { username } : {}),
    ...(hometown !== undefined ? { hometown: hometown || null } : {}),
    ...(bio !== undefined ? { bio: bio || null } : {}),
    ...(isPrivate !== undefined ? { is_private: isPrivate } : {}),
    ...(onboarded !== undefined ? { onboarded } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function climbToRow(c: Climb, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    session_id: c.sessionId,
    date: c.date,
    type: c.type,
    outcome: c.outcome,
    styles: c.styles,
    environment: c.environment,
    grade: c.grade,
    grade_system: c.gradeSystem,
    route_name: c.routeName ?? null,
    location: c.location ?? null,
    notes: c.notes ?? null,
    attempts: c.attempts ?? 1,
    project_id: c.projectId ?? null,
    project_name: c.projectName ?? null,
    media_uri: c.mediaUri ?? null,
    media_type: c.mediaType ?? null,
    media_uris: c.mediaUris ?? null,
    media_types: c.mediaTypes ?? null,
  };
}

function rowToSession(row: any): Session {
  return {
    id: row.id,
    date: row.date,
    environment: row.environment,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    title: row.title ?? undefined,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    lastClimbAt: row.last_climb_at ?? undefined,
    friends: row.friends ?? undefined,
    mediaUris: row.media_uris ?? undefined,
    mediaTypes: row.media_types ?? undefined,
    mediaUri: row.media_uris?.[0] ?? undefined,
    mediaType: row.media_types?.[0] ?? undefined,
  };
}

function rowToProject(row: any): NamedProject {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    type: row.type,
    styles: row.styles ?? [],
    createdAt: row.created_at_local,
  };
}

function rowToClimb(row: any): Climb {
  return {
    id: row.id,
    date: row.date,
    sessionId: row.session_id,
    type: row.type,
    outcome: row.outcome,
    styles: row.styles ?? [],
    environment: row.environment,
    grade: row.grade,
    gradeSystem: row.grade_system,
    routeName: row.route_name ?? undefined,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    attempts: row.attempts ?? 1,
    projectId: row.project_id ?? undefined,
    projectName: row.project_name ?? undefined,
    mediaUri: row.media_uri ?? undefined,
    mediaType: row.media_type ?? undefined,
    mediaUris: row.media_uris ?? undefined,
    mediaTypes: row.media_types ?? undefined,
  };
}

// ─── Re-upload media that failed to upload originally ────────────────────────
export async function reuploadMissingMedia(userId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const climbs = await getAllClimbs();
  const toUpdate: Climb[] = [];

  for (const climb of climbs) {
    const uris = climb.mediaUris ?? (climb.mediaUri ? [climb.mediaUri] : []);
    if (uris.length === 0) continue;
    if (uris.every(u => u.startsWith('http'))) continue; // already uploaded

    const newUris: string[] = [];
    const newTypes: ('photo' | 'video')[] = [];
    let changed = false;

    for (let i = 0; i < uris.length; i++) {
      const uri = uris[i];
      const type: 'photo' | 'video' = climb.mediaTypes?.[i] ?? climb.mediaType ?? 'photo';

      if (uri.startsWith('http')) {
        newUris.push(uri);
        newTypes.push(type);
        continue;
      }

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
    }

    if (changed) {
      toUpdate.push({
        ...climb,
        mediaUris: newUris,
        mediaTypes: newTypes,
        mediaUri: newUris[0],
        mediaType: newTypes[0],
      });
    }
  }

  if (toUpdate.length > 0) {
    const updatedMap = new Map(toUpdate.map(c => [c.id, c]));
    const merged = climbs.map(c => updatedMap.get(c.id) ?? c);
    await bulkSaveClimbs(merged);
    await supabase.from('climbs').upsert(
      toUpdate.map(c => climbToRow(c, userId)),
      { onConflict: 'id' }
    );
  }

  // ── Upload session-level media ──────────────────────────────────────────────
  const { getAllSessions, bulkSaveSessions } = await import('./storage');
  const sessions = await getAllSessions();
  const sessionsToUpdate: Session[] = [];

  for (const s of sessions) {
    const uris = s.mediaUris ?? (s.mediaUri ? [s.mediaUri] : []);
    if (uris.length === 0) continue;
    if (uris.every(u => u.startsWith('http'))) {
      // Already uploaded locally — make sure Supabase row has the http:// URIs
      sessionsToUpdate.push(s);
      continue;
    }

    const newUris: string[] = [];
    const newTypes: ('photo' | 'video')[] = [];
    let changed = false;

    for (let i = 0; i < uris.length; i++) {
      const uri = uris[i];
      const type: 'photo' | 'video' = s.mediaTypes?.[i] ?? s.mediaType ?? 'photo';
      if (uri.startsWith('http')) { newUris.push(uri); newTypes.push(type); continue; }
      try {
        const ext = type === 'video' ? 'mp4' : 'jpg';
        const path = `${userId}/session_${s.id}_${i}.${ext}`;
        const url = await uploadMedia(uri, path, session.access_token);
        newUris.push(url); newTypes.push(type); changed = true;
      } catch { newUris.push(uri); newTypes.push(type); }
    }

    if (changed) {
      sessionsToUpdate.push({ ...s, mediaUris: newUris, mediaTypes: newTypes, mediaUri: newUris[0], mediaType: newTypes[0] });
    }
  }

  if (sessionsToUpdate.length > 0) {
    const updatedMap = new Map(sessionsToUpdate.map(s => [s.id, s]));
    await bulkSaveSessions(sessions.map(s => updatedMap.get(s.id) ?? s));
    const rows = sessionsToUpdate.map(s => {
      const uris = (s.mediaUris ?? []).filter(u => u.startsWith('http'));
      return {
        id: s.id, user_id: userId,
        media_uris: uris.length > 0 ? uris : null,
        media_types: uris.length > 0 ? s.mediaTypes?.filter((_, i) => (s.mediaUris ?? [])[i]?.startsWith('http')) : null,
      };
    });
    await supabase.from('sessions').upsert(rows, { onConflict: 'id' });
  }
}
