import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Text, ActivityIndicator, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { formatDistanceToNow, parseISO } from 'date-fns';
import PushScreen from './PushScreen';
import ActivityCard from './ActivityCard';
import Avatar from './Avatar';
import UnderlineTabs, { UnderlineTab } from './UnderlineTabs';
import { PhotoClipContext } from './PhotoViewer';
import { useTabBarSpace } from './BottomTabBar';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { useNav, AdminView } from '../utils/NavigationContext';
import { FONTS, SPACING, convertGrade } from '../utils/theme';
import { getPreferredDisplayGrades } from '../utils/storage';
import {
  getAdminFeedPage, AdminFeedEntry, AdminFeedCursor,
  getAdminReports, setReportResolved, AdminReport,
} from '../utils/adminApi';

const BOULDER_SYSTEMS = new Set(['v-scale', 'font']);

const TABS: UnderlineTab<AdminView>[] = [
  { id: 'sessions', label: 'Sessions', icon: 'list-outline', iconActive: 'list' },
  { id: 'reports',  label: 'Reports',  icon: 'flag-outline', iconActive: 'flag' },
];

type ProfileRef = { id: string; name: string; username: string; avatar_url: string | null };

// Admins only (mounted from the root layout when isAdmin). Two tabs:
// Sessions — every user's sessions, private accounts included, view-only.
// Reports — content reports, newest first, with resolve/reopen.
// Opened from the Activity header's shield, or a "New report" notification.
export default function AdminFeedScreen() {
  const nav = useNav();
  const { adminView, closeAdmin, openAdmin, viewFriendProfile } = nav;
  const visible = adminView !== null;
  // Keeps the last tab while the page slides out.
  const [tab, setTab] = useState<AdminView>('sessions');
  useEffect(() => { if (adminView) setTab(adminView); }, [adminView]);

  // A profile opens only after this page has slid away (opening one modal
  // while another closes froze the app before).
  const pendingProfile = useRef<ProfileRef | null>(null);
  function openProfile(p: ProfileRef) {
    pendingProfile.current = p;
    closeAdmin();
  }
  function handleDismiss() {
    const p = pendingProfile.current;
    pendingProfile.current = null;
    if (p) viewFriendProfile(p);
  }

  return (
    <PushScreen visible={visible} title="Admin" subtitle={tab === 'sessions' ? 'View only' : undefined} onBack={closeAdmin} onDismiss={handleDismiss}>
      <UnderlineTabs tabs={TABS} value={tab} onChange={id => openAdmin(id)} />
      {tab === 'sessions' ? <SessionsTab visible={visible} /> : <ReportsTab visible={visible} onOpenProfile={openProfile} />}
    </PushScreen>
  );
}

function SessionsTab({ visible }: { visible: boolean }) {
  const { colors } = useTheme();
  const { user, avatarUrl, localAvatarUri } = useAuth();
  const tabBarSpace = useTabBarSpace();
  const scrollRef = useRef<ScrollView>(null);

  const [entries, setEntries] = useState<AdminFeedEntry[]>([]);
  const [cursor, setCursor] = useState<AdminFeedCursor>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const [prefs, setPrefs] = useState({ boulder: 'v-scale', rope: 'yds' });

  useEffect(() => {
    getPreferredDisplayGrades().then(setPrefs).catch(() => {});
  }, []);

  function displayGrade(grade: string | null, fromSystem: string | null): string {
    if (!grade || !fromSystem) return grade ?? '—';
    return convertGrade(grade, fromSystem, BOULDER_SYSTEMS.has(fromSystem) ? prefs.boulder : prefs.rope);
  }

  async function loadFirst() {
    setLoading(true);
    setError(null);
    try {
      const page = await getAdminFeedPage(null);
      setEntries(page.entries);
      setCursor(page.nextCursor);
      setDone(!page.nextCursor);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load sessions.');
    }
    setLoading(false);
  }

  async function loadMore() {
    if (done || !cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getAdminFeedPage(cursor);
      setEntries(prev => {
        const seen = new Set(prev.map(e => e.summary.sessionId));
        return [...prev, ...page.entries.filter(e => !seen.has(e.summary.sessionId))];
      });
      setCursor(page.nextCursor);
      setDone(!page.nextCursor);
    } catch {}
    setLoadingMore(false);
    loadingMoreRef.current = false;
  }

  // Fresh list every time the page opens.
  useEffect(() => {
    if (visible) loadFirst();
  }, [visible]);

  if (loading && entries.length === 0) return <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.xl }} />;
  if (error) return <Text style={[styles.empty, { color: colors.textMuted }]}>{error}</Text>;
  if (entries.length === 0) return <Text style={[styles.empty, { color: colors.textMuted }]}>No sessions yet.</Text>;

  return (
    <PhotoClipContext.Provider value={scrollRef}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: tabBarSpace }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadFirst} />}
        scrollEventThrottle={16}
        onScroll={e => {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          if (contentSize.height - contentOffset.y - layoutMeasurement.height < 400) loadMore();
        }}
      >
        {entries.map(e => (
          <ActivityCard
            key={e.summary.sessionId}
            entry={e.summary}
            colors={colors}
            currentUserId={user?.id}
            myAvatar={localAvatarUri ?? avatarUrl}
            daysBack={0}
            displayGrade={displayGrade}
            onShare={() => {}}
            onViewProfile={() => {}}
            readOnly={{
              climbs: e.climbs,
              likes: e.likes,
              comments: e.comments,
              commentLikes: e.commentLikes,
              isPrivateAccount: e.isPrivate,
            }}
          />
        ))}
        {loadingMore && <ActivityIndicator color={colors.accent} style={{ marginVertical: SPACING.lg }} />}
        {done && <Text style={[styles.empty, { color: colors.textMuted, marginVertical: SPACING.lg }]}>That's every session</Text>}
      </ScrollView>
    </PhotoClipContext.Provider>
  );
}

const TYPE_LABEL: Record<AdminReport['content_type'], string> = { session: 'Session', comment: 'Comment', user: 'Account' };

function personLabel(p: AdminReport['reporter']): string {
  if (!p) return 'Deleted user';
  return p.username ? `@${p.username}` : (p.name ?? 'Unknown');
}

function ReportsTab({ visible, onOpenProfile }: { visible: boolean; onOpenProfile: (p: ProfileRef) => void }) {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(includeResolved = showResolved) {
    setLoading(true);
    setError(null);
    try {
      setReports(await getAdminReports(includeResolved));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load reports.');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  async function toggleResolved(r: AdminReport) {
    const resolve = !r.resolved_at;
    setBusyId(r.id);
    try {
      await setReportResolved(r.id, resolve);
      setReports(prev => showResolved
        ? prev.map(x => x.id === r.id ? { ...x, resolved_at: resolve ? new Date().toISOString() : null } : x)
        : prev.filter(x => x.id !== r.id));
    } catch {
      Alert.alert('Error', 'Could not update the report. Please try again.');
    }
    setBusyId(null);
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: tabBarSpace }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
    >
      <View style={styles.filterRow}>
        {([false, true] as const).map(v => {
          const active = showResolved === v;
          return (
            <TouchableOpacity
              key={String(v)}
              onPress={() => { setShowResolved(v); load(v); }}
              activeOpacity={0.7}
              style={[styles.chip, { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : 'transparent' }]}
            >
              <Text style={[styles.chipText, { color: active ? colors.accent : colors.textSecondary }]}>{v ? 'All' : 'Open'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && reports.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.xl }} />
      ) : error ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>{error}</Text>
      ) : reports.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>{showResolved ? 'No reports yet.' : 'No open reports.'}</Text>
      ) : reports.map(r => {
        const reported = r.reported;
        const preview =
          r.content_type === 'comment' ? (
            r.comment ? `“${r.comment.text}”`
            : r.comment_snapshot ? `“${r.comment_snapshot.text}” (deleted since)`
            : 'Comment was deleted') :
          r.content_type === 'session' ? (r.session
            ? [r.session.title?.trim() || 'Untitled session', r.session.notes?.trim()].filter(Boolean).join(' — ') + (r.session.deleted ? ' (deleted)' : '')
            : 'Session was deleted') :
          null;
        return (
          <View key={r.id} style={[styles.report, { borderColor: colors.border, backgroundColor: colors.bgCard, opacity: r.resolved_at ? 0.6 : 1 }]}>
            <View style={styles.reportTop}>
              <Text style={[styles.reason, { color: colors.textPrimary }]}>{r.reason}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {TYPE_LABEL[r.content_type]} · {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.person}
              activeOpacity={0.7}
              disabled={!reported}
              onPress={() => reported && onOpenProfile({ id: reported.id, name: reported.name ?? 'Unknown', username: reported.username ?? '', avatar_url: reported.avatar_url })}
            >
              <Avatar name={reported?.name ?? '?'} avatarUrl={reported?.avatar_url ?? null} size={32} backgroundColor={colors.accentSoft} textColor={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.personName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {reported?.name ?? 'Deleted user'} <Text style={{ color: colors.textMuted }}>{reported?.username ? `@${reported.username}` : ''}</Text>
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>Reported by {personLabel(r.reporter)}</Text>
              </View>
            </TouchableOpacity>

            {preview ? (
              <Text style={[styles.preview, { color: colors.textSecondary, borderLeftColor: colors.border }]} numberOfLines={4}>{preview}</Text>
            ) : null}

            <View style={styles.actions}>
              {reported && (
                <TouchableOpacity
                  onPress={() => onOpenProfile({ id: reported.id, name: reported.name ?? 'Unknown', username: reported.username ?? '', avatar_url: reported.avatar_url })}
                  activeOpacity={0.7}
                  style={[styles.btn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.btnText, { color: colors.textPrimary }]}>View profile</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => toggleResolved(r)}
                disabled={busyId === r.id}
                activeOpacity={0.7}
                style={[styles.btn, r.resolved_at ? { borderColor: colors.border } : { borderColor: colors.accent, backgroundColor: colors.accent }]}
              >
                {busyId === r.id
                  ? <ActivityIndicator size="small" color={r.resolved_at ? colors.textPrimary : '#fff'} />
                  : <Text style={[styles.btnText, { color: r.resolved_at ? colors.textPrimary : '#fff' }]}>{r.resolved_at ? 'Reopen' : 'Resolve'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: SPACING.xl, fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  chipText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  report: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm },
  reportTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACING.sm },
  reason: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold, flexShrink: 1 },
  meta: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  personName: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  preview: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, borderLeftWidth: 3, paddingLeft: SPACING.sm, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  btn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
});
