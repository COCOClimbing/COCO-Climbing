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
  Image,
} from 'react-native';
import ImageCropPicker from 'react-native-image-crop-picker';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { upsertProfile } from '../utils/cloudSync';
import { supabase } from '../utils/supabase';
import { isUsernameAvailable } from '../utils/friendsApi';
import { uploadMedia } from '../utils/mediaUpload';
import { FONTS, SPACING } from '../utils/theme';
import PushScreen from './PushScreen';
import { useTabBarSpace } from './BottomTabBar';

const AVATAR_SIZE = 88;
const BIO_MAX_HEIGHT = 140;

// Edit Profile page: slides in like the app's other pages, edits every field
// at once and saves them together with the Save button. The photo can be
// changed here too; it uploads when you save.
export default function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { user, profileName, avatarUrl, localAvatarUri, username, hometown, bio, refreshProfile } = useAuth();
  const tabBarSpace = useTabBarSpace();

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [town, setTown] = useState('');
  const [about, setAbout] = useState('');
  const [email, setEmail] = useState('');
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [bioHeight, setBioHeight] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Start from the saved profile each time the page opens.
  useEffect(() => {
    if (!visible) return;
    setName(profileName ?? '');
    setHandle(username ?? '');
    setTown(hometown ?? '');
    setAbout(bio ?? '');
    setEmail(user?.email ?? '');
    setNewPhoto(null);
    setNameError(null);
    setUsernameError(null);
    setEmailError(null);
  }, [visible]);

  if (!user) return null;

  // Usernames are saved lowercase, but older ones may have capitals — leave
  // those alone unless the username is actually edited.
  const rawHandle = handle.trim().replace(/^@/, '');
  const handleChanged = rawHandle !== (username ?? '');
  const cleanHandle = handleChanged ? rawHandle.toLowerCase() : (username ?? '');
  const cleanEmail = email.trim().toLowerCase();
  const dirty =
    !!newPhoto ||
    name.trim() !== (profileName ?? '') ||
    handleChanged ||
    town.trim() !== (hometown ?? '') ||
    about.trim() !== (bio ?? '') ||
    cleanEmail !== (user.email ?? '').toLowerCase();

  function handleBack() {
    if (!dirty || saving) { onClose(); return; }
    Alert.alert('Discard changes?', 'Your edits haven\'t been saved.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  }

  async function handlePickPhoto() {
    try {
      const image = await ImageCropPicker.openPicker({
        width: 400,
        height: 400,
        cropping: true,
        cropperCircleOverlay: true,
        compressImageQuality: 0.9,
        cropperToolbarTitle: 'Move and Scale',
      });
      setNewPhoto(image.path);
    } catch {
      // Picker cancelled
    }
  }

  async function handleSave() {
    if (!user || saving) return;
    if (!dirty) { onClose(); return; }

    // Check everything before writing anything.
    let ok = true;
    if (!name.trim()) { setNameError('Name cannot be empty.'); ok = false; }
    if (handleChanged) {
      if (!/^[a-z0-9_]{3,20}$/.test(cleanHandle)) {
        setUsernameError('3–20 characters: letters, numbers, underscores only.');
        ok = false;
      }
    }
    if (!cleanEmail) { setEmailError('Email cannot be empty.'); ok = false; }
    if (!ok) return;

    setSaving(true);
    try {
      // Only changing the capitals of your own username isn't a clash.
      if (handleChanged && cleanHandle !== (username ?? '').toLowerCase()) {
        const available = await isUsernameAvailable(cleanHandle);
        if (!available) { setUsernameError('That username is already taken.'); return; }
      }

      let photoUrl = avatarUrl ?? undefined;
      if (newPhoto) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not signed in.');
        photoUrl = await uploadMedia(newPhoto, `${user.id}/avatar.jpg`, session.access_token);
      }

      await upsertProfile(user.id, name.trim(), photoUrl, cleanHandle || undefined, town.trim(), about.trim());

      let emailNote: string | null = null;
      if (cleanEmail !== (user.email ?? '').toLowerCase()) {
        const { error } = await supabase.auth.updateUser({ email: cleanEmail });
        if (error) {
          // The rest saved; keep the page open so the email can be fixed.
          await refreshProfile();
          setEmailError(error.message);
          return;
        }
        emailNote = 'A confirmation link was sent to your new email.';
      }

      await refreshProfile();
      onClose();
      if (emailNote) Alert.alert('Check your inbox', emailNote);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const photo = newPhoto ?? localAvatarUri ?? avatarUrl;
  const initials = (name || profileName || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const inputText = { color: colors.textPrimary };

  const saveButton = saving
    ? <ActivityIndicator color={colors.accent} />
    : (
      <TouchableOpacity onPress={handleSave} activeOpacity={0.7} hitSlop={10}>
        <Text style={[styles.save, { color: dirty ? colors.accent : colors.textMuted }]}>Save</Text>
      </TouchableOpacity>
    );

  return (
    <PushScreen visible={visible} title="Edit Profile" onBack={handleBack} headerRight={saveButton}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarSpace + SPACING.xl }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* Photo + name / username */}
        <View style={[styles.topBlock, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8} style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              {photo
                ? <Image source={{ uri: photo }} style={styles.avatarImage} />
                : <Text style={[styles.avatarInitials, { color: colors.accent }]}>{initials}</Text>}
            </View>
          </TouchableOpacity>
          <View style={styles.nameBox}>
            <TextInput
              style={[styles.nameInput, inputText]}
              value={name}
              onChangeText={v => { setName(v); setNameError(null); }}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
            />
            <View style={[styles.hairline, { backgroundColor: colors.border }]} />
            <View style={styles.handleRow}>
              <Text style={[styles.at, { color: colors.textMuted }]}>@</Text>
              <TextInput
                style={[styles.nameInput, styles.handleInput, inputText]}
                value={handle}
                onChangeText={v => { setHandle(v); setUsernameError(null); }}
                placeholder="username"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        </View>
        {(nameError || usernameError) && (
          <Text style={[styles.error, { color: colors.danger }]}>{nameError ?? usernameError}</Text>
        )}

        {/* Bio — sized from a hidden copy of its text (iOS auto-grow is unreliable on device) */}
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <View>
            <Text
              style={[styles.rowInput, styles.mirror]}
              onLayout={e => setBioHeight(Math.ceil(e.nativeEvent.layout.height))}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              {(about || 'Bio') + (about.endsWith('\n') ? ' ' : '')}
            </Text>
            <TextInput
              style={[styles.rowInput, inputText, bioHeight !== undefined && { height: Math.min(bioHeight, BIO_MAX_HEIGHT) }]}
              value={about}
              onChangeText={setAbout}
              placeholder="Bio"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={300}
              scrollEnabled={(bioHeight ?? 0) > BIO_MAX_HEIGHT}
            />
          </View>
        </View>
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[styles.rowInput, inputText]}
            value={town}
            onChangeText={setTown}
            placeholder="Hometown (e.g. Boulder, CO)"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {/* Account */}
        <View style={styles.sectionBand}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACCOUNT</Text>
        </View>
        <View style={[styles.row, styles.labeledRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Email</Text>
          <TextInput
            style={[styles.rowInput, styles.rowValue, inputText]}
            value={email}
            onChangeText={v => { setEmail(v); setEmailError(null); }}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </View>
        <Text style={[styles.note, { color: emailError ? colors.danger : colors.textMuted }]}>
          {emailError ?? 'Changing your email sends a confirmation link to the new address.'}
        </Text>
      </ScrollView>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  save: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold },
  topBlock: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, padding: SPACING.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  avatarWrap: { alignItems: 'center' },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatarInitials: { fontSize: 30, fontFamily: FONTS.family.bold },
  nameBox: { flex: 1 },
  nameInput: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold, paddingVertical: SPACING.md },
  hairline: { height: StyleSheet.hairlineWidth },
  handleRow: { flexDirection: 'row', alignItems: 'center' },
  at: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold, marginRight: 1 },
  handleInput: { flex: 1 },
  error: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium, paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  labeledRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  rowLabel: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.regular },
  rowInput: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.regular, paddingTop: 4, paddingBottom: 4, paddingHorizontal: 0 },
  rowValue: { flex: 1, textAlign: 'right' },
  mirror: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  sectionBand: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm, marginTop: SPACING.lg },
  sectionTitle: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.semibold, letterSpacing: 1 },
  note: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
});
