import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useTabBarSpace } from './BottomTabBar';
import { useNav, ScreenId } from '../utils/NavigationContext';
import { useAuth } from '../utils/AuthContext';
import { useHeaderScrollContext } from '../utils/HeaderScroll';
import StatusBarFade from './StatusBarFade';
import PushScreen from './PushScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNewSession, getValidActiveSessionId, setActiveSessionId, triggerSessionsRefresh } from '../utils/storage';
import { FONTS, SPACING } from '../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { routeNotificationTap } from '../utils/notifications';
import { formatDistanceToNow, parseISO } from 'date-fns';

const SCREEN_TITLES: Partial<Record<ScreenId, string>> = {
  log: 'Log',
  sessions: 'Sessions',
  projects: 'Projects',
  stats: 'Stats',
  friends: 'Activity',
  account: 'Account',
  settings: 'Settings',
};

type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  sender_id: string | null;
  session_id: string | null;
};

export default function AppHeader() {
  const { colors } = useTheme();
  const nav = useNav();
  const { screen, openSettings, closeSettings, openFriends, navigateToSession } = nav;
  const { user, pendingRequestCount } = useAuth();
  const { scrollY, floating, setHeaderHeight } = useHeaderScrollContext();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  // On screens whose content runs under the header, the bar and title fade
  // out as you scroll; the round buttons stay.
  const barOpacity = floating
    ? scrollY.interpolate({ inputRange: [0, 40], outputRange: [1, 0], extrapolate: 'clamp' })
    : 1;
  const circle = [styles.circleBtn, { backgroundColor: colors.bgCard }];

  const [notifVisible, setNotifVisible] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifDaysLoaded, setNotifDaysLoaded] = useState(14);
  const [loadingMoreNotifs, setLoadingMoreNotifs] = useState(false);
  const [notifsCaughtUp, setNotifsCaughtUp] = useState(false);
  const canTriggerLoadMoreNotifsRef = useRef(true);
  const loadingMoreNotifsRef = useRef(false);
  // iOS can't present a sheet while another is still dismissing, so a tap that
  // opens the Friends sheet waits for the notifications sheet to finish closing.
  const pendingSheetTapRef = useRef<AppNotification | null>(null);

  const loadUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('read', false);
      setUnreadCount(count ?? 0);
    } catch {
      // Network failure — leave the count as-is, the next 60s poll will retry.
    }
  }, [user]);

  useEffect(() => {
    loadUnreadCount();
    // Poll for new notifications every 60s while app is open
    const interval = setInterval(loadUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  async function fetchNotifications(days: number): Promise<number> {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      const cutoff = daysAgo.toISOString();

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user!.id)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false });
      const rows = (data ?? []) as AppNotification[];
      setNotifications(rows);

      // Mark only this loaded batch as read — a notification outside the
      // currently-loaded window shouldn't be marked read before it's ever seen.
      const unreadIds = rows.filter(n => !n.read).map(n => n.id);
      if (unreadIds.length > 0) {
        await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
      }
      setUnreadCount(0);
      return rows.length;
    } catch {
      return 0;
    }
  }

  async function openNotifications() {
    setNotifVisible(true);
    setNotifLoading(true);
    setNotifDaysLoaded(14);
    setNotifsCaughtUp(false);
    canTriggerLoadMoreNotifsRef.current = true;
    await fetchNotifications(14);
    setNotifLoading(false);
  }

  async function loadMoreNotifications() {
    if (loadingMoreNotifsRef.current || !canTriggerLoadMoreNotifsRef.current) return;
    loadingMoreNotifsRef.current = true;
    canTriggerLoadMoreNotifsRef.current = false;
    setLoadingMoreNotifs(true);
    const prevCount = notifications.length;
    const next = notifDaysLoaded + 7;
    setNotifDaysLoaded(next);
    const newCount = await fetchNotifications(next);
    setNotifsCaughtUp(newCount <= prevCount);
    setLoadingMoreNotifs(false);
    loadingMoreNotifsRef.current = false;
  }

  // Same as the Sessions tab's "+ Session": reuse the open session if there
  // is one, otherwise start a new one, then show it on the Sessions tab.
  async function startSession() {
    let id = await getValidActiveSessionId();
    if (!id) {
      id = await createNewSession('indoor');
      setActiveSessionId(id);
      triggerSessionsRefresh();
    }
    navigateToSession(id);
  }

  function routeTap(n: AppNotification) {
    routeNotificationTap(nav, n.type, { senderId: n.sender_id, sessionId: n.session_id }).catch(err => {
      console.error('[notifications] Failed to resolve tap routing:', err);
    });
  }

  function handleNotificationTap(n: AppNotification) {
    setNotifVisible(false);
    if (n.type === 'follow_request' && Platform.OS === 'ios') {
      pendingSheetTapRef.current = n;
      return;
    }
    routeTap(n);
  }

  function handleNotifModalDismiss() {
    const n = pendingSheetTapRef.current;
    pendingSheetTapRef.current = null;
    if (n) routeTap(n);
  }

  function iconForType(type: string) {
    switch (type) {
      case 'like': return 'heart';
      case 'comment': return 'chatbubble';
      case 'comment_like': return 'heart';
      case 'new_follower': return 'person-add';
      case 'follow_request': return 'person-add-outline';
      case 'follow_request_accepted': return 'checkmark-circle';
      case 'session_tag': return 'flag';
      default: return 'notifications';
    }
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.bar, { backgroundColor: colors.bg, borderBottomColor: colors.border, opacity: barOpacity }]}
      />
      {floating && <StatusBarFade />}
      {/* Left side — start session + search (your profile lives in the bottom
          bar's You tab); just a back button on Settings, which isn't a tab. */}
      <View style={styles.side}>
        {screen === 'settings' ? (
          <TouchableOpacity onPress={closeSettings} activeOpacity={0.7} style={circle} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
        <View style={styles.leftGroup}>
          <TouchableOpacity onPress={startSession} activeOpacity={0.7} style={circle} accessibilityLabel="Start session">
            <Ionicons name="add" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openFriends} activeOpacity={0.7} style={circle}>
            <Ionicons name="search" size={22} color={colors.textPrimary} />
            {pendingRequestCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={styles.badgeText}>{pendingRequestCount > 9 ? '9+' : pendingRequestCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        )}
      </View>

      <Animated.Text style={[styles.title, { color: colors.textPrimary, opacity: barOpacity }]}>
        {SCREEN_TITLES[screen] ?? ''}
      </Animated.Text>

      <View style={styles.sideRight}>
        {screen === 'settings' ? null : screen === 'account' ? (
          <TouchableOpacity onPress={openSettings} activeOpacity={0.7} accessibilityLabel="Settings" style={circle}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openNotifications} activeOpacity={0.7} style={circle}>
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications page */}
      <PushScreen visible={notifVisible} title="Notifications" onBack={() => setNotifVisible(false)} onDismiss={handleNotifModalDismiss}>

          {notifLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.xl }} />
          ) : notifications.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No notifications yet.</Text>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingTop: SPACING.sm, paddingBottom: tabBarSpace }}
              scrollEventThrottle={16}
              onScroll={e => {
                const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
                if (distanceFromBottom < 200) {
                  loadMoreNotifications();
                } else {
                  canTriggerLoadMoreNotifsRef.current = true;
                }
              }}
            >
              {notifications.map(n => (
                <TouchableOpacity
                  key={n.id}
                  onPress={() => handleNotificationTap(n)}
                  activeOpacity={0.7}
                  style={[styles.notifRow, { borderBottomColor: colors.border, backgroundColor: n.read ? 'transparent' : colors.accentSoft }]}
                >
                  <View style={[styles.notifIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name={iconForType(n.type) as any} size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, { color: colors.textPrimary }]}>{n.title}</Text>
                    <Text style={[styles.notifBody, { color: colors.textSecondary }]}>{n.body}</Text>
                    <Text style={[styles.notifTime, { color: colors.textMuted }]}>
                      {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {loadingMoreNotifs && (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: SPACING.lg }} />
              )}
              {!loadingMoreNotifs && notifsCaughtUp && (
                <Text style={[styles.emptyText, { marginTop: SPACING.lg, marginVertical: SPACING.lg }]}>You're all caught up</Text>
              )}
            </ScrollView>
          )}
      </PushScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  bar: {
    borderBottomWidth: 1,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  side: {
    width: 96,
    alignItems: 'flex-start',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  sideRight: {
    width: 96,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: FONTS.family.bold, lineHeight: 12 },
  emptyText: { textAlign: 'center', marginTop: SPACING.xl, fontFamily: FONTS.family.regular },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTitle: { fontFamily: FONTS.family.semibold, fontSize: 14 },
  notifBody: { fontFamily: FONTS.family.regular, fontSize: 13, marginTop: 2 },
  notifTime: { fontFamily: FONTS.family.regular, fontSize: 12, marginTop: 4 },
});
