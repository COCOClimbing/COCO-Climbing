import React, { createContext, useContext, useState } from 'react';

export type ScreenId = 'log' | 'sessions' | 'projects' | 'stats' | 'friends' | 'settings' | 'account' | 'login' | 'welcome' | 'onboarding';

interface NavContextType {
  screen: ScreenId;
  drawerOpen: boolean;
  returnTo: ScreenId | null;
  settingsOpen: boolean;
  friendsOpen: boolean;
  navCount: number;
  navigate: (screen: ScreenId) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setReturnTo: (screen: ScreenId | null) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openFriends: () => void;
  closeFriends: () => void;
}

const NavContext = createContext<NavContextType>({
  screen: 'friends',
  drawerOpen: false,
  returnTo: null,
  settingsOpen: false,
  friendsOpen: false,
  navCount: 0,
  navigate: () => {},
  openDrawer: () => {},
  closeDrawer: () => {},
  setReturnTo: () => {},
  openSettings: () => {},
  closeSettings: () => {},
  openFriends: () => {},
  closeFriends: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<ScreenId>('friends');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [returnTo, setReturnTo] = useState<ScreenId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [navCount, setNavCount] = useState(0);

  function navigate(s: ScreenId) {
    setScreen(s);
    setDrawerOpen(false);
    setNavCount(c => c + 1);
  }

  function openFriends() {
    setFriendsOpen(true);
  }

  function closeFriends() {
    setFriendsOpen(false);
  }

  return (
    <NavContext.Provider value={{
      screen,
      drawerOpen,
      returnTo,
      settingsOpen,
      friendsOpen,
      navCount,
      navigate,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      setReturnTo,
      openSettings: () => setScreen('settings'),
      closeSettings: () => setScreen('account'),
      openFriends,
      closeFriends,
    }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  return useContext(NavContext);
}
