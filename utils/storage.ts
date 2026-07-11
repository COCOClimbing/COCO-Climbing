import AsyncStorage from '@react-native-async-storage/async-storage';
import { Climb, Session } from './theme';
import { vGradeToNum, ydsGradeToNum } from './gradeUtils';

const KEYS = {
  CLIMBS: 'coco_climbs',
  SESSIONS: 'coco_sessions',
  ACTIVE_SESSION_ID: 'coco_active_session_id',
  DELETED_CLIMB_IDS: 'coco_deleted_climb_ids',
  DELETED_SESSION_IDS: 'coco_deleted_session_ids',
  PENDING_DELETES: 'coco_pending_deletes',
};

export interface PendingDelete {
  type: 'climb' | 'session';
  id: string;
  r2Uris?: string[];
}

export async function addPendingDelete(item: PendingDelete): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_DELETES);
    const items: PendingDelete[] = raw ? JSON.parse(raw) : [];
    if (!items.some(i => i.id === item.id)) items.push(item);
    await AsyncStorage.setItem(KEYS.PENDING_DELETES, JSON.stringify(items));
  } catch {}
}

export async function getPendingDeletes(): Promise<PendingDelete[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_DELETES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function removePendingDelete(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_DELETES);
    const items: PendingDelete[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(KEYS.PENDING_DELETES, JSON.stringify(items.filter(i => i.id !== id)));
  } catch {}
}

async function addToTombstone(key: string, id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(id)) {
      ids.push(id);
      await AsyncStorage.setItem(key, JSON.stringify(ids));
    }
  } catch {}
}

export async function getDeletedClimbIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DELETED_CLIMB_IDS);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

export async function getDeletedSessionIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DELETED_SESSION_IDS);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

// ─── Cloud sync hook ──────────────────────────────────────────────────────────
// Set by AuthContext when user is logged in
let _cloudUserId: string | null = null;
export function setCloudUserId(id: string | null) { _cloudUserId = id; }
export function getCloudUserId(): string | null { return _cloudUserId; }

// ─── Sessions refresh hook ────────────────────────────────────────────────────
// index.tsx registers its load() here; triggerClimbsRefresh() forces a reload after local migrations
let _onClimbsRefresh: (() => void) | null = null;
export function setClimbsRefreshCallback(cb: (() => void) | null) { _onClimbsRefresh = cb; }
export function triggerClimbsRefresh() { _onClimbsRefresh?.(); }

// sessions.tsx registers its load() here; BottomTabBar calls triggerSessionsRefresh() after saving
let _onSessionsRefresh: (() => void) | null = null;
export function setSessionsRefreshCallback(cb: (() => void) | null) { _onSessionsRefresh = cb; }
export function triggerSessionsRefresh() { _onSessionsRefresh?.(); }

// ─── Projects refresh hook ────────────────────────────────────────────────────
// projects.tsx registers its load() here; BottomTabBar calls triggerProjectsRefresh() after saving
let _onProjectsRefresh: (() => void) | null = null;
export function setProjectsRefreshCallback(cb: (() => void) | null) { _onProjectsRefresh = cb; }
export function triggerProjectsRefresh() { _onProjectsRefresh?.(); }

// ─── Stats refresh hook ───────────────────────────────────────────────────────
// stats.tsx registers its load() here; BottomTabBar calls triggerStatsRefresh() after saving
let _onStatsRefresh: (() => void) | null = null;
export function setStatsRefreshCallback(cb: (() => void) | null) { _onStatsRefresh = cb; }
export function triggerStatsRefresh() { _onStatsRefresh?.(); }

// ─── Feed refresh hook ────────────────────────────────────────────────────────
// friends.tsx registers its loadFeed() here so the activity feed reloads after local media migration
let _onFeedRefresh: (() => void) | null = null;
export function setFeedRefreshCallback(cb: (() => void) | null) { _onFeedRefresh = cb; }
export function triggerFeedRefresh() { _onFeedRefresh?.(); }

// ─── Active session tracker ───────────────────────────────────────────────────
// null  = no active session (never started or explicitly ended)
// string = ID of the currently open session
let _activeSessionId: string | null = null;
export function setActiveSessionId(id: string | null) {
  _activeSessionId = id;
  // Persist so the session survives the app being killed and reopened
  if (id) {
    AsyncStorage.setItem(KEYS.ACTIVE_SESSION_ID, id).catch(() => {});
  } else {
    AsyncStorage.removeItem(KEYS.ACTIVE_SESSION_ID).catch(() => {});
  }
}
export function getActiveSessionId(): string | null { return _activeSessionId; }

// Called once on app load. Reads the persisted active session ID from disk,
// validates the 1.5-hour lapse rule, and restores or clears _activeSessionId.
export async function restoreActiveSession(): Promise<void> {
  if (_activeSessionId) return; // already set (e.g. in-process restart)
  const stored = await AsyncStorage.getItem(KEYS.ACTIVE_SESSION_ID);
  if (!stored) return;

  _activeSessionId = stored; // temporarily set so getValidActiveSessionId can check it
  await getValidActiveSessionId(); // validates and clears _activeSessionId + storage if expired
}

export async function endSession(id: string): Promise<void> {
  // Null immediately so any renders during the async work see no active session
  if (_activeSessionId === id) setActiveSessionId(null);

  const sessions = await getAllSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  const session = sessions[idx];

  // If session has no location, inherit it from the first climb that has one
  let location = session.location;
  if (!location) {
    const climbs = await getAllClimbs();
    location = climbs.find(c => c.sessionId === id && c.location)?.location;
  }

  sessions[idx] = { ...session, endedAt: new Date().toISOString(), location };
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
}

const THREE_HOURS_MS = 1.5 * 60 * 60 * 1000;

// Returns the active session ID if it's still valid (within 3 hours of last climb,
// or session has no climbs yet and was started within 3 hours). Auto-expires otherwise.
export async function getValidActiveSessionId(): Promise<string | null> {
  const id = _activeSessionId;
  if (!id) return null;

  const sessions = await getAllSessions();
  const session = sessions.find(s => s.id === id);
  if (!session) {
    setActiveSessionId(null);
    return null;
  }

  // Use lastClimbAt if available, otherwise fall back to startedAt
  const checkTime = session.lastClimbAt ?? session.startedAt;
  if (checkTime) {
    const elapsed = Date.now() - new Date(checkTime).getTime();
    if (elapsed > THREE_HOURS_MS) {
      await endSession(id);
      if (_cloudUserId) {
        const updated = await getAllSessions();
        const ended = updated.find(s => s.id === id);
        if (ended) {
          import('./cloudSync').then(({ syncSessionToCloud }) =>
            syncSessionToCloud(ended, _cloudUserId!).catch(() => {})
          );
        }
      }
      return null;
    }
  }

  return id;
}

// ─── Climbs ──────────────────────────────────────────────────────────────────

export async function getAllClimbs(): Promise<Climb[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.CLIMBS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveClimb(climb: Climb): Promise<void> {
  const needsSessionStamp = _activeSessionId && climb.sessionId === _activeSessionId;

  if (needsSessionStamp) {
    // Read both in parallel, write both in one multiSet
    const [[, climbsRaw], [, sessionsRaw]] = await AsyncStorage.multiGet([KEYS.CLIMBS, KEYS.SESSIONS]);
    const climbs: Climb[] = climbsRaw ? JSON.parse(climbsRaw) : [];
    const sessions: Session[] = sessionsRaw ? JSON.parse(sessionsRaw) : [];

    const cIdx = climbs.findIndex(c => c.id === climb.id);
    if (cIdx >= 0) { climbs[cIdx] = climb; } else { climbs.unshift(climb); }

    const sIdx = sessions.findIndex(s => s.id === climb.sessionId);
    if (sIdx >= 0) {
      sessions[sIdx] = { ...sessions[sIdx], lastClimbAt: new Date().toISOString() };
    }

    await AsyncStorage.multiSet([
      [KEYS.CLIMBS, JSON.stringify(climbs)],
      [KEYS.SESSIONS, JSON.stringify(sessions)],
    ]);
  } else {
    const climbs = await getAllClimbs();
    const idx = climbs.findIndex(c => c.id === climb.id);
    if (idx >= 0) { climbs[idx] = climb; } else { climbs.unshift(climb); }
    await AsyncStorage.setItem(KEYS.CLIMBS, JSON.stringify(climbs));
  }

  // Cloud sync (fire and forget)
  if (_cloudUserId) {
    const userId = _cloudUserId;
    import('./cloudSync').then(({ syncClimbToCloud }) =>
      syncClimbToCloud(climb, userId).catch(() => {})
    );
  }
}

export async function deleteClimb(id: string): Promise<void> {
  const climbs = await getAllClimbs();
  const climb = climbs.find(c => c.id === id);
  await AsyncStorage.setItem(KEYS.CLIMBS, JSON.stringify(climbs.filter(c => c.id !== id)));
  await addToTombstone(KEYS.DELETED_CLIMB_IDS, id);

  const r2Uris = (climb?.mediaUris ?? (climb?.mediaUri ? [climb.mediaUri] : [])).filter(u => u.startsWith('http'));
  await addPendingDelete({ type: 'climb', id, r2Uris });

  if (_cloudUserId) {
    import('./cloudSync').then(({ deleteClimbFromCloud }) =>
      deleteClimbFromCloud(id, r2Uris)
        .then(() => removePendingDelete(id))
        .catch(() => {})
    );
  }
}

export async function getClimbsBySession(sessionId: string): Promise<Climb[]> {
  const all = await getAllClimbs();
  return all.filter(c => c.sessionId === sessionId);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function getAllSessions(): Promise<Session[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SESSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSession(session: Session): Promise<void> {
  const sessions = await getAllSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));

  // Cloud sync (fire and forget)
  if (_cloudUserId) {
    const userId = _cloudUserId;
    import('./cloudSync').then(({ syncSessionToCloud }) =>
      syncSessionToCloud(session, userId).catch(() => {})
    );
  }
}

// Creates a brand-new session right now (uses current timestamp for date + startedAt).
export async function createNewSession(environment: string = 'indoor', location?: string): Promise<string> {
  const now = new Date();
  const newSession: Session = {
    id: generateId(),
    date: getTodayISO(),
    environment: environment as any,
    location,
    startedAt: now.toISOString(),
  };
  await saveSession(newSession);
  return newSession.id;
}

// Always creates a brand-new session for the given date (allows multiple per day).
export async function createNewSessionForDate(date: string, environment: string, location?: string): Promise<string> {
  const newSession: Session = {
    id: generateId(),
    date,
    environment: environment as any,
    location,
    startedAt: new Date().toISOString(),
  };
  await saveSession(newSession);
  return newSession.id;
}

// Returns existing session for a given date, or creates a new one.
export async function getOrCreateSessionForDate(date: string, environment: string, location?: string): Promise<string> {
  const sessions = await getAllSessions();
  const existing = sessions.find(s => s.date === date);
  if (existing) return existing.id;

  const newSession: Session = {
    id: generateId(),
    date,
    environment: environment as any,
    location,
    startedAt: new Date().toISOString(),
  };
  await saveSession(newSession);
  return newSession.id;
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await getAllSessions();
  const climbs = await getAllClimbs();

  const session = sessions.find(s => s.id === id);
  const sessionClimbs = climbs.filter(c => c.sessionId === id);

  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions.filter(s => s.id !== id)));
  await AsyncStorage.setItem(KEYS.CLIMBS, JSON.stringify(climbs.filter(c => c.sessionId !== id)));
  await addToTombstone(KEYS.DELETED_SESSION_IDS, id);
  for (const c of sessionClimbs) await addToTombstone(KEYS.DELETED_CLIMB_IDS, c.id);

  // Delete permanent local file copies (fire and forget)
  const allLocalUris = [
    ...(session?.mediaUris ?? (session?.mediaUri ? [session.mediaUri] : [])),
    ...sessionClimbs.flatMap(c => c.mediaUris ?? (c.mediaUri ? [c.mediaUri] : [])),
  ].filter(u => u.startsWith('file://'));
  if (allLocalUris.length > 0) {
    import('expo-file-system/legacy').then(({ deleteAsync }) => {
      allLocalUris.forEach(u => deleteAsync(u, { idempotent: true }).catch(() => {}));
    });
  }

  const r2Uris = [
    ...(session?.mediaUris ?? (session?.mediaUri ? [session.mediaUri] : [])),
    ...sessionClimbs.flatMap(c => c.mediaUris ?? (c.mediaUri ? [c.mediaUri] : [])),
  ].filter(u => u.startsWith('http'));
  await addPendingDelete({ type: 'session', id, r2Uris });

  if (_cloudUserId) {
    import('./cloudSync').then(({ deleteSessionFromCloud }) =>
      deleteSessionFromCloud(id, r2Uris)
        .then(() => removePendingDelete(id))
        .catch(() => {})
    );
  }
}

// ─── Bulk saves (used by cloud sync to avoid O(n) read/write loops) ──────────

export async function bulkSaveClimbs(incoming: Climb[]): Promise<void> {
  const existing = await getAllClimbs();
  const map = new Map(existing.map(c => [c.id, c]));
  for (const c of incoming) map.set(c.id, c);
  await AsyncStorage.setItem(KEYS.CLIMBS, JSON.stringify([...map.values()]));
}

export async function bulkSaveSessions(incoming: Session[]): Promise<void> {
  const existing = await getAllSessions();
  const map = new Map(existing.map(s => [s.id, s]));
  for (const s of incoming) map.set(s.id, s);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify([...map.values()]));
}

export async function bulkSaveNamedProjects(incoming: NamedProject[]): Promise<void> {
  const existing = await getAllNamedProjects();
  const map = new Map(existing.map(p => [p.id, p]));
  for (const p of incoming) map.set(p.id, p);
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify([...map.values()]));
}

// Batch-deletes empty sessions in one write, avoiding per-item storage thrash.
export async function cleanupEmptySessions(idsToDelete: string[]): Promise<void> {
  if (idsToDelete.length === 0) return;
  const sessions = await getAllSessions();
  const deleteSet = new Set(idsToDelete);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions.filter(s => !deleteSet.has(s.id))));
  for (const id of idsToDelete) {
    await addToTombstone(KEYS.DELETED_SESSION_IDS, id);
    await addPendingDelete({ type: 'session', id });
  }
  if (_cloudUserId) {
    import('./cloudSync').then(({ deleteSessionFromCloud }) => {
      idsToDelete.forEach(id =>
        deleteSessionFromCloud(id)
          .then(() => removePendingDelete(id))
          .catch(() => {})
      );
    });
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getStats() {
  const climbs = await getAllClimbs();
  const sends = climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash');
  const projects = climbs.filter(c => c.outcome === 'project');

  const gradeMap: Record<string, number> = {};
  sends.forEach(c => {
    gradeMap[c.grade] = (gradeMap[c.grade] || 0) + 1;
  });

  const hardestV = sends
    .filter(c => c.gradeSystem === 'v-scale')
    .sort((a, b) => vGradeToNum(b.grade) - vGradeToNum(a.grade))[0]?.grade;

  const hardestYDS = sends
    .filter(c => c.gradeSystem === 'yds')
    .sort((a, b) => ydsGradeToNum(b.grade) - ydsGradeToNum(a.grade))[0]?.grade;

  return {
    totalClimbs: climbs.length,
    totalSends: sends.length,
    totalProjects: projects.length,
    hardestV,
    hardestYDS,
    gradeMap,
  };
}


export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Last Used Climb Type ─────────────────────────────────────────────────────

const LAST_TYPE_KEY = 'coco_last_climb_type';

export async function saveLastClimbType(type: string): Promise<void> {
  await AsyncStorage.setItem(LAST_TYPE_KEY, type);
}

export async function getLastClimbType(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_TYPE_KEY);
  } catch {
    return null;
  }
}

const LAST_OUTCOME_KEY = 'coco_last_outcome';

export async function saveLastOutcome(outcome: string): Promise<void> {
  await AsyncStorage.setItem(LAST_OUTCOME_KEY, outcome);
}

export async function getLastOutcome(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_OUTCOME_KEY);
  } catch {
    return null;
  }
}

const LAST_ENVIRONMENT_KEY = 'coco_last_environment';

export async function saveLastEnvironment(environment: string): Promise<void> {
  await AsyncStorage.setItem(LAST_ENVIRONMENT_KEY, environment);
}

export async function getLastEnvironment(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ENVIRONMENT_KEY);
  } catch {
    return null;
  }
}

// ─── Named Projects Registry ──────────────────────────────────────────────────
// Stores project names independently so they're available immediately after creation

const PROJECTS_KEY = 'coco_named_projects';

export interface NamedProject {
  id: string;
  name: string;
  grade: string;
  type: string;
  styles?: string[];
  createdAt: string;
}

export async function getAllNamedProjects(): Promise<NamedProject[]> {
  try {
    const raw = await AsyncStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveNamedProject(project: NamedProject): Promise<void> {
  const projects = await getAllNamedProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.unshift(project);
  }
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));

  // Cloud sync (fire and forget)
  if (_cloudUserId) {
    const userId = _cloudUserId;
    import('./cloudSync').then(({ syncProjectToCloud }) =>
      syncProjectToCloud(project, userId).catch(() => {})
    );
  }
}

export async function deleteNamedProject(id: string): Promise<void> {
  const projects = await getAllNamedProjects();
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.filter(p => p.id !== id)));

  // Cloud sync (fire and forget)
  if (_cloudUserId) {
    import('./cloudSync').then(({ deleteProjectFromCloud }) =>
      deleteProjectFromCloud(id).catch(() => {})
    );
  }
}

// ─── Last Used Grade System Per Type ─────────────────────────────────────────

const GRADE_SYSTEM_KEY = 'coco_grade_system';

export async function saveLastGradeSystem(climbType: string, system: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(GRADE_SYSTEM_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[climbType] = system;
    await AsyncStorage.setItem(GRADE_SYSTEM_KEY, JSON.stringify(map));
  } catch {}
}

export async function getLastGradeSystem(climbType: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(GRADE_SYSTEM_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[climbType] || null;
  } catch { return null; }
}

// ─── Last Used Grade Per Type ─────────────────────────────────────────────────

const LAST_GRADE_KEY = 'coco_last_grade';

export async function saveLastGrade(climbType: string, grade: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_GRADE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[climbType] = grade;
    await AsyncStorage.setItem(LAST_GRADE_KEY, JSON.stringify(map));
  } catch {}
}

export async function getLastGrade(climbType: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_GRADE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[climbType] || null;
  } catch { return null; }
}

// ─── Preferred Display Grade Systems ─────────────────────────────────────────

const PREFERRED_DISPLAY_KEY = 'coco_preferred_display_grades';

export async function savePreferredDisplayGrades(boulder: string, rope: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFERRED_DISPLAY_KEY, JSON.stringify({ boulder, rope }));
  } catch {}
}

export async function getPreferredDisplayGrades(): Promise<{ boulder: string; rope: string }> {
  try {
    const raw = await AsyncStorage.getItem(PREFERRED_DISPLAY_KEY);
    if (!raw) return { boulder: 'v-scale', rope: 'yds' };
    const parsed = JSON.parse(raw);
    return {
      boulder: parsed.boulder ?? 'v-scale',
      rope: parsed.rope ?? 'yds',
    };
  } catch { return { boulder: 'v-scale', rope: 'yds' }; }
}

// ─── Sessions Tab Condensed View ──────────────────────────────────────────────

const SESSIONS_CONDENSED_KEY = 'coco_sessions_condensed';

export async function saveSessionsCondensed(condensed: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSIONS_CONDENSED_KEY, JSON.stringify(condensed));
  } catch {}
}

export async function getSessionsCondensed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_CONDENSED_KEY);
    if (!raw) return false;
    return JSON.parse(raw) === true;
  } catch { return false; }
}
