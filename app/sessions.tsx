import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Share, ScrollView, PanResponder, TextInput, Modal, Linking, Alert, Dimensions, Image, KeyboardAvoidingView, Platform, Keyboard, KeyboardEvent } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../utils/supabase';
import ViewShot from 'react-native-view-shot';
import RNShare from 'react-native-share';
import * as Sharing from 'expo-sharing';
import SessionShareCard from '../components/SessionShareCard';
import SessionShareCardVertical from '../components/SessionShareCardVertical';
import SessionShareCardStrava from '../components/SessionShareCardStrava';
import LocationPicker from '../components/LocationPicker';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import {
  getAllSessions, getAllClimbs, deleteSession, deleteClimb,
  getOrCreateSessionForDate, createNewSession, saveSession, saveClimb,
  getTodayISO, setActiveSessionId, getActiveSessionId, endSession,
  setSessionsRefreshCallback, cleanupEmptySessions, restoreActiveSession,
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
import { useNav } from '../utils/NavigationContext';
import { syncSessionToCloud } from '../utils/cloudSync';

interface DaySession {
  date: string;
  sessionId: string;
  climbs: Climb[];
  startedAt: string;
  lastClimbAt?: string;
  title?: string;
  notes?: string;
  friends?: { id: string; name: string }[];
  location?: string;
  mediaUris?: string[];
  mediaTypes?: ('photo' | 'video')[];
}

// Defined at module scope so it never remounts when SessionsScreen re-renders.
// Owns the keyboardDidShow listener so scroll fires reliably after keyboard animation.
function SessionFriendPicker({
  initialFriends,
  onSave,
  scrollToSelf,
}: {
  initialFriends: { id: string; name: string }[];
  onSave: (friends: { id: string; name: string }[]) => void;
  scrollToSelf?: (keyboardHeight: number) => void;
}) {
  const [friends, setFriends] = useState<{ id: string; name: string }[]>(initialFriends);
  const isFocused = useRef(false);
  const scrollToSelfRef = useRef(scrollToSelf);
  scrollToSelfRef.current = scrollToSelf;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      if (isFocused.current) scrollToSelfRef.current?.(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      isFocused.current = false;
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  return (
    <FriendPicker
      selected={friends}
      onChange={(names) => { setFriends(names); onSave(names); }}
      onFocus={() => { isFocused.current = true; }}
    />
  );
}

let _cachedDays: DaySession[] = [];
let _detailScrollY = 0;

function formatSessionLabel(s: DaySession): { top: string; bottom: string } {
  const todayISO = getTodayISO();
  const hasRealTime = !!s.startedAt && s.startedAt.length > 0 && !s.startedAt.endsWith('T00:00:00.000Z');

  if (s.date === todayISO) {
    const timeStr = hasRealTime ? format(new Date(s.startedAt), 'h:mm a') : null;
    return { top: 'TODAY', bottom: timeStr ?? format(new Date(), 'MMM d, yyyy') };
  }
  const date = parseISO(s.date);
  return {
    top: format(date, 'EEE').toUpperCase(),
    bottom: format(date, 'MMM d, yyyy'),
  };
}

export default function SessionsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { tabResetCount } = useNav();

  useEffect(() => {
    if (tabResetCount['sessions']) setSelectedDay(null);
  }, [tabResetCount['sessions']]);
  const [days, setDays] = useState<DaySession[]>(_cachedDays);
  const [selectedDay, setSelectedDay] = useState<DaySession | null>(null);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [modalSessionId, setModalSessionId] = useState<string | undefined>();
  const [editingClimb, setEditingClimb] = useState<Climb | undefined>();
  const [detailClimb, setDetailClimb] = useState<Climb | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [changeDateSession, setChangeDateSession] = useState<DaySession | null>(null);
  const [selectedCalDate, setSelectedCalDate] = useState<string | undefined>();
  const [sessionTitle, setSessionTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputValue = useRef('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionFriends, setSessionFriends] = useState<{ id: string; name: string }[]>([]);
  const [sessionLocation, setSessionLocation] = useState('');
  const [sessionMediaItems, setSessionMediaItems] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
  const [editingNotes, setEditingNotes] = useState(false);
  const [shareDay, setShareDay] = useState<DaySession | null>(null);
  const [shareCardIndex, setShareCardIndex] = useState(0);
  const shareCardRefs = useRef<(ViewShot | null)[]>([]);
  const shareScrollRef = useRef<ScrollView>(null);
  const notesInputValue = useRef('');
  const listRef = useRef<FlatList>(null);
  const pendingSessionId = useRef<string | null>(null);

  // Sync editing state when a different session is opened
  useEffect(() => {
    setSessionTitle(selectedDay?.title ?? '');
    setSessionNotes(selectedDay?.notes ?? '');
    setSessionFriends(selectedDay?.friends ?? []);
    setSessionLocation(selectedDay?.location ?? '');
    if (selectedDay?.mediaUris && selectedDay.mediaUris.length > 0) {
      setSessionMediaItems(selectedDay.mediaUris.map((uri, i) => ({ uri, type: selectedDay.mediaTypes?.[i] ?? 'photo' })));
    } else {
      setSessionMediaItems([]);
    }
    setEditingNotes(false);
    setEditingTitle(false);
  }, [selectedDay?.sessionId]);

  const todayISO = getTodayISO();
  const selectedDayRef = useRef<DaySession | null>(null);
  selectedDayRef.current = selectedDay;

  const load = useCallback(async () => {
    await restoreActiveSession();
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
        title: s.title,
        notes: s.notes,
        friends: s.friends,
        location: s.location,
        mediaUris: s.mediaUris && s.mediaUris.length > 0 ? s.mediaUris : s.mediaUri ? [s.mediaUri] : [],
        mediaTypes: s.mediaUris && s.mediaUris.length > 0 ? (s.mediaTypes ?? []) : s.mediaType ? [s.mediaType] : [],
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

  function climbCount(c: Climb): number {
    if (c.type === 'hangboard' || c.type === 'lift') return 0;
    if (c.outcome === 'flash' || c.outcome === 'hang') return 1;
    return c.attempts ?? 1;
  }

  function sessionStats(day: DaySession) {
    const gradedClimbs = day.climbs.filter(c => c.type !== 'hangboard' && c.type !== 'lift');
    const sends = gradedClimbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
    const hardest = [...gradedClimbs]
      .filter(c => c.outcome === 'send' || c.outcome === 'flash')
      .sort((a, b) => gradeToNum(b.grade, b.gradeSystem) - gradeToNum(a.grade, a.gradeSystem))[0];
    const projecting = sends === 0 && gradedClimbs.length > 0 && gradedClimbs.every(c => c.projectId);
    const gradedCount = day.climbs.reduce((sum, c) => sum + climbCount(c), 0);
    return { sends, hardest, projecting, gradedCount };
  }

  function openLogModal(sessionId: string) {
    setModalSessionId(sessionId);
    setLogModalVisible(true);
  }

  async function handleSaveSessionMeta(notes: string, friends: { id: string; name: string }[], location: string, mediaItems?: { uri: string; type: 'photo' | 'video' }[], title?: string) {
    if (!selectedDayRef.current) return;
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === selectedDayRef.current!.sessionId);
    if (!session) return;
    const mediaUris = mediaItems?.map(m => m.uri);
    const mediaTypes = mediaItems?.map(m => m.type);
    const newTitle = title !== undefined ? title : session.title;
    await saveSession({ ...session, title: newTitle || undefined, notes, friends, location: location || undefined, mediaUris, mediaTypes, mediaUri: mediaUris?.[0], mediaType: mediaTypes?.[0] });
    const updater = (d: DaySession) =>
      d.sessionId === session.id ? { ...d, title: newTitle || undefined, notes, friends, location: location || undefined, mediaUris: mediaUris ?? [], mediaTypes: mediaTypes ?? [] } : d;
    setDays(prev => prev.map(updater));
    setSelectedDay(prev => prev ? updater(prev) : null);
  }

  async function handleSaveTitle(title: string) {
    setSessionTitle(title);
    setEditingTitle(false);
    await handleSaveSessionMeta(sessionNotes, sessionFriends, sessionLocation, sessionMediaItems, title);
  }

  async function handlePickSessionMedia() {
    Alert.alert('Add Photo', 'Choose source', [
      { text: 'Take Photo',    onPress: () => launchSessionMedia('camera') },
      { text: 'Photo Library', onPress: () => launchSessionMedia('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function launchSessionMedia(source: 'camera' | 'library') {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access in Settings.'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access in Settings.'); return; }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsMultipleSelection: true });
    if (result.canceled || !result.assets?.length) return;
    const newItems = result.assets.map(a => ({ uri: a.uri, type: 'photo' as const }));
    const updated = [...sessionMediaItems, ...newItems];
    setSessionMediaItems(updated);
    handleSaveSessionMeta(sessionNotes, sessionFriends, sessionLocation, updated);
  }

  function handleRemoveSessionMediaItem(index: number) {
    Alert.alert('Remove Photo', 'Remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          const updated = sessionMediaItems.filter((_, i) => i !== index);
          setSessionMediaItems(updated);
          handleSaveSessionMeta(sessionNotes, sessionFriends, sessionLocation, updated);
        },
      },
    ]);
  }

  function handleRemoveClimbMediaItem(climbId: string, uri: string) {
    Alert.alert('Remove Photo', 'Remove this photo from the climb?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const climbs = await getAllClimbs();
          const climb = climbs.find(c => c.id === climbId);
          if (!climb) return;
          const idx = climb.mediaUris?.indexOf(uri) ?? -1;
          let updatedClimb: Climb;
          if (idx >= 0 && climb.mediaUris) {
            const newUris = climb.mediaUris.filter((_, i) => i !== idx);
            const newTypes = climb.mediaTypes?.filter((_, i) => i !== idx);
            updatedClimb = { ...climb, mediaUris: newUris, mediaTypes: newTypes, mediaUri: newUris[0], mediaType: newTypes?.[0] };
          } else {
            updatedClimb = { ...climb, mediaUri: undefined, mediaType: undefined };
          }
          await saveClimb(updatedClimb);
          load();
        },
      },
    ]);
  }

  function handleSaveNotes(text: string) {
    setSessionNotes(text);
    setEditingNotes(false);
    handleSaveSessionMeta(text, sessionFriends, sessionLocation, sessionMediaItems);
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
    setShareDay(day);
  }

  const SHARE_CARDS = [
    { label: 'Card',                hint: null,                            transparent: false, vertical: true,  strava: false, stravasolid: false },
    { label: 'Transparent Card',    hint: null,                            transparent: true,  vertical: true,  strava: false, stravasolid: false },
    { label: 'Sticker',             hint: 'Save & place as story sticker', transparent: false, vertical: false, strava: true,  stravasolid: true  },
    { label: 'Transparent Sticker', hint: 'Save & place as story sticker', transparent: false, vertical: false, strava: true,  stravasolid: false },
  ];

  async function captureCurrentCard(): Promise<string> {
    const ref = shareCardRefs.current[shareCardIndex];
    return await (ref as any).capture();
  }

  async function handleCaptureAndShare() {
    try {
      const uri = await captureCurrentCard();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Session' });
    } catch {
      if (shareDay) {
        const sends = shareDay.climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash');
        await Share.share({ message: `COCO | ${shareDay.date} — ${shareDay.climbs.length} climbs, ${sends.length} sends` });
      }
    } finally {
      setShareDay(null);
    }
  }

  async function handleShareToStories() {
    try {
      const uri = await captureCurrentCard();
      await RNShare.shareSingle({
        social: RNShare.Social.INSTAGRAM_STORIES,
        backgroundImage: uri,
        appId: '2188945488595075',
      });
      setShareDay(null);
    } catch (e: any) {
      if (e?.message?.includes('not installed') || e?.message?.includes('not available')) {
        Alert.alert('Instagram not found', 'Instagram doesn\'t appear to be installed on this device.');
      } else {
        Alert.alert('Error', 'Could not share to Instagram Stories.');
      }
    }
  }

  async function handleShareAsSticker() {
    try {
      const uri = await captureCurrentCard();
      await RNShare.shareSingle({
        social: RNShare.Social.INSTAGRAM_STORIES,
        stickerImage: uri,
        appId: '2188945488595075',
      });
      setShareDay(null);
    } catch (e: any) {
      if (e?.message?.includes('not installed') || e?.message?.includes('not available')) {
        Alert.alert('Instagram not found', 'Instagram doesn\'t appear to be installed on this device.');
      } else {
        Alert.alert('Error', 'Could not share to Instagram Stories.');
      }
    }
  }

  // ── Active Session Card ───────────────────────────────────────────────────────

  const SCREEN_WIDTH = Dimensions.get('window').width;

  function ActiveSessionCard() {
    if (!activeSession) return null;

    const { sends, hardest, projecting, gradedCount } = sessionStats(activeSession);
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
              : gradedCount > 0 ? <>
                  <View>
                    <Text style={[styles.sessionStatVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{gradedCount}</Text>
                    <Text style={[styles.sessionStatLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>logged</Text>
                  </View>
                  <View>
                    <Text style={[styles.sessionStatVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{sends}</Text>
                    <Text style={[styles.sessionStatLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>sends</Text>
                  </View>
                </> : null
            }
            <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
          </View>
        </TouchableOpacity>

        {/* End Session footer button */}
        <TouchableOpacity
          style={[styles.endSessionRow, { borderTopColor: colors.accent + '40' }]}
          onPress={async () => {
            if (activeSessionId) {
              await endSession(activeSessionId);
              const sessions = await import('../utils/storage').then(m => m.getAllSessions());
              const ended = sessions.find(s => s.id === activeSessionId);
              if (ended && user) syncSessionToCloud(ended, user.id).catch(() => {});
            }
            await load();
          }}
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

  function sessionTimeOfDay(day: DaySession): string {
    const isoTime = day.startedAt || day.lastClimbAt || day.climbs[0]?.date;
    if (!isoTime) return 'Climbing Session';
    const d = new Date(isoTime);
    if (isNaN(d.getTime())) return 'Climbing Session';
    const hour = d.getHours();
    if (hour < 12) return 'Morning Climb';
    if (hour < 17) return 'Afternoon Climb';
    return 'Evening Climb';
  }

  function DetailView({ day }: { day: DaySession }) {
    const { sends, hardest, projecting, gradedCount } = sessionStats(day);
    const label = formatSessionLabel(day);
    const isActive = day.sessionId === getActiveSessionId();
    const hardestTypeColor = CLIMB_TYPES.find(t => t.id === hardest?.type)?.color ?? colors.accent;
    const displayClimbs = isActive ? day.climbs : mergeClimbs(day.climbs);

    const swipeBack = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 20 && Math.abs(g.dy) < 60,
        onPanResponderRelease: (_, g) => { if (g.dx > 60) { _detailScrollY = 0; setSelectedDay(null); } },
      })
    ).current;

    const detailScrollRef = useRef<ScrollView>(null);
    const friendsCardY = useRef(0);
    const notesCardY = useRef(0);
    const notesCardRef = useRef<View>(null);

    useEffect(() => {
      if (editingNotes) {
        const t = setTimeout(() => {
          notesCardRef.current?.measure((_fx, _fy, _w, _h, _px, py) => {
            const targetScreenY = 120;
            const scrollDelta = py - targetScreenY;
            const newY = Math.max(0, (_detailScrollY || 0) + scrollDelta);
            detailScrollRef.current?.scrollTo({ y: newY, animated: true });
          });
        }, 320);
        return () => clearTimeout(t);
      }
    }, [editingNotes]);

    useEffect(() => {
      if (_detailScrollY > 0) {
        const t = setTimeout(() => {
          detailScrollRef.current?.scrollTo({ y: _detailScrollY, animated: false });
        }, 0);
        return () => clearTimeout(t);
      }
    }, []);

    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.detailContainer, { backgroundColor: colors.bg }]} {...swipeBack.panHandlers}>
        {/* Back bar */}
        <View style={[styles.detailTopBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => { _detailScrollY = 0; setSelectedDay(null); }} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backBtnText, { color: colors.accent }]}>← Back</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={detailScrollRef}
          scrollEventThrottle={16}
          onScroll={e => { _detailScrollY = e.nativeEvent.contentOffset.y; }}
          contentContainerStyle={styles.detailContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Session header */}
          <View style={[styles.detailHeader, { backgroundColor: colors.bgCard, borderColor: isActive ? colors.accent : colors.border, borderWidth: isActive ? 2 : 1 }]}>
            {/* Date / active label */}
            <View style={styles.detailHeaderTop}>
              {isActive ? (
                <View style={styles.activeBadgeRow}>
                  <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.detailDay, { color: colors.accent }]}>ACTIVE SESSION</Text>
                </View>
              ) : (
                <Text style={[styles.detailDay, { color: colors.textMuted }]}>{label.top} · {label.bottom}</Text>
              )}
            </View>

            {/* Editable title */}
            {editingTitle ? (
              <TextInput
                style={[styles.detailTitle, styles.detailTitleInput, { color: colors.textPrimary, borderColor: colors.border }]}
                defaultValue={sessionTitle || sessionTimeOfDay(day)}
                onChangeText={t => { titleInputValue.current = t; }}
                onEndEditing={e => handleSaveTitle(e.nativeEvent.text.trim())}
                onSubmitEditing={e => handleSaveTitle(e.nativeEvent.text.trim())}
                placeholder={sessionTimeOfDay(day)}
                placeholderTextColor={colors.textMuted}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
              />
            ) : (
              <TouchableOpacity
                style={styles.detailTitleRow}
                onPress={() => { titleInputValue.current = sessionTitle; setEditingTitle(true); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.detailTitle, { color: colors.textPrimary, flex: 1 }]}>
                  {sessionTitle.trim() || sessionTimeOfDay(day)}
                </Text>
                <Ionicons name="pencil-outline" size={16} color={colors.textMuted} style={{ marginLeft: 6, marginTop: 3 }} />
              </TouchableOpacity>
            )}

            {/* Friends */}
            {day.friends && day.friends.length > 0 && (
              <Text style={[styles.detailFriends, { color: colors.textMuted }]}>
                with {day.friends.map((f: any) => f?.name ?? f).join(', ')}
              </Text>
            )}

            {/* Stats row */}
            <View style={[styles.detailStatsRow, { borderTopColor: colors.border }]}>
              {projecting ? (
                <Text style={[styles.todayStatLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
              ) : (
                <>
                  <View style={styles.todayStat}>
                    <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{day.climbs.reduce((s, c) => s + climbCount(c), 0)}</Text>
                    <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>climbs</Text>
                  </View>
                  <View style={styles.todayStat}>
                    <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{sends}</Text>
                    <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>sends</Text>
                  </View>
                </>
              )}
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
                  onIncrementAttempts={isActive ? async () => {
                    await saveClimb({ ...c, attempts: (c.attempts ?? 1) + 1 });
                    load();
                  } : undefined}
                />
              </SwipeToDelete>
            ))
          }

          {/* Notes */}
          <View ref={notesCardRef} style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.metaLabelRow}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>NOTES</Text>
              {editingNotes ? (
                <TouchableOpacity onPress={() => handleSaveNotes(notesInputValue.current)} activeOpacity={0.7}>
                  <Text style={[styles.metaAction, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Done</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => { notesInputValue.current = sessionNotes; setEditingNotes(true); }} activeOpacity={0.7}>
                  <Text style={[styles.metaAction, { color: colors.accent }]}>
                    {sessionNotes.trim() ? 'Edit Activity Note' : 'Add Activity Note'}
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
                handleSaveSessionMeta(sessionNotes, sessionFriends, loc, sessionMediaItems);
              }}
            />
          </View>

          {/* Friends */}
          <View
            style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onLayout={(e) => { friendsCardY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
            <SessionFriendPicker
              initialFriends={sessionFriends}
              onSave={(names) => {
                setSessionFriends(names);
                setSelectedDay(prev => prev ? { ...prev, friends: names } : null);
                handleSaveSessionMeta(sessionNotes, names, sessionLocation, sessionMediaItems);
              }}
              scrollToSelf={(keyboardHeight) => {
                if (friendsCardY.current > 0) {
                  // Scroll so the friends card sits in the top third of the space
                  // above the keyboard, leaving the dropdown visible below the input.
                  const windowHeight = Dimensions.get('window').height;
                  const visibleHeight = windowHeight - keyboardHeight;
                  const scrollY = friendsCardY.current - visibleHeight * 0.25;
                  detailScrollRef.current?.scrollTo({ y: Math.max(0, scrollY), animated: true });
                }
              }}
            />
          </View>

          {/* Session Media */}
          {(() => {
            // Gather all climb photos for this session
            const climbMedia: { uri: string; type: 'photo' | 'video'; fromClimb: true; climbId: string }[] = [];
            for (const c of day.climbs) {
              if (c.mediaUris && c.mediaUris.length > 0) {
                c.mediaUris.forEach((uri, i) => climbMedia.push({ uri, type: c.mediaTypes?.[i] ?? 'photo', fromClimb: true, climbId: c.id }));
              } else if (c.mediaUri) {
                climbMedia.push({ uri: c.mediaUri, type: c.mediaType ?? 'photo', fromClimb: true, climbId: c.id });
              }
            }
            const allMedia = [
              ...sessionMediaItems.map((m, i) => ({ ...m, fromClimb: false as const, sessionIndex: i })),
              ...climbMedia,
            ];
            return (
              <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>MEDIA</Text>
                {allMedia.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
                    {allMedia.map((item, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onLongPress={() => item.fromClimb ? handleRemoveClimbMediaItem(item.climbId, item.uri) : handleRemoveSessionMediaItem(item.sessionIndex)}
                        activeOpacity={0.9}
                        delayLongPress={400}
                        style={{ marginRight: SPACING.sm }}
                      >
                        <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.mediaThumbnail, styles.mediaAddTile, { borderColor: colors.border, backgroundColor: colors.bg }]}
                      onPress={handlePickSessionMedia}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 30, color: colors.textMuted }}>+</Text>
                    </TouchableOpacity>
                  </ScrollView>
                ) : (
                  <TouchableOpacity
                    style={[styles.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                    onPress={handlePickSessionMedia}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.mediaBtnText, { color: colors.textSecondary }]}>+ Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}

          {/* Actions */}
          <View style={styles.detailActions}>
            {isActive ? (
              <TouchableOpacity
                style={[styles.logClimbBtn, { backgroundColor: colors.accent, flex: 1 }]}
                onPress={async () => {
                  if (activeSessionId) {
                    await endSession(activeSessionId);
                    const sessions = await import('../utils/storage').then(m => m.getAllSessions());
                    const ended = sessions.find(s => s.id === activeSessionId);
                    if (ended && user) syncSessionToCloud(ended, user.id).catch(() => {});
                  }
                  await load();
                  setSelectedDay(null);
                }}
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
      </KeyboardAvoidingView>
    );
  }

  // ── History row ───────────────────────────────────────────────────────────────

  function renderDay({ item }: { item: DaySession }) {
    const { sends, hardest, projecting, gradedCount } = sessionStats(item);
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
                : gradedCount > 0 ? <>
                    <View>
                      <Text style={[styles.sessionStatVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{gradedCount}</Text>
                      <Text style={[styles.sessionStatLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>logged</Text>
                    </View>
                    <View>
                      <Text style={[styles.sessionStatVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{sends}</Text>
                      <Text style={[styles.sessionStatLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>sends</Text>
                    </View>
                  </> : null
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
        <Modal visible={!!shareDay} transparent animationType="fade" onRequestClose={() => setShareDay(null)}>
          <View style={styles.shareOverlay}>
            <ScrollView
              ref={shareScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              onMomentumScrollEnd={e => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setShareCardIndex(index);
              }}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ alignItems: 'center' }}
            >
              {SHARE_CARDS.map((card, i) => (
                <View key={i} style={{ width: SCREEN_WIDTH, alignItems: 'center', justifyContent: 'center', paddingTop: 160, paddingBottom: SPACING.xl }}>
                  <ViewShot ref={ref => { shareCardRefs.current[i] = ref; }} options={{ format: 'png', quality: 1 }}>
                    {shareDay && (card.strava ? (
                      <SessionShareCardStrava
                        date={shareDay.date}
                        climbs={shareDay.climbs}
                        location={shareDay.location}
                        accentColor={colors.accent}
                        solid={card.stravasolid}
                        climbingWith={shareDay.friends?.map((f: any) => f?.name ?? f)}
                      />
                    ) : card.vertical ? (
                      <SessionShareCardVertical
                        date={shareDay.date}
                        climbs={shareDay.climbs}
                        location={shareDay.location}
                        accentColor={colors.accent}
                        variant={card.transparent ? 'transparent' : 'solid'}
                        climbingWith={shareDay.friends?.map((f: any) => f?.name ?? f)}
                        title={shareDay.title}
                      />
                    ) : (
                      <SessionShareCard
                        date={shareDay.date}
                        climbs={shareDay.climbs}
                        location={shareDay.location}
                        accentColor={colors.accent}
                        transparent={card.transparent}
                      />
                    ))}
                  </ViewShot>
                  <Text style={[styles.cardLabel, { color: 'rgba(255,255,255,0.5)' }]}>{card.label}</Text>
                  {card.hint ? <Text style={[styles.cardHint, { color: 'rgba(255,255,255,0.3)' }]}>{card.hint}</Text> : null}
                </View>
              ))}
            </ScrollView>
            <View style={styles.dotsRow}>
              {SHARE_CARDS.map((_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: i === shareCardIndex ? '#fff' : 'rgba(255,255,255,0.3)' }]} />
              ))}
            </View>
            <View style={styles.shareButtons}>
              <TouchableOpacity style={[styles.shareConfirmBtn, { backgroundColor: colors.accent }]} onPress={handleCaptureAndShare} activeOpacity={0.8}>
                <Text style={styles.shareConfirmText}>Share...</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.shareCancelBtn, { borderColor: 'rgba(255,255,255,0.2)' }]} onPress={() => setShareDay(null)} activeOpacity={0.7}>
                <Text style={[styles.shareCancelText, { color: 'rgba(255,255,255,0.5)' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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

      {shareDay && <ShareCardModal />}
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
  detailHeader: { borderRadius: 12, padding: SPACING.lg, flexDirection: 'column', gap: SPACING.xs },
  detailHeaderTop: { flexDirection: 'row', alignItems: 'center' },
  detailDay: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.bold, letterSpacing: 1 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACING.xs },
  detailTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.family.bold, lineHeight: 28 },
  detailTitleInput: { borderBottomWidth: 1, paddingVertical: 2, flex: 1 },
  detailStatsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1 },
  todayStat: { alignItems: 'center' },
  todayStatVal: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold, textAlign: 'center' },
  todayStatLbl: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, textAlign: 'center' },
  detailActions: { flexDirection: 'row', gap: SPACING.sm },
  noClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.lg },
  detailFriends: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 },

  // Media styles
  mediaThumbnail: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  mediaAddTile: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBtn: {
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  mediaBtnText: {
    fontSize: FONTS.sizes.sm,
  },

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
  shareOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  cardLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: SPACING.sm,
  },
  cardHint: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  shareButtons: {
    gap: SPACING.md,
    width: 320,
    marginBottom: SPACING.xl,
  },
  shareConfirmBtn: {
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  shareConfirmText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
  },
  shareCancelBtn: {
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  shareCancelText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
  },
});
