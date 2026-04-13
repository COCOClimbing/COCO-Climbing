import { supabase } from './supabase';
import { getAllClimbs, getAllSessions, getAllNamedProjects, bulkSaveClimbs, bulkSaveSessions, bulkSaveNamedProjects, NamedProject } from './storage';
import { Climb, Session } from './theme';

// ─── Upload all local data to Supabase ───────────────────────────────────────
export async function uploadAllLocalData(userId: string): Promise<void> {
  const [climbs, sessions, projects] = await Promise.all([
    getAllClimbs(),
    getAllSessions(),
    getAllNamedProjects(),
  ]);

  if (sessions.length > 0) {
    const rows = sessions.map(s => ({
      id: s.id,
      user_id: userId,
      date: s.date,
      environment: s.environment,
      location: s.location ?? null,
      notes: s.notes ?? null,
    }));
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

  // IDs present locally
  const localSessionIds = new Set(localSessions.map(s => s.id));
  const localClimbIds   = new Set(localClimbs.map(c => c.id));
  const localProjectIds = new Set(localProjects.map(p => p.id));

  // Records that exist in cloud but not locally — pull them in
  const newSessions = cloudSessions.filter(r => !localSessionIds.has(r.id)).map(rowToSession);
  const newClimbs   = cloudClimbs.filter(r => !localClimbIds.has(r.id)).map(rowToClimb);
  const newProjects = cloudProjects.filter(r => !localProjectIds.has(r.id)).map(rowToProject);

  if (newSessions.length > 0) await bulkSaveSessions([...localSessions, ...newSessions]);
  if (newClimbs.length   > 0) await bulkSaveClimbs([...localClimbs, ...newClimbs]);
  if (newProjects.length > 0) await bulkSaveNamedProjects([...localProjects, ...newProjects]);

  // Upload everything local to cloud (covers records only on device)
  await uploadAllLocalData(userId);
}

// ─── Single-item sync (called after each save) ───────────────────────────────
export async function syncClimbToCloud(climb: Climb, userId: string): Promise<void> {
  await supabase.from('climbs').upsert(climbToRow(climb, userId), { onConflict: 'id' });
}

export async function deleteClimbFromCloud(id: string): Promise<void> {
  await supabase.from('climbs').delete().eq('id', id);
}

export async function syncSessionToCloud(session: Session, userId: string): Promise<void> {
  await supabase.from('sessions').upsert({
    id: session.id,
    user_id: userId,
    date: session.date,
    environment: session.environment,
    location: session.location ?? null,
    notes: session.notes ?? null,
  }, { onConflict: 'id' });
}

export async function deleteSessionFromCloud(id: string): Promise<void> {
  await supabase.from('sessions').delete().eq('id', id);
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

export async function getCloudProfile(userId: string): Promise<{ name: string; avatar_url: string | null; username?: string | null; hometown?: string | null } | null> {
  const { data } = await supabase.from('profiles').select('name, avatar_url, username, hometown').eq('id', userId).single();
  return data ?? null;
}

export async function upsertProfile(userId: string, name: string, avatarUrl?: string, username?: string, hometown?: string, bio?: string, isPrivate?: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    name,
    avatar_url: avatarUrl ?? null,
    ...(username ? { username } : {}),
    ...(hometown !== undefined ? { hometown: hometown || null } : {}),
    ...(bio !== undefined ? { bio: bio || null } : {}),
    ...(isPrivate !== undefined ? { is_private: isPrivate } : {}),
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
  };
}

function rowToSession(row: any): Session {
  return {
    id: row.id,
    date: row.date,
    environment: row.environment,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    lastClimbAt: row.last_climb_at ?? undefined,
    friends: row.friends ?? undefined,
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
  };
}
