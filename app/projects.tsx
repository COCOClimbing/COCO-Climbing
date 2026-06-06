import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import { getAllClimbs, saveClimb, deleteClimb, getAllNamedProjects, deleteNamedProject, getAllSessions, NamedProject, setProjectsRefreshCallback } from '../utils/storage';
import { EmptyState, GradeBadge } from '../components/UI';
import SwipeableProjectCard from '../components/SwipeableProjectCard';
import AddProjectModal from '../components/AddProjectModal';
import LogClimbModal from '../components/LogClimbModal';
import ProjectDetailModal from '../components/ProjectDetailModal';
import { format, parseISO } from 'date-fns';
import { useNav } from '../utils/NavigationContext';

interface PastProject {
  projectId: string; projectName?: string; grade: string; type: string;
  sentDate?: string; workDays: string[]; totalSessions: number;
}

export default function ProjectsScreen() {
  const { colors } = useTheme();
  const { tabResetCount } = useNav();

  useEffect(() => {
    if (tabResetCount['projects']) setDetailProject(null);
  }, [tabResetCount['projects']]);
  const [projects, setProjects] = useState<Climb[]>([]);
  const [namedProjects, setNamedProjects] = useState<NamedProject[]>([]);
  const [showingPast, setShowingPast] = useState(false);
  const [pastProjects, setPastProjects] = useState<PastProject[]>([]);
  const [workDays, setWorkDays] = React.useState<Record<string, string[]>>({});
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<NamedProject | null>(null);
  const [detailProject, setDetailProject] = useState<NamedProject | null>(null);
  const [projectsRefreshKey, setProjectsRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const all = await getAllClimbs();
    const namedProjects = await getAllNamedProjects();
    const sessions = await getAllSessions();
    const sessionDateMap: Record<string, string> = {};
    sessions.forEach(s => { sessionDateMap[s.id] = s.date; });

    const workDaysMap: Record<string, string[]> = {};
    all.filter(c => c.projectId && (c.attempts ?? 0) >= 1).forEach(c => {
      const pid = c.projectId!;
      const date = sessionDateMap[c.sessionId] || c.date.split('T')[0];
      if (!workDaysMap[pid]) workDaysMap[pid] = [];
      if (!workDaysMap[pid].includes(date)) workDaysMap[pid].push(date);
    });
    setWorkDays(workDaysMap);
    setNamedProjects(namedProjects);

    const sentProjectIds = new Set(
      all.filter(c => c.projectId && (c.outcome === 'send' || c.outcome === 'flash')).map(c => c.projectId!)
    );

    const projectsFromRegistry: Climb[] = namedProjects
      .filter(p => !sentProjectIds.has(p.id))
      .map(p => ({
        id: p.id, projectId: p.id, projectName: p.name, date: p.createdAt,
        sessionId: '', type: p.type as any, outcome: 'project' as any,
        styles: (p as any).styles ?? [], environment: 'outdoor' as any, grade: p.grade,
        gradeSystem: (p.grade.startsWith('V') || p.grade === 'VB' ? 'v-scale' : 'yds') as any,
        attempts: 0,
      }));
    setProjects(projectsFromRegistry);

    const projectMap: Record<string, { climbs: Climb[]; sent?: Climb }> = {};
    all.filter(c => c.projectId).forEach(c => {
      if (!projectMap[c.projectId!]) projectMap[c.projectId!] = { climbs: [] };
      if (c.outcome === 'send' || c.outcome === 'flash') projectMap[c.projectId!].sent = c;
      else projectMap[c.projectId!].climbs.push(c);
    });

    const past: PastProject[] = [];
    Object.entries(projectMap).forEach(([pid, data]) => {
      if (!data.sent) return;
      const allForProject = [...data.climbs, data.sent];
      const days = [...new Set(
        allForProject.filter(c => (c.attempts ?? 0) > 0)
          .map(c => sessionDateMap[c.sessionId] || c.date.split('T')[0])
      )];
      past.push({
        projectId: pid,
        projectName: data.sent.projectName || data.sent.routeName,
        grade: data.sent.grade, type: data.sent.type,
        sentDate: data.sent.date, workDays: days, totalSessions: days.length,
      });
    });
    past.sort((a, b) => b.totalSessions - a.totalSessions);
    setPastProjects(past);
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const refresh = () => { load(); setProjectsRefreshKey(k => k + 1); };
    setProjectsRefreshCallback(refresh);
    return () => setProjectsRefreshCallback(null);
  }, [load]);

  async function markAsSent(climb: Climb) {
    await saveClimb({ ...climb, outcome: 'send' });
    await load();
  }

  async function markAsUnsent(projectId: string) {
    const all = await getAllClimbs();
    const sentClimbs = all.filter(c => c.projectId === projectId && (c.outcome === 'send' || c.outcome === 'flash'));
    await Promise.all(sentClimbs.map(c => saveClimb({ ...c, outcome: 'attempt' })));
    await load();
  }

  function handleDelete(id: string) {
    Alert.alert('Remove Project', 'Delete this project?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteNamedProject(id);
        const all = await getAllClimbs();
        await Promise.all(all.filter(c => c.projectId === id).map(c => deleteClimb(c.id)));
        await load();
      }},
    ]);
  }

  function renderCurrentProject({ item }: { item: Climb }) {
    const typeInfo = CLIMB_TYPES.find(t => t.id === item.type);
    const daysAgo = Math.floor((Date.now() - new Date(item.date).getTime()) / 86400000);
    const worked = (workDays[item.projectId!] || []).length;

    return (
      <SwipeableProjectCard
        onDelete={() => handleDelete(item.id)}
        onSend={() => markAsSent(item)}
      >
        <TouchableOpacity
          style={[styles.projectCard, { backgroundColor: colors.bgCard, borderColor: colors.border, borderLeftColor: colors.accent }]}
          onPress={() => {
            const np = namedProjects.find(p => p.id === item.projectId);
            if (np) setDetailProject(np);
          }}
          activeOpacity={0.75}
        >
          <View style={styles.projectLeft}>
            <GradeBadge grade={item.grade} outcome={item.outcome} />
            <Text style={[styles.projectType, { color: colors.textMuted }]}>{typeInfo?.label}</Text>
          </View>
          <View style={styles.projectCenter}>
            {(item.projectName || item.routeName)
              ? <Text style={[styles.projectName, { color: colors.textPrimary, fontFamily: FONTS.family.semibold }]} numberOfLines={1}>{item.projectName || item.routeName}</Text>
              : <Text style={[styles.projectNameEmpty, { color: colors.textMuted }]}>Unnamed project</Text>
            }
            <Text style={[styles.projectAge, { color: colors.textMuted }]}>
              {daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`}
            </Text>
            {item.projectId && (
              <Text style={[styles.projectMeta, { color: colors.accent }]}>
                {worked} {worked === 1 ? 'day' : 'days'} worked
              </Text>
            )}
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </TouchableOpacity>
      </SwipeableProjectCard>
    );
  }

  function renderPastProject({ item }: { item: PastProject }) {
    const typeInfo = CLIMB_TYPES.find(t => t.id === item.type);
    const sentDay = item.sentDate ? format(parseISO(item.sentDate.split('T')[0]), 'MMM d, yyyy') : null;
    const firstDay = item.workDays.length > 0 ? format(parseISO(item.workDays.sort()[0]), 'MMM d') : null;

    return (
      <SwipeableProjectCard
        onDelete={() => handleDelete(item.projectId)}
        onSend={() => markAsUnsent(item.projectId)}
        sendLabel="Project"
        sendColor={colors.accent}
      >
      <View style={[styles.projectCard, styles.pastCard, { backgroundColor: colors.bgCard, borderColor: colors.border, borderLeftColor: colors.accentGreen }]}>
        <View style={styles.projectLeft}>
          <GradeBadge grade={item.grade} outcome="send" />
          <Text style={[styles.projectType, { color: colors.textMuted }]}>{typeInfo?.label}</Text>
        </View>
        <View style={styles.projectCenter}>
          {item.projectName
            ? <Text style={[styles.projectName, { color: colors.textPrimary, fontFamily: FONTS.family.semibold }]} numberOfLines={1}>{item.projectName}</Text>
            : <Text style={[styles.projectNameEmpty, { color: colors.textMuted }]}>Unnamed</Text>
          }
          {sentDay && <Text style={[styles.projectAge, { color: colors.accentGreen }]}>Sent {sentDay}</Text>}
          <Text style={[styles.projectMeta, { color: colors.accent }]}>
            {item.totalSessions} {item.totalSessions === 1 ? 'session' : 'sessions'}
            {firstDay ? ` · from ${firstDay}` : ''}
          </Text>
        </View>
        <View style={[styles.sentBadge, { backgroundColor: colors.accentGreenSoft, borderColor: colors.accentGreen }]}>
          <Text style={[styles.sentBadgeTxt, { color: colors.accentGreen, fontFamily: FONTS.family.bold }]}>Sent</Text>
        </View>
      </View>
      </SwipeableProjectCard>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        {!showingPast ? (
          <>
            <TouchableOpacity
              style={[styles.topBtn, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
              onPress={() => setAddModalVisible(true)}
            >
              <Text style={[styles.topBtnTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>+ Add Project</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.topBtn, { borderColor: colors.border }]}
              onPress={() => setShowingPast(true)}
            >
              <Text style={[styles.topBtnTxt, { color: colors.textSecondary, fontFamily: FONTS.family.medium }]}>Past Projects</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.topBtn, { borderColor: colors.accent }]}
            onPress={() => setShowingPast(false)}
          >
            <Text style={[styles.topBtnTxt, { color: colors.accent, fontFamily: FONTS.family.medium }]}>← Current Projects</Text>
          </TouchableOpacity>
        )}
      </View>

      {showingPast ? (
        <FlatList
          data={pastProjects}
          keyExtractor={item => item.projectId}
          renderItem={renderPastProject}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="" title="No sent projects yet" subtitle="Projects you send will appear here" />
          }
        />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={item => item.id}
          renderItem={renderCurrentProject}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="" title="No active projects" subtitle={'Use \"+ Add Project\" to track a climb you want to work on'} />
          }
        />
      )}

      <AddProjectModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSaved={load}
      />

      <AddProjectModal
        visible={!!editingProject}
        onClose={() => setEditingProject(null)}
        onSaved={() => { setEditingProject(null); load(); }}
        existingProject={editingProject ?? undefined}
      />

      <ProjectDetailModal
        visible={!!detailProject}
        project={detailProject}
        refreshKey={projectsRefreshKey}
        onClose={() => setDetailProject(null)}
        onEdit={() => {
          setEditingProject(detailProject);
          setDetailProject(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1,
  },
  topBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  topBtnTxt: { fontSize: FONTS.sizes.sm },
  list: { padding: SPACING.lg },
  projectCard: {
    borderRadius: 12, borderWidth: 1, borderLeftWidth: 3,
    padding: SPACING.md, marginBottom: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
  },
  pastCard: { opacity: 0.9 },
  projectLeft: { alignItems: 'center', gap: SPACING.xs },
  projectType: { fontSize: FONTS.sizes.xs, marginTop: 4, textAlign: 'center' },
  projectCenter: { flex: 1 },
  projectName: { fontSize: FONTS.sizes.md, marginBottom: 2 },
  projectNameEmpty: { fontSize: FONTS.sizes.md, fontStyle: 'italic', marginBottom: 2 },
  projectAge: { fontSize: FONTS.sizes.xs, marginBottom: 2 },
  projectMeta: { fontSize: FONTS.sizes.xs },
  chevron: { fontSize: 22 },
  sentBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  sentBadgeTxt: { fontSize: FONTS.sizes.sm },
});
