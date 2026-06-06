import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getAllClimbs, getAllSessions, getAllNamedProjects, bulkSaveClimbs, bulkSaveSessions, bulkSaveNamedProjects, NamedProject } from './storage';
import { uploadMedia } from './mediaUpload';
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
      return {
        id: s.id,
        user_id: userId,
        date: s.date,
        environment: s.environment,
        location: s.location ?? null,
        notes: s.notes ?? null,
        friends: s.friends ?? null,
        media_uris: uris.length > 0 ? uris : null,
        media_types: uris.length > 0 ? types : null,
      };
    });
    await supabase.from('sessions').upsert(rows, { onConflict: 'id' });
  }

  if (climbs.length > 0) {
    const rows = climbs.map(c => climbToRow(c, userId));
    await supabase.from('climbs').upsert(rows, { onConflict: 'id' });
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

  if (newSessions.length > 0) await bulkSaveSessions([...localSessions, ...newSessions]);
  if (newClimbs.length   > 0) await bulkSaveClimbs([...cleanedLocalClimbs, ...newClimbs]);
  if (newProjects.length > 0) await bulkSaveNamedProjects([...localProjects, ...newProjects]);

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
