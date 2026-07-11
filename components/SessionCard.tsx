import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Keyboard, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { DaySession, sessionStats, mergeClimbs, formatSessionLabel, sessionTimeOfDay } from '../utils/sessionHelpers';
import ClimbCard from './ClimbCard';
import SwipeToDelete from './SwipeToDelete';
import SwipeableComment from './SwipeableComment';
import LikesAvatarRow from './LikesAvatarRow';
import {
  getSessionLikes, getSessionComments, getCommentLikes,
  addSessionComment, deleteSessionComment, likeComment, unlikeComment,
  SessionLike, SessionComment,
} from '../utils/friendsApi';
import { sendCommentLikeNotification } from '../utils/notifications';

interface SessionCardProps {
  day: DaySession;
  colors: any;
  currentUserId: string | undefined;
  myAvatar: string | null | undefined;
  onEdit: () => void;
  onShare: () => void;
  onOpenClimb: (climb: Climb) => void;
  onDeleteClimb: (climbId: string) => void | Promise<void>;
  onViewProfile: (profile: { id: string; name: string; username: string; avatar_url: string | null }) => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
}

export default function SessionCard({
  day, colors, currentUserId, myAvatar, onEdit, onShare, onOpenClimb, onDeleteClimb, onViewProfile, onSwipeStart, onSwipeEnd,
}: SessionCardProps) {
  const { sends, hardest, projecting, gradedCount } = sessionStats(day);
  const label = formatSessionLabel(day);
  const hardestTypeColor = CLIMB_TYPES.find(t => t.id === hardest?.type)?.color ?? colors.accent;
  const displayClimbs = mergeClimbs(day.climbs);

  const [climbsExpanded, setClimbsExpanded] = useState(false);

  const [sessionLikes, setSessionLikes] = useState<SessionLike[]>([]);
  const [sessionComments, setSessionComments] = useState<SessionComment[]>([]);
  const [commentLikesMap, setCommentLikesMap] = useState<Record<string, string[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  useEffect(() => {
    Promise.all([
      getSessionLikes(day.sessionId),
      getSessionComments(day.sessionId),
    ]).then(([likes, comments]) => {
      setSessionLikes(likes);
      setSessionComments(comments);
      if (comments.length > 0) {
        getCommentLikes(comments.map(c => c.id)).then(setCommentLikesMap);
      }
    });
  }, [day.sessionId]);

  async function handleCommentLikeToggle(commentId: string, commentAuthorId: string) {
    if (!currentUserId) return;
    const likedBy = commentLikesMap[commentId] ?? [];
    const alreadyLiked = likedBy.includes(currentUserId);
    if (alreadyLiked) {
      await unlikeComment(commentId, currentUserId);
      setCommentLikesMap(prev => ({ ...prev, [commentId]: likedBy.filter(id => id !== currentUserId) }));
    } else {
      await likeComment(commentId, currentUserId);
      setCommentLikesMap(prev => ({ ...prev, [commentId]: [...likedBy, currentUserId] }));
      if (commentAuthorId !== currentUserId) {
        sendCommentLikeNotification(commentAuthorId, currentUserId, day.sessionId).catch(() => {});
      }
    }
  }

  async function handleDeleteSessionComment(commentId: string) {
    await deleteSessionComment(commentId);
    const updated = await getSessionComments(day.sessionId);
    setSessionComments(updated);
  }

  async function handleSendSessionComment() {
    if (!currentUserId || !commentText.trim()) return;
    await addSessionComment(day.sessionId, currentUserId, commentText.trim());
    setCommentText('');
    Keyboard.dismiss();
    const updated = await getSessionComments(day.sessionId);
    setSessionComments(updated);
  }

  const climbMedia: { uri: string; type: 'photo' | 'video'; fromClimb: true; climbId: string }[] = [];
  for (const c of day.climbs) {
    if (c.mediaUris && c.mediaUris.length > 0) {
      c.mediaUris.forEach((uri, i) => climbMedia.push({ uri, type: c.mediaTypes?.[i] ?? 'photo', fromClimb: true, climbId: c.id }));
    } else if (c.mediaUri) {
      climbMedia.push({ uri: c.mediaUri, type: c.mediaType ?? 'photo', fromClimb: true, climbId: c.id });
    }
  }
  const sessionMediaItems = (day.mediaUris ?? []).map((uri, i) => ({ uri, type: day.mediaTypes?.[i] ?? 'photo' as const }));
  const allMedia = [...sessionMediaItems, ...climbMedia];

  const hasNotes = (day.notes ?? '').trim().length > 0;
  const hasLocation = (day.location ?? '').trim().length > 0;
  const hasFriends = (day.friends?.length ?? 0) > 0;
  const hasMedia = allMedia.length > 0;

  const [viewerUris, setViewerUris] = useState<string[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const visibleComments = commentsExpanded ? sessionComments : sessionComments.slice(0, 3);
  const hiddenCommentCount = sessionComments.length - 3;

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dayLabel, { color: colors.textMuted }]}>{label.top} · {label.bottom}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {day.title?.trim() || sessionTimeOfDay(day)}
          </Text>
          {hasFriends && (
            <Text style={[styles.friendsLine, { color: colors.textMuted }]}>
              with {day.friends!.map(f => f?.name ?? f).join(', ')}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={onEdit} style={styles.editBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
        {projecting ? (
          <Text style={[styles.statLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
        ) : (
          <>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.textPrimary }]}>{gradedCount}</Text>
              <Text style={[styles.statLbl, { color: colors.textMuted }]}>climbs</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.textPrimary }]}>{sends}</Text>
              <Text style={[styles.statLbl, { color: colors.textMuted }]}>sends</Text>
            </View>
          </>
        )}
        {hardest && (
          <View style={[styles.hardestBadge, { backgroundColor: hardestTypeColor + '25', borderColor: hardestTypeColor }]}>
            <Text style={[styles.hardestText, { color: hardestTypeColor }]}>{hardest.grade}</Text>
          </View>
        )}
      </View>

      {/* Notes */}
      {hasNotes && (
        <Text style={[styles.notesText, { color: colors.textSecondary }]}>{day.notes}</Text>
      )}

      {/* Location */}
      {hasLocation && (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.locationText, { color: colors.textPrimary }]} numberOfLines={1}>{day.location}</Text>
        </View>
      )}

      {/* Media */}
      {hasMedia && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaScroll}>
          {allMedia.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => { setViewerUris(allMedia.map(m => m.uri)); setViewerIndex(idx); }}
              activeOpacity={0.9}
              style={{ marginRight: SPACING.sm }}
            >
              <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Climbs — collapsed by default */}
      <TouchableOpacity onPress={() => setClimbsExpanded(v => !v)} style={styles.climbsToggle} activeOpacity={0.7}>
        <Text style={[styles.climbsToggleText, { color: colors.textPrimary }]}>
          {climbsExpanded ? 'Hide climbs' : 'View climbs'}
        </Text>
        <Ionicons name={climbsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {climbsExpanded && (
        <View style={{ gap: SPACING.sm }}>
          {displayClimbs.length === 0 ? (
            <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
          ) : (
            displayClimbs.map(c => (
              <SwipeToDelete key={c.id} heightOffset={0} onDelete={() => onDeleteClimb(c.id)} onSwipeStart={onSwipeStart} onSwipeEnd={onSwipeEnd}>
                <ClimbCard climb={c} compact onPress={() => onOpenClimb(c)} />
              </SwipeToDelete>
            ))
          )}
        </View>
      )}

      {/* Activity: likes + comments */}
      <View style={[styles.activitySection, { borderTopColor: colors.border }]}>
        <LikesAvatarRow
          likers={sessionLikes.map(l => ({ id: l.id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === currentUserId ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
          onPressLiker={(l) => onViewProfile({ id: l.userId, name: l.name, username: '', avatar_url: l.avatarUrl })}
          currentUserId={currentUserId}
          colors={colors}
        />
        {sessionComments.length > 0 && (
          <View style={{ marginTop: SPACING.sm }}>
            {visibleComments.map(c => (
              <SwipeableComment
                key={c.id}
                c={c}
                isOwn // this card only ever shows your own session, so you can always delete
                onDelete={() => handleDeleteSessionComment(c.id)}
                onReport={() => {}} // never reportable on your own post
                onLike={() => handleCommentLikeToggle(c.id, c.user_id)}
                onNamePress={() => {
                  if (c.user_id === currentUserId) return;
                  onViewProfile({ id: c.user_id, name: c.profile?.name ?? 'Unknown', username: c.profile?.username ?? '', avatar_url: c.profile?.avatar_url ?? null });
                }}
                colors={colors}
                commentAvatarUrl={c.user_id === currentUserId ? (myAvatar ?? null) : (c.profile?.avatar_url ?? null)}
                likedByUserIds={commentLikesMap[c.id] ?? []}
                currentUserId={currentUserId ?? ''}
              />
            ))}
            {!commentsExpanded && hiddenCommentCount > 0 && (
              <TouchableOpacity onPress={() => setCommentsExpanded(true)} activeOpacity={0.7}>
                <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>View {hiddenCommentCount} more comment{hiddenCommentCount > 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            )}
            {commentsExpanded && sessionComments.length > 3 && (
              <TouchableOpacity onPress={() => setCommentsExpanded(false)} activeOpacity={0.7}>
                <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>Show less</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={[styles.commentInputRow, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <TextInput
            style={[styles.commentInputText, { color: colors.textPrimary }]}
            placeholder="Add a comment..."
            placeholderTextColor={colors.textMuted}
            value={commentText}
            onChangeText={setCommentText}
            multiline
          />
          <TouchableOpacity onPress={handleSendSessionComment} activeOpacity={0.7}>
            <Ionicons name="send" size={18} color={commentText.trim() ? colors.accent : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Action row */}
      <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={() => setCommentsExpanded(true)}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={onShare}>
          <Ionicons name="share-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Photo viewer for this card's media (own lightweight modal — see Step 2) */}
      {viewerUris && (
        <SessionCardPhotoViewer
          uris={viewerUris}
          initialIndex={viewerIndex}
          onClose={() => setViewerUris(null)}
        />
      )}
    </View>
  );
}

function SessionCardPhotoViewer({ uris, initialIndex, onClose }: { uris: string[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * screenWidth, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
          <TouchableOpacity onPress={onClose} style={{ position: 'absolute', top: 54, right: 20, zIndex: 10, padding: 6 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          {uris.length > 1 && (
            <View style={{ position: 'absolute', top: 58, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium }}>{index + 1} / {uris.length}</Text>
            </View>
          )}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth))}
            style={{ flex: 1 }}
          >
            {uris.map((uri, i) => (
              <View key={i} style={{ width: screenWidth, height: screenHeight, justifyContent: 'center', alignItems: 'center' }}>
                <Image source={{ uri }} style={{ width: screenWidth, height: screenHeight * 0.8 }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderBottomWidth: 3, paddingVertical: SPACING.lg, gap: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dayLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.bold, letterSpacing: 1 },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.family.bold, lineHeight: 28, marginTop: SPACING.xs },
  friendsLine: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 },
  editBtn: { padding: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, paddingTop: SPACING.sm, borderTopWidth: 1 },
  stat: { alignItems: 'center' },
  statVal: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold, textAlign: 'center' },
  statLbl: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, textAlign: 'center' },
  hardestBadge: { borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderWidth: 1 },
  hardestText: { fontSize: FONTS.sizes.sm },
  notesText: { fontSize: FONTS.sizes.sm, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  locationText: { flex: 1, fontSize: FONTS.sizes.md },
  mediaScroll: { flexGrow: 0 },
  mediaThumbnail: { width: 120, height: 120, borderRadius: 8, backgroundColor: '#222' },
  climbsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.xs },
  climbsToggleText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium },
  noClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.md },
  activitySection: { borderTopWidth: 1, paddingTop: SPACING.md },
  commentShowMore: { fontSize: FONTS.sizes.sm, marginTop: SPACING.xs },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  commentInputText: { flex: 1, fontSize: FONTS.sizes.sm, maxHeight: 80 },
  actionsRow: { flexDirection: 'row', gap: SPACING.lg, borderTopWidth: 1, paddingTop: SPACING.sm },
  actionBtn: { padding: 4 },
});
