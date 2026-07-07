import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../utils/supabase';

Sentry.init({
  dsn: 'https://83a0125fccfc61e3326563839294f07e@o4511210669801472.ingest.us.sentry.io/4511210674126848',
  tracesSampleRate: 0.2,
});
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from '../utils/ThemeContext';
import { NavigationProvider, useNav } from '../utils/NavigationContext';
import { AuthProvider, useAuth } from '../utils/AuthContext';
import AppHeader from '../components/AppHeader';
import BottomTabBar from '../components/BottomTabBar';
import ResetPasswordScreen from './reset-password';

import LogScreen from './index';
import SessionsScreen from './sessions';
import ProjectsScreen from './projects';
import StatsScreen from './stats';
import SettingsScreen from './settings';
import LoginScreen from './login';
import AccountScreen from './account';
import FriendsScreen from './friends';
import WelcomeScreen, { hasSeenWelcome } from './welcome';
import OnboardingScreen, { getOnboardingPrefs } from './onboarding';
import { getCloudProfile } from '../utils/cloudSync';
import { registerForPushNotifications, useNotificationTapRouting } from '../utils/notifications';

SplashScreen.preventAutoHideAsync();

async function checkAndApplyUpdate() {
  if (__DEV__) return;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (e) {
    Sentry.captureException(e);
  }
}

function AppShell({ onReady }: { onReady: () => void }) {
  const { colors, mode } = useTheme();
  const { screen, navigate } = useNav();
  const { user, loading, isPasswordRecovery } = useAuth();
  useNotificationTapRouting();

  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const readyCalled = React.useRef(false);

  // Check for OTA update 3s after mount to avoid any startup conflicts
  useEffect(() => {
    const t = setTimeout(checkAndApplyUpdate, 3000);
    return () => clearTimeout(t);
  }, []);

  // Load welcome flag once on mount
  useEffect(() => {
    hasSeenWelcome().then(seen => setWelcomeSeen(seen));
  }, []);

  // Register push notifications whenever a user logs in
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId) {
      registerForPushNotifications(userId).catch(() => {});
    }
  }, [userId]);

  // Load onboarding flag whenever user ID changes
  useEffect(() => {
    if (!userId) {
      setOnboardingDone(null);
      return;
    }
    async function checkOnboarding() {
      const profile = await getCloudProfile(userId!);
      // Treat as onboarded if the flag is set OR if the profile already exists
      // (covers users created before the onboarded column was added)
      if (profile?.onboarded || profile?.name) {
        setOnboardingDone(true);
        return;
      }
      // Fall back to local AsyncStorage (covers offline / new signup case)
      const prefs = await getOnboardingPrefs();
      setOnboardingDone(prefs !== null);
    }
    checkOnboarding();
  }, [userId]);

  // Handle deep links for password reset
  useEffect(() => {
    function handleUrl(url: string) {
      if (!url.startsWith('coco://')) return;
      // Parse the fragment — Supabase puts tokens after '#'
      const fragment = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? '';
      const params = Object.fromEntries(new URLSearchParams(fragment));
      if (params.access_token && params.refresh_token) {
        supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
      }
    }

    // App opened from a link while closed
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });

    // App already open, link tapped
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // Wait for everything to load
  const isReady = !loading && welcomeSeen !== null && (!user || onboardingDone !== null);
  useEffect(() => {
    if (isReady && !readyCalled.current) {
      readyCalled.current = true;
      onReady();
    }
  }, [isReady]);

  if (!isReady) return null;

  const statusBarStyle = mode === 'dark' ? 'light' : 'dark';

  if (isPasswordRecovery) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <StatusBar style={statusBarStyle} />
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <ResetPasswordScreen />
        </SafeAreaView>
      </View>
    );
  }

  // Not logged in → welcome (first launch) or login
  if (!user) {
    return (
      <View style={styles.root}>
        <StatusBar style={statusBarStyle} />
        {welcomeSeen ? <LoginScreen /> : <WelcomeScreen onDone={() => setWelcomeSeen(true)} />}
      </View>
    );
  }

  // Logged in, onboarding not done yet
  if (!onboardingDone) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <StatusBar style={statusBarStyle} />
        <SafeAreaView style={styles.root} edges={['top']}>
          <OnboardingScreen onDone={() => setOnboardingDone(true)} />
        </SafeAreaView>
      </View>
    );
  }

  // Main app
  const renderScreen = () => {
    switch (screen) {
      case 'log':      return <LogScreen />;
      case 'sessions': return <SessionsScreen />;
      case 'projects': return <ProjectsScreen />;
      case 'stats':    return <StatsScreen />;
      case 'settings': return <SettingsScreen />;
      case 'friends':  return <FriendsScreen />;
      case 'account':  return <AccountScreen />;
      default:         return <LogScreen />;
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar style={statusBarStyle} />
      <SafeAreaView style={styles.root} edges={['top']}>
        <AppHeader />
        <View style={[styles.body, { backgroundColor: colors.bg }]}>
          {screen !== 'friends' && renderScreen()}
          <FriendsScreen />
        </View>
        <BottomTabBar />
      </SafeAreaView>
    </View>
  );
}

// Inner component that has theme access and wraps SafeAreaProvider with the correct bg
function ThemedRoot({ onReady }: { onReady: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationProvider>
            <AppShell onReady={onReady} />
          </NavigationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </View>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
    'OilvareBase-Regular': require('../assets/fonts/OilvareBase-Regular.ttf'),
  });
  const [fontTimedOut, setFontTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, []);

  // Absolute last-resort: hide splash after 12s no matter what
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 12000);
    return () => clearTimeout(t);
  }, []);

  const handleReady = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  if (!fontsLoaded && !fontError && !fontTimedOut) return null;

  return (
    <ThemeProvider>
      <ThemedRoot onReady={handleReady} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});

export default Sentry.wrap(RootLayout);
