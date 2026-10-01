import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING, V_GRADES, YDS_GRADES, FRENCH_GRADES, BRITISH_GRADES, FONT_GRADES } from '../utils/theme';

export type GradeSystem = 'v-scale' | 'yds' | 'french' | 'british' | 'font' | 'custom';

export const CUSTOM_GRADE_MAX_LENGTH = 12;

interface Props {
  gradeSystem: GradeSystem;
  selected: string;
  onSystemChange: (system: GradeSystem) => void;
  onChange: (grade: string) => void;
  isBoulder?: boolean;
  lockSystem?: boolean;
  allowCustom?: boolean;
}

const BOULDER_SYSTEMS: { id: GradeSystem; label: string }[] = [
  { id: 'v-scale', label: 'V Scale' },
  { id: 'font',    label: 'Font' },
];

const CUSTOM_SYSTEM: { id: GradeSystem; label: string } = { id: 'custom', label: 'Custom' };

const ROPE_SYSTEMS: { id: GradeSystem; label: string }[] = [
  { id: 'yds',     label: 'YDS' },
  { id: 'french',  label: 'French' },
  { id: 'british', label: 'British' },
];

function getGrades(system: GradeSystem): string[] {
  switch (system) {
    case 'v-scale': return V_GRADES;
    case 'yds':     return YDS_GRADES;
    case 'french':  return FRENCH_GRADES;
    case 'british': return BRITISH_GRADES;
    case 'font':    return FONT_GRADES;
    case 'custom':  return [];
  }
}

export default function GradePicker({ gradeSystem, selected, onSystemChange, onChange, isBoulder, lockSystem, allowCustom = true }: Props) {
  const { colors } = useTheme();
  const systems = [...(isBoulder ? BOULDER_SYSTEMS : ROPE_SYSTEMS), ...(allowCustom ? [CUSTOM_SYSTEM] : [])];
  const isCustom = gradeSystem === 'custom';
  const grades = getGrades(gradeSystem);
  const validSelected = grades.includes(selected) ? selected : grades[0];

  function handleSystemChange(system: GradeSystem) {
    if (lockSystem) return;
    onSystemChange(system);
    onChange(system === 'custom' ? '' : getGrades(system)[0]);
  }

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      {/* Left: grade system buttons */}
      <View style={[styles.systemCol, { borderRightColor: colors.border }]}>
        {systems.map(s => {
          const isActive = gradeSystem === s.id;
          const isLocked = lockSystem && !isActive;
          return (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.systemBtn,
                isActive && { backgroundColor: colors.accent },
                isLocked && { opacity: 0.3 },
              ]}
              onPress={() => handleSystemChange(s.id)}
              activeOpacity={isLocked ? 1 : 0.7}
            >
              <Text style={[
                styles.systemTxt,
                {
                  color: isActive ? '#000' : colors.textSecondary,
                  fontFamily: isActive ? FONTS.family.bold : FONTS.family.regular,
                },
              ]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Right: free-text input for custom grades, otherwise the native iOS picker wheel */}
      {isCustom ? (
        <View style={styles.customCol}>
          <TextInput
            style={[styles.customInput, { color: colors.textPrimary, backgroundColor: colors.bgCard, borderColor: colors.border, fontFamily: FONTS.family.bold }]}
            value={selected}
            onChangeText={onChange}
            placeholder="e.g. Purple, Level 4"
            placeholderTextColor={colors.textMuted}
            maxLength={CUSTOM_GRADE_MAX_LENGTH}
            autoCorrect={false}
            returnKeyType="done"
          />
        </View>
      ) : (
      <View style={styles.pickerCol}>
        <Picker
          selectedValue={validSelected}
          onValueChange={val => onChange(val as string)}
          style={styles.picker}
          itemStyle={{
            color: colors.textPrimary,
            fontFamily: FONTS.family.bold,
            fontSize: 20,
            height: 140,
          }}
        >
          {grades.map(g => (
            <Picker.Item key={g} label={g} value={g} />
          ))}
        </Picker>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: SPACING.lg,
    height: 140,
  },
  systemCol: {
    width: 90,
    borderRightWidth: 1,
    flexDirection: 'column',
    justifyContent: 'space-around',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  systemBtn: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  systemTxt: {
    fontSize: FONTS.sizes.xs,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  pickerCol: { flex: 1, justifyContent: 'center' },
  customCol: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.md },
  customInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: 18 },
  picker: { flex: 1 },
});
