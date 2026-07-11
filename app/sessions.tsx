import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert, Dimensions, Image, KeyboardAvoidingView, Platform, Keyboard, KeyboardEvent } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../utils/supabase';
import ShareModal from '../components/ShareModal';
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
  triggerFeedRefresh, triggerStatsRefresh, getSessionsCondensed, saveSessionsCondensed,
} from '../utils/storage';
import FriendPicker from '../components/FriendPicker';
import ClimbCard from '../components/ClimbCard';
import ClimbDetailModal from '../components/ClimbDetailModal';
import { EmptyState } from '../components/UI';
import LogClimbModal from '../components/LogClimbModal';
import SwipeToDelete from '../components/SwipeToDelete';
import MiniCalendar from '../components/MiniCalendar';
import { useNav } from '../utils/NavigationContext';
import { syncSessionToCloud, deleteR2MediaUrls } from '../utils/cloudSync';
import { uploadMedia } from '../utils/mediaUpload';
import { DaySession, sessionStats, mergeClimbs, sessionTimeOfDay, formatSessionLabel } from '../utils/sessionHelpers';
import SessionCard from '../components/SessionCard';

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
let _cachedCondensed = false;

export default function SessionsScreen() {
  const { colors } = useTheme();
  const { user, avatarUrl, localAvatarUri } = useAuth();
  const { tabResetCount, pendingSessionId: navPendingSessionId, clearPendingSessionId, viewFriendProfile } = useNav();

  // Keep refs current so load() (stable useCallback with [] deps) can read
  // the latest navPendingSessionId without a stale closure
  const navPendingRef = useRef(navPendingSessionId);
  navPendingRef.current = navPendingSessionId;
  const clearNavPendingRef = useRef(clearPendingSessionId);
  clearNavPendingRef.current = clearPendingSessionId;

  useEffect(() => {
    if (tabResetCount['sessions']) setSelectedDay(null);
  }, [tabResetCount['sessions']]);

  useEffect(() => {
    if (!navPendingSessionId) return;
    const target = days.find(d => d.sessionId === navPendingSessionId);
    if (target) {
      scrollToSessionCard(navPendingSessionId);
      clearPendingSessionId();
    }
  }, [navPendingSessionId, days]);
  const [days, setDays] = useState<DaySession[]>(_cachedDays);
  const [sessionsCondensed, setSessionsCondensed] = useState(_cachedCondensed);
  const [selectedDay, setSelectedDay] = useState<DaySession | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
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
  const [viewerUris, setViewerUris] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const viewerScrollRef = useRef<ScrollView>(null);
  const notesInputValue = useRef('');
  const [listScrollEnabled, setListScrollEnabled] = useState(true);
  const pendingSessionId = useRef<string | null>(null);
  const sessionsScrollRef = useRef<ScrollView>(null);
  const sessionCardOffsets = useRef<Record<string, number>>({});
  const scrollToSessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Scroll photo viewer to the tapped photo once the modal has laid out
  useEffect(() => {
    if (!viewerVisible) return;
    const t = setTimeout(() => {
      const sw = Dimensions.get('window').width;
      viewerScrollRef.current?.scrollTo({ x: viewerIndex * sw, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, [viewerVisible]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Handle cross-tab deep-link (e.g. stats → this session) when the sessions
    // screen wasn't mounted yet and days was empty when the effect first fired
    const navId = navPendingRef.current;
    if (navId) {
      const navTarget = result.find(d => d.sessionId === navId);
      if (navTarget) {
        scrollToSessionCard(navId);
        clearNavPendingRef.current();
        return;
      }
    }

    // Navigate into a newly-created past session after saving
    if (pendingSessionId.current) {
      const targetId = pendingSessionId.current;
      const target = result.find(d => d.sessionId === targetId);
      pendingSessionId.current = null;
      if (target) { scrollToSessionCard(targetId); return; }
    }

    // Keep selectedDay in sync after reload (use ref to avoid stale closure)
    const current = selectedDayRef.current;
    if (current) {
      const updated = result.find(d => d.sessionId === current.sessionId);
      setSelectedDay(updated ?? null);
    }
  }, []); // stable — selectedDay accessed via ref

  useEffect(() => { load(); }, []);

  useEffect(() => {
    getSessionsCondensed().then(v => { _cachedCondensed = v; setSessionsCondensed(v); });
  }, []);

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
    const updatedSession = { ...session, title: newTitle || undefined, notes, friends, location: location || undefined, mediaUris, mediaTypes, mediaUri: mediaUris?.[0], mediaType: mediaTypes?.[0] };
    await saveSession(updatedSession);
    triggerFeedRefresh();
    if (user) syncSessionToCloud(updatedSession, user.id).catch(() => {});
    const updater = (d: DaySession) =>
      d.sessionId === session.id ? { ...d, title: newTitle || undefined, notes, friends, location: location || undefined, mediaUris: mediaUris ?? [], mediaTypes: mediaTypes ?? [] } : d;
    setDays(prev => prev.map(updater));
    setSelectedDay(prev => prev ? updater(prev) : null);
  }

  async function handleSaveActiveSessionMeta(sessionId: string, notes: string, friends: { id: string; name: string }[], location: string, mediaItems?: { uri: string; type: 'photo' | 'video' }[], title?: string) {
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const mediaUris = mediaItems?.map(m => m.uri);
    const mediaTypes = mediaItems?.map(m => m.type);
    const newTitle = title !== undefined ? title : session.title;
    const updatedSession = { ...session, title: newTitle || undefined, notes, friends, location: location || undefined, mediaUris, mediaTypes, mediaUri: mediaUris?.[0], mediaType: mediaTypes?.[0] };
    await saveSession(updatedSession);
    triggerFeedRefresh();
    if (user) syncSessionToCloud(updatedSession, user.id).catch(() => {});
    setDays(prev => prev.map(d => d.sessionId === sessionId ? { ...d, title: newTitle || undefined, notes, friends, location: location || undefined, mediaUris: mediaUris ?? [], mediaTypes: mediaTypes ?? [] } : d));
  }

  async function handlePickActiveSessionMedia(sessionId: string, currentMediaItems: { uri: string; type: 'photo' | 'video' }[], setMediaItems: (items: { uri: string; type: 'photo' | 'video' }[]) => void, notes: string, friends: { id: string; name: string }[], location: string) {
    Alert.alert('Add Photo', 'Choose source', [
      { text: 'Take Photo',    onPress: () => launchActiveSessionMedia('camera', sessionId, currentMediaItems, setMediaItems, notes, friends, location) },
      { text: 'Photo Library', onPress: () => launchActiveSessionMedia('library', sessionId, currentMediaItems, setMediaItems, notes, friends, location) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function launchActiveSessionMedia(source: 'camera' | 'library', sessionId: string, currentMediaItems: { uri: string; type: 'photo' | 'video' }[], setMediaItems: (items: { uri: string; type: 'photo' | 'video' }[]) => void, notes: string, friends: { id: string; name: string }[], location: string) {
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
    if (!user) return;

    const startIdx = currentMediaItems.length;
    const mediaDir = `${FileSystem.documentDirectory}coco_media/`;
    try { await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true }); } catch {}
    const permanentItems: { uri: string; type: 'photo' | 'video' }[] = [];
    const isPermanentCopy: boolean[] = [];
    for (let i = 0; i < result.assets.length; i++) {
      const asset = result.assets[i];
      const destUri = `${mediaDir}session_${sessionId}_${startIdx + i}_${Date.now()}.jpg`;
      try {
        await FileSystem.copyAsync({ from: asset.uri, to: destUri });
        permanentItems.push({ uri: destUri, type: 'photo' });
        isPermanentCopy.push(true);
      } catch (copyErr: any) {
        console.warn('[launchActiveSessionMedia] copy to permanent storage failed:', copyErr);
        permanentItems.push({ uri: asset.uri, type: 'photo' });
        isPermanentCopy.push(false);
      }
    }

    const withLocal = [...currentMediaItems, ...permanentItems];
    setMediaItems(withLocal);

    const permanentOnly = permanentItems.filter((_, i) => isPermanentCopy[i]);
    if (permanentOnly.length > 0) {
      const withPermanent = [...currentMediaItems, ...permanentOnly];
      await handleSaveActiveSessionMeta(sessionId, notes, friends, location, withPermanent);
    }

    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) {
      console.warn('[launchActiveSessionMedia] no auth session — upload skipped, file:// saved for retry');
      return;
    }

    const resolved = [...withLocal];
    let anyUploaded = false;

    for (let i = 0; i < permanentItems.length; i++) {
      const item = permanentItems[i];
      const slot = startIdx + i;
      try {
        const path = `${user.id}/session_${sessionId}_${slot}.jpg`;
        const url = await uploadMedia(item.uri, path, authSession.access_token);
        resolved[slot] = { uri: url, type: item.type };
        anyUploaded = true;
      } catch (uploadErr: any) {
        console.warn('[launchActiveSessionMedia] R2 upload failed for slot', slot, ':', uploadErr);
      }
    }

    if (anyUploaded) {
      setMediaItems(resolved);
      const allSessions = await getAllSessions();
      const sess = allSessions.find(s => s.id === sessionId);
      if (sess) {
        const updatedUris = resolved.map(m => m.uri);
        const updatedTypes = resolved.map(m => m.type);
        const updated = { ...sess, mediaUris: updatedUris, mediaTypes: updatedTypes, mediaUri: updatedUris[0], mediaType: updatedTypes[0] };
        await saveSession(updated);
        if (user) syncSessionToCloud(updated, user.id).catch(() => {});
        triggerFeedRefresh();
        setDays(prev => prev.map(d => d.sessionId === sessionId ? { ...d, mediaUris: updatedUris, mediaTypes: updatedTypes } : d));
      }
      for (let i = 0; i < permanentItems.length; i++) {
        if (isPermanentCopy[i] && resolved[startIdx + i]?.uri?.startsWith('http')) {
          FileSystem.deleteAsync(permanentItems[i].uri, { idempotent: true }).catch(() => {});
        }
      }
    }
  }

  function handleRemoveActiveSessionMediaItem(index: number, sessionId: string, currentMediaItems: { uri: string; type: 'photo' | 'video' }[], setMediaItems: (items: { uri: string; type: 'photo' | 'video' }[]) => void, notes: string, friends: { id: string; name: string }[], location: string) {
    Alert.alert('Remove Photo', 'Remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          const removedUri = currentMediaItems[index]?.uri;
          const updated = currentMediaItems.filter((_, i) => i !== index);
          setMediaItems(updated);
          handleSaveActiveSessionMeta(sessionId, notes, friends, location, updated);
          if (removedUri?.startsWith('http')) {
            deleteR2MediaUrls([removedUri]).catch(() => {});
          }
        },
      },
    ]);
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

    if (!user || !selectedDayRef.current) return;

    const sessionId = selectedDayRef.current.sessionId;
    const startIdx = sessionMediaItems.length;

    // Copy each picked file to permanent document storage so the URI survives
    // iOS clearing the ImagePicker temp directory if the app is closed mid-upload.
    const mediaDir = `${FileSystem.documentDirectory}coco_media/`;
    try { await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true }); } catch {}
    const permanentItems: { uri: string; type: 'photo' | 'video' }[] = [];
    const isPermanentCopy: boolean[] = [];
    for (let i = 0; i < result.assets.length; i++) {
      const asset = result.assets[i];
      const ext = 'jpg';
      const destUri = `${mediaDir}session_${sessionId}_${startIdx + i}_${Date.now()}.${ext}`;
      try {
        await FileSystem.copyAsync({ from: asset.uri, to: destUri });
        permanentItems.push({ uri: destUri, type: 'photo' });
        isPermanentCopy.push(true);
      } catch (copyErr: any) {
        console.warn('[launchSessionMedia] copy to permanent storage failed:', copyErr);
        // Fall back to temp URI so the photo appears immediately; upload will
        // still be attempted below, and if it succeeds the R2 URL persists.
        permanentItems.push({ uri: asset.uri, type: 'photo' });
        isPermanentCopy.push(false);
      }
    }

    // Show the photo in the UI immediately (may include temp URIs).
    const withLocal = [...sessionMediaItems, ...permanentItems];
    setSessionMediaItems(withLocal);

    // Only persist items that were copied to permanent storage — temp URIs
    // will not survive an app restart so saving them to AsyncStorage is
    // misleading (they'd be found as stale file:// paths and dropped).
    const permanentOnly = permanentItems.filter((_, i) => isPermanentCopy[i]);
    if (permanentOnly.length > 0) {
      const withPermanent = [...sessionMediaItems, ...permanentOnly];
      // Await so file:// paths are persisted before upload (and possible deletion).
      await handleSaveSessionMeta(sessionNotes, sessionFriends, sessionLocation, withPermanent);
    }

    // Upload to R2 in the foreground.
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) {
      console.warn('[launchSessionMedia] no auth session — upload skipped, file:// saved for retry');
      return;
    }

    const resolved = [...withLocal];
    let anyUploaded = false;

    for (let i = 0; i < permanentItems.length; i++) {
      const item = permanentItems[i];
      const slot = startIdx + i;
      try {
        const path = `${user.id}/session_${sessionId}_${slot}.jpg`;
        const url = await uploadMedia(item.uri, path, authSession.access_token);
        resolved[slot] = { uri: url, type: item.type };
        anyUploaded = true;
        // Permanent copy deleted AFTER the R2 URL is saved to local (below).
      } catch (uploadErr: any) {
        console.warn('[launchSessionMedia] R2 upload failed for slot', slot, ':', uploadErr);
        // Keep permanent URI — reuploadMissingMedia will retry on next open.
      }
    }

    if (anyUploaded) {
      setSessionMediaItems(resolved);
      // Save R2 URLs using the captured sessionId — not selectedDayRef (which may
      // be null if the user navigated away while the upload was in progress).
      const allSessions = await getAllSessions();
      const sess = allSessions.find(s => s.id === sessionId);
      if (sess) {
        const updatedUris = resolved.map(m => m.uri);
        const updatedTypes = resolved.map(m => m.type);
        const updated = { ...sess, mediaUris: updatedUris, mediaTypes: updatedTypes, mediaUri: updatedUris[0], mediaType: updatedTypes[0] };
        await saveSession(updated);
        if (user) syncSessionToCloud(updated, user.id).catch(() => {});
        triggerFeedRefresh();
        const dayUpdater = (d: DaySession): DaySession =>
          d.sessionId === sessionId ? { ...d, mediaUris: updatedUris, mediaTypes: updatedTypes } : d;
        setDays(prev => prev.map(dayUpdater));
        setSelectedDay(prev => prev?.sessionId === sessionId ? dayUpdater(prev) : prev);
      }
      // NOW delete permanent copies — after R2 URLs are persisted to local.
      for (let i = 0; i < permanentItems.length; i++) {
        if (isPermanentCopy[i] && resolved[startIdx + i]?.uri?.startsWith('http')) {
          FileSystem.deleteAsync(permanentItems[i].uri, { idempotent: true }).catch(() => {});
        }
      }
    }
  }

  function handleRemoveSessionMediaItem(index: number) {
    Alert.alert('Remove Photo', 'Remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          const removedUri = sessionMediaItems[index]?.uri;
          const updated = sessionMediaItems.filter((_, i) => i !== index);
          setSessionMediaItems(updated);
          handleSaveSessionMeta(sessionNotes, sessionFriends, sessionLocation, updated);
          if (removedUri?.startsWith('http')) {
            deleteR2MediaUrls([removedUri]).catch(() => {});
          }
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
          if (uri.startsWith('http')) {
            deleteR2MediaUrls([uri]).catch(() => {});
          }
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


  async function handleToggleCondensed() {
    const next = !sessionsCondensed;
    _cachedCondensed = next;
    setSessionsCondensed(next);
    await saveSessionsCondensed(next);
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

  function scrollToSessionCard(sessionId: string, attemptsLeft = 10) {
    if (scrollToSessionTimeoutRef.current) clearTimeout(scrollToSessionTimeoutRef.current);
    const y = sessionCardOffsets.current[sessionId];
    if (y !== undefined) {
      sessionsScrollRef.current?.scrollTo({ y: Math.max(0, y - SPACING.lg), animated: true });
    } else if (attemptsLeft > 0) {
      scrollToSessionTimeoutRef.current = setTimeout(() => scrollToSessionCard(sessionId, attemptsLeft - 1), 50);
    }
  }

  function handleCalendarSelect(dateStr: string) {
    setSelectedCalDate(dateStr);
    const existing = listDays.find(d => d.date === dateStr);
    if (existing) {
      setCalendarVisible(false);
      scrollToSessionCard(existing.sessionId);
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

  async function handleDeleteSession(day: DaySession) {
    Alert.alert('Delete Session', 'This will delete the session and all its climbs. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          for (const c of day.climbs) await deleteClimb(c.id);
          await deleteSession(day.sessionId);
          triggerStatsRefresh();
          setEditModalVisible(false);
          setSelectedDay(null);
          await load();
        },
      },
    ]);
  }



  // ── Active Session Card ───────────────────────────────────────────────────────

  const SCREEN_WIDTH = Dimensions.get('window').width;
  const SCREEN_HEIGHT = Dimensions.get('window').height;

  function ActiveSessionCard() {
    const [activeTitle, setActiveTitle] = useState('');
    const [activeEditingTitle, setActiveEditingTitle] = useState(false);
    const activeTitleInputValue = useRef('');
    const [activeNotes, setActiveNotes] = useState('');
    const [activeEditingNotes, setActiveEditingNotes] = useState(false);
    const activeNotesInputValue = useRef('');
    const [activeFriends, setActiveFriends] = useState<{ id: string; name: string }[]>([]);
    const [activeLocation, setActiveLocation] = useState('');
    const [activeMediaItems, setActiveMediaItems] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);

    useEffect(() => {
      setActiveTitle(activeSession?.title ?? '');
      setActiveNotes(activeSession?.notes ?? '');
      setActiveFriends(activeSession?.friends ?? []);
      setActiveLocation(activeSession?.location ?? '');
      if (activeSession?.mediaUris && activeSession.mediaUris.length > 0) {
        setActiveMediaItems(activeSession.mediaUris.map((uri, i) => ({ uri, type: activeSession.mediaTypes?.[i] ?? 'photo' })));
      } else {
        setActiveMediaItems([]);
      }
      setActiveEditingNotes(false);
      setActiveEditingTitle(false);
    }, [activeSession?.sessionId]);

    if (!activeSession) return null;

    const { sends, hardest, projecting, gradedCount } = sessionStats(activeSession);
    const hardestTypeColor = CLIMB_TYPES.find(t => t.id === hardest?.type)?.color ?? colors.accent;

    const climbMedia: { uri: string; type: 'photo' | 'video'; fromClimb: true; climbId: string }[] = [];
    for (const c of activeSession.climbs) {
      if (c.mediaUris && c.mediaUris.length > 0) {
        c.mediaUris.forEach((uri, i) => climbMedia.push({ uri, type: c.mediaTypes?.[i] ?? 'photo', fromClimb: true, climbId: c.id }));
      } else if (c.mediaUri) {
        climbMedia.push({ uri: c.mediaUri, type: c.mediaType ?? 'photo', fromClimb: true, climbId: c.id });
      }
    }
    const allActiveMedia = [
      ...activeMediaItems.map((m, i) => ({ ...m, fromClimb: false as const, sessionIndex: i })),
      ...climbMedia,
    ];

    return (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.accent, borderWidth: 2, gap: SPACING.md, marginBottom: SPACING.md }]}>
        {/* Active badge */}
        <View style={styles.activeBadgeRow}>
          <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.detailDay, { color: colors.accent }]}>ACTIVE SESSION</Text>
        </View>

        {/* Editable title */}
        {activeEditingTitle ? (
          <TextInput
            style={[styles.detailTitle, styles.detailTitleInput, { color: colors.textPrimary, borderColor: colors.border }]}
            defaultValue={activeTitle || sessionTimeOfDay(activeSession)}
            onChangeText={t => { activeTitleInputValue.current = t; }}
            onEndEditing={e => {
              const t = e.nativeEvent.text.trim();
              setActiveTitle(t);
              setActiveEditingTitle(false);
              handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, activeLocation, activeMediaItems, t);
            }}
            onSubmitEditing={e => {
              const t = e.nativeEvent.text.trim();
              setActiveTitle(t);
              setActiveEditingTitle(false);
              handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, activeLocation, activeMediaItems, t);
            }}
            placeholder={sessionTimeOfDay(activeSession)}
            placeholderTextColor={colors.textMuted}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity
            style={styles.detailTitleRow}
            onPress={() => { activeTitleInputValue.current = activeTitle; setActiveEditingTitle(true); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.detailTitle, { color: colors.textPrimary, flex: 1 }]}>
              {activeTitle.trim() || sessionTimeOfDay(activeSession)}
            </Text>
            <Ionicons name="pencil-outline" size={16} color={colors.textMuted} style={{ marginLeft: 6, marginTop: 3 }} />
          </TouchableOpacity>
        )}

        {/* Stats row */}
        <View style={[styles.detailStatsRow, { borderTopColor: colors.border }]}>
          {projecting ? (
            <Text style={[styles.todayStatLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
          ) : (
            <>
              <View style={styles.todayStat}>
                <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{gradedCount}</Text>
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

        {/* Climbs */}
        {activeSession.climbs.length === 0 ? (
          <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
        ) : (
          activeSession.climbs.map(c => (
            <SwipeToDelete
              key={c.id}
              onSwipeStart={() => setListScrollEnabled(false)}
              onSwipeEnd={() => setListScrollEnabled(true)}
              onDelete={async () => { await deleteClimb(c.id); triggerStatsRefresh(); load(); }}
              rightAction={c.outcome === 'attempt' ? {
                label: 'Send',
                color: colors.accentGreen,
                onPress: async () => {
                  await saveClimb({ ...c, outcome: 'send', attempts: (c.attempts ?? 1) + 1 });
                  triggerStatsRefresh();
                  load();
                },
              } : undefined}
            >
              <ClimbCard
                climb={c}
                compact
                onPress={() => { setEditingClimb(c); setLogModalVisible(true); }}
                onIncrementAttempts={async () => {
                  await saveClimb({ ...c, attempts: (c.attempts ?? 1) + 1 });
                  load();
                }}
              />
            </SwipeToDelete>
          ))
        )}

        {/* Notes */}
        <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <View style={styles.metaLabelRow}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>NOTES</Text>
            {activeEditingNotes ? (
              <TouchableOpacity
                onPress={() => {
                  const t = activeNotesInputValue.current;
                  setActiveNotes(t);
                  setActiveEditingNotes(false);
                  handleSaveActiveSessionMeta(activeSession.sessionId, t, activeFriends, activeLocation, activeMediaItems);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.metaAction, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Done</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => { activeNotesInputValue.current = activeNotes; setActiveEditingNotes(true); }} activeOpacity={0.7}>
                <Text style={[styles.metaAction, { color: colors.accent }]}>
                  {activeNotes.trim() ? 'Edit Activity Note' : 'Add Activity Note'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {activeEditingNotes ? (
            <TextInput
              key={activeSession.sessionId}
              style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.border }]}
              defaultValue={activeNotes}
              onChangeText={(t) => { activeNotesInputValue.current = t; }}
              onEndEditing={(e) => {
                const t = e.nativeEvent.text;
                setActiveNotes(t);
                setActiveEditingNotes(false);
                handleSaveActiveSessionMeta(activeSession.sessionId, t, activeFriends, activeLocation, activeMediaItems);
              }}
              placeholder="Add session notes…"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus
            />
          ) : activeNotes.trim() ? (
            <Text style={[styles.notesText, { color: colors.textSecondary }]}>{activeNotes}</Text>
          ) : null}
        </View>

        {/* Location */}
        <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
          <View style={{ marginBottom: -SPACING.md }}>
            <LocationPicker
              value={activeLocation}
              onChange={(loc) => {
                setActiveLocation(loc);
                handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, loc, activeMediaItems);
              }}
            />
          </View>
        </View>

        {/* Climbing With */}
        <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
          <SessionFriendPicker
            initialFriends={activeFriends}
            onSave={(names) => {
              setActiveFriends(names);
              handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, names, activeLocation, activeMediaItems);
            }}
          />
        </View>

        {/* Media */}
        <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>MEDIA</Text>
          {allActiveMedia.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
              {allActiveMedia.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => { setViewerUris(allActiveMedia.map(m => m.uri)); setViewerIndex(idx); setViewerVisible(true); }}
                  onLongPress={() => item.fromClimb ? handleRemoveClimbMediaItem(item.climbId, item.uri) : handleRemoveActiveSessionMediaItem(item.sessionIndex, activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
                  activeOpacity={0.9}
                  delayLongPress={400}
                  style={{ marginRight: SPACING.sm }}
                >
                  <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.mediaThumbnail, styles.mediaAddTile, { borderColor: colors.border, backgroundColor: colors.bg }]}
                onPress={() => handlePickActiveSessionMedia(activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 30, color: colors.textMuted }}>+</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <TouchableOpacity
              style={[styles.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
              onPress={() => handlePickActiveSessionMedia(activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
              activeOpacity={0.7}
            >
              <Text style={[styles.mediaBtnText, { color: colors.textSecondary }]}>+ Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <View style={styles.detailActions}>
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
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.logClimbBtnText}>End Session</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => setShareDay(activeSession)}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => setChangeDateSession(activeSession)}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Edit Date</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Session Edit Modal ────────────────────────────────────────────────────────

  function SessionEditModalContent({ day }: { day: DaySession }) {
    const { sends, hardest, projecting, gradedCount } = sessionStats(day);
    const label = formatSessionLabel(day);
    const hardestTypeColor = CLIMB_TYPES.find(t => t.id === hardest?.type)?.color ?? colors.accent;
    const displayClimbs = mergeClimbs(day.climbs);

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.detailContainer, { backgroundColor: colors.bg }]}>
        <View style={[styles.detailTopBar, { borderBottomColor: colors.border, justifyContent: 'flex-end' }]}>
          <TouchableOpacity onPress={() => { setEditModalVisible(false); setSelectedDay(null); }} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backBtnText, { color: colors.accent }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.detailContent}
          keyboardShouldPersistTaps="never"
        >
          {/* Session header */}
          <View style={[styles.detailHeader, { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.detailHeaderTop}>
              <Text style={[styles.detailDay, { color: colors.textMuted }]}>{label.top} · {label.bottom}</Text>
            </View>

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

            <View style={[styles.detailStatsRow, { borderTopColor: colors.border }]}>
              {projecting ? (
                <Text style={[styles.todayStatLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
              ) : (
                <>
                  <View style={styles.todayStat}>
                    <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{gradedCount}</Text>
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
            <View style={{ marginBottom: -SPACING.md }}>
              <LocationPicker
                value={sessionLocation}
                onChange={(loc) => {
                  setSessionLocation(loc);
                  handleSaveSessionMeta(sessionNotes, sessionFriends, loc, sessionMediaItems);
                }}
              />
            </View>
          </View>

          {/* Climbing With */}
          <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
            <SessionFriendPicker
              initialFriends={sessionFriends}
              onSave={(names) => {
                setSessionFriends(names);
                setSelectedDay(prev => prev ? { ...prev, friends: names } : null);
                handleSaveSessionMeta(sessionNotes, names, sessionLocation, sessionMediaItems);
              }}
            />
          </View>

          {/* Media */}
          <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>MEDIA</Text>
            {allMedia.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
                {allMedia.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => { setViewerUris(allMedia.map(m => m.uri)); setViewerIndex(idx); setViewerVisible(true); }}
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

          {/* Climbs */}
          {displayClimbs.length === 0 ? (
            <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
          ) : (
            displayClimbs.map(c => (
              <SwipeToDelete
                key={c.id}
                onDelete={async () => { await deleteClimb(c.id); triggerStatsRefresh(); load(); }}
              >
                <ClimbCard
                  climb={c}
                  compact
                  onPress={() => setDetailClimb(c)}
                />
              </SwipeToDelete>
            ))
          )}
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, marginTop: SPACING.sm }]}
            onPress={() => openLogModal(day.sessionId)}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>+ Add Climb</Text>
          </TouchableOpacity>

          {/* Actions */}
          <View style={styles.detailActions}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border, flex: 1 }]}
              onPress={() => setChangeDateSession(day)}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Edit Date</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.danger }]}
              onPress={() => handleDeleteSession(day)}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.danger }]}>Delete Session</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const photoViewerModal = (
    <Modal
      visible={viewerVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setViewerVisible(false)}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
        <TouchableOpacity
          onPress={() => setViewerVisible(false)}
          style={{ position: 'absolute', top: 54, right: 20, zIndex: 10, padding: 6 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={26} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        {viewerUris.length > 1 && (
          <View style={{ position: 'absolute', top: 58, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium }}>
              {viewerIndex + 1} / {viewerUris.length}
            </Text>
          </View>
        )}
        <ScrollView
          ref={viewerScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setViewerIndex(idx);
          }}
          style={{ flex: 1 }}
        >
          {viewerUris.map((uri, i) => (
            <View key={i} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri }} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 }} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
        {viewerUris.length > 1 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', paddingBottom: 48, gap: 6 }}>
            {viewerUris.map((_, i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === viewerIndex ? 'white' : 'rgba(255,255,255,0.35)' }} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>

      <View style={{ flex: 1 }}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.addSessionBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
            onPress={handleNewSession}
          >
            <Text style={[styles.addSessionTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>+ Session</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleToggleCondensed}
            style={[styles.condenseToggleBtn, { borderColor: colors.borderLight }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={sessionsCondensed ? 'expand-outline' : 'contract-outline'} size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCalendarVisible(true)} style={[styles.calTextBtn, { borderColor: colors.borderLight }]}>
            <Text style={[styles.calTxt, { color: colors.textPrimary, fontFamily: FONTS.family.medium }]}>Calendar</Text>
          </TouchableOpacity>
        </View>

        <ScrollView ref={sessionsScrollRef} contentContainerStyle={styles.list} scrollEnabled={listScrollEnabled}>
          <ActiveSessionCard />
          {listDays.length === 0 && !activeSession && (
            <EmptyState icon="" title="No sessions yet" subtitle="Press + to log your first climb" />
          )}
          {listDays.map(day => (
            <View key={day.sessionId} onLayout={(e) => { sessionCardOffsets.current[day.sessionId] = e.nativeEvent.layout.y; }}>
              <SessionCard
                day={day}
                colors={colors}
                currentUserId={user?.id}
                myAvatar={localAvatarUri ?? avatarUrl}
                onEdit={() => { setSelectedDay(day); setEditModalVisible(true); }}
                onShare={() => setShareDay(day)}
                onOpenClimb={(climb) => setDetailClimb(climb)}
                onDeleteClimb={async (climbId) => { await deleteClimb(climbId); triggerStatsRefresh(); load(); }}
                onViewProfile={viewFriendProfile}
                onSwipeStart={() => setListScrollEnabled(false)}
                onSwipeEnd={() => setListScrollEnabled(true)}
                condensed={sessionsCondensed}
              />
            </View>
          ))}
        </ScrollView>

        <MiniCalendar
          visible={calendarVisible}
          onClose={() => setCalendarVisible(false)}
          activeDates={activeDates}
          onSelectDate={handleCalendarSelect}
          selectedDate={selectedCalDate}
          mode="view"
        />
      </View>

      {/* Shared modals — used by both list and detail contexts */}
      {photoViewerModal}
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
      <ShareModal
        visible={!!shareDay}
        data={shareDay ? {
          date: shareDay.date,
          climbs: shareDay.climbs,
          location: shareDay.location,
          title: shareDay.title,
          climbingWith: shareDay.friends?.map((f: any) => f?.name ?? f),
        } : null}
        accentColor={colors.accent}
        onDismiss={() => setShareDay(null)}
      />
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setEditModalVisible(false); setSelectedDay(null); }}
      >
        {selectedDay && <SessionEditModalContent day={selectedDay} />}
      </Modal>

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
  condenseToggleBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  calTextBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  calTxt: { fontSize: FONTS.sizes.sm },
  list: { padding: SPACING.xl },

  activeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  activeDot: { width: 7, height: 7, borderRadius: 4 },

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
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBtnText: {
    fontSize: FONTS.sizes.sm,
  },

  commentShowMore: { fontSize: FONTS.sizes.sm, marginTop: SPACING.xs },
  viewCommentInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  viewCommentInputText: { flex: 1, fontSize: FONTS.sizes.sm, maxHeight: 80 },

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
