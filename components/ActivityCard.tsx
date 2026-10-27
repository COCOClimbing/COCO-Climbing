import React, { useState, useEffect, useRef, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Keyboard, Modal, Dimensions, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import ClimbCard from './ClimbCard';
import { defaultSessionTitle, trainingKind } from '../utils/sessionHelpers';
import ClimbDetailModal from './ClimbDetailModal';
import SwipeableComment from './SwipeableComment';
import DiscussionScreen from './DiscussionScreen';
import LikesAvatarRow from './LikesAvatarRow';
import Avatar from './Avatar';
import { formatRelativeDate } from '../utils/formatRelativeDate';
import { format } from 'date-fns';
import {
  getSessionLikes, getSessionComments, getCommentLikes,
  addSessionComment, deleteSessionComment, likeComment, unlikeComment,
  likeSession, unlikeSession, getFriendRecentClimbs,
  SessionLike, SessionComment, SessionSummary,
} from '../utils/friendsApi';
import { sendLikeNotification, sendCommentNotification, sendCommentLikeNotification } from '../utils/notifications';
import { reportContent } from '../utils/moderationApi';
import PhotoViewer, { usePhotoOrigins, PhotoClipContext } from './PhotoViewer';

const PHOTO_HEIGHT = 220;

function NaturalPhoto({ uri, initialWidth, onPress, viewRef }: { uri: string; initialWidth?: number; onPress: () => void; viewRef?: (el: View | null) => void }) {
  const [imgWidth, setImgWidth] = useState<number | null>(initialWidth ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initialWidth) return;
    Image.getSize(
      uri,
      (w, h) => setImgWidth(Math.round(PHOTO_HEIGHT * w / h)),
      () => setFailed(true),
    );
  }, [uri, initialWidth]);

  if (failed || imgWidth === null) return null;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View ref={viewRef} style={{ width: imgWidth, height: PHOTO_HEIGHT, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.1)' }}>
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

function ProfileAvatar({ name, avatarUrl, size, colors }: { name: string; avatarUrl: string | null; size: number; colors: any }) {
  return (
    <Avatar
      name={name}
      avatarUrl={avatarUrl}
      size={size}
      backgroundColor={colors.accentSoft}
      textColor={colors.accent}
      style={{ borderWidth: 2, borderColor: colors.accent }}
    />
  );
}

function mapToClimb(c: any): Climb {
  return {
    id: c.id, date: c.date, sessionId: c.session_id,
    type: c.type, outcome: c.outcome, styles: c.styles ?? [],
    environment: c.environment, grade: c.grade, gradeSystem: c.grade_system,
    routeName: c.route_name, holdColor: c.hold_color, location: c.location, notes: c.notes,
    routine: c.routine ?? undefined,
    attempts: c.attempts, mediaUri: c.media_uri, mediaType: c.media_type,
    mediaUris: c.media_uris ?? (c.media_uri ? [c.media_uri] : undefined),
    mediaTypes: c.media_types ?? (c.media_type ? [c.media_type] : undefined),
    projectId: c.project_id, projectName: c.project_name,
  };
}

interface ActivityCardProps {
  entry: SessionSummary;
  colors: any;
  currentUserId: string | undefined;
  myAvatar: string | null | undefined;
  daysBack: number;
  displayGrade: (grade: string | null, fromSystem: string | null) => string;
  onShare: () => void;
  onViewProfile: (profile: { id: string; name: string; username: string; avatar_url: string | null }) => void;
}

export default function ActivityCard({
  entry, colors, currentUserId, myAvatar, daysBack, displayGrade, onShare, onViewProfile,
}: ActivityCardProps) {
  const isOutdoor = entry.environment === 'outdoor';

  const [climbsExpanded, setClimbsExpanded] = useState(false);
  // Climb/lift/hang opened from the expanded list (read-only)
  const [detailClimb, setDetailClimb] = useState<Climb | null>(null);
  const [expandedClimbs, setExpandedClimbs] = useState<Climb[] | null>(null);
  const [loadingClimbs, setLoadingClimbs] = useState(false);

  const [sessionLikes, setSessionLikes] = useState<SessionLike[]>([]);
  const [sessionComments, setSessionComments] = useState<SessionComment[]>([]);
  const [commentLikesMap, setCommentLikesMap] = useState<Record<string, string[]>>({});
  // Full comment thread page; the card shows only the first few comments.
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [discussionFocus, setDiscussionFocus] = useState(false);

  useEffect(() => {
    if (!entry.sessionId) return;
    Promise.all([
      getSessionLikes(entry.sessionId),
      getSessionComments(entry.sessionId),
    ]).then(([likes, comments]) => {
      setSessionLikes(likes);
      setSessionComments(comments);
      if (comments.length > 0) {
        getCommentLikes(comments.map(c => c.id)).then(setCommentLikesMap).catch(() => {});
      }
    }).catch(() => {});
  }, [entry.sessionId]);

  async function handleToggleClimbs() {
    if (climbsExpanded) { setClimbsExpanded(false); return; }
    setClimbsExpanded(true);
    // Refetch on every open so edits made since (e.g. a routine) show up; keep the
    // previous list on screen meanwhile rather than flashing "Loading…"
    if (expandedClimbs === null) setLoadingClimbs(true);
    try {
      const fetched = await getFriendRecentClimbs(entry.friend.id, daysBack);
      const normDate = (d: string) => (d ?? '').slice(0, 10);
      const mapped = fetched
        .filter((c: any) => entry.sessionId ? c.session_id === entry.sessionId : normDate(c.date) === normDate(entry.sessionDate))
        .map(mapToClimb);
      setExpandedClimbs(mapped);
    } catch {
      setExpandedClimbs([]);
    }
    setLoadingClimbs(false);
  }

  const liked = sessionLikes.some(l => l.user_id === currentUserId);

  function handleLikeToggle() {
    if (!currentUserId || !entry.sessionId) return;
    const sessionId = entry.sessionId;
    const alreadyLiked = sessionLikes.some(l => l.user_id === currentUserId);
    if (alreadyLiked) {
      setSessionLikes(prev => prev.filter(l => l.user_id !== currentUserId));
      unlikeSession(sessionId, currentUserId).catch(() => {});
    } else {
      setSessionLikes(prev => [...prev, { user_id: currentUserId, session_id: sessionId, created_at: new Date().toISOString() } as SessionLike]);
      likeSession(sessionId, currentUserId).catch(() => {});
      if (entry.friend.id !== currentUserId) {
        sendLikeNotification(entry.friend.id, currentUserId, sessionId).catch(() => {});
      }
    }
  }

  async function handleCommentLikeToggle(commentId: string, commentAuthorId: string) {
    if (!currentUserId || !entry.sessionId) return;
    const sessionId = entry.sessionId;
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
          sendCommentLikeNotification(commentAuthorId, currentUserId, sessionId, commentId).catch(() => {});
        }
      }
    } catch {
      // Swallow — state is only updated after the API call succeeds above,
      // so a failure leaves nothing to roll back, just nothing left to
      // silently reject.
    }
  }

  async function handleDeleteSessionComment(commentId: string) {
    if (!entry.sessionId) return;
    await deleteSessionComment(commentId);
    const updated = await getSessionComments(entry.sessionId);
    setSessionComments(updated);
  }

  function handleReportComment(commentUserId: string, commentId: string) {
    if (!currentUserId) return;
    Alert.alert('Report Comment', 'Are you sure you want to report this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report', style: 'destructive', onPress: async () => {
          try {
            await reportContent(currentUserId, commentUserId, 'comment', commentId, 'Inappropriate comment');
            Alert.alert('Report Submitted', 'Thank you. We review all reports within 24 hours.');
          } catch {
            Alert.alert('Error', 'Could not submit report. Please try again.');
          }
        },
      },
    ]);
  }

  async function handleSendSessionComment(text: string): Promise<boolean> {
    if (!currentUserId || !text.trim() || !entry.sessionId) return false;
    try {
      await addSessionComment(entry.sessionId, currentUserId, text.trim());
    } catch (err: any) {
      Alert.alert('Could not post comment', err?.message ?? 'Unknown error');
      return false;
    }
    const updated = await getSessionComments(entry.sessionId);
    setSessionComments(updated);
    if (entry.friend.id !== currentUserId) {
      sendCommentNotification(entry.friend.id, currentUserId, entry.sessionId).catch(() => {});
    }
    return true;
  }

  function openDiscussion(focus: boolean) {
    setDiscussionFocus(focus);
    setDiscussionOpen(true);
  }

  async function submitReportPost(reason: string) {
    if (!currentUserId || !entry.sessionId) return;
    try {
      await reportContent(currentUserId, entry.friend.id, 'session', entry.sessionId, reason);
      Alert.alert('Report Submitted', 'Thank you. We review all reports within 24 hours.');
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  }

  function handleMoreMenu() {
    if (!currentUserId || !entry.sessionId) return;
    Alert.alert('Post Options', undefined, [
      {
        text: 'Report Post', style: 'destructive', onPress: () => {
          Alert.alert('Report Post', 'Why are you reporting this post?', [
            { text: 'Spam', onPress: () => submitReportPost('Spam') },
            { text: 'Inappropriate Content', onPress: () => submitReportPost('Inappropriate Content') },
            { text: 'Harassment', onPress: () => submitReportPost('Harassment') },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const [viewerUris, setViewerUris] = useState<string[] | null>(null);
  const { origins: photoOrigins, register: registerPhoto } = usePhotoOrigins();
  const photoClip = useContext(PhotoClipContext);
  const [viewerIndex, setViewerIndex] = useState(0);


  return (
    <View style={[styles.card, { borderBottomColor: colors.bgElevated }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 }}
          onPress={() => onViewProfile({ id: entry.friend.id, name: entry.friend.name, username: entry.friend.username, avatar_url: entry.friend.avatar_url })}
          activeOpacity={0.75}
        >
          <ProfileAvatar name={entry.friend.name} avatarUrl={entry.friend.avatar_url ?? null} size={44} colors={colors} />
          <View style={styles.cardHeaderInfo}>
            <Text style={[styles.cardName, { color: colors.textPrimary }]}>{entry.friend.name}</Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              {formatRelativeDate(entry.sessionDate)}{entry.sessionTime && !isNaN(new Date(entry.sessionTime).getTime()) ? ` at ${format(new Date(entry.sessionTime), 'h:mm a')}` : ''} · {isOutdoor ? 'Outdoor' : 'Indoor'}
            </Text>
            {entry.location?.trim() ? (
              <View style={[styles.cardLocationRow, { paddingBottom: 0, paddingTop: 4 }]}>
                <Ionicons name="location-sharp" size={13} color={colors.textSecondary} />
                <Text style={[styles.cardLocation, { color: colors.textSecondary }]} numberOfLines={1}>{entry.location.trim()}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleMoreMenu} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.cardTitleRow}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {entry.title?.trim() || defaultSessionTitle(entry.sessionTime, entry.training)}
        </Text>
      </View>

      {/* Notes */}
      {entry.notes?.trim() ? (
        <Text style={[styles.cardNotes, { color: colors.textPrimary }]}>{entry.notes.trim()}</Text>
      ) : null}

      {/* Partners */}
      {entry.partners?.length ? (
        <View style={styles.partnersRow}>
          <Text style={[styles.partnersLabel, { color: colors.textMuted }]}>with </Text>
          {entry.partners.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={styles.partnerChip}
              activeOpacity={0.7}
              onPress={() => {
                if (p.id === currentUserId) return;
                onViewProfile({ id: p.id, name: p.name, username: '', avatar_url: p.avatar_url ?? null });
              }}
            >
              <ProfileAvatar name={p.name} avatarUrl={p.avatar_url ?? null} size={20} colors={colors} />
              <Text style={[styles.partnerName, { color: colors.accent }]}>
                {p.id === currentUserId ? 'You' : p.name}{i < entry.partners!.length - 1 ? ',' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Stats */}
      <View style={styles.cardStatsRow}>
        <View style={styles.cardStat}>
          <Text style={[styles.cardStatNum, { color: colors.textPrimary }]}>
            {CLIMB_TYPES.find(t => t.id === entry.climbType)?.label ?? '—'}
          </Text>
          <Text style={[styles.cardStatLbl, { color: colors.textSecondary }]}>Type</Text>
        </View>
        <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
        <View style={styles.cardStat}>
          <Text style={[styles.cardStatNum, { color: colors.textPrimary }]}>{entry.climbCount}</Text>
          <Text style={[styles.cardStatLbl, { color: colors.textSecondary }]}>Climbs</Text>
        </View>
        {entry.hardestGrade ? (
          <>
            <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.cardStat}>
              <Text style={[styles.cardStatNum, { color: colors.accent }]}>{displayGrade(entry.hardestGrade, entry.hardestGradeSystem)}</Text>
              <Text style={[styles.cardStatLbl, { color: colors.textSecondary }]}>Hardest</Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Photos */}
      {entry.sessionPhotos && entry.sessionPhotos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
          contentContainerStyle={styles.photoStripContent}
        >
          {entry.sessionPhotos.map((uri, i) => (
            <NaturalPhoto
              key={i}
              uri={uri}
              initialWidth={entry.photoWidths?.[uri]}
              viewRef={registerPhoto(uri)}
              onPress={() => { setViewerUris(entry.sessionPhotos!); setViewerIndex(i); }}
            />
          ))}
        </ScrollView>
      )}

      {/* Climbs — collapsed by default, fetched on demand */}
      <TouchableOpacity
        onPress={handleToggleClimbs}
        activeOpacity={0.7}
        style={[styles.cardExpandBtn, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
      >
        <Text style={[styles.cardExpandTxt, { color: colors.textPrimary }]}>
          {climbsExpanded ? 'Hide climbs' : 'View climbs'}
        </Text>
        <Ionicons name={climbsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {climbsExpanded && (
        <View style={{ gap: SPACING.sm, marginBottom: SPACING.md }}>
          {loadingClimbs ? (
            <Text style={[styles.cardNoClimbs, { color: colors.textMuted }]}>Loading…</Text>
          ) : !expandedClimbs || expandedClimbs.length === 0 ? (
            <Text style={[styles.cardNoClimbs, { color: colors.textMuted }]}>No climbs found</Text>
          ) : (
            expandedClimbs.map(c => <ClimbCard key={c.id} climb={c} compact showRoutineLink expandRoutine={!!trainingKind(expandedClimbs)} onPress={() => setDetailClimb(c)} />)
          )}
        </View>
      )}

      {/* Likes / comment counts */}
      {(sessionLikes.length > 0 || sessionComments.length > 0) && (
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

      {/* Comment thread */}
      {sessionComments.length > 0 && (
        <View style={[styles.commentSection, { borderTopColor: colors.border }]}>
          {sessionComments.slice(0, 3).map(c => (
            <SwipeableComment
              key={c.id}
              c={c}
              isOwn={c.user_id === currentUserId}
              onDelete={() => handleDeleteSessionComment(c.id)}
              onReport={c.user_id !== currentUserId ? () => handleReportComment(c.user_id, c.id) : () => {}}
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
        subtitle={`${entry.friend.id === currentUserId ? 'You' : entry.friend.name} · ${formatRelativeDate(entry.sessionDate)}`}
        likes={sessionLikes.map(l => ({ id: l.id ?? l.user_id, userId: l.user_id, name: l.profile?.name ?? 'Unknown', avatarUrl: l.user_id === currentUserId ? (myAvatar ?? null) : (l.profile?.avatar_url ?? null) }))}
        comments={sessionComments}
        commentLikesMap={commentLikesMap}
        currentUserId={currentUserId ?? ''}
        myAvatar={myAvatar ?? null}
        isPostOwner={entry.friend.id === currentUserId}
        autoFocus={discussionFocus}
        colors={colors}
        onSend={handleSendSessionComment}
        onDeleteComment={c => handleDeleteSessionComment(c.id)}
        onReportComment={c => handleReportComment(c.user_id, c.id)}
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
      <ClimbDetailModal visible={!!detailClimb} climb={detailClimb} onClose={() => setDetailClimb(null)} />
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingBottom: SPACING.md },
  cardHeaderInfo: { flex: 1 },
  cardName: { fontSize: 14, fontFamily: FONTS.family.bold, marginBottom: 1 },
  cardMeta: { fontSize: 12, fontFamily: FONTS.family.regular },
  cardTitleRow: { paddingTop: SPACING.xs, paddingBottom: SPACING.xs },
  cardTitle: { fontSize: 19, fontFamily: FONTS.family.bold, letterSpacing: -0.3 },
  cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: SPACING.xs },
  cardLocation: { fontSize: 12, fontFamily: FONTS.family.regular },
  cardNotes: { fontSize: 14, fontFamily: FONTS.family.regular, lineHeight: 20, paddingBottom: SPACING.sm },
  partnersRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingBottom: SPACING.md, gap: SPACING.xs },
  partnersLabel: { fontSize: 12, fontFamily: FONTS.family.regular },
  partnerChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  partnerName: { fontSize: 12, fontFamily: FONTS.family.medium },
  cardStatsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, gap: 0 },
  cardStat: { flex: 1, alignItems: 'center' },
  cardStatNum: { fontSize: 18, fontFamily: FONTS.family.bold, letterSpacing: -0.3, marginBottom: 2, textAlign: 'center' },
  cardStatLbl: { fontSize: 12, fontFamily: FONTS.family.regular },
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
    // Soft lift off the card (needs the solid backgroundColor set inline)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  cardExpandTxt: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  cardNoClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.md },
  cardCounts: { flexDirection: 'row', gap: SPACING.md, paddingBottom: SPACING.xs, marginTop: SPACING.md, alignItems: 'center' },
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: SPACING.xs },
  cardActionBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md },
  commentSection: { borderTopWidth: 1, marginTop: SPACING.md, paddingTop: SPACING.lg, gap: SPACING.sm },
  commentShowMore: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium, paddingVertical: 2 },
});
