import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import PushScreen from './PushScreen';
import ActivityCard from './ActivityCard';
import { PhotoClipContext } from './PhotoViewer';
import { useTabBarSpace } from './BottomTabBar';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { FONTS, SPACING, convertGrade } from '../utils/theme';
import { getPreferredDisplayGrades } from '../utils/storage';
import { getAdminFeedPage, AdminFeedEntry, AdminFeedCursor } from '../utils/adminApi';

const BOULDER_SYSTEMS = new Set(['v-scale', 'font']);

// Admins only: every session from every user, newest first, private accounts
// included. View-only — the cards hide like/comment/share and the comment
// threads have no comment box. Opened from the Activity header.
export default function AdminFeedScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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

  return (
    <PushScreen visible={visible} title="All sessions" subtitle="Admin · view only" onBack={onClose}>
      {loading && entries.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.xl }} />
      ) : error ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>{error}</Text>
      ) : entries.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No sessions yet.</Text>
      ) : (
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
      )}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: SPACING.xl, fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
});
