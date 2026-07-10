import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { FONTS, SPACING } from '../utils/theme';

export interface Liker {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export default function LikesAvatarRow({
  likers,
  onPressLiker,
  currentUserId,
  colors,
}: {
  likers: Liker[];
  onPressLiker?: (liker: Liker) => void;
  currentUserId?: string;
  colors: any;
}) {
  if (likers.length === 0) return null;
  return (
    <View style={styles.likeCountRow}>
      <View style={styles.avatarStack}>
        {likers.slice(0, 3).map((l, i) => {
          const onPress = (onPressLiker && l.userId !== currentUserId) ? () => onPressLiker(l) : undefined;
          return l.avatarUrl
            ? (
              <TouchableOpacity key={l.id} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
                <Image source={{ uri: l.avatarUrl }} style={[styles.likeAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]} />
              </TouchableOpacity>
            )
            : (
              <TouchableOpacity key={l.id} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
                <View style={[styles.likeAvatar, styles.likeAvatarFallback, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, backgroundColor: colors.border }]} />
              </TouchableOpacity>
            );
        })}
      </View>
      <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
        {likers.length} {likers.length === 1 ? 'like' : 'likes'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  likeCountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  likeAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#fff' },
  likeAvatarFallback: {},
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
});
