import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, FlatList,
  TouchableOpacity, SafeAreaView
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { getAllClimbs, getAllSessions } from '../utils/storage';
import { GradeBadge } from './UI';
import { format, parseISO } from 'date-fns';

interface PastProject {
  projectId: string;
  projectName?: string;
  grade: string;
  type: string;
  sentDate?: string;
  workDays: string[];
  totalSessions: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PastProjectsModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const [pastProjects, setPastProjects] = useState<PastProject[]>([]);

  useEffect(() => {
    if (visible) loadPastProjects();
  }, [visible]);

  async function loadPastProjects() {
    const all = await getAllClimbs();
    const sessions = await getAllSessions();
    const sessionDateMap: Record<string, string> = {};
    sessions.forEach(s => { sessionDateMap[s.id] = s.date; });

    // Group all project-tagged climbs by projectId
    const projectMap: Record<string, {
      climbs: Climb[];
      sent?: Climb;
    }> = {};

    all.filter(c => c.projectId).forEach(c => {
      if (!projectMap[c.projectId!]) projectMap[c.projectId!] = { climbs: [] };
      if (c.outcome === 'send' || c.outcome === 'flash') {
        projectMap[c.projectId!].sent = c;
      } else {
        projectMap[c.projectId!].climbs.push(c);
      }
    });

    // Build past projects — only ones that have been sent
    const results: PastProject[] = [];
    Object.entries(projectMap).forEach(([projectId, data]) => {
      if (!data.sent) return; // only show sent projects

      const allClimbsForProject = [...data.climbs, data.sent];
      const workDays = [...new Set(
        allClimbsForProject
          .filter(c => (c.attempts ?? 0) > 0)
          .map(c => sessionDateMap[c.sessionId] || c.date.split('T')[0])
      )];

      results.push({
        projectId,
        projectName: data.sent.projectName || data.sent.routeName,
        grade: data.sent.grade,
        type: data.sent.type,
        sentDate: data.sent.date,
        workDays,
        totalSessions: workDays.length,
      });
    });

    // Sort by most sessions first
    results.sort((a, b) => b.totalSessions - a.totalSessions);
    setPastProjects(results);
  }

  function renderProject({ item }: { item: PastProject }) {
    const typeInfo = CLIMB_TYPES.find(t => t.id === item.type);
    const firstDay = item.workDays.length > 0
      ? format(parseISO(item.workDays.sort()[0]), 'MMM d')
      : null;
    const sentDay = item.sentDate
      ? format(parseISO(item.sentDate.split('T')[0]), 'MMM d, yyyy')
      : null;

    return (
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, borderLeftColor: colors.accentGreen }]}>
        <View style={styles.cardTop}>
          <GradeBadge grade={item.grade} outcome="send" />
          <View style={[styles.sentBadge, { backgroundColor: colors.accentGreenSoft, borderColor: colors.accentGreen }]}>
            <Text style={[styles.sentBadgeTxt, { color: colors.accentGreen, fontFamily: FONTS.family.bold }]}>Sent</Text>
          </View>
        </View>

        {item.projectName && (
          <Text style={[styles.name, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{item.projectName}</Text>
        )}
        <Text style={[styles.type, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>
          {typeInfo?.label ?? item.type}
        </Text>

        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: colors.accent, fontFamily: FONTS.family.heavy }]}>{item.totalSessions}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
              {item.totalSessions === 1 ? 'session' : 'sessions'}
            </Text>
          </View>
          {firstDay && (
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: colors.textPrimary, fontFamily: FONTS.family.semibold }]}>{firstDay}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>first session</Text>
            </View>
          )}
          {sentDay && (
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: colors.accentGreen, fontFamily: FONTS.family.semibold }]}>{sentDay}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>sent</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary, fontFamily: FONTS.family.heavy }]}>Past Projects</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeTxt, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={pastProjects}
          keyExtractor={item => item.projectId}
          renderItem={renderProject}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.textSecondary, fontFamily: FONTS.family.semibold }]}>No sent projects yet</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                Projects you send will appear here, showing how many sessions it took
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, borderBottomWidth: 1,
  },
  title: { fontSize: FONTS.sizes.xl },
  closeBtn: { padding: SPACING.sm },
  closeTxt: { fontSize: FONTS.sizes.md },
  list: { padding: SPACING.lg },
  card: {
    borderRadius: 12, borderWidth: 1, borderLeftWidth: 3,
    padding: SPACING.lg, marginBottom: SPACING.md,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  sentBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 4 },
  sentBadgeTxt: { fontSize: FONTS.sizes.sm },
  name: { fontSize: FONTS.sizes.lg, marginBottom: 2 },
  type: { fontSize: FONTS.sizes.sm, marginBottom: SPACING.md },
  stats: { flexDirection: 'row', gap: SPACING.xl },
  statItem: { alignItems: 'flex-start' },
  statVal: { fontSize: FONTS.sizes.lg },
  statLabel: { fontSize: FONTS.sizes.xs, marginTop: 1 },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxl * 2, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: FONTS.sizes.lg, marginBottom: SPACING.sm },
  emptySub: { fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
});
