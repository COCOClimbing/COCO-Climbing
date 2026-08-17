import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Keyboard, Modal, Dimensions, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import ClimbCard from './ClimbCard';
import SwipeableComment from './SwipeableComment';
import LikesAvatarRow from './LikesAvatarRow';
import {
  getSessionLikes, getSessionComments, getCommentLikes,
  addSessionComment, deleteSessionComment, likeComment, unlikeComment,
  likeSession, unlikeSession, getFriendRecentClimbs,
  SessionLike, SessionComment, SessionSummary,
} from '../utils/friendsApi';
import { sendLikeNotification, sendCommentNotification, sendCommentLikeNotification } from '../utils/notifications';
import { reportContent } from '../utils/moderationApi';

const PHOTO_HEIGHT = 220;

function NaturalPhoto({ uri, initialWidth, onPress }: { uri: string; initialWidth?: number; onPress: () => void }) {
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

const AVATAR_MAX_RETRIES = 3;

function ProfileAvatar({ name, avatarUrl, size, colors }: { name: string; avatarUrl: string | null; size: number; colors: any }) {
  const [retryCount, setRetryCount] = useState(0);
  const initials = (name || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const isUrl = avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('file://'));

  // A failed load used to latch permanently (imgError never reset), so once a
  // single transient failure hit — e.g. a flaky request against the R2.dev
  // subdomain — that avatar showed initials for the rest of the app session,
  // even on later renders with a perfectly good URL. Reset retries whenever
  // the URL itself changes, and retry a few times (via a changing key, which
  // forces Image to mount fresh and issue a brand new request) before giving
  // up and falling back to initials.
  useEffect(() => { setRetryCount(0); }, [avatarUrl]);

  const failed = retryCount > AVATAR_MAX_RETRIES;

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {isUrl && !failed
        ? (
          <Image
            key={`${avatarUrl}-${retryCount}`}
            source={{ uri: avatarUrl! }}
            style={{ width: size, height: size }}
            onError={() => setTimeout(() => setRetryCount(c => c + 1), 600)}
          />
        )
        : <Text style={{ color: colors.accent, fontSize: size * 0.32, fontFamily: FONTS.family.bold }}>{initials}</Text>
      }
    </View>
  );
}

function sessionTimeOfDay(isoTime?: string): string {
  if (!isoTime) return 'Climbing Session';
  const hour = new Date(isoTime).getHours();
  if (hour < 12) return 'Morning Climb';
  if (hour < 17) return 'Afternoon Climb';
  return 'Evening Climb';
}

function formatRelativeDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    const dateDay = new Date(y, m - 1, d);
    const today = new Date();
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((todayDay.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  } catch {
    return dateStr;
  }
}

function mapToClimb(c: any): Climb {
  return {
    id: c.id, date: c.date, sessionId: c.session_id,
    type: c.type, outcome: c.outcome, styles: c.styles ?? [],
    environment: c.environment, grade: c.grade, gradeSystem: c.grade_system,
    routeName: c.route_name, location: c.location, notes: c.notes,
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
  const [expandedClimbs, setExpandedClimbs] = useState<Climb[] | null>(null);
  const [loadingClimbs, setLoadingClimbs] = useState(false);

  const [sessionLikes, setSessionLikes] = useState<SessionLike[]>([]);
  const [sessionComments, setSessionComments] = useState<SessionComment[]>([]);
  const [commentLikesMap, setCommentLikesMap] = useState<Record<string, string[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentsExpanded, setCommentsExpanded] = useState(false);

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
    if (expandedClimbs !== null) return;
    setLoadingClimbs(true);
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

  async function handleSendSessionComment() {
    if (!currentUserId || !commentText.trim() || !entry.sessionId) return;
    try {
      await addSessionComment(entry.sessionId, currentUserId, commentText.trim());
    } catch (err: any) {
      Alert.alert('Could not post comment', err?.message ?? 'Unknown error');
      return;
    }
    setCommentText('');
    Keyboard.dismiss();
    const updated = await getSessionComments(entry.sessionId);
    setSessionComments(updated);
    if (entry.friend.id !== currentUserId) {
      sendCommentNotification(entry.friend.id, currentUserId, entry.sessionId).catch(() => {});
    }
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
  const [viewerIndex, setViewerIndex] = useState(0);

  const visibleComments = commentsExpanded ? sessionComments : sessionComments.slice(0, 3);
  const hiddenCommentCount = sessionComments.length - 3;

  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
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
            <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
              {formatRelativeDate(entry.sessionDate)} · {isOutdoor ? 'Outdoor' : 'Indoor'}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleMoreMenu} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.cardTitleRow}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {entry.title?.trim() || sessionTimeOfDay(entry.sessionTime)}
        </Text>
      </View>

      {/* Location */}
      {entry.location?.trim() ? (
        <View style={styles.cardLocationRow}>
          <Ionicons name="location-sharp" size={11} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text style={[styles.cardLocation, { color: colors.textMuted }]}>{entry.location.trim()}</Text>
        </View>
      ) : null}

      {/* Notes */}
      {entry.notes?.trim() ? (
        <Text style={[styles.cardNotes, { color: colors.textSecondary }]}>{entry.notes.trim()}</Text>
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
          <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Type</Text>
        </View>
        <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
        <View style={styles.cardStat}>
          <Text style={[styles.cardStatNum, { color: colors.textPrimary }]}>{entry.climbCount}</Text>
          <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Climbs</Text>
        </View>
        {entry.hardestGrade ? (
          <>
            <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.cardStat}>
              <Text style={[styles.cardStatNum, { color: colors.accent }]}>{displayGrade(entry.hardestGrade, entry.hardestGradeSystem)}</Text>
              <Text style={[styles.cardStatLbl, { color: colors.textMuted }]}>Hardest</Text>
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
              onPress={() => { setViewerUris(entry.sessionPhotos!); setViewerIndex(i); }}
            />
          ))}
        </ScrollView>
      )}

      {/* Climbs — collapsed by default, fetched on demand */}
      <TouchableOpacity
        onPress={handleToggleClimbs}
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
          {loadingClimbs ? (
            <Text style={[styles.cardNoClimbs, { color: colors.textMuted }]}>Loading…</Text>
          ) : !expandedClimbs || expandedClimbs.length === 0 ? (
            <Text style={[styles.cardNoClimbs, { color: colors.textMuted }]}>No climbs found</Text>
          ) : (
            expandedClimbs.map(c => <ClimbCard key={c.id} climb={c} compact />)
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
            <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
              {sessionComments.length} {sessionComments.length === 1 ? 'comment' : 'comments'}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7} onPress={handleLikeToggle}>
          <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={22} color={liked ? colors.accent : colors.textMuted} />
        </TouchableOpacity>
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
        <ActivityCardPhotoViewer
          uris={viewerUris}
          initialIndex={viewerIndex}
          onClose={() => setViewerUris(null)}
        />
      )}
    </View>
  );
}

function ActivityCardPhotoViewer({ uris, initialIndex, onClose }: { uris: string[]; initialIndex: number; onClose: () => void }) {
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingBottom: SPACING.md },
  cardHeaderInfo: { flex: 1 },
  cardName: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold, marginBottom: 4 },
  cardMeta: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardTitleRow: { paddingTop: SPACING.xs, paddingBottom: SPACING.xs },
  cardTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold, letterSpacing: -0.2 },
  cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: SPACING.xs },
  cardLocation: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardNotes: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, lineHeight: 20, paddingBottom: SPACING.sm },
  partnersRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingBottom: SPACING.md, gap: SPACING.xs },
  partnersLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  partnerChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  cardNoClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.md },
  cardCounts: { flexDirection: 'row', gap: SPACING.md, paddingBottom: SPACING.xs, marginTop: SPACING.md, alignItems: 'center' },
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: SPACING.xs },
  cardActionBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md },
  commentSection: { borderTopWidth: 1, marginTop: SPACING.md, paddingTop: SPACING.lg, gap: SPACING.sm },
  commentShowMore: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium, paddingVertical: 2 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  commentInputText: { flex: 1, fontSize: FONTS.sizes.sm, maxHeight: 80 },
});
