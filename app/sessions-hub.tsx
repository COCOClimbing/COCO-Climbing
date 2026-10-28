import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useNav } from '../utils/NavigationContext';
import { useHeaderScrollContext } from '../utils/HeaderScroll';
import { useTheme } from '../utils/ThemeContext';
import UnderlineTabs, { UnderlineTab } from '../components/UnderlineTabs';
import SessionsScreen from './sessions';
import { useTabSwipe } from '../utils/useTabSwipe';
import ProjectsScreen from './projects';

type View_ = 'sessions' | 'projects' | 'calendar';

const VIEWS: UnderlineTab<View_>[] = [
  { id: 'sessions', label: 'Sessions', icon: 'list-outline',     iconActive: 'list' },
  { id: 'projects', label: 'Projects', icon: 'flag-outline',     iconActive: 'flag' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar-outline', iconActive: 'calendar' },
];

// The Sessions tab: a Strava-style underlined toggle between the sessions
// list, projects (which no longer have their own bottom tab) and a calendar.
export default function SessionsHub() {
  const { pendingSessionId } = useNav();
  const { headerHidden } = useHeaderScrollContext();
  const { colors } = useTheme();
  const [view, setView] = useState<View_>('sessions');
  // Swipe sideways to move between Sessions / Projects / Calendar (off while a
  // session's detail view is open, which hides the tabs)
  const tabSwipe = useTabSwipe<View_>(VIEWS.map(v => v.id), view, setView, !headerHidden);

  // Jumping to a specific session (e.g. from Stats) must land on the sessions view.
  useEffect(() => {
    if (pendingSessionId) setView('sessions');
  }, [pendingSessionId]);

  return (
    <View style={styles.root} {...tabSwipe.panHandlers}>
      {/* Hidden while a session's detail view fills the screen. */}
      {/* Soft shadow (matching the header's round buttons) so the list
          scrolls visibly underneath the pinned toggle. */}
      {!headerHidden && (
        <View style={[styles.tabsBar, { backgroundColor: colors.bg }]}>
          <UnderlineTabs<View_> tabs={VIEWS} value={view} onChange={setView} />
        </View>
      )}
      <Animated.View style={[styles.root, tabSwipe.slideStyle]}>
        {/* Sessions and Calendar are one SessionsScreen instance, so switching
            between them keeps its loaded data. */}
        {view === 'projects'
          ? <ProjectsScreen />
          : <SessionsScreen calendarMode={view === 'calendar'} onShowList={() => setView('sessions')} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsBar: {
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
});
