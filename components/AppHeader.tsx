import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useNav, ScreenId } from '../utils/NavigationContext';
import { useAuth } from '../utils/AuthContext';
import { FONTS, SPACING } from '../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
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
  const { screen, navigate, openSettings, openFriends } = useNav();
  const { user, pendingRequestCount, avatarUrl, localAvatarUri, profileName } = useAuth();
  const initials = profileName
    ? profileName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const [notifVisible, setNotifVisible] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('read', false);
    setUnreadCount(count ?? 0);
  }, [user]);

  useEffect(() => {
    loadUnreadCount();
    // Poll for new notifications every 60s while app is open
    const interval = setInterval(loadUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  async function openNotifications() {
    setNotifVisible(true);
    setNotifLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as AppNotification[]);
    setNotifLoading(false);

    // Mark all as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', user!.id)
      .eq('read', false);
    setUnreadCount(0);
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
    <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
      {/* Left side — profile avatar + search icon */}
      <View style={styles.side}>
        <View style={styles.leftGroup}>
          <TouchableOpacity onPress={() => navigate('account')} activeOpacity={0.7}>
            <View style={[styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
              {(localAvatarUri ?? avatarUrl) ? (
                <Image source={{ uri: localAvatarUri ?? avatarUrl! }} style={styles.avatarImage} />
              ) : (
                <Text style={[styles.avatarInitials, { color: colors.accent }]}>{initials}</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={openFriends} activeOpacity={0.7} style={styles.searchBtn}>
            <Ionicons name="search" size={24} color={colors.textPrimary} />
            {pendingRequestCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={styles.badgeText}>{pendingRequestCount > 9 ? '9+' : pendingRequestCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {SCREEN_TITLES[screen] ?? ''}
      </Text>

      <View style={styles.sideRight}>
        {screen === 'account' ? (
          <TouchableOpacity onPress={openSettings} style={[styles.pill, { borderColor: colors.border }]} activeOpacity={0.7}>
            <Text style={[styles.pillText, { color: colors.textPrimary }]}>Settings</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openNotifications} activeOpacity={0.7} style={styles.bellBtn}>
            <Ionicons name="notifications" size={24} color={colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications modal */}
      <Modal visible={notifVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNotifVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Notifications</Text>
            <TouchableOpacity onPress={() => setNotifVisible(false)} activeOpacity={0.7}>
              <Text style={{ color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </View>

          {notifLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.xl }} />
          ) : notifications.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No notifications yet.</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingVertical: SPACING.sm }}>
              {notifications.map(n => (
                <View
                  key={n.id}
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
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  side: {
    width: 80,
    alignItems: 'flex-start',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  searchBtn: {
    position: 'relative',
  },
  bellBtn: {
    position: 'relative',
  },
  sideRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarInitials: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  pill: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  pillText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.semibold },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: FONTS.family.bold, lineHeight: 12 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold },
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
