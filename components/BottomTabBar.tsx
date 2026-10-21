import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createNewSession, getValidActiveSessionId, setActiveSessionId, triggerSessionsRefresh, triggerProjectsRefresh, triggerStatsRefresh } from '../utils/storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useNav, ScreenId } from '../utils/NavigationContext';
import { useAuth } from '../utils/AuthContext';

import { FONTS, SPACING } from '../utils/theme';
import LogClimbModal from './LogClimbModal';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// The bar floats as a rounded pill over the bottom of the screen, Strava-style,
// with content scrolling behind it. Scroll views pad their content by
// useTabBarSpace() so their last item can scroll clear of it.
const BAR_HEIGHT = 64;

// Sits down into the home-indicator area, like Strava's.
function barBottom(safeBottom: number) {
  return Math.max(safeBottom - 14, SPACING.sm);
}

export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return barBottom(insets.bottom) + BAR_HEIGHT + SPACING.md;
}

const TABS: { id: ScreenId; label: string; icon: IoniconName; iconActive: IoniconName }[] = [
  { id: 'friends',  label: 'Activity', icon: 'pulse-outline',     iconActive: 'pulse' },
  { id: 'sessions', label: 'Sessions', icon: 'list-outline',      iconActive: 'list' },
  { id: 'stats',    label: 'Stats',    icon: 'bar-chart-outline', iconActive: 'bar-chart' },
  // Icon unused — the You tab renders the user's avatar instead.
  { id: 'account',  label: 'You',      icon: 'person-outline',    iconActive: 'person' },
];

// onTabPress runs before switching tabs — PushScreen's copy of this bar uses
// it to close its page first.
export default function BottomTabBar({ onTabPress }: { onTabPress?: () => void } = {}) {
  const { colors } = useTheme();
  const { screen, returnTo, navigate } = useNav();
  // While viewing a profile opened from another tab, the screen is 'friends'
  // underneath but you're really looking at a pushed detail view — keep
  // highlighting the origin tab, since "← Back" lands you there. Only applies
  // on the 'friends' screen: returnTo is also set by navigateToSession (e.g.
  // Stats -> a session), where the current screen genuinely is the
  // destination and should be highlighted normally.
  const originScreen = (screen === 'friends' && returnTo) ? returnTo : screen;
  // Settings is reached from your profile, so it stays under the You tab.
  const activeScreen = originScreen === 'settings' ? 'account' : originScreen;
  const { avatarUrl, localAvatarUri, profileName } = useAuth();
  const avatarUri = localAvatarUri ?? avatarUrl;
  const initials = profileName
    ? profileName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const insets = useSafeAreaInsets();
  const [logModalVisible, setLogModalVisible] = useState(false);
  const sessionIdRef = useRef<string | undefined>();

  const leftTabs = TABS.slice(0, 2);
  const rightTabs = TABS.slice(2);

  // Highlight bubble behind the active tab that slides between tabs. Tabs sit
  // inside two groups either side of the +, so each tab's x within the bar is
  // its group's x plus its own x within the group.
  const groupX = useRef<Record<'left' | 'right', number>>({ left: 0, right: 0 });
  const tabX = useRef<Record<string, { group: 'left' | 'right'; x: number }>>({});
  const [tabWidth, setTabWidth] = useState(0);
  const bubbleX = useRef(new Animated.Value(0)).current;
  const bubblePlaced = useRef(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const activeIndex = TABS.findIndex(t => t.id === activeScreen);

  useEffect(() => {
    const t = tabX.current[activeScreen];
    if (!t || !tabWidth) return;
    const x = groupX.current[t.group] + t.x;
    if (!bubblePlaced.current) {
      bubbleX.setValue(x);
      bubblePlaced.current = true;
    } else {
      Animated.spring(bubbleX, { toValue: x, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
    }
  }, [activeScreen, tabWidth, layoutVersion]);

  function onGroupLayout(group: 'left' | 'right') {
    return (e: LayoutChangeEvent) => {
      groupX.current[group] = e.nativeEvent.layout.x;
      setLayoutVersion(v => v + 1);
    };
  }

  function onTabLayout(id: string, group: 'left' | 'right') {
    return (e: LayoutChangeEvent) => {
      tabX.current[id] = { group, x: e.nativeEvent.layout.x };
      setTabWidth(e.nativeEvent.layout.width);
      setLayoutVersion(v => v + 1);
    };
  }

  function renderTab(tab: typeof TABS[number], group: 'left' | 'right') {
    const active = activeScreen === tab.id;
    const showBadge = false;
    return (
      <TouchableOpacity
        key={tab.id}
        onLayout={onTabLayout(tab.id, group)}
        style={styles.tab}
        onPress={() => { onTabPress?.(); navigate(tab.id); }}
        activeOpacity={0.7}
      >
        {tab.id === 'account' ? (
          <View style={[
            styles.avatar,
            { backgroundColor: colors.accentSoft, borderColor: active ? colors.accent : 'transparent' },
          ]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitials, { color: colors.accent }]}>{initials}</Text>
            )}
          </View>
        ) : (
          <Ionicons
            name={active ? tab.iconActive : tab.icon}
            size={22}
            color={active ? colors.accent : colors.textMuted}
          />
        )}
        <Text style={[
          styles.tabLabel,
          { color: active ? colors.accent : colors.textMuted },
          active && { fontFamily: FONTS.family.bold },
        ]}>
          {tab.label}
        </Text>
        {showBadge && (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Text style={styles.badgeText}>{pendingRequestCount > 9 ? '9+' : pendingRequestCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <>
      <View style={[
        styles.bar,
        {
          // Slightly see-through, so content scrolling behind shows faintly.
          // (A true frosted blur needs a native module and an App Store build.)
          backgroundColor: colors.bgCard + 'EB',
          borderColor: colors.border,
          bottom: barBottom(insets.bottom),
        },
      ]}>
        {activeIndex >= 0 && tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.bubble, { width: tabWidth, backgroundColor: colors.bgElevated, transform: [{ translateX: bubbleX }] }]}
          />
        )}
        <View style={styles.tabGroup} onLayout={onGroupLayout('left')}>
          {leftTabs.map(t => renderTab(t, 'left'))}
        </View>

        {/* Centre FAB */}
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.accent }]}
          onPress={async () => {
            let id = await getValidActiveSessionId();
            if (!id) {
              id = await createNewSession('indoor');
              setActiveSessionId(id);
            }
            sessionIdRef.current = id;
            setLogModalVisible(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>

        <View style={styles.tabGroup} onLayout={onGroupLayout('right')}>
          {rightTabs.map(t => renderTab(t, 'right'))}
        </View>
      </View>

      <LogClimbModal
        visible={logModalVisible}
        onClose={() => { setLogModalVisible(false); sessionIdRef.current = undefined; }}
        onSaved={() => { setLogModalVisible(false); sessionIdRef.current = undefined; triggerSessionsRefresh(); triggerProjectsRefresh(); triggerStatsRefresh(); }}
        defaultSessionId={sessionIdRef.current}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 10,
  },
  tabGroup: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },
  bubble: {
    position: 'absolute',
    left: 0,
    top: 5,
    bottom: 5,
    borderRadius: 27,
  },
  tabLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginTop: 2,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Round the image itself too — the wrapper's overflow: 'hidden' clip isn't
  // reliable on device, which left the photo showing square.
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  avatarInitials: {
    fontSize: 9,
    fontFamily: FONTS.family.semibold,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: '15%',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: FONTS.family.bold,
    lineHeight: 12,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.xs,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    fontFamily: FONTS.family.regular,
    marginTop: -1,
  },
});
