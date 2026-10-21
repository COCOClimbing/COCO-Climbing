import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNav } from '../utils/NavigationContext';
import { useHeaderScrollContext } from '../utils/HeaderScroll';
import UnderlineTabs, { UnderlineTab } from '../components/UnderlineTabs';
import SessionsScreen from './sessions';
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
  const [view, setView] = useState<View_>('sessions');

  // Jumping to a specific session (e.g. from Stats) must land on the sessions view.
  useEffect(() => {
    if (pendingSessionId) setView('sessions');
  }, [pendingSessionId]);

  return (
    <View style={styles.root}>
      {/* Hidden while a session's detail view fills the screen. */}
      {!headerHidden && <UnderlineTabs<View_> tabs={VIEWS} value={view} onChange={setView} />}
      <View style={styles.root}>
        {/* Sessions and Calendar are one SessionsScreen instance, so switching
            between them keeps its loaded data. */}
        {view === 'projects'
          ? <ProjectsScreen />
          : <SessionsScreen calendarMode={view === 'calendar'} onShowList={() => setView('sessions')} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
