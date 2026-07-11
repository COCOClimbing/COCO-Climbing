import React, { createContext, useContext, useState } from 'react';

export type ScreenId = 'log' | 'sessions' | 'projects' | 'stats' | 'friends' | 'settings' | 'account' | 'login' | 'welcome' | 'onboarding';

export interface PendingFriendProfile {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  hometown?: string | null;
  is_private?: boolean;
}

interface NavContextType {
  screen: ScreenId;
  drawerOpen: boolean;
  returnTo: ScreenId | null;
  settingsOpen: boolean;
  friendsOpen: boolean;
  navCount: number;
  tabResetCount: Record<string, number>;
  pendingFriendProfile: PendingFriendProfile | null;
  pendingSessionId: string | null;
  pendingActivitySessionId: string | null;
  navigate: (screen: ScreenId) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setReturnTo: (screen: ScreenId | null) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openFriends: () => void;
  closeFriends: () => void;
  viewFriendProfile: (profile: PendingFriendProfile) => void;
  clearPendingFriendProfile: () => void;
  navigateToSession: (sessionId: string) => void;
  clearPendingSessionId: () => void;
  viewActivitySession: (sessionId: string) => void;
  clearPendingActivitySessionId: () => void;
}

const NavContext = createContext<NavContextType>({
  screen: 'friends',
  drawerOpen: false,
  returnTo: null,
  settingsOpen: false,
  friendsOpen: false,
  navCount: 0,
  tabResetCount: {},
  pendingFriendProfile: null,
  pendingSessionId: null,
  pendingActivitySessionId: null,
  navigate: () => {},
  openDrawer: () => {},
  closeDrawer: () => {},
  setReturnTo: () => {},
  openSettings: () => {},
  closeSettings: () => {},
  openFriends: () => {},
  closeFriends: () => {},
  viewFriendProfile: () => {},
  clearPendingFriendProfile: () => {},
  navigateToSession: () => {},
  clearPendingSessionId: () => {},
  viewActivitySession: () => {},
  clearPendingActivitySessionId: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<ScreenId>('friends');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [returnTo, setReturnTo] = useState<ScreenId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [navCount, setNavCount] = useState(0);
  const [tabResetCount, setTabResetCount] = useState<Record<string, number>>({});
  const [pendingFriendProfile, setPendingFriendProfile] = useState<PendingFriendProfile | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingActivitySessionId, setPendingActivitySessionId] = useState<string | null>(null);

  function navigate(s: ScreenId) {
    if (s === screen) {
      setTabResetCount(prev => ({ ...prev, [s]: (prev[s] ?? 0) + 1 }));
    } else {
      setScreen(s);
      setDrawerOpen(false);
      setNavCount(c => c + 1);
    }
  }

  function openFriends() {
    setFriendsOpen(true);
  }

  function closeFriends() {
    setFriendsOpen(false);
  }

  function viewFriendProfile(profile: PendingFriendProfile) {
    if (screen !== 'friends') setReturnTo(screen);
    setPendingFriendProfile(profile);
    setScreen('friends');
    setDrawerOpen(false);
    setNavCount(c => c + 1);
  }

  function clearPendingFriendProfile() {
    setPendingFriendProfile(null);
  }

  function navigateToSession(sessionId: string) {
    setPendingSessionId(sessionId);
    setReturnTo(screen);
    setScreen('sessions');
    setDrawerOpen(false);
    setNavCount(c => c + 1);
  }

  function clearPendingSessionId() {
    setPendingSessionId(null);
  }

  function viewActivitySession(sessionId: string) {
    setPendingActivitySessionId(sessionId);
    setScreen('friends');
    setDrawerOpen(false);
    setNavCount(c => c + 1);
  }

  function clearPendingActivitySessionId() {
    setPendingActivitySessionId(null);
  }

  return (
    <NavContext.Provider value={{
      screen,
      drawerOpen,
      returnTo,
      settingsOpen,
      friendsOpen,
      navCount,
      tabResetCount,
      pendingFriendProfile,
      pendingSessionId,
      pendingActivitySessionId,
      navigate,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      setReturnTo,
      openSettings: () => setScreen('settings'),
      closeSettings: () => setScreen('account'),
      openFriends,
      closeFriends,
      viewFriendProfile,
      clearPendingFriendProfile,
      navigateToSession,
      clearPendingSessionId,
      viewActivitySession,
      clearPendingActivitySessionId,
    }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  return useContext(NavContext);
}
