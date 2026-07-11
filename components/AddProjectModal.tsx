import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING, CLIMB_TYPES, CLIMB_STYLES, ClimbTypeId, StyleId } from '../utils/theme';
import { generateId, saveNamedProject, NamedProject, getAllClimbs, saveClimb } from '../utils/storage';
import { Pill, Divider } from './UI';
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
    setGrade('V3'); setLocation(''); setSelectedStyles([]); setNotes('');
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please give your project a name.');
      return;
    }
    setSaving(true);
    try {
      if (isEditing && existingProject) {
        await saveNamedProject({ ...existingProject, name: name.trim(), grade, type: climbType, styles: selectedStyles });
        // Update all linked climbs to match new grade/type
        const gs = inferGradeSystem(grade) as any;
        const all = await getAllClimbs();
        await Promise.all(
          all.filter(c => c.projectId === existingProject.id)
            .map(c => saveClimb({ ...c, grade, gradeSystem: gs, type: climbType, styles: selectedStyles, projectName: name.trim() }))
        );
      } else {
        const projectId = generateId();
        await saveNamedProject({
          id: projectId,
          name: name.trim(),
          grade,
          type: climbType,
          styles: selectedStyles,
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[ss.container, { backgroundColor: colors.bg }]}>
          <View style={[ss.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={ss.headerBtn}>
              <Text style={[ss.cancelTxt, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[ss.title, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{isEditing ? 'Edit Project' : 'New Project'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} style={ss.headerBtn}>
              <Text style={[ss.saveTxt, { color: colors.accent, fontFamily: FONTS.family.bold }]}>
                {saving ? '...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={ss.content} keyboardShouldPersistTaps="handled">
            <Text style={[ss.label, { color: colors.textMuted }]}>PROJECT NAME</Text>
            <TextInput
              style={[ss.input, { backgroundColor: colors.bgCard, borderColor: colors.accent, color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
              placeholder="Name your project..."
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
            />

            <Text style={[ss.label, { color: colors.textMuted }]}>TYPE</Text>
            <View style={ss.row}>
              {CLIMBING_TYPES.map(ct => (
                <Pill key={ct.id} label={ct.label} selected={climbType === ct.id}
                  onPress={() => {
                    setClimbType(ct.id);
                    if (ct.id === 'boulder') {
                      if (gradeSystem !== 'v-scale' && gradeSystem !== 'font') {
                        setGradeSystem('v-scale'); setGrade('V3');
                      }
                    } else {
                      if (gradeSystem === 'v-scale' || gradeSystem === 'font') {
                        setGradeSystem('yds'); setGrade('5.10a');
                      }
                    }
                  }}
                  small
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
              isBoulder={climbType === 'boulder'}
            />
            <Divider />

            <Text style={[ss.label, { color: colors.textMuted }]}>STYLE (optional)</Text>
            <View style={ss.row}>
              {CLIMB_STYLES.map(s => (
                <Pill key={s.id} label={s.label} selected={selectedStyles.includes(s.id as StyleId)}
                  onPress={() => toggleStyle(s.id as StyleId)}
                  small
                />
              ))}
            </View>
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
  headerBtn: { padding: SPACING.sm, minWidth: 60 },
  title: { fontSize: FONTS.sizes.lg },
  cancelTxt: { fontSize: FONTS.sizes.md },
  saveTxt: { fontSize: FONTS.sizes.md, textAlign: 'right' },
  content: { padding: SPACING.lg },
  label: { fontSize: FONTS.sizes.xs, letterSpacing: 1.5, marginBottom: SPACING.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.md },
  input: { borderRadius: 10, borderWidth: 1, fontSize: FONTS.sizes.md, padding: SPACING.md, marginBottom: SPACING.lg },
  inputMulti: { height: 80, textAlignVertical: 'top' },
});
