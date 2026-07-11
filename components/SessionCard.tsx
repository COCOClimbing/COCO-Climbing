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

const PHOTO_HEIGHT = 220;

function NaturalPhoto({ uri, onPress }: { uri: string; onPress: () => void }) {
  const [imgWidth, setImgWidth] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Image.getSize(
      uri,
      (w, h) => setImgWidth(Math.round(PHOTO_HEIGHT * w / h)),
      () => setFailed(true),
    );
  }, [uri]);

  if (failed || imgWidth === null) return null;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View style={{ width: imgWidth, height: PHOTO_HEIGHT, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.1)' }}>
        <Image
          source={{ uri }}
          style={{ width: imgWidth, height: PHOTO_HEIGHT }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      </View>
    </TouchableOpacity>
  );
}

function InitialsAvatar({ name, colors }: { name: string; colors: any }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <View style={[styles.partnerAvatar, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
      <Text style={[styles.partnerAvatarText, { color: colors.accent }]}>{initials}</Text>
    </View>
  );
}

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
  const displayClimbs = mergeClimbs(day.climbs);
  const climbTypeLabel = CLIMB_TYPES.find(t => t.id === hardest?.type)?.label ?? '—';

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
        <Text style={[styles.dateLabel, { color: colors.textMuted }]}>{label.top} · {label.bottom}</Text>
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.cardTitleRow}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {day.title?.trim() || sessionTimeOfDay(day)}
        </Text>
      </View>

      {/* Location */}
      {hasLocation && (
        <View style={styles.cardLocationRow}>
          <Ionicons name="location-sharp" size={11} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text style={[styles.cardLocation, { color: colors.textMuted }]}>{day.location}</Text>
        </View>
      )}

      {/* Notes */}
      {hasNotes && (
        <Text style={[styles.cardNotes, { color: colors.textSecondary }]}>{day.notes}</Text>
      )}

      {/* Climbing with */}
      {hasFriends && (
        <View style={styles.partnersRow}>
          <Text style={[styles.partnersLabel, { color: colors.textMuted }]}>with </Text>
          {day.friends!.map((f, i) => (
            <View key={f.id} style={styles.partnerChip}>
              <InitialsAvatar name={f.name} colors={colors} />
              <Text style={[styles.partnerName, { color: colors.accent }]}>
                {f.name}{i < day.friends!.length - 1 ? ',' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Stats */}
      <View style={styles.cardStatsRow}>
        {projecting ? (
          <Text style={[styles.cardStatNum, { color: colors.accent, textAlign: 'left', fontFamily: FONTS.family.semibold }]}>Projecting</Text>
        ) : (
          <>
            <View style={styles.cardStat}>
              <Text style={[styles.cardStatNum, { color: colors.textPrimary }]}>{climbTypeLabel}</Text>
              <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Type</Text>
            </View>
            <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.cardStat}>
              <Text style={[styles.cardStatNum, { color: colors.textPrimary }]}>{gradedCount}</Text>
              <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Climbs</Text>
            </View>
            {hardest && (
              <>
                <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.cardStat}>
                  <Text style={[styles.cardStatNum, { color: colors.accent }]}>{hardest.grade}</Text>
                  <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Hardest</Text>
                </View>
              </>
            )}
          </>
        )}
      </View>

      {/* Photos */}
      {hasMedia && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
          contentContainerStyle={styles.photoStripContent}
        >
          {allMedia.map((item, idx) => (
            <NaturalPhoto
              key={idx}
              uri={item.uri}
              onPress={() => { setViewerUris(allMedia.map(m => m.uri)); setViewerIndex(idx); }}
            />
          ))}
        </ScrollView>
      )}

      {/* Climbs — collapsed by default */}
      <TouchableOpacity
        onPress={() => setClimbsExpanded(v => !v)}
        activeOpacity={0.7}
        style={[styles.cardExpandBtn, { borderColor: colors.border }]}
      >
        <Text style={[styles.cardExpandTxt, { color: colors.textPrimary }]}>
          {climbsExpanded ? 'Hide climbs' : 'View climbs'}
        </Text>
        <Ionicons name={climbsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {climbsExpanded && (
        <View style={{ gap: SPACING.sm, marginBottom: SPACING.md }}>
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

      {/* Likes / comment counts */}
      {(sessionLikes.length > 0 || sessionComments.length > 0) && (
        <View style={styles.cardCounts}>
          <LikesAvatarRow
            likers={sessionLikes.map(l => ({ id: l.id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === currentUserId ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
            onPressLiker={(l) => onViewProfile({ id: l.userId, name: l.name, username: '', avatar_url: l.avatarUrl })}
            currentUserId={currentUserId}
            colors={colors}
          />
          {sessionComments.length > 0 && (
            <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
              {sessionComments.length} {sessionComments.length === 1 ? 'comment' : 'comments'}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={() => setCommentsExpanded(true)}>
          <Ionicons name="chatbubble-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={onShare}>
          <Ionicons name="share-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Comment thread */}
      {sessionComments.length > 0 && (
        <View style={[styles.commentSection, { borderTopColor: colors.border }]}>
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

      {/* Comment input */}
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

      {/* Photo viewer for this card's media */}
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
  card: {
    borderBottomWidth: 3,
    paddingVertical: SPACING.xl,
    marginHorizontal: -SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: SPACING.xs },
  dateLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardTitleRow: { paddingTop: SPACING.xs, paddingBottom: SPACING.xs },
  cardTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold, letterSpacing: -0.2 },
  cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: SPACING.xs },
  cardLocation: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardNotes: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, lineHeight: 20, paddingBottom: SPACING.sm },
  partnersRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingBottom: SPACING.md, gap: SPACING.xs },
  partnersLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  partnerChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  partnerAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  partnerAvatarText: { fontSize: 9, fontFamily: FONTS.family.bold },
  partnerName: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium },
  cardStatsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, gap: 0 },
  cardStat: { flex: 1, alignItems: 'center' },
  cardStatNum: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold, letterSpacing: -0.3, marginBottom: 2, textAlign: 'center' },
  cardStatLbl: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardStatDivider: { width: 1, height: 32 },
  photoStrip: { marginTop: SPACING.md, marginHorizontal: -SPACING.xl },
  photoStripContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  cardExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardExpandTxt: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  noClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.md },
  cardCounts: { flexDirection: 'row', gap: SPACING.md, paddingBottom: SPACING.xs, marginTop: SPACING.md, alignItems: 'center' },
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: SPACING.xs,
  },
  cardActionBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md },
  commentSection: { borderTopWidth: 1, marginTop: SPACING.md, paddingTop: SPACING.lg, gap: SPACING.sm },
  commentShowMore: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium, paddingVertical: 2 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  commentInputText: { flex: 1, fontSize: FONTS.sizes.sm, maxHeight: 80 },
});
