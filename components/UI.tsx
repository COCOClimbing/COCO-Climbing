import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator
} from 'react-native';
import { FONTS, SPACING, COLORS } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';

// ─── Pill / Chip ─────────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  small?: boolean;
  icon?: string;
}

export function Pill({ label, selected, onPress, color, small, icon }: PillProps) {
  const { colors } = useTheme();
  const accentColor = color || colors.accent;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.pill,
        small && styles.pillSmall,
        selected && { backgroundColor: accentColor + '25', borderColor: accentColor },
        !selected && { borderColor: colors.border },
      ]}
    >
      {icon && <Text style={[styles.pillIcon, small && { fontSize: 12 }]}>{icon}</Text>}
      <Text style={[
        styles.pillText,
        small && styles.pillTextSmall,
        selected && { color: accentColor },
        !selected && { color: colors.textSecondary },
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      {right}
    </View>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

// ─── Grade Badge ─────────────────────────────────────────────────────────────

export function GradeBadge({ grade, outcome }: { grade: string; outcome: string }) {
  const { colors } = useTheme();
  const color =
    outcome === 'send' || outcome === 'flash' ? colors.accentGreen :
    outcome === 'hang' ? '#9B5DE5' :
    outcome === 'project' ? colors.accent :
    colors.accentBlue;

  return (
    <View style={[styles.gradeBadge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.gradeText, { color }]}>{grade}</Text>
    </View>
  );
}

// ─── Outcome Badge ───────────────────────────────────────────────────────────

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const { colors } = useTheme();
  const map: Record<string, { label: string; color: string; icon: string }> = {
    send:    { label: 'Send',    color: colors.accentGreen, icon: '' },
    flash:   { label: 'Flash',   color: colors.accentGold,  icon: '' },
    attempt: { label: 'Attempt', color: colors.accentBlue,  icon: '↻' },
    hang:    { label: 'Hang',    color: '#9B5DE5',          icon: '' },
    project: { label: 'Project', color: colors.accent,      icon: '' },
  };
  const info = map[outcome] || map.attempt;
  return (
    <View style={[styles.outcomeBadge, { backgroundColor: info.color + '20' }]}>
      <Text style={[styles.outcomeText, { color: info.color }]}>{info.icon ? `${info.icon} ${info.label}` : info.label}</Text>
    </View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{title}</Text>
      {subtitle && <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
    </View>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled, full }: ButtonProps) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.button,
        { borderColor: colors.border },
        isPrimary && { backgroundColor: colors.accent, borderColor: colors.accent },
        isDanger && { borderColor: colors.danger, backgroundColor: colors.danger + '15' },
        full && { width: '100%' },
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading
        ? <ActivityIndicator color={isPrimary ? '#000' : colors.textPrimary} size="small" />
        : <Text style={[
            styles.buttonText,
            { color: colors.textPrimary },
            isPrimary && { color: '#000' },
            isDanger && { color: colors.danger },
          ]}>
            {label}
          </Text>
      }
    </TouchableOpacity>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  pillSmall: { paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  pillIcon: { fontSize: 14, marginRight: 4 },
  pillText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium, letterSpacing: 0.3 },
  pillTextSmall: { fontSize: FONTS.sizes.xs },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },

  gradeBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  gradeText: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.heavy, letterSpacing: -0.5 },

  outcomeBadge: {
    borderRadius: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  outcomeText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.semibold, letterSpacing: 0.5 },

  empty: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.semibold, marginBottom: SPACING.sm },
  emptySubtitle: { fontSize: FONTS.sizes.sm, textAlign: 'center' },

  button: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonText: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold },

  divider: { height: 1, marginVertical: SPACING.lg },
});
