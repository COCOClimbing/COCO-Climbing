import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { searchByUsername, FriendProfile } from '../utils/friendsApi';
import { FONTS, SPACING } from '../utils/theme';

interface SelectedFriend { id: string; name: string; }

interface Props {
  selected: SelectedFriend[];
  onChange: (friends: SelectedFriend[]) => void;
}

export default function FriendPicker({ selected, onChange }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  // Debounced live search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchByUsername(query.trim(), user?.id ?? '');
        setResults(found.filter(f => !selected.some(s => s.id === f.id)));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, user?.id]);

  const suggestions = results.filter(f => !selected.some(s => s.id === f.id));

  function handleSelect(f: FriendProfile) {
    onChange([...selected, { id: f.id, name: f.name }]);
    setQuery('');
    setResults([]);
  }

  function handleRemove(id: string) {
    onChange(selected.filter(s => s.id !== id));
  }

  function handleBlur() {
    setTimeout(() => setFocused(false), 150);
  }

  return (
    <View>
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
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder="Search by username…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading
          ? <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: SPACING.sm }} />
          : query.trim().length > 0
            ? (
              <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }} style={{ marginRight: SPACING.sm }}>
                <Text style={[styles.clearBtn, { color: colors.textMuted }]}>×</Text>
              </TouchableOpacity>
            )
            : null
        }
      </View>

      {/* Dropdown results */}
      {focused && query.trim().length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {suggestions.length === 0 && !loading ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>No users found</Text>
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
                  <Text style={[styles.username, { color: colors.textMuted }]}>@{f.username}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
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
    paddingVertical: SPACING.sm,
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
