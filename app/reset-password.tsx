import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { FONTS, SPACING } from '../utils/theme';

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const { updatePassword, clearPasswordRecovery } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleUpdate() {
    if (!password.trim()) { setError('Please enter a new password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError(null);
    const { error: err } = await updatePassword(password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setSuccess(true);
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.bgElevated, borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={[styles.appName, { color: colors.accent }]}>COCO</Text>
        <Text style={[styles.appTagline, { color: colors.textMuted }]}>Climbing Tracker</Text>

        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {success ? (
            <View style={styles.successContainer}>
              <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Password updated!</Text>
              <Text style={[styles.successText, { color: colors.textSecondary }]}>
                Your password has been changed. You can now use it to log in.
              </Text>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accent }]}
                onPress={clearPasswordRecovery}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>Back to App</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Set New Password</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Choose a new password for your account.
              </Text>

              <Text style={[styles.label, { color: colors.textSecondary }]}>New Password</Text>
              <TextInput
                style={inputStyle}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="next"
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm Password</Text>
              <TextInput
                style={inputStyle}
                placeholder="Repeat your password"
                placeholderTextColor={colors.textMuted}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleUpdate}
              />

              {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accent }, loading && { opacity: 0.6 }]}
                onPress={handleUpdate}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update Password</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, marginTop: SPACING.sm }]}
                onPress={clearPasswordRecovery}
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: 80,
    alignItems: 'stretch',
  },
  appName: {
    fontSize: 42,
    fontFamily: FONTS.family.heavy,
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 4,
  },
  appTagline: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: SPACING.xxl + SPACING.lg,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: SPACING.xl,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  label: {
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
  error: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
    marginVertical: SPACING.sm,
  },
  button: {
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  successContainer: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
  },
  successTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
  },
  successText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
});
