import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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
import SideDrawer from '../components/SideDrawer';
import ResetPasswordScreen from './reset-password';

import LogScreen from './index';
import SessionsScreen from './sessions';
import ProjectsScreen from './projects';
import StatsScreen from './stats';
import SettingsScreen from './settings';
import LoginScreen from './login';
import AccountScreen from './account';
import FriendsScreen from './friends';

SplashScreen.preventAutoHideAsync();

function AppShell() {
  const { colors } = useTheme();
  const { screen } = useNav();
  const { isPasswordRecovery } = useAuth();

  // Show password reset screen when recovery link is clicked
  if (isPasswordRecovery) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top']}>
        <ResetPasswordScreen />
      </SafeAreaView>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case 'log':      return <LogScreen />;
      case 'sessions': return <SessionsScreen />;
      case 'projects': return <ProjectsScreen />;
      case 'stats':    return <StatsScreen />;
      case 'settings': return <SettingsScreen />;
      case 'friends':  return <FriendsScreen />;
      case 'login':    return <LoginScreen />;
      case 'account':  return <AccountScreen />;
    }
  };

  // Login screen gets full screen without header/drawer
  if (screen === 'login') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top']}>
        <LoginScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top']}>
      <AppHeader />
      <View style={[styles.body, { backgroundColor: colors.bg }]}>
        {renderScreen()}
      </View>
      <SideDrawer />
    </SafeAreaView>
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
    <SafeAreaProvider onLayout={onLayout}>
      <AuthProvider>
        <ThemeProvider>
          <NavigationProvider>
            <AppShell />
          </NavigationProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});
