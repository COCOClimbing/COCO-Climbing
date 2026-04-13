import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
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

SplashScreen.preventAutoHideAsync();

function AppShell() {
  const { colors, mode } = useTheme();
  const { screen, navigate } = useNav();
  const { user, loading, isPasswordRecovery } = useAuth();

  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // Load welcome flag once on mount
  useEffect(() => {
    hasSeenWelcome().then(seen => setWelcomeSeen(seen));
  }, []);

  // Load onboarding flag whenever user changes
  useEffect(() => {
    if (!user) {
      setOnboardingDone(null);
      return;
    }
    getOnboardingPrefs().then(prefs => setOnboardingDone(prefs !== null));
  }, [user]);

  // Wait for everything to load
  if (loading || welcomeSeen === null) return null;
  if (user && onboardingDone === null) return null;

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
function ThemedRoot({ onLayout }: { onLayout: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaProvider onLayout={onLayout}>
        <AuthProvider>
          <NavigationProvider>
            <AppShell />
          </NavigationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  const onLayout = useCallback(async () => {
    if (fontsLoaded || fontError) await SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <ThemedRoot onLayout={onLayout} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});
