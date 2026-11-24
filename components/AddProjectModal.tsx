import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import PressGrow from './PressGrow';
import BoldIcon from './BoldIcon';
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
  const [saving, setSaving] = useState(false);

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
      setLocation('');
      setNotes('');
    } else if (visible && !existingProject) {
      reset();
    }
  }, [visible, existingProject]);

  function toggleStyle(styleId: StyleId) {
    setSelectedStyles(prev => prev.includes(styleId) ? prev.filter(s => s !== styleId) : [...prev, styleId]);
  }

  function reset() {
    setName(''); setClimbType('boulder'); setGradeSystem('v-scale');
    setGrade('V3'); setLocation(''); setSelectedStyles([]); setHoldColor(undefined); setEnvironment('indoor'); setNotes('');
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
      if (isEditing && existingProject) {
        await saveNamedProject({ ...existingProject, name: name.trim(), grade, type: climbType, styles: selectedStyles, holdColor: savedHold, environment });
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
        const projectId = generateId();
        await saveNamedProject({
          id: projectId,
          name: name.trim(),
          grade,
          type: climbType,
          styles: selectedStyles,
          holdColor: savedHold,
          environment,
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

          <ScrollView style={{ flex: 1 }} contentContainerStyle={ss.content} keyboardShouldPersistTaps="handled">
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
            />
            <View style={{ height: 40 }} />
          </ScrollView>
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
});
