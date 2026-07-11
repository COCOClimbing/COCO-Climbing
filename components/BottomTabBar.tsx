import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createNewSession, getValidActiveSessionId, setActiveSessionId, triggerSessionsRefresh, triggerProjectsRefresh, triggerStatsRefresh } from '../utils/storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useNav, ScreenId } from '../utils/NavigationContext';

import { FONTS, SPACING } from '../utils/theme';
import LogClimbModal from './LogClimbModal';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { id: ScreenId; label: string; icon: IoniconName; iconActive: IoniconName }[] = [
  { id: 'friends',  label: 'Activity', icon: 'pulse-outline',     iconActive: 'pulse' },
  { id: 'sessions', label: 'Sessions', icon: 'calendar-outline',  iconActive: 'calendar' },
  { id: 'projects', label: 'Projects', icon: 'flag-outline',      iconActive: 'flag' },
  { id: 'stats',    label: 'Stats',    icon: 'bar-chart-outline', iconActive: 'bar-chart' },
];

export default function BottomTabBar() {
  const { colors } = useTheme();
  const { screen, returnTo, navigate } = useNav();
  // While viewing a profile opened from another tab, the screen is 'friends'
  // underneath but you're really looking at a pushed detail view — keep
  // highlighting the origin tab, since "← Back" lands you there. Only applies
  // on the 'friends' screen: returnTo is also set by navigateToSession (e.g.
  // Stats -> a session), where the current screen genuinely is the
  // destination and should be highlighted normally.
  const activeScreen = (screen === 'friends' && returnTo) ? returnTo : screen;

  const insets = useSafeAreaInsets();
  const [logModalVisible, setLogModalVisible] = useState(false);
  const sessionIdRef = useRef<string | undefined>();

  const leftTabs = TABS.slice(0, 2);
  const rightTabs = TABS.slice(2);

  function renderTab(tab: typeof TABS[number]) {
    const active = activeScreen === tab.id;
    const showBadge = false;
    return (
      <TouchableOpacity
        key={tab.id}
        style={styles.tab}
        onPress={() => navigate(tab.id)}
        activeOpacity={0.7}
      >
        {active && <View style={[styles.activeBar, { backgroundColor: colors.accent }]} />}
        <Ionicons
          name={active ? tab.iconActive : tab.icon}
          size={22}
          color={active ? colors.accent : colors.textMuted}
        />
        <Text style={[
          styles.tabLabel,
          { color: active ? colors.accent : colors.textMuted },
          active && { fontFamily: FONTS.family.semibold },
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
          backgroundColor: colors.drawerBg,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom || SPACING.sm,
        },
      ]}>
        <View style={styles.tabGroup}>
          {leftTabs.map(renderTab)}
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

        <View style={styles.tabGroup}>
          {rightTabs.map(renderTab)}
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
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 4,
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },
  tabLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginTop: 2,
  },
  activeBar: {
    position: 'absolute',
    top: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
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
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    fontFamily: FONTS.family.regular,
    marginTop: -1,
  },
});
