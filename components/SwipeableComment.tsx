import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import SwipeToDelete from './SwipeToDelete';
import { FONTS, SPACING } from '../utils/theme';

export default function SwipeableComment({
  c,
  isOwn,
  onDelete,
  onReport,
  onLike,
  onNamePress,
  colors,
  commentAvatarUrl,
  likedByUserIds,
  currentUserId,
}: {
  c: any;
  isOwn: boolean;
  onDelete: () => void;
  onReport: () => void;
  onLike: () => void;
  onNamePress: () => void;
  colors: any;
  commentAvatarUrl: string | null;
  likedByUserIds: string[];
  currentUserId: string;
}) {
  const liked = likedByUserIds.includes(currentUserId);
  return (
    <SwipeToDelete onDelete={onDelete} disabled={!isOwn} heightOffset={0}>
      <TouchableOpacity
        style={[swipeCommentStyles.row, { backgroundColor: colors.bg }]}
        activeOpacity={0.85}
        onLongPress={onReport}
        delayLongPress={500}
      >
        <TouchableOpacity onPress={onNamePress} activeOpacity={0.7}>
          {commentAvatarUrl
            ? <Image source={{ uri: commentAvatarUrl }} style={swipeCommentStyles.avatar} />
            : <View style={[swipeCommentStyles.avatar, { backgroundColor: colors.border }]} />
          }
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[swipeCommentStyles.name, { color: colors.textPrimary }]}>
            <Text onPress={onNamePress}>{c.profile?.name ?? 'Unknown'}</Text>{' '}
            <Text style={[swipeCommentStyles.text, { color: colors.textSecondary }]}>{c.text}</Text>
          </Text>
          <Text style={[swipeCommentStyles.time, { color: colors.textMuted }]}>
            {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true })}
          </Text>
        </View>
        <TouchableOpacity onPress={onLike} activeOpacity={0.7} style={swipeCommentStyles.likeBtn}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? '#e05c4a' : colors.textMuted} />
          {likedByUserIds.length > 0 && (
            <Text style={[swipeCommentStyles.likeCount, { color: liked ? '#e05c4a' : colors.textMuted }]}>
              {likedByUserIds.length}
            </Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </SwipeToDelete>
  );
}

const swipeCommentStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start', paddingVertical: 2 },
  avatar: { width: 20, height: 20, borderRadius: 10, marginTop: 2 },
  name: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  text: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  time: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: SPACING.sm, paddingTop: 2 },
  likeCount: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium },
});
