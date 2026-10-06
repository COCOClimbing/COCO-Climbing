import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { upsertProfile } from '../utils/cloudSync';
import { supabase } from '../utils/supabase';
import { isUsernameAvailable } from '../utils/friendsApi';
import { FONTS, SPACING } from '../utils/theme';

export default function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { user, profileName, avatarUrl, username, hometown, bio, refreshProfile } = useAuth();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(profileName ?? '');
  const [savingName, setSavingName] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState(username ?? '');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [editingHometown, setEditingHometown] = useState(false);
  const [hometownValue, setHometownValue] = useState(hometown ?? '');
  const [savingHometown, setSavingHometown] = useState(false);

  const [editingBio, setEditingBio] = useState(false);
  const [bioValue, setBioValue] = useState(bio ?? '');
  const [savingBio, setSavingBio] = useState(false);

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState(user?.email ?? '');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (visible) {
      setNameValue(profileName ?? '');
      setUsernameValue(username ?? '');
      setHometownValue(hometown ?? '');
      setBioValue(bio ?? '');
      setEmailValue(user?.email ?? '');
      setEditingName(false);
      setEditingUsername(false);
      setEditingHometown(false);
      setEditingBio(false);
      setEditingEmail(false);
      setUsernameError(null);
      setEmailError(null);
      setEmailSent(false);
    }
  }, [visible]);

  if (!user) return null;

  async function handleSaveName() {
    if (!nameValue.trim()) return;
    setSavingName(true);
    try {
      await upsertProfile(user.id, nameValue.trim(), avatarUrl ?? undefined);
      await refreshProfile();
      setEditingName(false);
    } catch {
      Alert.alert('Error', 'Failed to save name.');
    }
    setSavingName(false);
  }

  async function handleSaveUsername() {
    const trimmed = usernameValue.trim().toLowerCase().replace(/^@/, '');
    if (!trimmed) { setUsernameError('Username cannot be empty.'); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(trimmed)) {
      setUsernameError('3–20 characters: letters, numbers, underscores only.');
      return;
    }
    if (trimmed === username) { setEditingUsername(false); return; }
    setSavingUsername(true);
    setUsernameError(null);
    try {
      const available = await isUsernameAvailable(trimmed);
      if (!available) {
        setUsernameError('That username is already taken.');
        setSavingUsername(false);
        return;
      }
      await upsertProfile(user.id, profileName ?? '', avatarUrl ?? undefined, trimmed);
      await refreshProfile();
      setEditingUsername(false);
    } catch {
      setUsernameError('Failed to save username.');
    }
    setSavingUsername(false);
  }

  async function handleSaveHometown() {
    const trimmed = hometownValue.trim();
    setSavingHometown(true);
    try {
      await upsertProfile(user.id, profileName ?? '', avatarUrl ?? undefined, username ?? undefined, trimmed || undefined);
      await refreshProfile();
      setEditingHometown(false);
    } catch {
      Alert.alert('Error', 'Failed to save hometown.');
    }
    setSavingHometown(false);
  }

  async function handleSaveBio() {
    const trimmed = bioValue.trim();
    setSavingBio(true);
    try {
      await upsertProfile(user.id, profileName ?? '', avatarUrl ?? undefined, username ?? undefined, hometown ?? undefined, trimmed || undefined);
      await refreshProfile();
      setEditingBio(false);
    } catch {
      Alert.alert('Error', 'Failed to save bio.');
    }
    setSavingBio(false);
  }

  async function handleSaveEmail() {
    const trimmed = emailValue.trim().toLowerCase();
    if (!trimmed) { setEmailError('Email cannot be empty.'); return; }
    if (trimmed === user?.email) { setEditingEmail(false); return; }
    setSavingEmail(true);
    setEmailError(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) { setEmailError(error.message); }
      else { setEmailSent(true); setEditingEmail(false); }
    } catch {
      setEmailError('Failed to update email.');
    }
    setSavingEmail(false);
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.bgElevated,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => onClose()}
    >
      <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Profile</Text>
          <TouchableOpacity onPress={() => onClose()} activeOpacity={0.7}>
            <Text style={[styles.doneText, { color: colors.accent }]}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={styles.modalScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PROFILE</Text>

            {/* Name */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
              {editingName ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={[inputStyle, styles.fieldInput]}
                    value={nameValue}
                    onChangeText={setNameValue}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                  <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: colors.accent }]}
                    onPress={handleSaveName}
                    disabled={savingName}
                    activeOpacity={0.8}
                  >
                    {savingName ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.fieldValueRow}
                  onPress={() => { setNameValue(profileName ?? ''); setEditingName(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fieldValue, { color: profileName ? colors.textPrimary : colors.textMuted }]}>
                    {profileName || 'Tap to add name'}
                  </Text>
                  <Text style={[styles.editHint, { color: colors.accent }]}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Username */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
              {editingUsername ? (
                <View>
                  <View style={styles.editRow}>
                    <TextInput
                      style={[inputStyle, styles.fieldInput]}
                      value={usernameValue}
                      onChangeText={v => { setUsernameValue(v); setUsernameError(null); }}
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSaveUsername}
                      placeholder="letters, numbers, _"
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: colors.accent }]}
                      onPress={handleSaveUsername}
                      disabled={savingUsername}
                      activeOpacity={0.8}
                    >
                      {savingUsername ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                  {usernameError && <Text style={[styles.errorText, { color: colors.danger }]}>{usernameError}</Text>}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.fieldValueRow}
                  onPress={() => { setUsernameValue(username ?? ''); setUsernameError(null); setEditingUsername(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fieldValue, { color: username ? colors.textPrimary : colors.textMuted }]}>
                    {username ? `@${username}` : 'Tap to set username'}
                  </Text>
                  <Text style={[styles.editHint, { color: colors.accent }]}>{username ? 'Edit' : 'Add'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Hometown */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Hometown</Text>
              {editingHometown ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={[inputStyle, styles.fieldInput]}
                    value={hometownValue}
                    onChangeText={setHometownValue}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveHometown}
                    placeholder="e.g. Boulder, CO"
                    placeholderTextColor={colors.textMuted}
                  />
                  <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: colors.accent }]}
                    onPress={handleSaveHometown}
                    disabled={savingHometown}
                    activeOpacity={0.8}
                  >
                    {savingHometown ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.fieldValueRow}
                  onPress={() => { setHometownValue(hometown ?? ''); setEditingHometown(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fieldValue, { color: hometown ? colors.textPrimary : colors.textMuted }]}>
                    {hometown || 'Tap to add hometown'}
                  </Text>
                  <Text style={[styles.editHint, { color: colors.accent }]}>{hometown ? 'Edit' : 'Add'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Bio */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
              {editingBio ? (
                <View>
                  <TextInput
                    style={[inputStyle, styles.bioInput]}
                    value={bioValue}
                    onChangeText={setBioValue}
                    autoFocus
                    multiline
                    numberOfLines={4}
                    placeholder="A little about yourself"
                    placeholderTextColor={colors.textMuted}
                    maxLength={300}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: colors.accent, marginTop: SPACING.sm }]}
                    onPress={handleSaveBio}
                    disabled={savingBio}
                    activeOpacity={0.8}
                  >
                    {savingBio ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.fieldValueRow}
                  onPress={() => { setBioValue(bio ?? ''); setEditingBio(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fieldValue, { color: bio ? colors.textPrimary : colors.textMuted }]}>
                    {bio || 'Tap to add a bio'}
                  </Text>
                  <Text style={[styles.editHint, { color: colors.accent }]}>{bio ? 'Edit' : 'Add'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Email */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
              {editingEmail ? (
                <View>
                  <View style={styles.editRow}>
                    <TextInput
                      style={[inputStyle, styles.fieldInput]}
                      value={emailValue}
                      onChangeText={v => { setEmailValue(v); setEmailError(null); }}
                      autoFocus
                      autoCapitalize="none"
                      keyboardType="email-address"
                      returnKeyType="done"
                      onSubmitEditing={handleSaveEmail}
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: colors.accent }]}
                      onPress={handleSaveEmail}
                      disabled={savingEmail}
                      activeOpacity={0.8}
                    >
                      {savingEmail ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                  {emailError && <Text style={[styles.errorText, { color: colors.danger }]}>{emailError}</Text>}
                  <Text style={[styles.hint, { color: colors.textMuted }]}>A confirmation link will be sent to the new address.</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.fieldValueRow}
                  onPress={() => { setEmailValue(user?.email ?? ''); setEmailError(null); setEmailSent(false); setEditingEmail(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>{user?.email}</Text>
                  <Text style={[styles.editHint, { color: colors.accent }]}>Edit</Text>
                </TouchableOpacity>
              )}
              {emailSent && !editingEmail && (
                <Text style={[styles.hint, { color: colors.accentGreen }]}>Confirmation sent — check your inbox.</Text>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold },
  doneText: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.medium },
  modalScroll: { padding: SPACING.xl, paddingBottom: SPACING.xxl * 2 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  field: {
    paddingVertical: SPACING.sm,
  },
  fieldLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
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
  fieldInput: {
    flex: 1,
    marginBottom: 0,
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.bold,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    flex: 1,
  },
  editHint: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
    marginLeft: SPACING.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.sm,
  },
  errorText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
    marginTop: SPACING.xs,
  },
  bioInput: {
    minHeight: 90,
    paddingTop: SPACING.md,
  },
  hint: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginTop: SPACING.xs,
  },
});
