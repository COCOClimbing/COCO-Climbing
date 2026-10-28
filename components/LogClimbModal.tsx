import React, { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import {
  View, Text, StyleSheet, ScrollView, Modal,
  TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  FONTS, SPACING, CLIMB_TYPES, CLIMB_OUTCOMES,
  CLIMB_STYLES, ENVIRONMENTS, HOLD_COLORS,
  Climb, ClimbTypeId, OutcomeId, StyleId, EnvironmentId, HoldColorId
} from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import {
  saveClimb, createNewSession, generateId, getTodayISO,
  saveLastClimbType, getLastClimbType, getAllNamedProjects, getAllClimbs, saveNamedProject,
  saveLastGradeSystem, getLastGradeSystem, saveLastGrade, getLastGrade, setActiveSessionId, getAllSessions, saveSession,
  saveLastOutcome, getLastOutcome,
  saveLastEnvironment, getLastEnvironment,
} from '../utils/storage';
import { Image as CompressorImage } from 'react-native-compressor';
import { supabase } from '../utils/supabase';
import { useAuth } from '../utils/AuthContext';
import { Pill, Divider, HoldColorDot } from './UI';
import GradePicker, { GradeSystem } from './GradePicker';
import FriendPicker from './FriendPicker';
import LocationPicker from './LocationPicker';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  existingClimb?: Climb;
  defaultSessionId?: string;
  sessionDate?: string;
  editProjectMode?: boolean; // hides environment + project picker, shows project name as title
}

// Persists last-used outcome across modal opens within an app session
let _lastUsedOutcome: OutcomeId = 'send';

// One section of the form (label + its controls) in a rounded box that's
// invisible until you tap something inside it, then highlighted so you can see
// what you're editing. Only taps count; a drag (scrolling) doesn't.
function Section({ id, active, onActivate, activateOnTouch = false, onLayout, children }: {
  id: string; active: boolean; onActivate: (id: string) => void;
  onLayout?: (e: any) => void;
  // Light up as soon as a finger touches it (for the grade wheel, which you drag)
  activateOnTouch?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const startY = useRef(0);
  return (
    <View
      onLayout={onLayout}
      onTouchStart={e => { startY.current = e.nativeEvent.pageY; if (activateOnTouch) onActivate(id); }}
      onTouchEnd={e => { if (Math.abs(e.nativeEvent.pageY - startY.current) < 10) onActivate(id); }}
      style={[styles.section, active && { borderColor: colors.accent, backgroundColor: colors.accent + '0F' }]}
    >
      {children}
    </View>
  );
}

export default function LogClimbModal({ visible, onClose, onSaved, existingClimb, defaultSessionId, sessionDate, editProjectMode }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Notes box position: its spot inside the Details section plus that
  // section's spot in the form, so focusing Notes scrolls to the right place.
  const notesYRef = useRef(0);
  const detailsYRef = useRef(0);

  // Form state
  const [environment, setEnvironment]       = useState<EnvironmentId>('indoor');
  const [isProject, setIsProject]           = useState(false);
  const [climbType, setClimbType]           = useState<ClimbTypeId>('boulder');
  // Environment and Type usually stay the same between climbs, so once you've
  // logged before they start folded to just the current pick; tap one to
  // open that picker on its own.
  const [envOpen, setEnvOpen]               = useState(true);
  const [typeOpen, setTypeOpen]             = useState(true);
  // Section the user last tapped into; its box is highlighted.
  const [activeSection, setActiveSection]   = useState<string | null>(null);
  const [outcome, setOutcome]               = useState<OutcomeId>(_lastUsedOutcome);
  const [selectedStyles, setSelectedStyles] = useState<StyleId[]>([]);
  const [gradeSystem, setGradeSystem]       = useState<GradeSystem>('v-scale');
  const [grade, setGrade]                   = useState('V3');
  const [routeName, setRouteName]           = useState('');
  const [location, setLocation]             = useState('');
  const [notes, setNotes]                   = useState('');
  const [attempts, setAttempts]             = useState('1');
  const [showGradePicker, setShowGradePicker] = useState(false);
  const [routine, setRoutine]               = useState('');
  const [holdColor, setHoldColor]           = useState<HoldColorId | undefined>();
  const [mediaItems, setMediaItems]         = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);

  // Friends state
  const [friends, setFriends] = useState<{ id: string; name: string }[]>([]);

  // Location and friends live on the session: only ask for them on the session's
  // first climb (if not already set). After that they're edited from the session.
  const [askLocation, setAskLocation]       = useState(true);
  const [askFriends, setAskFriends]         = useState(true);

  // Project state
  const [selectedProjectId, setSelectedProjectId]   = useState<string | undefined>();
  const [newProjectName, setNewProjectName]         = useState('');
  const [existingProjects, setExistingProjects]     = useState<{id: string, name: string, grade: string, type: string}[]>([]);

  // Load named projects
  useEffect(() => {
    if (visible) {
      getAllNamedProjects().then(projects => {
        setExistingProjects(projects.map(p => ({ id: p.id, name: p.name, grade: p.grade, type: p.type })));
      });
      // Load friends + location from the session
      if (defaultSessionId) {
        Promise.all([getAllSessions(), getAllClimbs()]).then(([sessions, allClimbs]) => {
          const session = sessions.find(s => s.id === defaultSessionId);
          // Only the session's first climb asks; after that they're edited
          // from the session screen, filled in or not.
          const firstClimb = !allClimbs.some(c => c.sessionId === defaultSessionId);
          const raw = session?.friends ?? [];
          // Normalize legacy string[] format
          const normalized = raw.map((f: any) =>
            typeof f === 'string' ? { id: f, name: f } : f
          );
          setFriends(normalized);
          setAskLocation(!existingClimb && firstClimb && !session?.location);
          setAskFriends(!existingClimb && firstClimb && normalized.length === 0);
        });
      } else {
        setFriends([]);
        setAskLocation(!existingClimb);
        setAskFriends(!existingClimb);
      }
    }
  }, [visible, defaultSessionId, existingClimb]);

  async function restoreLastGrade(type: ClimbTypeId) {
    if (type === 'boulder') {
      const sys = await getLastGradeSystem('boulder');
      const resolved = sys && ['v-scale', 'font', 'custom'].includes(sys) ? sys : 'v-scale';
      setGradeSystem(resolved as GradeSystem);
      setGrade((await getLastGrade(type)) ?? (resolved === 'font' ? '6a' : resolved === 'custom' ? '' : 'V3'));
    } else if (type !== 'hangboard' && type !== 'lift') {
      const sys = await getLastGradeSystem(type);
      const resolved = sys && ['yds', 'french', 'british', 'custom'].includes(sys) ? sys : 'yds';
      setGradeSystem(resolved as GradeSystem);
      setGrade((await getLastGrade(type)) ?? (resolved === 'yds' ? '5.10a' : resolved === 'french' ? '6a' : resolved === 'custom' ? '' : 'VS'));
    }
  }

  // Fold Environment + Type once they've been chosen for this session: when
  // editing a climb, or when the session already has a climb logged. The
  // first climb of a session (including a brand-new one) shows both pickers.
  useEffect(() => {
    if (!visible) return;
    // Start the highlight where you'd go first: Environment on a session's
    // first climb (pickers open), Grade once they're folded.
    const fold = (open: boolean) => {
      setEnvOpen(open); setTypeOpen(open);
      setActiveSection(open ? 'env' : 'grade');
    };
    if (existingClimb) { fold(false); return; }
    fold(true);
    if (!defaultSessionId) return;
    let cancelled = false;
    getAllClimbs().then(all => {
      if (!cancelled && all.some(c => c.sessionId === defaultSessionId)) fold(false);
    });
    return () => { cancelled = true; };
  }, [visible, existingClimb, defaultSessionId]);

  // Load last climb type, grade system, grade, and outcome for new climbs
  useEffect(() => {
    if (!existingClimb && visible) {
      getLastOutcome().then(last => {
        if (last) { _lastUsedOutcome = last as OutcomeId; setOutcome(last as OutcomeId); }
      });
      getLastEnvironment().then(last => {
        if (last) setEnvironment(last as EnvironmentId);
      });
      getLastClimbType().then(async last => {
        const type = (last as ClimbTypeId) || 'boulder';
        setClimbType(type);
        await restoreLastGrade(type);
      });
    }
  }, [visible, existingClimb]);

  // When climb type changes, restore last used grade system and grade for that type
  useEffect(() => {
    if (existingClimb) return;
    restoreLastGrade(climbType);
  }, [climbType]);

  // Custom grades aren't offered for projects (project records only store grade text
  // and re-infer the system from it), so drop back to a standard grade if Project is picked.
  useEffect(() => {
    if (isProject && gradeSystem === 'custom') {
      const boulder = climbType === 'boulder';
      setGradeSystem(boulder ? 'v-scale' : 'yds');
      setGrade(boulder ? 'V3' : '5.10a');
    }
  }, [isProject, gradeSystem]);

  // Load existing climb data
  useEffect(() => {
    if (existingClimb) {
      setEnvironment(existingClimb.environment);
      setIsProject(existingClimb.outcome === 'project' || !!existingClimb.projectId);
      setClimbType(existingClimb.type);
      setOutcome(existingClimb.outcome === 'project' ? 'attempt' : existingClimb.outcome);
      setSelectedStyles(existingClimb.styles);
      setHoldColor(existingClimb.holdColor);
      setGradeSystem(existingClimb.gradeSystem);
      setGrade(existingClimb.grade);
      setRouteName(existingClimb.routeName || '');
      setLocation(existingClimb.location || '');
      setNotes(existingClimb.notes || '');
      setRoutine(existingClimb.routine || '');
      setAttempts(String(existingClimb.attempts || 1));
      setSelectedProjectId(existingClimb.projectId);
      setNewProjectName(existingClimb.projectName && !existingClimb.projectId ? existingClimb.projectName : '');
      // Load existing media — prefer the new array, fall back to legacy single field
      if (existingClimb.mediaUris && existingClimb.mediaUris.length > 0) {
        setMediaItems(existingClimb.mediaUris.map((uri, i) => ({ uri, type: existingClimb.mediaTypes?.[i] ?? 'photo' })));
      } else if (existingClimb.mediaUri) {
        setMediaItems([{ uri: existingClimb.mediaUri, type: existingClimb.mediaType ?? 'photo' }]);
      } else {
        setMediaItems([]);
      }
    } else {
      resetForm();
    }
  }, [existingClimb, visible]);



  function resetForm() {
    setEnvironment('indoor');
    setIsProject(false);
    setClimbType('boulder');
    setOutcome(_lastUsedOutcome);
    setSelectedStyles([]);
    setHoldColor(undefined);
    setGradeSystem('v-scale');
    setGrade('V3');
    setRouteName('');
    setLocation('');
    setNotes('');
    setAttempts('1');
    setRoutine('');
    setSelectedProjectId(undefined);
    setNewProjectName('');
    setMediaItems([]);
    setShowGradePicker(false);
    setFriends([]);
  }

  function toggleStyle(styleId: StyleId) {
    setSelectedStyles(prev => prev.includes(styleId) ? prev.filter(s => s !== styleId) : [...prev, styleId]);
  }

  // When picking an existing project, auto-populate grade, type, etc.
  function selectExistingProject(p: {id: string, name: string, grade: string, type: string}) {
    setSelectedProjectId(p.id);
    setNewProjectName('');
    setGrade(p.grade);
    // Set grade system based on grade
    if (p.grade.startsWith('V') || p.grade === 'VB') {
      setGradeSystem('v-scale');
    } else {
      setGradeSystem('yds');
    }
    if (p.type) setClimbType(p.type as ClimbTypeId);
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to your photo library in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      setMediaItems(prev => [...prev, ...result.assets.map(a => ({ uri: a.uri, type: 'photo' as const }))]);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaItems(prev => [...prev, { uri: result.assets[0].uri, type: 'photo' as const }]);
    }
  }

  function showMediaOptions() {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Take Photo',    onPress: () => takePhoto() },
      { text: 'Photo Library', onPress: () => pickPhoto() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const isTraining = climbType === 'hangboard' || climbType === 'lift';

  async function uploadMedia(localUri: string, climbId: string): Promise<string> {
    const path = `${user!.id}/${climbId}.jpg`;
    const { data: { session } } = await supabase.auth.getSession();

    const uploadUri = await CompressorImage.compress(localUri, { quality: 0.6, maxWidth: 1080, maxHeight: 1080 });

    const formData = new FormData();
    formData.append('file', { uri: uploadUri, name: 'climb.jpg', type: 'image/jpeg' } as any);
    const res = await fetch(
      `https://coco-media.jacksonwalti.workers.dev/upload?path=${encodeURIComponent(path)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` }, body: formData }
    );
    if (!res.ok) throw new Error('Media upload failed');
    const { url } = await res.json();
    return url as string;
  }

  async function handleSave() {
    if (!isTraining && gradeSystem === 'custom' && !grade.trim()) {
      Alert.alert('Enter a grade', 'Type the grade your gym uses, or pick another grade system.');
      return;
    }
    setSaving(true);
    try {
      // In editProjectMode, only update the project registry + linked climbs — no session touch
      if (editProjectMode && existingClimb?.projectId) {
        const namedProjects = await getAllNamedProjects();
        const np = namedProjects.find(p => p.id === existingClimb.projectId);
        if (np) {
          await saveNamedProject({ ...np, grade, type: climbType, styles: selectedStyles });
        }
        const all = await getAllClimbs();
        const gs = (grade.startsWith('V') || grade === 'VB' ? 'v-scale' : 'yds') as any;
        // One at a time: saveClimb rewrites the whole list, so parallel saves clobber each other
        for (const c of all.filter(c => c.projectId === existingClimb.projectId)) {
          await saveClimb({ ...c, grade, gradeSystem: gs, type: climbType, styles: selectedStyles });
        }
        onSaved();
        onClose();
        resetForm();
        return;
      }

      let sessionId = defaultSessionId || existingClimb?.sessionId;
      if (!sessionId) {
        // No session supplied — create a fresh one and mark it active
        sessionId = await createNewSession(environment, location || undefined);
        setActiveSessionId(sessionId);
      }

      // Determine final outcome
      let finalOutcome: OutcomeId = outcome;
      _lastUsedOutcome = finalOutcome;

      // Handle project name
      let projId = selectedProjectId;
      let projName = selectedProjectId
        ? existingProjects.find(p => p.id === selectedProjectId)?.name
        : newProjectName.trim() || undefined;

      if (isProject && newProjectName.trim() && !selectedProjectId) {
        projId = generateId();
        await saveNamedProject({
          id: projId,
          name: newProjectName.trim(),
          grade,
          type: climbType,
          createdAt: new Date().toISOString(),
        });
      }

      await saveLastClimbType(climbType);
      await saveLastOutcome(finalOutcome);
      await saveLastEnvironment(environment);
      if (!isTraining) {
        await saveLastGradeSystem(climbType, gradeSystem);
        await saveLastGrade(climbType, grade.trim());
      }

      const climbId = existingClimb?.id || generateId();

      // Upload media items to Supabase — new local files only
      const finalMediaUris: string[] = [];
      const finalMediaTypes: ('photo' | 'video')[] = [];
      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        if (user && !item.uri.startsWith('http')) {
          try {
            const url = await uploadMedia(item.uri, `${climbId}_${i}`);
            finalMediaUris.push(url);
            finalMediaTypes.push(item.type);
          } catch {
            // Upload failed — save local URI so media is never lost
            finalMediaUris.push(item.uri);
            finalMediaTypes.push(item.type);
          }
        } else {
          finalMediaUris.push(item.uri);
          finalMediaTypes.push(item.type);
        }
      }

      const climb: Climb = {
        id: climbId,
        date: existingClimb?.date || new Date().toISOString(),
        sessionId,
        type: climbType,
        outcome: finalOutcome,
        styles: selectedStyles,
        environment,
        grade: isTraining ? '' : grade.trim(),
        gradeSystem: isTraining ? 'v-scale' : gradeSystem,
        routeName: routeName || undefined,
        // Location is stored on the session, not the climb. Editing an older climb
        // that still carries its own location leaves it untouched.
        location: existingClimb?.location,
        notes: notes || undefined,
        routine: isTraining && routine.trim() ? routine.trim() : undefined,
        attempts: parseInt(attempts) || 1,
        mediaUris: finalMediaUris.length > 0 ? finalMediaUris : undefined,
        mediaTypes: finalMediaTypes.length > 0 ? finalMediaTypes : undefined,
        mediaUri: finalMediaUris[0] || undefined,
        mediaType: finalMediaTypes[0] || undefined,
        projectId: isProject ? projId : undefined,
        projectName: isProject ? projName : undefined,
        // Hold color only applies to indoor, non-training climbs — this also drops
        // a color picked earlier and then hidden by switching to outdoor/training.
        holdColor: environment === 'indoor' && !isTraining ? holdColor : undefined,
      };

      await saveClimb(climb);

      // Persist newly picked friends / location to the session
      const setFriendsOnSession = askFriends && friends.length > 0;
      const setLocationOnSession = askLocation && !!location;
      if (setFriendsOnSession || setLocationOnSession) {
        const sessions = await getAllSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
          await saveSession({
            ...session,
            ...(setFriendsOnSession ? { friends } : {}),
            ...(setLocationOnSession ? { location } : {}),
          });
        }
      }

      onSaved();
      onClose();
      resetForm();
    } catch (e) {
      Alert.alert('Error', 'Could not save climb. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            {/* Round back (cancel) and check (save) buttons, like the app's other round buttons */}
            <TouchableOpacity onPress={onClose} style={[styles.roundBtn, { backgroundColor: colors.bgCard }]} activeOpacity={0.7} accessibilityLabel="Cancel">
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>
                {editProjectMode
                  ? (existingClimb?.projectName || existingClimb?.routeName || 'Edit Project')
                  : existingClimb ? 'Edit Climb' : 'Log Climb'}
              </Text>
              {editProjectMode && (
                <Text style={{ color: colors.textMuted, fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 }}>
                  Edit grade, type, or style
                </Text>
              )}
              {sessionDate && !existingClimb && !editProjectMode && (
                <Text style={{ color: colors.accent, fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium, marginTop: 2 }}>
                  {sessionDate}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={handleSave} style={[styles.roundBtn, { backgroundColor: colors.accent }, saving && { opacity: 0.6 }]} disabled={saving} activeOpacity={0.7} accessibilityLabel="Save">
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  // Same path as Ionicons' checkmark, but at the back arrow's
                  // line weight (48) so the two buttons match
                  <Svg width={24} height={24} viewBox="0 0 512 512">
                    <Path d="M416 128L192 384l-96-96" fill="none" stroke="#fff" strokeWidth={48} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
            </TouchableOpacity>
          </View>

          <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* Folded Environment / Type: just the current pick; tapping a pill
                opens that picker. While both are folded they share one row. */}
            {!editProjectMode && (() => {
              const typeInfo = CLIMB_TYPES.find(t => t.id === climbType);
              const typeHidden = isProject && !!selectedProjectId;
              const envLabel = ENVIRONMENTS.find(e => e.id === environment)?.label ?? 'Indoor';
              const foldedPill = (label: string, color: string, onPress: () => void, key: string) => (
                <TouchableOpacity key={key} onPress={onPress} activeOpacity={0.7}
                  style={[styles.pill, styles.summaryPill, { borderColor: color, backgroundColor: color + '25' }]}>
                  <View style={styles.summaryPillInner}>
                    <Text style={[styles.pillText, { color, fontFamily: FONTS.family.medium }]}>{label}</Text>
                    <Ionicons name="chevron-down" size={13} color={color} />
                  </View>
                </TouchableOpacity>
              );
              const envPills = [
                foldedPill(envLabel, colors.accent, () => setEnvOpen(true), 'env'),
                ...(isProject ? [foldedPill('Project', colors.accent, () => setEnvOpen(true), 'proj')] : []),
              ];
              const typePill = !typeHidden && typeInfo
                ? foldedPill(typeInfo.label, typeInfo.color, () => setTypeOpen(true), 'type')
                : null;
              const showEnvFold = !envOpen;
              // Type joins this row only while Environment is folded too;
              // otherwise it folds in its own spot below.
              const showTypeHere = !envOpen && !typeOpen && !!typePill;
              if (!showEnvFold) return null;
              return (
                <>
                  <Section id="env" active={activeSection === 'env'} onActivate={setActiveSection}>
                  <View style={styles.setupSummaryPills}>
                    {envPills}
                    {showTypeHere && typePill}
                  </View>
                  </Section>
                  <Divider />
                </>
              );
            })()}

            {/* Environment + Project — hidden in editProjectMode */}
            {!editProjectMode && envOpen && (
              <>
                <Section id="env" active={activeSection === 'env'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>ENVIRONMENT</Text>
                <View style={styles.row}>
                  {ENVIRONMENTS.map(env => (
                    <Pill key={env.id} label={env.label} selected={environment === env.id && !isProject}
                      onPress={() => { setEnvironment(env.id); setIsProject(false); }} />
                  ))}
                  <Pill
                    label="Project"
                    selected={isProject}
                    color={colors.accent}
                    onPress={() => {
                      const next = !isProject;
                      setIsProject(next);
                      if (next && (outcome === 'send' || outcome === 'flash')) setOutcome('attempt');
                    }}
                  />
                </View>
                </Section>
                <Divider />
              </>
            )}

            {/* Project picker — shown when Project is toggled on (not in editProjectMode) */}
            {!editProjectMode && isProject && (
              <>
                <Section id="project" active={activeSection === 'project'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>PROJECT</Text>
                {existingProjects.length > 0 && (
                  <View style={styles.row}>
                    {existingProjects.map(p => (
                      <Pill
                        key={p.id}
                        label={`${p.name} (${p.grade})`}
                        selected={selectedProjectId === p.id}
                        onPress={() => selectExistingProject(p)}
                        color={colors.accentGold}
                        small
                      />
                    ))}
                  </View>
                )}
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgCard, borderColor: selectedProjectId ? colors.border : colors.accent, color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
                  placeholder="+ New project name..."
                  placeholderTextColor={colors.textMuted}
                  value={newProjectName}
                  onChangeText={t => { setNewProjectName(t); setSelectedProjectId(undefined); }}
                />
                </Section>
                <Divider />
              </>
            )}

            {/* Type + Grade — hidden when an existing project is selected */}
            {!(isProject && !!selectedProjectId) && (
              <>
                {!typeOpen && envOpen && !editProjectMode && (() => {
                  const typeInfo = CLIMB_TYPES.find(t => t.id === climbType);
                  if (!typeInfo) return null;
                  return (
                    <>
                      <Section id="type" active={activeSection === 'type'} onActivate={setActiveSection}>
                      <View style={styles.setupSummaryPills}>
                        <TouchableOpacity onPress={() => setTypeOpen(true)} activeOpacity={0.7}
                          style={[styles.pill, styles.summaryPill, { borderColor: typeInfo.color, backgroundColor: typeInfo.color + '25' }]}>
                          <View style={styles.summaryPillInner}>
                            <Text style={[styles.pillText, { color: typeInfo.color, fontFamily: FONTS.family.medium }]}>{typeInfo.label}</Text>
                            <Ionicons name="chevron-down" size={13} color={typeInfo.color} />
                          </View>
                        </TouchableOpacity>
                      </View>
                      </Section>
                      <Divider />
                    </>
                  );
                })()}
                {(typeOpen || editProjectMode) && (
                <>
                <Section id="type" active={activeSection === 'type'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>TYPE</Text>
                <View style={styles.row}>
                  {CLIMB_TYPES.map(ct => (
                    <TouchableOpacity
                      key={ct.id}
                      onPress={() => {
                        setClimbType(ct.id);
                        if (!['top_rope', 'sport', 'trad'].includes(ct.id) && outcome === 'hang') {
                          setOutcome('send');
                        }
                      }}
                      activeOpacity={0.7}
                      style={[
                        styles.pill,
                        { borderColor: ct.id === climbType ? ct.color : colors.border },
                        ct.id === climbType && { backgroundColor: ct.color + '25' },
                      ]}
                    >
                      <Text style={[
                        styles.pillText,
                        { color: ct.id === climbType ? ct.color : colors.textSecondary,
                          fontFamily: FONTS.family.medium },
                      ]}>{ct.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                </Section>
                <Divider />
                </>
                )}

                {!isTraining && (
                  <>
                    <Section id="grade" active={activeSection === 'grade'} onActivate={setActiveSection} activateOnTouch>
                    <Text style={[styles.label, { color: colors.textMuted }]}>GRADE</Text>
                    <GradePicker
                      gradeSystem={gradeSystem}
                      selected={grade}
                      onSystemChange={(sys) => { setGradeSystem(sys); setActiveSection('grade'); }}
                      onChange={(g) => { setGrade(g); setActiveSection('grade'); }}
                      isBoulder={climbType === 'boulder'}
                      allowCustom={!isProject && !editProjectMode}
                    />
                    </Section>
                    <Divider />
                  </>
                )}
              </>
            )}

            {/* Outcome — hidden for training only */}
            {!isTraining && (
              <>
                <Section id="outcome" active={activeSection === 'outcome'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>OUTCOME</Text>
                <View style={styles.row}>
                  {CLIMB_OUTCOMES
                    .filter(o => {
                      if (isProject) return o.id === 'attempt' || (o.id === 'hang' && ['top_rope', 'sport', 'trad'].includes(climbType));
                      return ['top_rope', 'sport', 'trad'].includes(climbType) || o.id !== 'hang';
                    })
                    .map(o => (
                      <Pill key={o.id} label={o.label} selected={outcome === o.id} color={o.color} onPress={() => setOutcome(o.id)} />
                    ))}
                </View>
                {(outcome === 'attempt' || outcome === 'send' || outcome === 'hang') && (
                  <View style={[styles.attemptsRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                    <Text style={[styles.attemptsLabel, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>{outcome === 'hang' ? 'Hangs' : 'Attempts'}</Text>
                    <View style={styles.attemptsStepper}>
                      <TouchableOpacity style={[styles.stepBtn, { backgroundColor: colors.bgElevated }]} onPress={() => setAttempts(String(Math.max(1, parseInt(attempts) - 1)))}>
                        <Text style={[styles.stepBtnText, { color: colors.textPrimary }]}>−</Text>
                      </TouchableOpacity>
                      <Text style={[styles.attemptsValue, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{attempts}</Text>
                      <TouchableOpacity style={[styles.stepBtn, { backgroundColor: colors.bgElevated }]} onPress={() => setAttempts(String(parseInt(attempts) + 1))}>
                        <Text style={[styles.stepBtnText, { color: colors.textPrimary }]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                </Section>
                <Divider />
              </>
            )}

            {/* Style — hidden for training */}
            {!isTraining && (
              <>
                <Section id="style" active={activeSection === 'style'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>STYLE</Text>
                <View style={styles.row}>
                  {CLIMB_STYLES.map(s => (
                    <Pill key={s.id} label={s.label} selected={selectedStyles.includes(s.id)} onPress={() => toggleStyle(s.id)} />
                  ))}
                </View>
                </Section>
                <Divider />
              </>
            )}

            {/* Hold color — indoor, non-training only */}
            {!isTraining && environment === 'indoor' && (
              <>
                <Section id="hold" active={activeSection === 'hold'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>HOLD COLOR</Text>
                <View style={styles.row}>
                  {HOLD_COLORS.map(c => {
                    const selected = holdColor === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setHoldColor(selected ? undefined : c.id)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`${c.label} holds${selected ? ', selected' : ''}`}
                        style={[
                          styles.swatchWrap,
                          { borderColor: selected ? colors.textPrimary : 'transparent' },
                        ]}
                      >
                        <HoldColorDot colorId={c.id} size={32} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                </Section>
                <Divider />
              </>
            )}

            {/* Routine — only for hangboard/lift */}
            {isTraining && (
              <>
                <Section id="routine" active={activeSection === 'routine'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>ROUTINE</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
                  placeholder="Describe your routine, sets, reps, hold types..."
                  placeholderTextColor={colors.textMuted}
                  value={routine}
                  onChangeText={setRoutine}
                  multiline
                  numberOfLines={4}
                />
                {/* Lift/hangboard: notes share the routine's box */}
                {isTraining && (
                  <>
                    <Text style={[styles.label, { color: colors.textMuted, marginTop: SPACING.md }]}>NOTES</Text>
                    <TextInput
                      style={[styles.input, styles.inputMulti, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
                      placeholder="How'd it go?"
                      placeholderTextColor={colors.textMuted}
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                      numberOfLines={3}
                    />
                  </>
                )}
                </Section>
                {!isTraining && <Divider />}
              </>
            )}

            {/* Notes, Location and Climbing with: separate sections in the same
                order as an open session. Location and friends live on the session,
                so they only show on its first climb. Lift/hangboard notes sit in the routine box. */}
            {!isTraining && (
            <Section id="notes" active={activeSection === 'notes'} onActivate={setActiveSection} onLayout={(e) => { detailsYRef.current = e.nativeEvent.layout.y; }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>NOTES</Text>
            <View onLayout={(e) => { notesYRef.current = e.nativeEvent.layout.y; }}>
              <TextInput
                style={[styles.input, styles.inputMulti, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
                placeholder="How'd this climb go?"
                placeholderTextColor={colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                onFocus={() => {
                  setTimeout(() => {
                    scrollRef.current?.scrollTo({ y: detailsYRef.current + notesYRef.current - 16, animated: true });
                  }, 320);
                }}
              />
            </View>
            </Section>
            )}

            {askLocation && (
              <>
                <Divider />
                <Section id="location" active={activeSection === 'location'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>LOCATION</Text>
                {/* The picker brings its own bottom gap; trim it like the session screen does */}
                <View style={{ marginBottom: -SPACING.sm }}>
                  <LocationPicker value={location} onChange={setLocation} onOpenChange={open => { if (open) setActiveSection('location'); }} />
                </View>
                </Section>
              </>
            )}

            {askFriends && (
              <>
                <Divider />
                <Section id="friends" active={activeSection === 'friends'} onActivate={setActiveSection}>
                <Text style={[styles.label, { color: colors.textMuted }]}>CLIMBING WITH</Text>
                <FriendPicker selected={friends} onChange={setFriends} onOpenChange={open => { if (open) setActiveSection('friends'); }} />
                </Section>
              </>
            )}

            {/* Media */}
            <Divider />
            <Section id="media" active={activeSection === 'media'} onActivate={setActiveSection}>
            <Text style={[styles.label, { color: colors.textMuted }]}>MEDIA</Text>
            {mediaItems.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
                {mediaItems.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    onLongPress={() => Alert.alert('Remove Photo', 'Remove this photo?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => setMediaItems(prev => prev.filter((_, i) => i !== index)) },
                    ])}
                    activeOpacity={0.9}
                    delayLongPress={400}
                    style={{ marginRight: SPACING.sm }}
                  >
                    <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.mediaThumbnail, styles.mediaAddTile, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
                  onPress={showMediaOptions}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 30, color: colors.textMuted }}>+</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <TouchableOpacity
                style={[styles.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
                onPress={showMediaOptions}
              >
                <Text style={[styles.mediaBtnText, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>
                  + Add Photo
                </Text>
              </TouchableOpacity>
            )}

            </Section>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1 },
  roundBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  headerTitle: { fontSize: FONTS.sizes.lg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  // Fixed padding/border so highlighting a section doesn't shift anything
  section: {
    marginHorizontal: -SPACING.sm,
    paddingHorizontal: SPACING.sm - 1,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 14,
  },
  label: { fontSize: FONTS.sizes.xs, letterSpacing: 1.5, marginBottom: SPACING.md },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  attemptsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md, borderRadius: 10, borderWidth: 1, padding: SPACING.md },
  attemptsLabel: { fontSize: FONTS.sizes.md },
  attemptsStepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  stepBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, lineHeight: 24 },
  attemptsValue: { fontSize: FONTS.sizes.xl, minWidth: 28, textAlign: 'center' },
  mediaBtn: { borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.md },
  mediaBtnText: { fontSize: FONTS.sizes.md },
  mediaThumbnail: { width: 120, height: 120, borderRadius: 8, backgroundColor: '#222' },
  mediaAddTile: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  swatchWrap: { borderWidth: 3, borderRadius: 24, padding: 2, marginRight: SPACING.xs, marginBottom: SPACING.xs },
  pill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginRight: SPACING.sm, marginBottom: SPACING.sm },
  pillText: { fontSize: FONTS.sizes.sm, letterSpacing: 0.3 },
  setupSummaryPills: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.xs },
  summaryPillInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryPill: { marginBottom: SPACING.sm },
  input: { borderRadius: 10, borderWidth: 1, fontSize: FONTS.sizes.md, padding: SPACING.md, marginBottom: SPACING.md },
  // Starts at 80 and grows as you type more, rather than scrolling inside a fixed box
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
});
