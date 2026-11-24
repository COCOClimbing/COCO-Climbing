import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Keyboard, Image
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import PressGrow from './PressGrow';
import BoldIcon from './BoldIcon';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING, CLIMB_TYPES, CLIMB_STYLES, HOLD_COLORS, ENVIRONMENTS, ClimbTypeId, StyleId, HoldColorId } from '../utils/theme';
import { generateId, saveNamedProject, NamedProject, getAllClimbs, saveClimb, projectEnvironment } from '../utils/storage';
import { Pill, Divider, HoldColorDot } from './UI';
import GradePicker from './GradePicker';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  existingProject?: NamedProject;
}

const CLIMBING_TYPES = CLIMB_TYPES.filter(t => t.id !== 'hangboard' && t.id !== 'lift');

function inferGradeSystem(grade: string): 'v-scale' | 'yds' | 'french' | 'british' {
  if (grade.startsWith('V') || grade === 'VB') return 'v-scale';
  if (grade.startsWith('5.')) return 'yds';
  if (/^\d/.test(grade) && grade.includes('a') || grade.includes('b') || grade.includes('c')) return 'french';
  return 'yds';
}

export default function AddProjectModal({ visible, onClose, onSaved, existingProject }: Props) {
  const { colors } = useTheme();
  const isEditing = !!existingProject;
  const [name, setName] = useState('');
  const [climbType, setClimbType] = useState<ClimbTypeId>('boulder');
  const [gradeSystem, setGradeSystem] = useState<'v-scale' | 'yds' | 'french' | 'british'>('v-scale');
  const [grade, setGrade] = useState('V3');
  const [location, setLocation] = useState('');
  const [selectedStyles, setSelectedStyles] = useState<StyleId[]>([]);
  const [holdColor, setHoldColor] = useState<HoldColorId | undefined>();
  const [environment, setEnvironment] = useState<'indoor' | 'outdoor'>('indoor');
  const [notes, setNotes] = useState('');
  const [mediaItems, setMediaItems] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
  const [saving, setSaving] = useState(false);
  // Scroll a tapped box above the keyboard (same as Log/Edit Climb's notes)
  const scrollRef = useRef<ScrollView>(null);
  const locationYRef = useRef(0);   // bottom edge of each box, in scroll content
  const notesYRef = useRef(0);
  const offsetRef = useRef(0);
  const kbTopRef = useRef(0);       // keyboard's top edge on screen (0 = keyboard down)
  const scrollWrapRef = useRef<View>(null);
  const focusedRef = useRef<React.MutableRefObject<number> | null>(null);
  // Scroll just enough that the box's bottom sits a little above the keyboard.
  // The keyboard reports screen coordinates but measureInWindow is relative to
  // the sheet, which starts one status-bar height down the screen, so add that back.
  const scrollToY = (bottom: React.MutableRefObject<number>) => {
    focusedRef.current = bottom;
    const kbTop = kbTopRef.current;
    if (!kbTop) return; // keyboard not up yet; keyboardDidShow runs this again
    scrollWrapRef.current?.measureInWindow((_x, top) => {
      const sheetTop = initialWindowMetrics?.insets.top ?? 0;
      const visible = kbTop - (top + sheetTop);
      const target = bottom.current + 16 - visible;
      if (target > offsetRef.current) scrollRef.current?.scrollTo({ y: target, animated: true });
    });
  };
  React.useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      kbTopRef.current = e.endCoordinates.screenY;
      if (focusedRef.current) scrollToY(focusedRef.current);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbTopRef.current = 0; });
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Pre-fill when editing
  React.useEffect(() => {
    if (visible && existingProject) {
      setName(existingProject.name);
      setClimbType(existingProject.type as ClimbTypeId);
      setGrade(existingProject.grade);
      setGradeSystem(inferGradeSystem(existingProject.grade));
      setSelectedStyles((existingProject.styles ?? []) as StyleId[]);
      setHoldColor(existingProject.holdColor as HoldColorId | undefined);
      setEnvironment(existingProject.environment ?? 'indoor');
      if (!existingProject.environment) {
        // Older project: use where it was last logged
        getAllClimbs().then(all => {
          const env = projectEnvironment(existingProject, all);
          if (env) setEnvironment(env);
        });
      }
      setLocation(existingProject.location ?? '');
      setNotes(existingProject.notes ?? '');
      setMediaItems((existingProject.mediaUris ?? []).map((uri, i) => ({ uri, type: existingProject.mediaTypes?.[i] ?? 'photo' })));
    } else if (visible && !existingProject) {
      reset();
    }
  }, [visible, existingProject]);

  function toggleStyle(styleId: StyleId) {
    setSelectedStyles(prev => prev.includes(styleId) ? prev.filter(s => s !== styleId) : [...prev, styleId]);
  }

  function reset() {
    setName(''); setClimbType('boulder'); setGradeSystem('v-scale');
    setGrade('V3'); setLocation(''); setSelectedStyles([]); setHoldColor(undefined); setEnvironment('indoor'); setNotes(''); setMediaItems([]);
  }

  // Photos: same picker as Log/Edit Climb
  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to your photo library in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      setMediaItems(prev => [...prev, ...result.assets.map(a => ({ uri: a.uri, type: 'photo' as const }))]);
    }
  }
  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      setMediaItems(prev => [...prev, { uri: result.assets[0].uri, type: 'photo' as const }]);
    }
  }
  function showMediaOptions() {
    Keyboard.dismiss();
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Take Photo', onPress: () => takePhoto() },
      { text: 'Photo Library', onPress: () => pickPhoto() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please give your project a name.');
      return;
    }
    setSaving(true);
    // Hold color only applies to indoor projects
    const savedHold = environment === 'indoor' ? holdColor : undefined;
    try {
      const projectId = existingProject?.id ?? generateId();
      // Photos upload in the background when the project syncs (see syncProjectToCloud)
      const extras = {
        notes: notes.trim() || undefined,
        location: location.trim() || undefined,
        mediaUris: mediaItems.map(m => m.uri),
        mediaTypes: mediaItems.map(m => m.type),
      };
      if (isEditing && existingProject) {
        await saveNamedProject({ ...existingProject, name: name.trim(), grade, type: climbType, styles: selectedStyles, holdColor: savedHold, environment, ...extras });
        // Update all linked climbs to match new grade/type
        const gs = inferGradeSystem(grade) as any;
        const all = await getAllClimbs();
        // One at a time: saveClimb rewrites the whole list, so parallel saves clobber each other
        for (const c of all.filter(c => c.projectId === existingProject.id)) {
          await saveClimb({
            ...c, grade, gradeSystem: gs, type: climbType, styles: selectedStyles, projectName: name.trim(),
            // Hold color only means something on indoor climbs
            ...(c.environment === 'indoor' ? { holdColor: savedHold } : {}),
          });
        }
      } else {
        await saveNamedProject({
          id: projectId,
          name: name.trim(),
          grade,
          type: climbType,
          styles: selectedStyles,
          holdColor: savedHold,
          environment,
          ...extras,
          createdAt: new Date().toISOString(),
        });
      }
      onSaved();
      onClose();
      reset();
    } catch {
      Alert.alert('Error', 'Could not save project.');
    } finally {
      setSaving(false);
    }
  }


  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[ss.container, { backgroundColor: colors.bg }]}>
          {/* Same header as Log/Edit Climb: round back (cancel) and check (save) */}
          <View style={[ss.header, { borderBottomColor: colors.border }]}>
            <PressGrow onPress={onClose} style={[ss.roundBtn, { backgroundColor: colors.bgCard }]} accessibilityLabel="Cancel">
              {pressed => <BoldIcon name="chevron-back" size={24} color={colors.textPrimary} weight={pressed ? 0.5 : 0} />}
            </PressGrow>
            <Text style={[ss.title, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{isEditing ? 'Edit Project' : 'New Project'}</Text>
            <PressGrow onPress={handleSave} style={[ss.roundBtn, { backgroundColor: colors.accent }, saving && { opacity: 0.6 }]} disabled={saving} accessibilityLabel="Save">
              {pressed => saving
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  <Svg width={24} height={24} viewBox="0 0 512 512">
                    <Path d="M416 128L192 384l-96-96" fill="none" stroke="#fff" strokeWidth={pressed ? 60 : 48} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
            </PressGrow>
          </View>

          <View ref={scrollWrapRef} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={ss.content} keyboardShouldPersistTaps="handled"
            onScroll={e => { offsetRef.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}>
            <Text style={[ss.label, { color: colors.textMuted }]}>PROJECT NAME</Text>
            <TextInput
              style={[ss.input, { backgroundColor: colors.bgCard, borderColor: colors.accent, color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
              placeholder="Name your project..."
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              // Only jump to the keyboard for a new project, not when editing
              autoFocus={!isEditing}
            />

            <Text style={[ss.label, { color: colors.textMuted }]}>ENVIRONMENT</Text>
            <View style={ss.row}>
              {ENVIRONMENTS.map(env => (
                <Pill key={env.id} label={env.label} selected={environment === env.id}
                  onPress={() => setEnvironment(env.id)} />
              ))}
            </View>

            <Text style={[ss.label, { color: colors.textMuted }]}>TYPE</Text>
            <View style={ss.row}>
              {CLIMBING_TYPES.map(ct => (
                <Pill key={ct.id} label={ct.label} selected={climbType === ct.id}
                  onPress={() => {
                    setClimbType(ct.id);
                    if (ct.id === 'boulder' || ct.id === 'board') {
                      if (gradeSystem !== 'v-scale' && gradeSystem !== 'font') {
                        setGradeSystem('v-scale'); setGrade('V3');
                      }
                    } else {
                      if (gradeSystem === 'v-scale' || gradeSystem === 'font') {
                        setGradeSystem('yds'); setGrade('5.10a');
                      }
                    }
                  }}
                />
              ))}
            </View>
            <Divider />

            <Text style={[ss.label, { color: colors.textMuted }]}>GRADE</Text>
            <GradePicker
              gradeSystem={gradeSystem}
              selected={grade}
              onSystemChange={(sys) => { setGradeSystem(sys as any); }}
              onChange={setGrade}
              isBoulder={climbType === 'boulder' || climbType === 'board'}
              allowCustom={false}
            />
            <Divider />

            <Text style={[ss.label, { color: colors.textMuted }]}>STYLE (optional)</Text>
            <View style={ss.row}>
              {CLIMB_STYLES.map(s => (
                <Pill key={s.id} label={s.label} selected={selectedStyles.includes(s.id as StyleId)}
                  onPress={() => toggleStyle(s.id as StyleId)}
                />
              ))}
            </View>
            {environment === 'indoor' && (<>
            <Divider />

            <Text style={[ss.label, { color: colors.textMuted }]}>HOLD COLOR (optional)</Text>
            <View style={ss.row}>
              {HOLD_COLORS.map(c => {
                const selected = holdColor === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setHoldColor(selected ? undefined : c.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.label} holds${selected ? ', selected' : ''}`}
                    style={[ss.swatchWrap, { borderColor: selected ? colors.textPrimary : 'transparent' }]}
                  >
                    <HoldColorDot colorId={c.id} size={32} />
                  </TouchableOpacity>
                );
              })}
            </View>
            </>)}
            <Divider />

            <Text style={[ss.label, { color: colors.textMuted }]}>LOCATION (optional)</Text>
            <TextInput
              style={[ss.input, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
              placeholder="Crag / gym name..."
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
              onFocus={() => scrollToY(locationYRef)}
              onBlur={() => { focusedRef.current = null; }}
              onLayout={e => { locationYRef.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height; }}
            />

            <Text style={[ss.label, { color: colors.textMuted }]}>NOTES (optional)</Text>
            <TextInput
              style={[ss.input, ss.inputMulti, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
              placeholder="Beta, description, why you want to try it..."
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              onFocus={() => scrollToY(notesYRef)}
              onBlur={() => { focusedRef.current = null; }}
              onLayout={e => { notesYRef.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height; }}
            />
            <Text style={[ss.label, { color: colors.textMuted }]}>MEDIA (optional)</Text>
            {mediaItems.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
                {mediaItems.map((item, index) => (
                  <TouchableOpacity
                    key={item.uri + index}
                    onLongPress={() => Alert.alert('Remove Photo', 'Remove this photo?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => setMediaItems(prev => prev.filter((_, i) => i !== index)) },
                    ])}
                    activeOpacity={0.9}
                    delayLongPress={400}
                    style={{ marginRight: SPACING.sm }}
                  >
                    <Image source={{ uri: item.uri }} style={ss.mediaThumbnail} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[ss.mediaThumbnail, ss.mediaAddTile, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
                  onPress={showMediaOptions}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 30, color: colors.textMuted }}>+</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <TouchableOpacity
                style={[ss.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
                onPress={showMediaOptions}
              >
                <Text style={[ss.mediaBtnText, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>+ Add Photo</Text>
              </TouchableOpacity>
            )}

            {/* Room to scroll the notes box up above the keyboard */}
            <View style={{ height: 360 }} />
          </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ss = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1,
  },
  roundBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  title: { fontSize: FONTS.sizes.lg },
  content: { padding: SPACING.lg },
  label: { fontSize: FONTS.sizes.xs, letterSpacing: 1.5, marginBottom: SPACING.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.md },
  swatchWrap: { borderWidth: 3, borderRadius: 24, padding: 2, marginRight: SPACING.xs, marginBottom: SPACING.xs },
  input: { borderRadius: 10, borderWidth: 1, fontSize: FONTS.sizes.md, padding: SPACING.md, marginBottom: SPACING.lg },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  mediaBtn: { borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.md },
  mediaBtnText: { fontSize: FONTS.sizes.md },
  mediaThumbnail: { width: 120, height: 120, borderRadius: 8, backgroundColor: '#222' },
  mediaAddTile: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
