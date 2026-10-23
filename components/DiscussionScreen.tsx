import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Keyboard, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import PushScreen from './PushScreen';
import Avatar from './Avatar';
import LikesAvatarRow, { Liker } from './LikesAvatarRow';
import { useTabBarSpace } from './BottomTabBar';
import { FONTS, SPACING } from '../utils/theme';
import type { SessionComment } from '../utils/friendsApi';

type ProfileRef = { id: string; name: string; username: string; avatar_url: string | null };

const INPUT_MAX_HEIGHT = 100;

// The full comment thread for one post, Strava-style: a page that slides in
// with the post's likes, every comment, and a comment box pinned above the tab
// bar. Cards in the feed show only their first few comments and open this.
// The parent owns the comments and likes, so the card underneath stays in sync.
export default function DiscussionScreen({
  visible,
  onClose,
  subtitle,
  likes,
  comments,
  commentLikesMap,
  currentUserId,
  myAvatar,
  isPostOwner,
  autoFocus,
  colors,
  onSend,
  onDeleteComment,
  onReportComment,
  onLikeComment,
  onViewProfile,
}: {
  visible: boolean;
  onClose: () => void;
  subtitle?: string;
  likes: Liker[];
  comments: SessionComment[];
  commentLikesMap: Record<string, string[]>;
  currentUserId: string;
  myAvatar: string | null;
  // The post's owner can delete anyone's comment on it.
  isPostOwner: boolean;
  // Open the keyboard once the page is in (from the card's comment button).
  autoFocus: boolean;
  colors: any;
  // Resolves true once the comment is posted.
  onSend: (text: string) => Promise<boolean>;
  onDeleteComment: (comment: SessionComment) => void;
  onReportComment: (comment: SessionComment) => void;
  onLikeComment: (comment: SessionComment) => void;
  onViewProfile: (profile: ProfileRef) => void;
}) {
  const tabBarSpace = useTabBarSpace();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputHeight, setInputHeight] = useState<number | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  // A profile tapped on this page opens once the page has slid away — opening
  // one page while another is still closing froze the app before.
  const pendingProfile = useRef<ProfileRef | null>(null);

  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener('keyboardWillShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    // Wait for the slide-in before raising the keyboard.
    const focusTimer = autoFocus ? setTimeout(() => inputRef.current?.focus(), 320) : null;
    return () => {
      show.remove();
      hide.remove();
      if (focusTimer) clearTimeout(focusTimer);
      setKeyboardHeight(0);
    };
  }, [visible]);

  function openProfile(profile: ProfileRef) {
    if (profile.id === currentUserId) return;
    pendingProfile.current = profile;
    Keyboard.dismiss();
    onClose();
  }

  function handleDismiss() {
    setText('');
    const profile = pendingProfile.current;
    pendingProfile.current = null;
    if (profile) onViewProfile(profile);
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const ok = await onSend(trimmed);
    setSending(false);
    if (!ok) return;
    setText('');
    Keyboard.dismiss();
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }

  function handleMore(c: SessionComment) {
    const isOwn = c.user_id === currentUserId;
    const buttons: any[] = [];
    if (isOwn || isPostOwner) buttons.push({ text: 'Delete Comment', style: 'destructive', onPress: () => onDeleteComment(c) });
    if (!isOwn) buttons.push({ text: 'Report Comment', style: 'destructive', onPress: () => onReportComment(c) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Comment', undefined, buttons);
  }

  const canSend = text.trim().length > 0 && !sending;
  // The mirror Text sizes the box; iOS auto-grow is unreliable on device.
  const mirrorText = (text || 'Add a comment') + (text.endsWith('\n') ? ' ' : '');

  return (
    <PushScreen visible={visible} title="Comments" subtitle={subtitle} onBack={onClose} onDismiss={handleDismiss}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="never"
        showsVerticalScrollIndicator={false}
      >
        {likes.length > 0 && (
          <View style={styles.likesRow}>
            <Ionicons name="thumbs-up-outline" size={22} color={colors.textPrimary} />
            <LikesAvatarRow
              likers={likes}
              onPressLiker={l => openProfile({ id: l.userId, name: l.name, username: '', avatar_url: l.avatarUrl })}
              currentUserId={currentUserId}
              colors={colors}
            />
          </View>
        )}

        {comments.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>No comments yet. Start the conversation.</Text>
        ) : (
          comments.map(c => {
            const profile: ProfileRef = { id: c.user_id, name: c.profile?.name ?? 'Unknown', username: c.profile?.username ?? '', avatar_url: c.profile?.avatar_url ?? null };
            const likedBy = commentLikesMap[c.id] ?? [];
            const liked = likedBy.includes(currentUserId);
            return (
              <View key={c.id} style={styles.comment}>
                <TouchableOpacity onPress={() => openProfile(profile)} activeOpacity={0.7}>
                  <Avatar
                    name={profile.name}
                    avatarUrl={c.user_id === currentUserId ? myAvatar : profile.avatar_url}
                    size={40}
                    backgroundColor={colors.accentSoft}
                    textColor={colors.accent}
                  />
                </TouchableOpacity>
                <View style={styles.commentBody}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      <Text onPress={() => openProfile(profile)}>{profile.name}</Text>
                      {' · '}
                      {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true })}
                    </Text>
                    <TouchableOpacity onPress={() => handleMore(c)} activeOpacity={0.7} hitSlop={10}>
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.commentText, { color: colors.textPrimary }]}>{c.text}</Text>
                  <TouchableOpacity onPress={() => onLikeComment(c)} activeOpacity={0.7} style={styles.likeBtn} hitSlop={6}>
                    <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#e05c4a' : colors.textSecondary} />
                    <Text style={[styles.likeLabel, { color: liked ? '#e05c4a' : colors.textSecondary }]}>
                      {likedBy.length === 0 ? 'Like' : `${likedBy.length} ${likedBy.length === 1 ? 'like' : 'likes'}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Sits above the tab bar, or right on top of the keyboard while typing. */}
      <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingBottom: keyboardHeight > 0 ? keyboardHeight + SPACING.sm : tabBarSpace }]}>
        <View style={styles.inputWrap}>
          <Text
            style={[styles.input, styles.mirror]}
            onLayout={e => setInputHeight(Math.ceil(e.nativeEvent.layout.height))}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            {mirrorText}
          </Text>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.textPrimary }, inputHeight !== undefined && { height: Math.min(inputHeight, INPUT_MAX_HEIGHT) }]}
            placeholder="Add a comment"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            scrollEnabled={(inputHeight ?? 0) > INPUT_MAX_HEIGHT}
          />
        </View>
        <TouchableOpacity onPress={handleSend} disabled={!canSend} activeOpacity={0.7} hitSlop={8}>
          <Text style={[styles.send, { color: canSend ? colors.accent : colors.textMuted }]}>Send</Text>
        </TouchableOpacity>
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  likesRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingBottom: SPACING.lg },
  empty: { textAlign: 'center', marginTop: SPACING.xl, fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  comment: { flexDirection: 'row', gap: SPACING.md, paddingVertical: SPACING.md },
  commentBody: { flex: 1, gap: SPACING.xs },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  commentMeta: { flex: 1, fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  commentText: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.regular, lineHeight: 22 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingTop: 2 },
  likeLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  inputWrap: { flex: 1 },
  input: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.regular, paddingTop: 4, paddingBottom: 4, paddingHorizontal: 0 },
  mirror: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  send: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold, paddingBottom: 4 },
});
