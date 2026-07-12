import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING, CLIMB_TYPES, Climb } from '../utils/theme';
import { getAllClimbs, getAllSessions, NamedProject } from '../utils/storage';
import { GradeBadge } from './UI';
import { format, parseISO } from 'date-fns';

interface Props {
  visible: boolean;
  project: NamedProject | null;
  refreshKey?: number;
  onClose: () => void;
  onEdit: () => void;
}

const OUTCOME_LABELS: Record<string, string> = {
  send: 'Send',
  flash: 'Flash',
  attempt: 'Attempt',
  project: 'Attempt',
};

function outcomeColors(outcome: string, colors: any): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    send:    { bg: colors.accentGreen + '20', text: colors.accentGreen },
    flash:   { bg: colors.accentGold  + '20', text: colors.accentGold  },
    attempt: { bg: colors.accentBlue  + '20', text: colors.accentBlue  },
    hang:    { bg: '#9B5DE520',               text: '#9B5DE5'          },
    project: { bg: colors.accent      + '20', text: colors.accent      },
  };
  return map[outcome] ?? map.attempt;
}

interface ClimbEntry {
  climb: Climb;
  sessionDate: string;
}

export default function ProjectDetailModal({ visible, project, refreshKey, onClose, onEdit }: Props) {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<ClimbEntry[]>([]);

  useEffect(() => {
    if (visible && project) {
      load();
    }
  }, [visible, project, refreshKey]);

  async function load() {
    if (!project) return;
    const allClimbs = await getAllClimbs();
    const sessions = await getAllSessions();
    const sessionDateMap: Record<string, string> = {};
    sessions.forEach(s => { sessionDateMap[s.id] = s.date; });

    const filtered = allClimbs.filter(c => c.projectId === project.id && c.sessionId);

    // Group attempt-outcome logs by session, keep all others separate
    const attemptGroups: Record<string, { totalAttempts: number; notes: string[]; representative: Climb; sessionDate: string }> = {};
    const result: { climb: Climb; sessionDate: string }[] = [];

    filtered.forEach(c => {
      const sessionDate = sessionDateMap[c.sessionId] || c.date.split('T')[0];
      if (c.outcome === 'attempt') {
        if (!attemptGroups[c.sessionId]) {
          attemptGroups[c.sessionId] = { totalAttempts: 0, notes: [], representative: c, sessionDate };
          result.push({ climb: c, sessionDate }); // placeholder, updated below
        }
        attemptGroups[c.sessionId].totalAttempts += c.attempts ?? 0;
        if (c.notes?.trim()) attemptGroups[c.sessionId].notes.push(c.notes.trim());
      } else {
        result.push({ climb: c, sessionDate });
      }
    });

    // Patch the attempt placeholders with merged totals
    result.forEach(entry => {
      if (entry.climb.outcome === 'attempt') {
        const group = attemptGroups[entry.climb.sessionId];
        if (group) {
          entry.climb = {
            ...group.representative,
            attempts: group.totalAttempts,
            notes: group.notes.length > 1 ? group.notes.map(n => `• ${n}`).join('\n') : group.notes[0],
          };
        }
      }
    });

    result.sort((a, b) => new Date(b.climb.date).getTime() - new Date(a.climb.date).getTime());
    setEntries(result);
  }

  if (!project) return null;

  const typeInfo = CLIMB_TYPES.find(t => t.id === project.type);
  const uniqueDays = [...new Set(entries.map(e => e.sessionDate))];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onClose}>
      <View style={[ss.container, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[ss.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={ss.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[ss.backTxt, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[ss.title, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]} numberOfLines={1}>
            {project.name}
          </Text>
          <TouchableOpacity
            onPress={onEdit}
            style={[ss.editPill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[ss.editPillTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Edit Project</Text>
          </TouchableOpacity>
        </View>

        {/* Project summary */}
        <View style={[ss.summary, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
          <View style={ss.summaryRow}>
            <GradeBadge grade={project.grade} outcome="project" />
            <View style={ss.summaryInfo}>
              <Text style={[ss.summaryType, { color: colors.textSecondary, fontFamily: FONTS.family.medium }]}>
                {typeInfo?.label ?? project.type}
              </Text>
              <Text style={[ss.summaryDays, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>
                {uniqueDays.length} {uniqueDays.length === 1 ? 'day' : 'days'} worked
                {'  ·  '}
                {entries.length} {entries.length === 1 ? 'log' : 'logs'}
              </Text>
            </View>
          </View>
        </View>

        {/* Climb log entries */}
        <ScrollView contentContainerStyle={ss.scrollContent} showsVerticalScrollIndicator={false}>
          {entries.length === 0 ? (
            <View style={ss.empty}>
              <Text style={[ss.emptyTitle, { color: colors.textSecondary, fontFamily: FONTS.family.semibold }]}>
                No sessions logged yet
              </Text>
              <Text style={[ss.emptySubtitle, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                Log a climb linked to this project to see your notes here
              </Text>
            </View>
          ) : (
            entries.map(({ climb, sessionDate }) => {
              const outcomeColor = outcomeColors(climb.outcome, colors);
              const dateLabel = (() => {
                try { return format(parseISO(sessionDate), 'MMM d, yyyy'); }
                catch { return sessionDate; }
              })();
              const count = climb.attempts ?? 0;
              const unit = climb.outcome === 'hang'
                ? (count === 1 ? 'hang' : 'hangs')
                : (count === 1 ? 'attempt' : 'attempts');

              return (
                <View
                  key={climb.id}
                  style={[ss.entryCard, { backgroundColor: colors.bgCard, borderColor: colors.border, borderLeftColor: colors.accent }]}
                >
                  <View style={ss.entryTop}>
                    <Text style={[ss.entryDate, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                      {dateLabel}
                    </Text>
                    <View style={[ss.outcomePill, { backgroundColor: outcomeColor.bg }]}>
                      <Text style={[ss.outcomeTxt, { color: outcomeColor.text, fontFamily: FONTS.family.semibold }]}>
                        {OUTCOME_LABELS[climb.outcome] ?? climb.outcome}
                      </Text>
                    </View>
                    {count > 0 && (
                      <Text style={[ss.attempts, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                        {count} {unit}
                      </Text>
                    )}
                  </View>
                  {climb.notes ? (
                    <Text style={[ss.notes, { color: colors.textPrimary, fontFamily: FONTS.family.regular }]}>
                      {climb.notes}
                    </Text>
                  ) : (
                    <Text style={[ss.noNotes, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                      No notes
                    </Text>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  headerBtn: { minWidth: 60 },
  backTxt: { fontSize: FONTS.sizes.md },
  title: { fontSize: FONTS.sizes.lg, flex: 1, textAlign: 'center', marginHorizontal: SPACING.sm },
  editPill: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
  },
  editPillTxt: { fontSize: FONTS.sizes.sm },
  summary: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  summaryInfo: { flex: 1 },
  summaryType: { fontSize: FONTS.sizes.sm, marginBottom: 2 },
  summaryDays: { fontSize: FONTS.sizes.sm },
  scrollContent: { padding: SPACING.lg },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: FONTS.sizes.md, marginBottom: SPACING.sm, textAlign: 'center' },
  emptySubtitle: { fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
  entryCard: {
    borderRadius: 12, borderWidth: 1, borderLeftWidth: 3,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  entryTop: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  entryDate: { fontSize: FONTS.sizes.xs, flex: 1 },
  outcomePill: {
    borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  outcomeTxt: { fontSize: FONTS.sizes.xs },
  attempts: { fontSize: FONTS.sizes.xs },
  notes: { fontSize: FONTS.sizes.sm, lineHeight: 20 },
  noNotes: { fontSize: FONTS.sizes.sm, fontStyle: 'italic' },
});
