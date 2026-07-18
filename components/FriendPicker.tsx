import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Modal, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { GestureHandlerRootView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { getFollowing, FriendProfile } from '../utils/friendsApi';
import { FONTS, SPACING } from '../utils/theme';
import { useSlideSheet } from '../utils/useSlideSheet';

interface SelectedFriend { id: string; name: string; }

interface Props {
  selected: SelectedFriend[];
  onChange: (friends: SelectedFriend[]) => void;
}

export default function FriendPicker({ selected, onChange }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { translateY, close } = useSlideSheet(modalVisible, () => setModalVisible(false));

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getFollowing(user.id)
      .then(setFollowing)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  useEffect(() => {
    if (modalVisible) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [modalVisible]);

  const q = query.trim().toLowerCase();
  const suggestions = following.filter(f =>
    !selected.some(s => s.id === f.id) &&
    (q === '' || f.name?.toLowerCase().includes(q) || f.username?.toLowerCase().includes(q))
  );

  function handleSelect(f: FriendProfile) {
    onChange([...selected, { id: f.id, name: f.name }]);
    setQuery('');
  }

  function handleRemove(id: string) {
    onChange(selected.filter(s => s.id !== id));
  }

  return (
    <>
      {/* Selected friend chips */}
      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map(s => (
            <TouchableOpacity
              key={s.id}
              onPress={() => handleRemove(s.id)}
              style={[styles.chip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, { color: colors.accent }]}>{s.name}</Text>
              <Text style={[styles.chipX, { color: colors.accent }]}>×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Trigger — opens the picker in its own modal, so its results list
          never has to fight an ancestor ScrollView for scroll/tap gestures
          (the same nested-ScrollView conflict that LocationPicker below
          already avoids the same way). */}
      <TouchableOpacity
        style={[styles.inputRow, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.placeholder, { color: colors.textMuted }]}>Search friends…</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={close}
      >
        <GestureHandlerRootView style={styles.backdrop}>
          <GHTouchableOpacity style={styles.backdropSpacer} activeOpacity={1} onPress={close} />
          <Animated.View
            style={[
              styles.sheetCard,
              { backgroundColor: colors.bg, transform: [{ translateY }] },
            ]}
          >
          <KeyboardAvoidingView
            style={styles.modal}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.headerBtn} />
            <Text style={[styles.modalTitle, { color: colors.textPrimary, fontFamily: FONTS.family.semibold }]}>
              Climbing With
            </Text>
            <GHTouchableOpacity onPress={close} style={styles.headerBtn}>
              <Text style={[styles.doneText, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Done</Text>
            </GHTouchableOpacity>
          </View>

          {selected.length > 0 && (
            <View style={[styles.chips, styles.modalChips]}>
              {selected.map(s => (
                <GHTouchableOpacity
                  key={s.id}
                  onPress={() => handleRemove(s.id)}
                  style={[styles.chip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, { color: colors.accent }]}>{s.name}</Text>
                  <Text style={[styles.chipX, { color: colors.accent }]}>×</Text>
                </GHTouchableOpacity>
              ))}
            </View>
          )}

          <View style={[styles.searchRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search friends…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.trim().length > 0 && (
              <GHTouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.clearBtn, { color: colors.textMuted }]}>×</Text>
              </GHTouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: SPACING.xl }} />
          ) : (
            <FlatList
              data={suggestions}
              keyExtractor={f => f.id}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 20) + SPACING.md }]}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.textMuted }]}>
                  {following.length === 0 ? 'Follow someone to tag them' : 'No matching friends'}
                </Text>
              }
              renderItem={({ item: f }) => (
                <GHTouchableOpacity
                  onPress={() => handleSelect(f)}
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.avatarLetter, { color: colors.accent }]}>
                      {f.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: colors.textPrimary }]}>{f.name}</Text>
                    {f.username ? <Text style={[styles.username, { color: colors.textMuted }]}>@{f.username}</Text> : null}
                  </View>
                </GHTouchableOpacity>
              )}
            />
          )}
          </KeyboardAvoidingView>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  modalChips: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: 0,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: 5,
  },
  chipText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
  },
  chipX: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
  },
  placeholder: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropSpacer: {
    height: 60,
  },
  sheetCard: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  headerBtn: { minWidth: 60 },
  modalTitle: { fontSize: FONTS.sizes.lg },
  doneText: { fontSize: FONTS.sizes.md, textAlign: 'right' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    paddingVertical: 0,
    height: 20,
  },
  clearBtn: {
    fontSize: FONTS.sizes.lg,
    lineHeight: 20,
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  empty: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    padding: SPACING.md,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.bold,
  },
  info: { flex: 1 },
  name: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
  },
  username: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginTop: 1,
  },
});
