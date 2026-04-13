import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Share, ScrollView, PanResponder, TextInput } from 'react-native';
import LocationPicker from '../components/LocationPicker';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import {
  getAllSessions, getAllClimbs, deleteSession, deleteClimb,
  getOrCreateSessionForDate, createNewSession, saveSession,
  getTodayISO, setActiveSessionId, getActiveSessionId, endSession,
  setSessionsRefreshCallback, cleanupEmptySessions,
} from '../utils/storage';
import { gradeToNum } from '../utils/gradeUtils';
import FriendPicker from '../components/FriendPicker';
import ClimbCard from '../components/ClimbCard';
import ClimbDetailModal from '../components/ClimbDetailModal';
import { EmptyState } from '../components/UI';
import LogClimbModal from '../components/LogClimbModal';
import SwipeToDelete from '../components/SwipeToDelete';
import MiniCalendar from '../components/MiniCalendar';
import { format, parseISO } from 'date-fns';

interface DaySession {
  date: string;
  sessionId: string;
  climbs: Climb[];
  startedAt: string;
  lastClimbAt?: string;
  notes?: string;
  friends?: string[];
  location?: string;
}

let _cachedDays: DaySession[] = [];

function formatSessionLabel(s: DaySession): { top: string; bottom: string } {
  const todayISO = getTodayISO();
  const hasRealTime = !!s.startedAt && s.startedAt.length > 0 && !s.startedAt.endsWith('T00:00:00.000Z');

  if (s.date === todayISO) {
    const timeStr = hasRealTime ? format(new Date(s.startedAt), 'h:mm a') : null;
    return { top: 'TODAY', bottom: timeStr ?? '' };
  }
  const date = parseISO(s.date);
  return {
    top: format(date, 'EEE').toUpperCase(),
    bottom: format(date, 'MMM d, yyyy'),
  };
}

export default function SessionsScreen() {
  const { colors } = useTheme();
  const [days, setDays] = useState<DaySession[]>(_cachedDays);
  const [selectedDay, setSelectedDay] = useState<DaySession | null>(null);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [modalSessionId, setModalSessionId] = useState<string | undefined>();
  const [editingClimb, setEditingClimb] = useState<Climb | undefined>();
  const [detailClimb, setDetailClimb] = useState<Climb | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [changeDateSession, setChangeDateSession] = useState<DaySession | null>(null);
  const [selectedCalDate, setSelectedCalDate] = useState<string | undefined>();
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionFriends, setSessionFriends] = useState<string[]>([]);
  const [sessionLocation, setSessionLocation] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const notesInputValue = useRef('');
  const listRef = useRef<FlatList>(null);
  const pendingSessionId = useRef<string | null>(null);

  // Sync editing state when a different session is opened
  useEffect(() => {
    setSessionNotes(selectedDay?.notes ?? '');
    setSessionFriends(selectedDay?.friends ?? []);
    setSessionLocation(selectedDay?.location ?? '');
    setEditingNotes(false);
  }, [selectedDay?.sessionId]);

  const todayISO = getTodayISO();
  const selectedDayRef = useRef<DaySession | null>(null);
  selectedDayRef.current = selectedDay;

  const load = useCallback(async () => {
    const sessions = await getAllSessions();
    const allClimbs = await getAllClimbs();
    const activeId = getActiveSessionId();

    const sessionIdsWithClimbs = new Set(allClimbs.map(c => c.sessionId));
    // Batch-delete empty sessions in one write instead of one per session
    const emptyIds = sessions
      .filter(s => !sessionIdsWithClimbs.has(s.id) && s.id !== activeId)
      .map(s => s.id);
    await cleanupEmptySessions(emptyIds);

    const activeSessions = sessions.filter(s => sessionIdsWithClimbs.has(s.id) || s.id === activeId);

    const result: DaySession[] = activeSessions
      .map(s => ({
        date: s.date,
        sessionId: s.id,
        climbs: allClimbs.filter(c => c.sessionId === s.id),
        startedAt: s.startedAt ?? '',
        lastClimbAt: s.lastClimbAt,
        notes: s.notes,
        friends: s.friends,
        location: s.location,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    _cachedDays = result;
    setDays(result);

    // Navigate into a newly-created past session after saving
    if (pendingSessionId.current) {
      const target = result.find(d => d.sessionId === pendingSessionId.current);
      pendingSessionId.current = null;
      if (target) { setSelectedDay(target); return; }
    }

    // Keep selectedDay in sync after reload (use ref to avoid stale closure)
    const current = selectedDayRef.current;
    if (current) {
      const updated = result.find(d => d.sessionId === current.sessionId);
      setSelectedDay(updated ?? null);
    }
  }, []); // stable — selectedDay accessed via ref

  useEffect(() => { load(); }, []);

  // Register load() so BottomTabBar can trigger a refresh after saving via FAB
  useEffect(() => {
    setSessionsRefreshCallback(load);
    return () => setSessionsRefreshCallback(null);
  }, [load]);

  const activeSessionId = getActiveSessionId();
  const activeSession = activeSessionId ? (days.find(d => d.sessionId === activeSessionId) ?? null) : null;
  const listDays = days.filter(d => d.sessionId !== activeSessionId);
  const activeDates = [...new Set(days.map(d => d.date))];

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function sessionStats(day: DaySession) {
    const sends = day.climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
    const hardest = [...day.climbs]
      .filter(c => c.outcome === 'send' || c.outcome === 'flash')
      .sort((a, b) => gradeToNum(b.grade, b.gradeSystem) - gradeToNum(a.grade, a.gradeSystem))[0];
    const projecting = sends === 0 && day.climbs.length > 0 && day.climbs.every(c => c.projectId);
    return { sends, hardest, projecting };
  }

  function openLogModal(sessionId: string) {
    setModalSessionId(sessionId);
    setLogModalVisible(true);
  }

  async function handleSaveSessionMeta(notes: string, friends: string[], location: string) {
    if (!selectedDayRef.current) return;
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === selectedDayRef.current!.sessionId);
    if (!session) return;
    await saveSession({ ...session, notes, friends, location: location || undefined });
    // Update in-memory state without a full reload
    const updater = (d: DaySession) =>
      d.sessionId === session.id ? { ...d, notes, friends, location: location || undefined } : d;
    setDays(prev => prev.map(updater));
    setSelectedDay(prev => prev ? updater(prev) : null);
  }

  function handleSaveNotes(text: string) {
    setSessionNotes(text);
    setEditingNotes(false);
    handleSaveSessionMeta(text, sessionFriends, sessionLocation);
  }


  async function handleNewSession() {
    // If a session is already open, just navigate into it
    if (activeSession) {
      setSelectedDay(activeSession);
      return;
    }

    const sessionId = await createNewSession('indoor');
    setActiveSessionId(sessionId);
    setDays(prev => {
      const newEntry: DaySession = {
        date: todayISO,
        sessionId,
        climbs: [],
        startedAt: new Date().toISOString(),
      };
      return [newEntry, ...prev.filter(d => d.sessionId !== sessionId)];
    });
  }

  async function handleAddPastSession(dateStr: string) {
    const sessionId = await getOrCreateSessionForDate(dateStr, 'indoor');
    pendingSessionId.current = sessionId;
    setModalSessionId(sessionId);
    setLogModalVisible(true);
  }

  function handleCalendarSelect(dateStr: string) {
    setSelectedCalDate(dateStr);
    const existing = listDays.find(d => d.date === dateStr);
    if (existing) {
      setSelectedDay(existing);
    } else {
      handleAddPastSession(dateStr);
      setCalendarVisible(false);
    }
  }

  async function handleChangeSessionDate(day: DaySession, newDate: string) {
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === day.sessionId);
    if (session) await saveSession({ ...session, date: newDate });
    setChangeDateSession(null);
    setSelectedDay(null);
    await load();
  }

  async function handleShareDay(day: DaySession) {
    const dateStr = format(parseISO(day.date), 'EEEE, MMM d yyyy');
    const timeStr = format(new Date(day.startedAt), 'h:mm a');
    const sends = day.climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash');
    const hardest = [...sends].sort((a, b) => b.grade.localeCompare(a.grade))[0];
    const climbLines = day.climbs.map(c => {
      const outcome = c.outcome.charAt(0).toUpperCase() + c.outcome.slice(1);
      return `  • ${c.grade} ${c.type.replace('_', ' ')} — ${outcome}${c.routeName ? ` (${c.routeName})` : ''}`;
    }).join('\n');
    const msg = [
      `COCO | ${dateStr} at ${timeStr}`, ``,
      `${day.climbs.length} climb${day.climbs.length !== 1 ? 's' : ''} · ${sends.length} send${sends.length !== 1 ? 's' : ''}${hardest ? ` · Best: ${hardest.grade}` : ''}`,
      ``, climbLines,
    ].join('\n');
    await Share.share({ message: msg });
  }

  // ── Active Session Card ───────────────────────────────────────────────────────

  function ActiveSessionCard() {
    if (!activeSession) return null;

    const { sends, hardest, projecting } = sessionStats(activeSession);
    const label = formatSessionLabel(activeSession);
    const hardestTypeColor = CLIMB_TYPES.find(t => t.id === hardest?.type)?.color ?? colors.accent;

    return (
      <>
      <View style={[styles.sessionBlock, { backgroundColor: colors.bgCard, borderColor: colors.accent, borderWidth: 2, marginBottom: 4 }]}>
        {/* Tappable top row → detail view */}
        <TouchableOpacity
          style={styles.sessionHeader}
          onPress={() => setSelectedDay(activeSession)}
          activeOpacity={0.75}
        >
          <View style={styles.sessionLeft}>
            <View style={styles.activeBadgeRow}>
              <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.sessionDay, { color: colors.accent, fontFamily: FONTS.family.bold }]}>{label.top}</Text>
            </View>
            <Text style={[styles.sessionDate, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{label.bottom}</Text>
          </View>
          <View style={styles.sessionMeta}>
            {hardest && (
              <View style={[styles.hardestBadge, { backgroundColor: hardestTypeColor + '25', borderColor: hardestTypeColor }]}>
                <Text style={[styles.hardestText, { color: hardestTypeColor, fontFamily: FONTS.family.bold }]}>{hardest.grade}</Text>
              </View>
            )}
            {projecting
              ? <Text style={[styles.sessionStatLabel, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
              : <>
                  <View>
                    <Text style={[styles.sessionStatVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{activeSession.climbs.length}</Text>
                    <Text style={[styles.sessionStatLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>logged</Text>
                  </View>
                  <View>
                    <Text style={[styles.sessionStatVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{sends}</Text>
                    <Text style={[styles.sessionStatLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>sends</Text>
                  </View>
                </>
            }
            <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
          </View>
        </TouchableOpacity>

        {/* End Session footer button */}
        <TouchableOpacity
          style={[styles.endSessionRow, { borderTopColor: colors.accent + '40' }]}
          onPress={async () => { if (activeSessionId) await endSession(activeSessionId); await load(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.endSessionText, { color: colors.accent }]}>End Session</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.activeDivider, { backgroundColor: colors.border }]} />
      </>
    );
  }

  // ── Detail View ───────────────────────────────────────────────────────────────

  function mergeClimbs(climbs: Climb[]): Climb[] {
    const groups: Record<string, { total: number; notes: string[]; rep: Climb }> = {};
    const result: Climb[] = [];
    climbs.forEach(c => {
      const key = c.projectId && c.outcome === 'attempt' ? c.projectId : null;
      if (key) {
        if (!groups[key]) { groups[key] = { total: 0, notes: [], rep: c }; result.push(c); }
        groups[key].total += c.attempts ?? 0;
        if (c.notes?.trim()) groups[key].notes.push(c.notes.trim());
      } else {
        result.push(c);
      }
    });
    return result.map(c => {
      const key = c.projectId && c.outcome === 'attempt' ? c.projectId : null;
      if (key && groups[key]) {
        const g = groups[key];
        return { ...g.rep, attempts: g.total, notes: g.notes.length > 1 ? g.notes.map(n => `• ${n}`).join('\n') : g.notes[0] };
      }
      return c;
    });
  }

  function DetailView({ day }: { day: DaySession }) {
    const { sends, hardest, projecting } = sessionStats(day);
    const label = formatSessionLabel(day);
    const isActive = day.sessionId === getActiveSessionId();
    const hardestTypeColor = CLIMB_TYPES.find(t => t.id === hardest?.type)?.color ?? colors.accent;
    const displayClimbs = isActive ? day.climbs : mergeClimbs(day.climbs);

    const swipeBack = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 20 && Math.abs(g.dy) < 60,
        onPanResponderRelease: (_, g) => { if (g.dx > 60) setSelectedDay(null); },
      })
    ).current;

    return (
      <View style={[styles.detailContainer, { backgroundColor: colors.bg }]} {...swipeBack.panHandlers}>
        {/* Back bar */}
        <View style={[styles.detailTopBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setSelectedDay(null)} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backBtnText, { color: colors.accent }]}>← Back</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.detailContent}>
          {/* Session header */}
          <View style={[styles.detailHeader, { backgroundColor: colors.bgCard, borderColor: isActive ? colors.accent : colors.border, borderWidth: isActive ? 2 : 1 }]}>
            <View>
              {isActive && (
                <View style={styles.activeBadgeRow}>
                  <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.detailDay, { color: colors.accent }]}>ACTIVE SESSION</Text>
                </View>
              )}
              {!isActive && (
                <Text style={[styles.detailDay, { color: colors.textMuted }]}>
                  {label.top}
                </Text>
              )}
              <Text style={[styles.detailDate, { color: colors.textPrimary }]}>{label.bottom}</Text>
              {day.friends && day.friends.length > 0 && (
                <Text style={[styles.detailFriends, { color: colors.textMuted }]}>
                  with {day.friends.join(', ')}
                </Text>
              )}
            </View>
            <View style={styles.detailStats}>
              {projecting
                ? <Text style={[styles.todayStatLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
                : <>
                    <View style={styles.todayStat}>
                      <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{day.climbs.length}</Text>
                      <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>climbs</Text>
                    </View>
                    <View style={styles.todayStat}>
                      <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{sends}</Text>
                      <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>sends</Text>
                    </View>
                  </>
              }
              {hardest && (
                <View style={[styles.hardestBadge, { backgroundColor: hardestTypeColor + '25', borderColor: hardestTypeColor }]}>
                  <Text style={[styles.hardestText, { color: hardestTypeColor }]}>{hardest.grade}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Climbs */}
          {displayClimbs.length === 0
            ? <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
            : displayClimbs.map(c => (
              <SwipeToDelete key={c.id} onDelete={async () => { await deleteClimb(c.id); load(); }}>
                <ClimbCard
                  climb={c}
                  compact
                  onPress={() => {
                    if (isActive) {
                      setEditingClimb(c); setLogModalVisible(true);
                    } else {
                      setDetailClimb(c);
                    }
                  }}
                />
              </SwipeToDelete>
            ))
          }

          {/* Notes */}
          <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.metaLabelRow}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>NOTES</Text>
              {editingNotes ? (
                <TouchableOpacity onPress={() => handleSaveNotes(notesInputValue.current)} activeOpacity={0.7}>
                  <Text style={[styles.metaAction, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Done</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => { notesInputValue.current = sessionNotes; setEditingNotes(true); }} activeOpacity={0.7}>
                  <Text style={[styles.metaAction, { color: colors.accent }]}>
                    {sessionNotes.trim() ? 'Edit note' : 'Add note'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {editingNotes ? (
              <TextInput
                key={day.sessionId}
                style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.border }]}
                defaultValue={sessionNotes}
                onChangeText={(t) => { notesInputValue.current = t; }}
                onEndEditing={(e) => handleSaveNotes(e.nativeEvent.text)}
                placeholder="Add session notes…"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                autoFocus
              />
            ) : sessionNotes.trim() ? (
              <Text style={[styles.notesText, { color: colors.textSecondary }]}>{sessionNotes}</Text>
            ) : null}
          </View>

          {/* Location */}
          <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
            <LocationPicker
              value={sessionLocation}
              onChange={(loc) => {
                setSessionLocation(loc);
                handleSaveSessionMeta(sessionNotes, sessionFriends, loc);
              }}
            />
          </View>

          {/* Friends */}
          <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
            <FriendPicker
              selected={sessionFriends}
              onChange={(names) => {
                setSessionFriends(names);
                handleSaveSessionMeta(sessionNotes, names, sessionLocation);
              }}
            />
          </View>

          {/* Actions */}
          <View style={styles.detailActions}>
            {isActive ? (
              <TouchableOpacity
                style={[styles.logClimbBtn, { backgroundColor: colors.accent, flex: 1 }]}
                onPress={async () => { if (activeSessionId) await endSession(activeSessionId); await load(); setSelectedDay(null); }}
                activeOpacity={0.8}
              >
                <Text style={styles.logClimbBtnText}>End Session</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.logClimbBtn, { backgroundColor: colors.accent, flex: 1 }]}
                onPress={() => openLogModal(day.sessionId)}
                activeOpacity={0.8}
              >
                <Text style={styles.logClimbBtnText}>+ Add Climb</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => handleShareDay(day)}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => setChangeDateSession(day)}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Edit Date</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── History row ───────────────────────────────────────────────────────────────

  function renderDay({ item }: { item: DaySession }) {
    const { sends, hardest, projecting } = sessionStats(item);
    const label = formatSessionLabel(item);
    const hardestTypeColor = CLIMB_TYPES.find(t => t.id === hardest?.type)?.color ?? colors.accent;

    return (
      <SwipeToDelete
        key={item.sessionId}
        heightOffset={0}
        onDelete={async () => {
          for (const c of item.climbs) await deleteClimb(c.id);
          await deleteSession(item.sessionId);
          await load();
        }}
      >
        <TouchableOpacity
          style={[styles.sessionBlock, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          onPress={() => setSelectedDay(item)}
          activeOpacity={0.75}
        >
          <View style={styles.sessionHeader}>
            <View style={styles.sessionLeft}>
              <Text style={[styles.sessionDay, { color: colors.textMuted, fontFamily: FONTS.family.bold }]}>
                {label.top}
              </Text>
              <Text style={[styles.sessionDate, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>
                {label.bottom}
              </Text>
            </View>
            <View style={styles.sessionMeta}>
              {hardest && (
                <View style={[styles.hardestBadge, { backgroundColor: hardestTypeColor + '25', borderColor: hardestTypeColor }]}>
                  <Text style={[styles.hardestText, { color: hardestTypeColor, fontFamily: FONTS.family.bold }]}>{hardest.grade}</Text>
                </View>
              )}
              {projecting
                ? <Text style={[styles.sessionStatLabel, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
                : <>
                    <View>
                      <Text style={[styles.sessionStatVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{item.climbs.length}</Text>
                      <Text style={[styles.sessionStatLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>logged</Text>
                    </View>
                    <View>
                      <Text style={[styles.sessionStatVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{sends}</Text>
                      <Text style={[styles.sessionStatLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>sends</Text>
                    </View>
                  </>
              }
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </View>
          </View>
        </TouchableOpacity>
      </SwipeToDelete>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (selectedDay) {
    return (
      <>
        <DetailView day={selectedDay} />
        <LogClimbModal
          visible={logModalVisible}
          onClose={() => { setLogModalVisible(false); setModalSessionId(undefined); setEditingClimb(undefined); }}
          onSaved={load}
          defaultSessionId={modalSessionId}
          existingClimb={editingClimb}
        />
        <ClimbDetailModal
          visible={!!detailClimb}
          climb={detailClimb}
          onClose={() => setDetailClimb(null)}
          onEdit={() => { setEditingClimb(detailClimb ?? undefined); setDetailClimb(null); setLogModalVisible(true); }}
        />
        <MiniCalendar
          visible={changeDateSession !== null}
          onClose={() => setChangeDateSession(null)}
          activeDates={activeDates}
          onSelectDate={(date) => changeDateSession && handleChangeSessionDate(changeDateSession, date)}
          mode="pick"
        />
      </>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.addSessionBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
          onPress={handleNewSession}
        >
          <Text style={[styles.addSessionTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>+ Session</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCalendarVisible(true)} style={[styles.calTextBtn, { borderColor: colors.borderLight }]}>
          <Text style={[styles.calTxt, { color: colors.textPrimary, fontFamily: FONTS.family.medium }]}>Calendar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={listDays}
        keyExtractor={item => item.sessionId}
        renderItem={renderDay}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={() => {}}
        ListHeaderComponent={<ActiveSessionCard />}
        ListEmptyComponent={
          !activeSession
            ? <EmptyState icon="" title="No sessions yet" subtitle="Press + to log your first climb" />
            : null
        }
      />

      <MiniCalendar
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        activeDates={activeDates}
        onSelectDate={handleCalendarSelect}
        selectedDate={selectedCalDate}
        mode="view"
      />
      <MiniCalendar
        visible={changeDateSession !== null}
        onClose={() => setChangeDateSession(null)}
        activeDates={activeDates}
        onSelectDate={(date) => changeDateSession && handleChangeSessionDate(changeDateSession, date)}
        mode="pick"
      />

      <LogClimbModal
        visible={logModalVisible}
        onClose={() => { setLogModalVisible(false); setModalSessionId(undefined); }}
        onSaved={load}
        defaultSessionId={modalSessionId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  addSessionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  addSessionTxt: { fontSize: FONTS.sizes.sm },
  calTextBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  calTxt: { fontSize: FONTS.sizes.sm },
  list: { padding: SPACING.lg, gap: SPACING.md },

  activeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
  endSessionRow: {
    borderTopWidth: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endSessionText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  activeDivider: {
    height: 1,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.lg,
  },

  // Log climb button
  logClimbBtn: {
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  logClimbBtnText: { color: '#fff', fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },

  // Secondary button
  secondaryBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },

  // Session row
  sessionBlock: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: 20 },
  sessionLeft: { gap: 3, flex: 1 },
  sessionDay: { fontSize: FONTS.sizes.xs, letterSpacing: 1 },
  sessionDate: { fontSize: FONTS.sizes.md },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  sessionStatVal: { fontSize: FONTS.sizes.md, textAlign: 'center' },
  sessionStatLabel: { fontSize: FONTS.sizes.xs, textAlign: 'center' },
  chevron: { fontSize: 22 },
  hardestBadge: { borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderWidth: 1 },
  hardestText: { fontSize: FONTS.sizes.sm },

  // Detail view
  detailContainer: { flex: 1 },
  detailTopBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  backBtn: { paddingVertical: SPACING.xs },
  backBtnText: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.medium },
  detailContent: { padding: SPACING.lg, gap: SPACING.md },
  detailHeader: { borderRadius: 12, padding: SPACING.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailDay: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.bold, letterSpacing: 1 },
  detailDate: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold, marginTop: 2 },
  detailStats: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  todayStat: { alignItems: 'center' },
  todayStatVal: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold, textAlign: 'center' },
  todayStatLbl: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, textAlign: 'center' },
  detailActions: { flexDirection: 'row', gap: SPACING.sm },
  noClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.lg },
  detailFriends: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 4 },

  // Notes & Friends meta cards
  metaCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  metaLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  metaLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 1.2,
  },
  metaAction: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
  },
  notesText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    lineHeight: 20,
  },
  notesInput: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
});
