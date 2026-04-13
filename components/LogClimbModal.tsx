import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal,
  TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  FONTS, SPACING, CLIMB_TYPES, CLIMB_OUTCOMES,
  CLIMB_STYLES, ENVIRONMENTS,
  Climb, ClimbTypeId, OutcomeId, StyleId, EnvironmentId
} from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import {
  saveClimb, createNewSession, generateId, getTodayISO,
  saveLastClimbType, getLastClimbType, getAllNamedProjects, getAllClimbs, saveNamedProject,
  saveLastGradeSystem, getLastGradeSystem, setActiveSessionId, getAllSessions, saveSession,
} from '../utils/storage';
import { Pill, Divider } from './UI';
import GradePicker from './GradePicker';
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

export default function LogClimbModal({ visible, onClose, onSaved, existingClimb, defaultSessionId, sessionDate, editProjectMode }: Props) {
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);

  // Form state
  const [environment, setEnvironment]       = useState<EnvironmentId>('indoor');
  const [isProject, setIsProject]           = useState(false);
  const [climbType, setClimbType]           = useState<ClimbTypeId>('boulder');
  const [outcome, setOutcome]               = useState<OutcomeId>('send');
  const [selectedStyles, setSelectedStyles] = useState<StyleId[]>([]);
  const [gradeSystem, setGradeSystem]       = useState<'v-scale' | 'yds' | 'french' | 'british'>('v-scale');
  const [grade, setGrade]                   = useState('V3');
  const [routeName, setRouteName]           = useState('');
  const [location, setLocation]             = useState('');
  const [notes, setNotes]                   = useState('');
  const [attempts, setAttempts]             = useState('1');
  const [showGradePicker, setShowGradePicker] = useState(false);
  const [routine, setRoutine]               = useState('');
  const [mediaUri, setMediaUri]             = useState<string | undefined>();
  const [mediaType, setMediaType]           = useState<'photo' | 'video' | undefined>();

  // Friends state
  const [friends, setFriends] = useState<{ id: string; name: string }[]>([]);

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
      // Load friends from the session
      if (defaultSessionId) {
        getAllSessions().then(sessions => {
          const session = sessions.find(s => s.id === defaultSessionId);
          const raw = session?.friends ?? [];
          // Normalize legacy string[] format
          const normalized = raw.map((f: any) =>
            typeof f === 'string' ? { id: f, name: f } : f
          );
          setFriends(normalized);
        });
      } else {
        setFriends([]);
      }
    }
  }, [visible, defaultSessionId]);

  // Load last climb type and grade system for new climbs
  useEffect(() => {
    if (!existingClimb && visible) {
      getLastClimbType().then(last => {
        const type = (last as ClimbTypeId) || 'boulder';
        setClimbType(type);
        if (type === 'boulder') {
          setGradeSystem('v-scale');
          setGrade('V3');
        } else {
          getLastGradeSystem(type).then(sys => {
            const validRopeSystems = ['yds', 'french', 'british'];
            const resolved = sys && validRopeSystems.includes(sys) ? sys : 'yds';
            setGradeSystem(resolved as any);
          });
        }
      });
    }
  }, [visible, existingClimb]);

  // When climb type changes, always restore last used grade system for that type
  useEffect(() => {
    if (climbType === 'boulder') {
      getLastGradeSystem('boulder').then(sys => {
        const valid = ['v-scale', 'font'];
        const resolved = sys && valid.includes(sys) ? sys : 'v-scale';
        setGradeSystem(resolved as any);
        setGrade(resolved === 'font' ? '6a' : 'V3');
      });
    } else if (climbType !== 'hangboard' && climbType !== 'lift') {
      getLastGradeSystem(climbType).then(sys => {
        const valid = ['yds', 'french', 'british'];
        const resolved = sys && valid.includes(sys) ? sys : 'yds';
        setGradeSystem(resolved as any);
        setGrade(resolved === 'yds' ? '5.10a' : resolved === 'french' ? '6a' : 'VS');
      });
    }
  }, [climbType]);

  // Load existing climb data
  useEffect(() => {
    if (existingClimb) {
      setEnvironment(existingClimb.environment);
      setIsProject(existingClimb.outcome === 'project' || !!existingClimb.projectId);
      setClimbType(existingClimb.type);
      setOutcome(existingClimb.outcome === 'project' ? 'attempt' : existingClimb.outcome);
      setSelectedStyles(existingClimb.styles);
      setGradeSystem(existingClimb.gradeSystem);
      setGrade(existingClimb.grade);
      setRouteName(existingClimb.routeName || '');
      setLocation(existingClimb.location || '');
      setNotes(existingClimb.notes || '');
      setAttempts(String(existingClimb.attempts || 1));
      setSelectedProjectId(existingClimb.projectId);
      setNewProjectName(existingClimb.projectName && !existingClimb.projectId ? existingClimb.projectName : '');
      setMediaUri(existingClimb.mediaUri);
      setMediaType(existingClimb.mediaType);
    } else {
      resetForm();
    }
  }, [existingClimb, visible]);



  function resetForm() {
    setEnvironment('indoor');
    setIsProject(false);
    setClimbType('boulder');
    setOutcome('send');
    setSelectedStyles([]);
    setGradeSystem('v-scale');
    setGrade('V3');
    setRouteName('');
    setLocation('');
    setNotes('');
    setAttempts('1');
    setRoutine('');
    setSelectedProjectId(undefined);
    setNewProjectName('');
    setMediaUri(undefined);
    setMediaType(undefined);
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

  async function pickMedia(type: 'photo' | 'video') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to your photo library in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) { setMediaUri(result.assets[0].uri); setMediaType(type); }
  }

  async function takeMedia(type: 'photo' | 'video') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: type === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) { setMediaUri(result.assets[0].uri); setMediaType(type); }
  }

  function showMediaOptions() {
    Alert.alert('Add Media', 'Choose a source', [
      { text: 'Take Photo',    onPress: () => takeMedia('photo') },
      { text: 'Record Video',  onPress: () => takeMedia('video') },
      { text: 'Photo Library', onPress: () => pickMedia('photo') },
      { text: 'Video Library', onPress: () => pickMedia('video') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const isTraining = climbType === 'hangboard' || climbType === 'lift';

  async function handleSave() {
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
        await Promise.all(
          all.filter(c => c.projectId === existingClimb.projectId)
            .map(c => saveClimb({ ...c, grade, gradeSystem: gs, type: climbType, styles: selectedStyles }))
        );
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

      // Auto-flash: 1 attempt send → flash
      if (!isProject && outcome === 'send' && (parseInt(attempts) || 1) === 1) {
        finalOutcome = 'flash';
      }

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
      if (!isTraining) await saveLastGradeSystem(climbType, gradeSystem);

      const climb: Climb = {
        id: existingClimb?.id || generateId(),
        date: existingClimb?.date || new Date().toISOString(),
        sessionId,
        type: climbType,
        outcome: finalOutcome,
        styles: selectedStyles,
        environment,
        grade,
        gradeSystem,
        routeName: routeName || undefined,
        location: location || undefined,
        notes: isTraining && routine ? routine : notes || undefined,
        attempts: parseInt(attempts) || 1,
        mediaUri: mediaUri || undefined,
        mediaType: mediaType || undefined,
        projectId: isProject ? projId : undefined,
        projectName: isProject ? projName : undefined,
      };

      await saveClimb(climb);

      // Persist friends to the session
      if (friends.length > 0) {
        const sessions = await getAllSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) await saveSession({ ...session, friends });
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
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Text style={[styles.cancelText, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>Cancel</Text>
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
            <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={saving}>
              <Text style={[styles.saveText, { color: colors.accent, fontFamily: FONTS.family.bold }]}>{saving ? '...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* Environment + Project — hidden in editProjectMode */}
            {!editProjectMode && (
              <>
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
                <Divider />
              </>
            )}

            {/* Project picker — shown when Project is toggled on (not in editProjectMode) */}
            {!editProjectMode && isProject && (
              <>
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
                <Divider />
              </>
            )}

            {/* Type + Grade — hidden when an existing project is selected */}
            {!(isProject && !!selectedProjectId) && (
              <>
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
                <Divider />

                {!isTraining && (
                  <>
                    <Text style={[styles.label, { color: colors.textMuted }]}>GRADE</Text>
                    <GradePicker
                      gradeSystem={gradeSystem}
                      selected={grade}
                      onSystemChange={(sys) => { setGradeSystem(sys); }}
                      onChange={setGrade}
                      isBoulder={climbType === 'boulder'}
                    />
                    <Divider />
                  </>
                )}
              </>
            )}

            {/* Outcome — hidden for training only */}
            {!isTraining && (
              <>
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
                <Divider />
              </>
            )}

            {/* Style — hidden for training */}
            {!isTraining && (
              <>
                <Text style={[styles.label, { color: colors.textMuted }]}>STYLE</Text>
                <View style={styles.row}>
                  {CLIMB_STYLES.map(s => (
                    <Pill key={s.id} label={s.label} selected={selectedStyles.includes(s.id)} onPress={() => toggleStyle(s.id)} small />
                  ))}
                </View>
                <Divider />
              </>
            )}

            {/* Routine — only for hangboard/lift */}
            {isTraining && (
              <>
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
                <Divider />
              </>
            )}

            {/* Details */}
            <Text style={[styles.label, { color: colors.textMuted }]}>DETAILS (optional)</Text>
            <LocationPicker value={location} onChange={setLocation} />
            <TextInput style={[styles.input, styles.inputMulti, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONTS.family.regular }]} placeholder="Notes..." placeholderTextColor={colors.textMuted} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

            {/* Tag friends */}
            <Text style={[styles.label, { color: colors.textMuted, marginTop: SPACING.sm }]}>WITH (optional)</Text>
            <FriendPicker selected={friends} onChange={setFriends} />

            {/* Media */}
            <Divider />
            <Text style={[styles.label, { color: colors.textMuted }]}>MEDIA</Text>
            {mediaUri ? (
              <View style={styles.mediaPreviewRow}>
                <Image source={{ uri: mediaUri }} style={styles.mediaThumb} resizeMode="cover" />
                <View style={styles.mediaPreviewInfo}>
                  <Text style={[styles.mediaTypeLabel, { color: colors.textSecondary, fontFamily: FONTS.family.semibold }]}>
                    {mediaType === 'video' ? 'Video attached' : 'Photo attached'}
                  </Text>
                  <TouchableOpacity onPress={() => { setMediaUri(undefined); setMediaType(undefined); }}>
                    <Text style={[styles.mediaRemove, { color: colors.danger, fontFamily: FONTS.family.regular }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
                onPress={showMediaOptions}
              >
                <Text style={[styles.mediaBtnText, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>
                  + Add Photo or Video
                </Text>
              </TouchableOpacity>
            )}

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
  headerBtn: { padding: SPACING.sm, minWidth: 60 },
  headerTitle: { fontSize: FONTS.sizes.lg },
  cancelText: { fontSize: FONTS.sizes.md },
  saveText: { fontSize: FONTS.sizes.md, textAlign: 'right' },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  label: { fontSize: FONTS.sizes.xs, letterSpacing: 1.5, marginBottom: SPACING.md },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  attemptsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md, borderRadius: 10, borderWidth: 1, padding: SPACING.md },
  attemptsLabel: { fontSize: FONTS.sizes.md },
  attemptsStepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  stepBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, lineHeight: 24 },
  attemptsValue: { fontSize: FONTS.sizes.xl, minWidth: 28, textAlign: 'center' },
  mediaBtn: { borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.md },
  mediaBtnText: { fontSize: FONTS.sizes.md },
  mediaPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  mediaThumb: { width: 72, height: 72, borderRadius: 8 },
  mediaPreviewInfo: { flex: 1, gap: SPACING.sm },
  mediaTypeLabel: { fontSize: FONTS.sizes.md },
  mediaRemove: { fontSize: FONTS.sizes.sm },
  pill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginRight: SPACING.sm, marginBottom: SPACING.sm },
  pillText: { fontSize: FONTS.sizes.sm, letterSpacing: 0.3 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: FONTS.sizes.md, padding: SPACING.md, marginBottom: SPACING.md },
  inputMulti: { height: 80, textAlignVertical: 'top' },
});
