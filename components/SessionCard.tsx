import React, { useState, useEffect, useRef, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Keyboard, Modal, Dimensions, Alert, Animated,
} from 'react-native';
import { PhotoGroup, useGroupedPhoto, preloadPhotos } from './PhotoGroup';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, CLIMB_TYPES } from '../utils/theme';
import { DaySession, sessionStats, sessionTimeOfDay, isTrainingClimb, TRAINING_KIND_LABEL } from '../utils/sessionHelpers';
import { formatRelativeDate } from '../utils/formatRelativeDate';
import { format } from 'date-fns';
import Avatar from './Avatar';
import SwipeableComment from './SwipeableComment';
import DiscussionScreen from './DiscussionScreen';
import LikesAvatarRow from './LikesAvatarRow';
import {
  getSessionLikes, getSessionComments, getCommentLikes,
  addSessionComment, deleteSessionComment, likeComment, unlikeComment,
  likeSession, unlikeSession,
  SessionLike, SessionComment,
} from '../utils/friendsApi';
import { sendCommentLikeNotification } from '../utils/notifications';
import PhotoViewer, { usePhotoOrigins, PhotoClipContext } from './PhotoViewer';

const PHOTO_HEIGHT = 220;

// Filled by prefetchSessionCards() so a list can wait for its cards' photo
// sizes and likes/comments, then show every card complete at once (like the
// Activity feed) instead of each piece popping in on its own.
const photoWidthCache: Record<string, number> = {};
type CardSocial = { likes: SessionLike[]; comments: SessionComment[]; commentLikes: Record<string, string[]>; at: number };
const socialCache: Record<string, CardSocial> = {};
// A card mounting this soon after a prefetch uses it instead of refetching.
const SOCIAL_FRESH_MS = 15000;

function sessionMediaUris(day: DaySession): string[] {
  const climbUris = day.climbs.flatMap(c => c.mediaUris && c.mediaUris.length > 0 ? c.mediaUris : c.mediaUri ? [c.mediaUri] : []);
  return [...(day.mediaUris ?? []), ...climbUris];
}

// Loads photo sizes and likes/comments for these cards. Gives up after
// `timeoutMs` (e.g. offline) so the list never waits forever; anything not
// ready by then loads inside the card as before.
export async function prefetchSessionCards(days: DaySession[], timeoutMs = 5000): Promise<void> {
  const uris = [...new Set(days.flatMap(sessionMediaUris))].filter(u => photoWidthCache[u] === undefined);
  const now = Date.now();
  const needSocial = days.filter(d => !socialCache[d.sessionId] || now - socialCache[d.sessionId].at > SOCIAL_FRESH_MS);
  const work = Promise.all([
    // Downloads the photos too (not just their sizes) so they're cached and
    // show up with the card rather than filling in one by one afterward.
    preloadPhotos(uris, PHOTO_HEIGHT).then(widths => { Object.assign(photoWidthCache, widths); }),
    ...needSocial.map(async d => {
      try {
        const [likes, comments] = await Promise.all([getSessionLikes(d.sessionId), getSessionComments(d.sessionId)]);
        const commentLikes = comments.length > 0 ? await getCommentLikes(comments.map(c => c.id)).catch(() => ({})) : {};
        socialCache[d.sessionId] = { likes, comments, commentLikes, at: Date.now() };
      } catch {}
    }),
  ]);
  await Promise.race([work, new Promise<void>(resolve => setTimeout(resolve, timeoutMs))]);
}

const NATURAL_PHOTO_MAX_RETRIES = 3;

function NaturalPhoto({ uri, onPress, viewRef }: { uri: string; onPress: () => void; viewRef?: (el: View | null) => void }) {
  const [imgWidth, setImgWidth] = useState<number | null>(photoWidthCache[uri] ?? null);
  const [retryCount, setRetryCount] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset fully whenever the photo itself changes, so one photo's failure
  // can never hide a different, unrelated one rendered by a reused instance.
  useEffect(() => {
    setImgWidth(photoWidthCache[uri] ?? null);
    setRetryCount(0);
    setFailed(false);
  }, [uri]);

  // A failed Image.getSize used to latch permanently (same bug as
  // ActivityCard's avatar): one transient hiccup — e.g. a flaky request
  // against the R2.dev subdomain — hid the photo for the rest of the app
  // session even though a later attempt at the same URL would've worked.
  // Retry a few times with backoff before actually giving up.
  useEffect(() => {
    if (retryCount === 0 && photoWidthCache[uri] !== undefined) return; // size already known
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        photoWidthCache[uri] = Math.round(PHOTO_HEIGHT * w / h);
        if (!cancelled) setImgWidth(photoWidthCache[uri]);
      },
      () => {
        if (cancelled) return;
        if (retryCount < NATURAL_PHOTO_MAX_RETRIES) {
          setTimeout(() => { if (!cancelled) setRetryCount(c => c + 1); }, 600);
        } else {
          setFailed(true);
        }
      },
    );
    return () => { cancelled = true; };
  }, [uri, retryCount]);

  const { opacity, onDone } = useGroupedPhoto(uri);
  useEffect(() => { if (failed) onDone(); }, [failed]);

  if (failed || imgWidth === null) return null;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Animated.View ref={viewRef} style={{ width: imgWidth, height: PHOTO_HEIGHT, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.1)', opacity }}>
        <Image
          key={`${uri}-${retryCount}`}
          source={{ uri }}
          style={{ width: imgWidth, height: PHOTO_HEIGHT }}
          resizeMode="cover"
          onLoad={onDone}
          onError={() => {
            if (retryCount < NATURAL_PHOTO_MAX_RETRIES) {
              setTimeout(() => setRetryCount(c => c + 1), 600);
            } else {
              setFailed(true);
            }
          }}
        />
      </Animated.View>
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
  onViewProfile: (profile: { id: string; name: string; username: string; avatar_url: string | null }) => void;
  condensed?: boolean;
}

export default function SessionCard({
  day, colors, currentUserId, myAvatar, onEdit, onShare, onViewProfile, condensed = false,
}: SessionCardProps) {
  const { sends, hardest, projecting, gradedCount, training } = sessionStats(day);
  // Header matches the Activity feed: "Yesterday at 3:29 PM · Indoor".
  const sessionTime = day.startedAt || day.lastClimbAt || day.climbs[0]?.date;
  const timeLabel = sessionTime && !isNaN(new Date(sessionTime).getTime()) ? ` at ${format(new Date(sessionTime), 'h:mm a')}` : '';
  const climbEnvs = [...new Set(day.climbs.map(c => c.environment).filter(Boolean))];
  const isOutdoor = climbEnvs.length === 1 && climbEnvs[0] === 'outdoor';
  // A session of only custom-graded climbs has no "hardest", so fall back to its first non-training climb.
  // A lift/hangboard-only session shows its training type and no climb count.
  const trainingOnly = training !== null;
  const typeSource = hardest ?? day.climbs.find(c => !isTrainingClimb(c));
  const climbTypeLabel = training ? TRAINING_KIND_LABEL[training] : (CLIMB_TYPES.find(t => t.id === typeSource?.type)?.label ?? '—');

  const cached = socialCache[day.sessionId];
  const [sessionLikes, setSessionLikes] = useState<SessionLike[]>(cached?.likes ?? []);
  const [sessionComments, setSessionComments] = useState<SessionComment[]>(cached?.comments ?? []);
  const [commentLikesMap, setCommentLikesMap] = useState<Record<string, string[]>>(cached?.commentLikes ?? {});
  // Full comment thread page; the card shows only the first few comments.
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [discussionFocus, setDiscussionFocus] = useState(false);

  useEffect(() => {
    const c = socialCache[day.sessionId];
    if (c && Date.now() - c.at < SOCIAL_FRESH_MS) {
      // Just prefetched by the list; use that instead of fetching again.
      setSessionLikes(c.likes);
      setSessionComments(c.comments);
      setCommentLikesMap(c.commentLikes);
      return;
    }
    Promise.all([
      getSessionLikes(day.sessionId),
      getSessionComments(day.sessionId),
    ]).then(([likes, comments]) => {
      setSessionLikes(likes);
      setSessionComments(comments);
      if (comments.length > 0) {
        getCommentLikes(comments.map(c => c.id)).then(setCommentLikesMap).catch(() => {});
      }
    }).catch(() => {});
  }, [day.sessionId]);

  const liked = sessionLikes.some(l => l.user_id === currentUserId);

  function handleLikeToggle() {
    if (!currentUserId) return;
    const alreadyLiked = sessionLikes.some(l => l.user_id === currentUserId);
    if (alreadyLiked) {
      setSessionLikes(prev => prev.filter(l => l.user_id !== currentUserId));
      unlikeSession(day.sessionId, currentUserId).catch(() => {});
    } else {
      setSessionLikes(prev => [...prev, { user_id: currentUserId, session_id: day.sessionId, created_at: new Date().toISOString() } as SessionLike]);
      likeSession(day.sessionId, currentUserId).catch(() => {});
    }
  }

  async function handleCommentLikeToggle(commentId: string, commentAuthorId: string) {
    if (!currentUserId) return;
    const likedBy = commentLikesMap[commentId] ?? [];
    const alreadyLiked = likedBy.includes(currentUserId);
    try {
      if (alreadyLiked) {
        await unlikeComment(commentId, currentUserId);
        setCommentLikesMap(prev => ({ ...prev, [commentId]: likedBy.filter(id => id !== currentUserId) }));
      } else {
        await likeComment(commentId, currentUserId);
        setCommentLikesMap(prev => ({ ...prev, [commentId]: [...likedBy, currentUserId] }));
        if (commentAuthorId !== currentUserId) {
          sendCommentLikeNotification(commentAuthorId, currentUserId, day.sessionId, commentId).catch(() => {});
        }
      }
    } catch {
      // Swallow — a failed like/unlike leaves commentLikesMap unchanged
      // (state is only updated after the API call succeeds above), so
      // there's nothing to roll back, just nothing left to silently reject.
    }
  }

  async function handleDeleteSessionComment(commentId: string) {
    await deleteSessionComment(commentId);
    const updated = await getSessionComments(day.sessionId);
    setSessionComments(updated);
  }

  async function handleSendSessionComment(text: string): Promise<boolean> {
    if (!currentUserId || !text.trim()) return false;
    try {
      await addSessionComment(day.sessionId, currentUserId, text.trim());
    } catch (err: any) {
      Alert.alert('Could not post comment', err?.message ?? 'Unknown error');
      return false;
    }
    const updated = await getSessionComments(day.sessionId);
    setSessionComments(updated);
    return true;
  }

  function openDiscussion(focus: boolean) {
    setDiscussionFocus(focus);
    setDiscussionOpen(true);
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
  const { origins: photoOrigins, register: registerPhoto } = usePhotoOrigins();
  const photoClip = useContext(PhotoClipContext);
  const [viewerIndex, setViewerIndex] = useState(0);


  return (
    <TouchableOpacity activeOpacity={1} style={[styles.card, { borderBottomColor: colors.bgElevated }]} onPress={onEdit}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Avatar
          name="You"
          avatarUrl={myAvatar ?? null}
          size={44}
          backgroundColor={colors.accentSoft}
          textColor={colors.accent}
          style={{ borderWidth: 2, borderColor: colors.accent }}
        />
        <View style={styles.headerInfo}>
          <Text style={[styles.cardName, { color: colors.textPrimary }]}>You</Text>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
            {formatRelativeDate(day.date)}{timeLabel} · {isOutdoor ? 'Outdoor' : 'Indoor'}
          </Text>
          {hasLocation ? (
            <View style={[styles.cardLocationRow, { paddingBottom: 0, paddingTop: 4 }]}>
              <Ionicons name="location-sharp" size={13} color={colors.textSecondary} />
              <Text style={[styles.cardLocation, { color: colors.textSecondary }]} numberOfLines={1}>{day.location!.trim()}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.cardTitleRow}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {day.title?.trim() || sessionTimeOfDay(day)}
        </Text>
      </View>

      {/* Notes */}
      {!condensed && hasNotes && (
        <Text style={[styles.cardNotes, { color: colors.textPrimary }]}>{day.notes}</Text>
      )}

      {/* Climbing with */}
      {!condensed && hasFriends && (
        <View style={styles.partnersRow}>
          <Text style={[styles.partnersLabel, { color: colors.textMuted }]}>with </Text>
          {day.friends!.map((f, i) => (
            <TouchableOpacity
              key={f.id}
              style={styles.partnerChip}
              activeOpacity={0.7}
              onPress={() => {
                if (f.id === currentUserId) return;
                onViewProfile({ id: f.id, name: f.name, username: '', avatar_url: null });
              }}
            >
              <InitialsAvatar name={f.name} colors={colors} />
              <Text style={[styles.partnerName, { color: colors.accent }]}>
                {f.name}{i < day.friends!.length - 1 ? ',' : ''}
              </Text>
            </TouchableOpacity>
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
              <Text style={[styles.cardStatLbl, { color: colors.textSecondary }]}>Type</Text>
            </View>
            {/* Empty columns keep Type in the same left-hand spot as on climbing cards */}
            {trainingOnly && (
              <>
                <View style={styles.cardStat} />
                <View style={styles.cardStat} />
              </>
            )}
            {!trainingOnly && (
              <>
                <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.cardStat}>
                  <Text style={[styles.cardStatNum, { color: colors.textPrimary }]}>{gradedCount}</Text>
                  <Text style={[styles.cardStatLbl, { color: colors.textSecondary }]}>Climbs</Text>
                </View>
              </>
            )}
            {hardest && (
              <>
                <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.cardStat}>
                  <Text style={[styles.cardStatNum, { color: colors.accent }]}>{hardest.grade}</Text>
                  <Text style={[styles.cardStatLbl, { color: colors.textSecondary }]}>Hardest</Text>
                </View>
              </>
            )}
          </>
        )}
      </View>

      {/* Photos */}
      {!condensed && hasMedia && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
          contentContainerStyle={styles.photoStripContent}
        >
          <PhotoGroup uris={allMedia.map(m => m.uri)}>
          {allMedia.map((item, idx) => (
            <NaturalPhoto
              key={idx}
              uri={item.uri}
              viewRef={registerPhoto(item.uri)}
              onPress={() => { setViewerUris(allMedia.map(m => m.uri)); setViewerIndex(idx); }}
            />
          ))}
          </PhotoGroup>
        </ScrollView>
      )}

      {/* View climbs — opens the session, like the feed's button */}
      {!condensed && (
        <TouchableOpacity
          onPress={onEdit}
          activeOpacity={0.7}
          style={[styles.cardExpandBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.cardExpandTxt, { color: colors.textPrimary }]}>
            {training === 'lift' ? 'View lift' : training === 'hangboard' ? 'View hang' : training === 'both' ? 'View lift + hang' : 'View climbs'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Likes / comment counts */}
      {!condensed && (sessionLikes.length > 0 || sessionComments.length > 0) && (
        <View style={styles.cardCounts}>
          <LikesAvatarRow
            likers={sessionLikes.map(l => ({ id: l.id ?? l.user_id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === currentUserId ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
            onPressLiker={(l) => onViewProfile({ id: l.userId, name: l.name, username: '', avatar_url: l.avatarUrl })}
            currentUserId={currentUserId}
            colors={colors}
          />
          {sessionComments.length > 0 && (
            <Text style={[styles.cardCountTxt, { color: colors.textMuted }]} onPress={() => openDiscussion(false)}>
              {sessionComments.length} {sessionComments.length === 1 ? 'comment' : 'comments'}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      {!condensed && (
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={handleLikeToggle}>
            <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={24} color={liked ? colors.accent : colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={() => openDiscussion(true)}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={onShare}>
            <Ionicons name="share-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Comment thread */}
      {!condensed && sessionComments.length > 0 && (
        <View style={[styles.commentSection, { borderTopColor: colors.border }]}>
          {sessionComments.slice(0, 3).map(c => (
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
              onPress={() => openDiscussion(false)}
            />
          ))}
          {sessionComments.length > 3 && (
            <TouchableOpacity onPress={() => openDiscussion(false)} activeOpacity={0.7}>
              <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>View all {sessionComments.length} comments</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <DiscussionScreen
        visible={discussionOpen}
        onClose={() => setDiscussionOpen(false)}
        subtitle={`You · ${formatRelativeDate(day.date)}`}
        likes={sessionLikes.map(l => ({ id: l.id ?? l.user_id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === currentUserId ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
        comments={sessionComments}
        commentLikesMap={commentLikesMap}
        currentUserId={currentUserId ?? ''}
        myAvatar={myAvatar ?? null}
        isPostOwner={true}
        autoFocus={discussionFocus}
        colors={colors}
        onSend={handleSendSessionComment}
        onDeleteComment={c => handleDeleteSessionComment(c.id)}
        onReportComment={() => {}}
        onLikeComment={c => handleCommentLikeToggle(c.id, c.user_id)}
        onViewProfile={onViewProfile}
      />

      {/* Photo viewer for this card's media */}
      {viewerUris && (
        <PhotoViewer
          uris={viewerUris}
          initialIndex={viewerIndex}
          origins={photoOrigins}
          clipTo={photoClip}
          onClose={() => setViewerUris(null)}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderBottomWidth: 3,
    paddingVertical: SPACING.xl,
    marginHorizontal: -SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingBottom: SPACING.md },
  headerInfo: { flex: 1 },
  cardName: { fontSize: 14, fontFamily: FONTS.family.bold, marginBottom: 1 },
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
  dateLabel: { fontSize: 12, fontFamily: FONTS.family.regular },
  cardTitleRow: { paddingTop: SPACING.xs, paddingBottom: SPACING.xs },
  cardTitle: { fontSize: 19, fontFamily: FONTS.family.bold, letterSpacing: -0.3 },
  cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: SPACING.xs },
  cardLocation: { fontSize: 12, fontFamily: FONTS.family.regular },
  cardNotes: { fontSize: 14, fontFamily: FONTS.family.regular, lineHeight: 20, paddingBottom: SPACING.sm },
  partnersRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingBottom: SPACING.md, gap: SPACING.xs },
  partnersLabel: { fontSize: 12, fontFamily: FONTS.family.regular },
  partnerChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  partnerAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  partnerAvatarText: { fontSize: 9, fontFamily: FONTS.family.bold },
  partnerName: { fontSize: 12, fontFamily: FONTS.family.medium },
  cardStatsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, gap: 0 },
  cardStat: { flex: 1, alignItems: 'center' },
  cardStatNum: { fontSize: 18, fontFamily: FONTS.family.bold, letterSpacing: -0.3, marginBottom: 2, textAlign: 'center' },
  cardStatLbl: { fontSize: 12, fontFamily: FONTS.family.regular },
  cardStatDivider: { width: 1, height: 32 },
  photoStrip: { marginTop: SPACING.md, marginHorizontal: -SPACING.xl },
  photoStripContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
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
});
