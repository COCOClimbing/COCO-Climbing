import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useNav } from '../utils/NavigationContext';
import { useAuth } from '../utils/AuthContext';
import { isUsernameAvailable } from '../utils/friendsApi';
import { FONTS, SPACING } from '../utils/theme';
import { supabase } from '../utils/supabase';

type Tab = 'login' | 'signup';

export default function LoginScreen() {
  const { colors } = useTheme();
  const { navigate, returnTo, setReturnTo } = useNav();
  const { signIn, signUp } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign up fields
  const [signupName, setSignupName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  // Username availability
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!signupUsername.trim()) {
      setUsernameStatus('idle');
      return;
    }

    // Basic validation: only letters, numbers, underscores
    const valid = /^[a-zA-Z0-9_]{3,20}$/.test(signupUsername.trim());
    if (!valid) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(signupUsername.trim());
        setUsernameStatus(available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [signupUsername]);

  function handleUsernameChange(text: string) {
    // Strip leading @ if typed
    const stripped = text.startsWith('@') ? text.slice(1) : text;
    setSignupUsername(stripped);
  }

  async function handleLogin() {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(loginEmail.trim(), loginPassword);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      const dest = returnTo ?? 'friends';
      setReturnTo(null);
      navigate(dest);
    }
  }

  async function handleResetPassword() {
    if (!resetEmail.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setResetLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: 'coco://reset-password',
    });
    setResetLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setResetSent(true);
    }
  }

  async function handleSignUp() {
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (signupPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (signupUsername.trim() && usernameStatus === 'taken') {
      setError('That username is already taken.');
      return;
    }
    if (signupUsername.trim() && usernameStatus === 'invalid') {
      setError('Username must be 3–20 characters: letters, numbers, underscores only.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await signUp(
      signupEmail.trim(),
      signupPassword,
      signupName.trim(),
      signupUsername.trim() || undefined,
    );
    setLoading(false);
    if (err) {
      setError(err);
    }
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setError(null);
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.bgElevated,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
  ];

  function renderUsernameStatus() {
    if (usernameStatus === 'idle' || !signupUsername.trim()) return null;
    if (usernameStatus === 'checking') {
      return <Text style={[styles.usernameHint, { color: colors.textMuted }]}>Checking...</Text>;
    }
    if (usernameStatus === 'available') {
      return <Text style={[styles.usernameHint, { color: colors.accentGreen }]}>✓ Available</Text>;
    }
    if (usernameStatus === 'taken') {
      return <Text style={[styles.usernameHint, { color: colors.danger }]}>✗ Already taken</Text>;
    }
    if (usernameStatus === 'invalid') {
      return <Text style={[styles.usernameHint, { color: colors.danger }]}>3–20 chars: letters, numbers, underscores</Text>;
    }
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Branding */}
        <View style={styles.brandingSection}>
          <Text style={[styles.appName, { color: colors.accent }]}>COCO</Text>
          <Text style={[styles.appTagline, { color: colors.textMuted }]}>Climbing Tracker</Text>
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'login' && { borderBottomColor: colors.accent },
            ]}
            onPress={() => switchTab('login')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabLabel,
              { color: activeTab === 'login' ? colors.accent : colors.textMuted },
              activeTab === 'login' && { fontFamily: FONTS.family.semibold },
            ]}>
              Log In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'signup' && { borderBottomColor: colors.accent },
            ]}
            onPress={() => switchTab('signup')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabLabel,
              { color: activeTab === 'signup' ? colors.accent : colors.textMuted },
              activeTab === 'signup' && { fontFamily: FONTS.family.semibold },
            ]}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form card */}
        <View style={[styles.formCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {activeTab === 'login' && showForgotPassword ? (
            /* ── Forgot Password view ── */
            <>
              {resetSent ? (
                <View style={styles.resetSuccessContainer}>
                  <Text style={[styles.resetSuccessTitle, { color: colors.textPrimary }]}>Check your email</Text>
                  <Text style={[styles.resetSuccessText, { color: colors.textSecondary }]}>
                    We've sent a password reset link to {resetEmail}. Click the link in the email to set a new password.
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: colors.accent, alignSelf: 'stretch' }]}
                    onPress={() => { setShowForgotPassword(false); setResetSent(false); setResetEmail(''); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryButtonText}>Back to Log In</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={[styles.resetTitle, { color: colors.textPrimary }]}>Reset Password</Text>
                  <Text style={[styles.resetSubtitle, { color: colors.textSecondary }]}>
                    Enter your email and we'll send you a link to reset your password.
                  </Text>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
                  <TextInput
                    style={inputStyle}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMuted}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="done"
                    onSubmitEditing={handleResetPassword}
                  />
                  {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: colors.accent }, resetLoading && styles.buttonDisabled]}
                    onPress={handleResetPassword}
                    disabled={resetLoading}
                    activeOpacity={0.8}
                  >
                    {resetLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send Reset Link</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, marginTop: SPACING.sm }]}
                    onPress={() => { setShowForgotPassword(false); setError(null); setResetEmail(''); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.primaryButtonText, { color: colors.textSecondary }]}>Back to Log In</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : activeTab === 'login' ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
              <TextInput
                style={inputStyle}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={loginEmail}
                onChangeText={setLoginEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Password</Text>
              <TextInput
                style={inputStyle}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              <TouchableOpacity
                style={styles.forgotPasswordButton}
                onPress={() => { setShowForgotPassword(true); setError(null); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.forgotPasswordText, { color: colors.accent }]}>Forgot Password?</Text>
              </TouchableOpacity>

              {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.accent }, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Log In</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                style={inputStyle}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                value={signupName}
                onChangeText={setSignupName}
                autoCorrect={false}
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
              <View>
                <TextInput
                  style={[
                    inputStyle,
                    usernameStatus === 'available' && { borderColor: colors.accentGreen },
                    usernameStatus === 'taken' && { borderColor: colors.danger },
                    usernameStatus === 'invalid' && { borderColor: colors.danger },
                  ]}
                  placeholder="@username"
                  placeholderTextColor={colors.textMuted}
                  value={signupUsername}
                  onChangeText={handleUsernameChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
                {renderUsernameStatus()}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
              <TextInput
                style={inputStyle}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={signupEmail}
                onChangeText={setSignupEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Password</Text>
              <TextInput
                style={inputStyle}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
                value={signupPassword}
                onChangeText={setSignupPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
              />

              {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.accent }, loading && styles.buttonDisabled]}
                onPress={handleSignUp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: 60,
    paddingBottom: SPACING.xxl,
  },
  brandingSection: {
    alignItems: 'center',
    marginBottom: SPACING.xxl + SPACING.lg,
  },
  appName: {
    fontSize: FONTS.sizes.hero,
    fontFamily: FONTS.family.heavy,
    letterSpacing: 6,
  },
  appTagline: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
    letterSpacing: 2,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.medium,
  },
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  fieldLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    marginBottom: SPACING.sm,
  },
  usernameHint: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
    marginLeft: 2,
  },
  errorText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  forgotPasswordText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
  },
  resetTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    marginBottom: SPACING.sm,
  },
  resetSubtitle: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  resetSuccessContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  resetSuccessTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
  },
  resetSuccessText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
});
