import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Keyboard, ScrollView,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { getFollowing, FriendProfile } from '../utils/friendsApi';
import { FONTS, SPACING } from '../utils/theme';

interface SelectedFriend { id: string; name: string; }

interface Props {
  selected: SelectedFriend[];
  onChange: (friends: SelectedFriend[]) => void;
  onFocus?: () => void;
  onDropdownChange?: (open: boolean) => void;
  dropup?: boolean;
}

export default function FriendPicker({ selected, onChange, onFocus, onDropdownChange, dropup }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState<FriendProfile[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getFollowing(user.id)
      .then(setFollowing)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  const q = query.trim().toLowerCase();
  const suggestions = following.filter(f =>
    !selected.some(s => s.id === f.id) &&
    (q === '' || f.name?.toLowerCase().includes(q) || f.username?.toLowerCase().includes(q))
  );

  useEffect(() => {
    onDropdownChange?.(focused);
  }, [focused]);

  function handleSelect(f: FriendProfile) {
    Keyboard.dismiss();
    onChange([...selected, { id: f.id, name: f.name }]);
    setQuery('');
    setFocused(false);
  }

  function handleRemove(id: string) {
    onChange(selected.filter(s => s.id !== id));
  }

  function handleBlur() {
    setTimeout(() => setFocused(false), 300);
  }

  return (
    <View style={{ position: 'relative', zIndex: focused ? 100 : 1 }}>
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

      {/* Search input */}
      <View style={[styles.inputRow, { backgroundColor: colors.bgElevated, borderColor: focused ? colors.accent : colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={query}
          onChangeText={setQuery}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={handleBlur}
          placeholder="Search friends…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading
          ? <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: SPACING.sm }} />
          : query.trim().length > 0
            ? (
              <TouchableOpacity onPress={() => setQuery('')} style={{ marginRight: SPACING.sm }}>
                <Text style={[styles.clearBtn, { color: colors.textMuted }]}>×</Text>
              </TouchableOpacity>
            )
            : null
        }
      </View>

      {/* Dropdown results */}
      {focused && (
        <ScrollView
          style={[styles.dropdown, { backgroundColor: colors.bgCard, borderColor: colors.border }, dropup && styles.dropup]}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {suggestions.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {following.length === 0 ? 'Follow someone to tag them' : 'No matching friends'}
            </Text>
          ) : (
            suggestions.map((f, i) => (
              <TouchableOpacity
                key={f.id}
                onPress={() => handleSelect(f)}
                style={[styles.row, { borderTopColor: colors.border }, i === 0 && { borderTopWidth: 0 }]}
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
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
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
    borderWidth: 1,
    borderRadius: 8,
  },
  input: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    paddingHorizontal: SPACING.md,
    paddingVertical: 0,
    height: 20,
  },
  clearBtn: {
    fontSize: FONTS.sizes.lg,
    lineHeight: 20,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
    maxHeight: 220,
  },
  dropup: {
    position: 'absolute',
    bottom: '100%' as any,
    left: 0,
    right: 0,
    marginTop: 0,
    marginBottom: 4,
    zIndex: 200,
    elevation: 5,
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
    borderTopWidth: 1,
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
