import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, TouchableWithoutFeedback, Image
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useNav, ScreenId } from '../utils/NavigationContext';
import { useAuth } from '../utils/AuthContext';
import { FONTS, SPACING } from '../utils/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = 260;

const NAV_ITEMS: { id: ScreenId; icon: string; label: string }[] = [
  { id: 'sessions', icon: '', label: 'Sessions' },
  { id: 'projects', icon: '', label: 'Projects' },
  { id: 'stats',    icon: '', label: 'Stats' },
  { id: 'friends',  icon: '', label: 'Activity' },
  { id: 'account',  icon: '', label: 'Account' },
];

export default function SideDrawer() {
  const { colors } = useTheme();
  const { screen, drawerOpen, navigate, closeDrawer } = useNav();
  const { pendingRequestCount, avatarUrl } = useAuth();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: drawerOpen ? 0 : -DRAWER_WIDTH,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }),
      Animated.timing(overlayOpacity, {
        toValue: drawerOpen ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [drawerOpen]);

  if (!drawerOpen) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim overlay */}
      <TouchableWithoutFeedback onPress={closeDrawer}>
        <Animated.View
          style={[
            styles.overlay,
            { opacity: overlayOpacity },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: colors.drawerBg,
            borderRightColor: colors.border,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* App name */}
        <View style={styles.drawerHeader}>
          <Text style={[styles.appName, { color: colors.accent }]}>COCO</Text>
          <Text style={[styles.appTagline, { color: colors.textMuted }]}>Climbing Tracker</Text>
        </View>

        {/* Nav items */}
        <View style={styles.navList}>
          {NAV_ITEMS.map(item => {
            const active = screen === item.id;
            const showBadge = item.id === 'friends' && pendingRequestCount > 0;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.navItem,
                  active && { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
                  !active && { borderLeftColor: 'transparent' },
                ]}
                onPress={() => navigate(item.id)}
                activeOpacity={0.7}
              >
                {item.id === 'account' && avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={[styles.avatar, { borderColor: active ? colors.accent : colors.border }]} />
                ) : item.id === 'account' && !avatarUrl ? (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.accentSoft, borderColor: active ? colors.accent : colors.border }]}>
                    <Text style={[styles.avatarInitial, { color: colors.accent }]}>J</Text>
                  </View>
                ) : (
                  <Text style={styles.navIcon}>{item.icon}</Text>
                )}
                <View style={styles.navLabelRow}>
                  <Text style={[
                    styles.navLabel,
                    { color: active ? colors.accent : colors.textSecondary },
                    active && { fontFamily: FONTS.family.bold },
                  ]}>
                    {item.label}
                  </Text>
                  {showBadge && (
                    <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                      <Text style={styles.badgeText}>
                        {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Close hint */}
        <TouchableOpacity onPress={closeDrawer} style={styles.closeHint}>
          <Text style={[styles.closeHintText, { color: colors.textMuted }]}>  Close</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    borderRightWidth: 1,
    paddingTop: 60,
    paddingBottom: 40,
  },
  drawerHeader: {
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xxl,
  },
  appName: {
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.family.heavy,
    letterSpacing: 4,
  },
  appTagline: {
    fontSize: FONTS.sizes.xs,
    letterSpacing: 1,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  navList: {
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderLeftWidth: 3,
    marginBottom: 2,
    gap: SPACING.md,
  },
  navIcon: { fontSize: 20 },
  navLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  navLabel: {
    fontSize: FONTS.sizes.md,
    letterSpacing: 0.3,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
    lineHeight: 14,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    marginLeft: 8,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
  },
  closeHint: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  closeHintText: {
    fontSize: FONTS.sizes.sm,
  },
});
