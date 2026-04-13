import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  PanResponder,
  Animated,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useNav } from '../utils/NavigationContext';
import { useAuth } from '../utils/AuthContext';
import { FONTS, SPACING, V_GRADES, CLIMB_TYPES, getGradeDifficulty, convertGrade } from '../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { getAllSessions, getAllClimbs, getActiveSessionId, getPreferredDisplayGrades } from '../utils/storage';
import ClimbCard from '../components/ClimbCard';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import {
  FriendProfile,
  FriendRequest,
  FriendCounts,
  SessionLike,
  SessionComment,
  searchByUsername,
  sendFriendRequest,
  getPendingRequests,
  getAcceptedFriends,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  getFriendRecentClimbs,
  getFriendAllClimbs,
  getFriendshipStatus,
  getFriendCounts,
  getSessionLikes,
  likeSession,
  unlikeSession,
  getSessionComments,
  addSessionComment,
  deleteSessionComment,
} from '../utils/friendsApi';

// ─── Types ────────────────────────────────────────────────────────────────────


type SearchResult = FriendProfile & {
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
};

type FriendWithActivity = FriendProfile & {
  recentClimbCount: number;
};

// ─── SwipeableComment ─────────────────────────────────────────────────────────

function SwipeableComment({
  c,
  isOwn,
  onDelete,
  colors,
  commentAvatarUrl,
}: {
  c: any;
  isOwn: boolean;
  onDelete: () => void;
  colors: any;
  commentAvatarUrl: string | null;
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        isOwn && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        if (gs.dx < 0) translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (isOwn && gs.dx < -75) {
          Animated.timing(translateX, { toValue: -500, duration: 200, useNativeDriver: true }).start(() => onDelete());
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'flex-end', paddingRight: SPACING.lg }]}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
      </View>
      <Animated.View style={[swipeCommentStyles.row, { transform: [{ translateX }], backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
        {commentAvatarUrl
          ? <Image source={{ uri: commentAvatarUrl }} style={swipeCommentStyles.avatar} />
          : <View style={[swipeCommentStyles.avatar, { backgroundColor: colors.border }]} />
        }
        <View style={{ flex: 1 }}>
          <Text style={[swipeCommentStyles.name, { color: colors.textPrimary }]}>
            {c.profile?.name ?? 'Unknown'}{' '}
            <Text style={[swipeCommentStyles.text, { color: colors.textSecondary }]}>{c.text}</Text>
          </Text>
          <Text style={[swipeCommentStyles.time, { color: colors.textMuted }]}>
            {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true })}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const swipeCommentStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start', paddingVertical: 2 },
  avatar: { width: 20, height: 20, borderRadius: 10, marginTop: 2 },
  name: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  text: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  time: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 },
});

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AvatarCircle({ name, size = 44, colors }: { name: string; size?: number; colors: any }) {
  const initials = (name || '?')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={[
      avatarStyles.circle,
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accentSoft,
        borderColor: colors.accent,
      },
    ]}>
      <Text style={[avatarStyles.initials, { color: colors.accent, fontSize: size * 0.36 }]}>
        {initials}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: FONTS.family.bold,
  },
});

// ─── FriendDetailView ─────────────────────────────────────────────────────────

type DayGroup = { date: string; climbs: any[] };

function ProfileAvatar({ name, avatarUrl, size, colors }: { name: string; avatarUrl: string | null; size: number; colors: any }) {
  const [imgError, setImgError] = useState(false);
  const initials = (name || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const isUrl = avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('file://'));
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {isUrl && !imgError
        ? <Image source={{ uri: avatarUrl! }} style={{ width: size, height: size }} onError={() => setImgError(true)} />
        : <Text style={{ color: colors.accent, fontSize: size * 0.32, fontFamily: FONTS.family.bold }}>{initials}</Text>
      }
    </View>
  );
}

function FriendDetailView({
  friend,
  onBack,
  colors,
}: {
  friend: FriendProfile;
  onBack: () => void;
  colors: any;
}) {
  const { user } = useAuth();
  const [climbs, setClimbs] = useState<any[]>([]);
  const [counts, setCounts] = useState<FriendCounts>({ followers: 0, following: 0 });
  const [loadingClimbs, setLoadingClimbs] = useState(true);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none');
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  useEffect(() => {
    Promise.all([loadClimbs(), loadCounts(), loadFriendStatus()]);
  }, []);

  async function loadClimbs() {
    setLoadingClimbs(true);
    try { setClimbs(await getFriendAllClimbs(friend.id)); } catch { setClimbs([]); }
    setLoadingClimbs(false);
  }

  async function loadCounts() {
    try { setCounts(await getFriendCounts(friend.id)); } catch {}
  }

  async function loadFriendStatus() {
    if (!user) return;
    try { setFriendStatus(await getFriendshipStatus(user.id, friend.id)); } catch {}
  }

  async function handleFriendAction() {
    if (!user || friendActionLoading) return;
    setFriendActionLoading(true);
    try {
      if (friendStatus === 'none') {
        const { error } = await sendFriendRequest(user.id, friend.id, friend.is_private ?? false);
        if (error) throw new Error(error);
        setFriendStatus(friend.is_private ? 'pending_sent' : 'accepted');
      } else if (friendStatus === 'accepted') {
        await removeFriend(user.id, friend.id);
        setFriendStatus('none');
      } else if (friendStatus === 'pending_received') {
        const requests = await getPendingRequests(user.id);
        const req = requests.find(r => r.sender_id === friend.id);
        if (req) await acceptFriendRequest(req.id);
        setFriendStatus('accepted');
      }
      await loadCounts();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong.');
    }
    setFriendActionLoading(false);
  }

  const normDate = (d: string) => (d ?? '').slice(0, 10);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthClimbs = climbs.filter(c => normDate(c.date) >= monthStart);
  const monthSends = monthClimbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;

  // Hardest sends by climb type
  const GRADED_TYPES = [
    { id: 'boulder', label: 'Boulder' },
    { id: 'top_rope', label: 'Top Rope' },
    { id: 'sport', label: 'Sport' },
    { id: 'trad', label: 'Trad' },
  ];
  const allSends = climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash');
  const hardestByType = GRADED_TYPES.map(({ id, label }) => {
    const typeSends = allSends.filter(c => c.type === id && c.grade && c.grade_system);
    if (typeSends.length === 0) return { label, grade: null };
    const sys = id === 'boulder' ? 'v-scale' : 'yds';
    const best = [...typeSends].sort((a, b) => {
      const da = getGradeDifficulty(a.grade, a.grade_system);
      const db = getGradeDifficulty(b.grade, b.grade_system);
      return db - da;
    })[0];
    return { label, grade: convertGrade(best.grade, best.grade_system, sys) };
  });

  // Sessions
  const dayMap: Record<string, any[]> = {};
  climbs.forEach(c => {
    const d = normDate(c.date);
    if (!dayMap[d]) dayMap[d] = [];
    dayMap[d].push(c);
  });
  const dayGroups: DayGroup[] = Object.entries(dayMap)
    .map(([date, climbList]) => ({ date, climbs: climbList }))
    .sort((a, b) => b.date.localeCompare(a.date));

  function mapToClimb(c: any) {
    return {
      id: c.id, date: c.date, sessionId: c.session_id,
      type: c.type, outcome: c.outcome, styles: c.styles ?? [],
      environment: c.environment, grade: c.grade, gradeSystem: c.grade_system,
      routeName: c.route_name, location: c.location, notes: c.notes,
      attempts: c.attempts, mediaUri: c.media_uri, mediaType: c.media_type,
      projectId: c.project_id, projectName: c.project_name,
    };
  }

  const friendBtnLabel = friendStatus === 'accepted' ? 'Following'
    : friendStatus === 'pending_sent' ? 'Requested'
    : friendStatus === 'pending_received' ? 'Follow Back'
    : 'Follow';
  const friendBtnFilled = friendStatus === 'none' || friendStatus === 'pending_received';

  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <View style={[detailStyles.container, { backgroundColor: colors.bg }]}>
      {/* Back */}
      <View style={[detailStyles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={detailStyles.backBtn} activeOpacity={0.7}>
          <Text style={[detailStyles.backText, { color: colors.accent }]}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={detailStyles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Profile header (account-style) ── */}
        <View style={detailStyles.profileHeader}>
          <View style={detailStyles.profileTop}>
            <ProfileAvatar name={friend.name} avatarUrl={friend.avatar_url} size={80} colors={colors} />
            <View style={detailStyles.profileInfo}>
              <Text style={[detailStyles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>{friend.name}</Text>
              {friend.username ? <Text style={[detailStyles.profileUsername, { color: colors.textSecondary }]}>@{friend.username}</Text> : null}
              {friend.hometown ? <Text style={[detailStyles.profileHometown, { color: colors.textMuted }]} numberOfLines={1}>{friend.hometown}</Text> : null}
            </View>
          </View>

          {/* Following / Followers + friend action button */}
          <View style={detailStyles.profileBottom}>
            <View style={detailStyles.countsRow}>
              <View style={detailStyles.countItem}>
                <Text style={[detailStyles.countLabel, { color: colors.textMuted }]}>Following</Text>
                <Text style={[detailStyles.countNumber, { color: colors.textPrimary }]}>{counts.following}</Text>
              </View>
              <View style={detailStyles.countItem}>
                <Text style={[detailStyles.countLabel, { color: colors.textMuted }]}>Followers</Text>
                <Text style={[detailStyles.countNumber, { color: colors.textPrimary }]}>{counts.followers}</Text>
              </View>
            </View>
            {user && user.id !== friend.id && (
              <TouchableOpacity
                onPress={handleFriendAction}
                disabled={friendActionLoading || friendStatus === 'pending_sent'}
                activeOpacity={0.7}
                style={[
                  detailStyles.friendBtn,
                  friendBtnFilled
                    ? { backgroundColor: colors.accent, borderColor: colors.accent }
                    : { borderColor: colors.border },
                ]}
              >
                {friendActionLoading
                  ? <ActivityIndicator color={friendBtnFilled ? '#fff' : colors.textPrimary} size="small" />
                  : <Text style={[detailStyles.friendBtnText, { color: friendBtnFilled ? '#fff' : colors.textPrimary }]}>{friendBtnLabel}</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loadingClimbs ? (
          <View style={detailStyles.loadingBox}><ActivityIndicator color={colors.accent} /></View>
        ) : (
          <View style={detailStyles.statsWrapper}>

            {/* ── This Month ── */}
            <Text style={[detailStyles.sectionLabel, { color: colors.textPrimary }]}>THIS MONTH</Text>
            <View style={detailStyles.monthRow}>
              {[
                { label: 'Climbs', value: String(monthClimbs.length) },
                { label: 'Sends', value: String(monthSends) },
              ].map(item => (
                <View key={item.label} style={detailStyles.monthItem}>
                  <Text style={[detailStyles.monthLabel, { color: colors.textMuted }]}>{item.label}</Text>
                  <Text style={[detailStyles.monthValue, { color: colors.textPrimary }]}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />

            {/* ── Hardest Sends ── */}
            <Text style={[detailStyles.sectionLabel, { color: colors.textPrimary }]}>HARDEST SENDS</Text>
            <View style={detailStyles.hardestRow}>
              {hardestByType.map(({ label, grade }) => (
                <View key={label} style={detailStyles.hardestItem}>
                  <Text style={[detailStyles.hardestLabel, { color: colors.textMuted }]}>{label}</Text>
                  <Text style={[detailStyles.hardestGrade, { color: grade ? colors.accent : colors.textMuted }]}>{grade ?? 'N/A'}</Text>
                </View>
              ))}
            </View>

            <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />

            {/* ── Totals ── */}
            <Text style={[detailStyles.sectionLabel, { color: colors.textPrimary }]}>TOTALS</Text>
            <View style={detailStyles.hardestRow}>
              {[
                { label: 'Climbs', value: String(climbs.length) },
                { label: 'Sends', value: String(allSends.length) },
              ].map(item => (
                <View key={item.label} style={detailStyles.hardestItem}>
                  <Text style={[detailStyles.hardestLabel, { color: colors.textMuted }]}>{item.label}</Text>
                  <Text style={[detailStyles.hardestGrade, { color: colors.textPrimary }]}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />

            {/* ── Sessions ── */}
            <Text style={[detailStyles.sectionLabel, { color: colors.textPrimary }]}>SESSIONS</Text>
            {dayGroups.length === 0 ? (
              <Text style={[detailStyles.emptyText, { color: colors.textMuted }]}>No sessions logged yet.</Text>
            ) : (
              dayGroups.map(day => {
                const isExpanded = expandedDate === day.date;
                const daySends = day.climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
                const date = parseISO(day.date);
                return (
                  <View key={day.date} style={[detailStyles.sessionBlock, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                    <TouchableOpacity style={detailStyles.sessionHeader} onPress={() => setExpandedDate(isExpanded ? null : day.date)} activeOpacity={0.75}>
                      <View>
                        <Text style={[detailStyles.sessionDate, { color: colors.textPrimary }]}>{format(date, 'EEE, MMM d, yyyy')}</Text>
                        <Text style={[detailStyles.sessionSub, { color: colors.textMuted }]}>
                          {day.climbs.length} climb{day.climbs.length !== 1 ? 's' : ''} · {daySends} send{daySends !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <Text style={[detailStyles.chevron, isExpanded && detailStyles.chevronOpen, { color: colors.textMuted }]}>›</Text>
                    </TouchableOpacity>
                    {isExpanded && (
                      <View style={[detailStyles.sessionContent, { borderTopColor: colors.border }]}>
                        {day.climbs.map((c, i) => (
                          <ClimbCard key={c.id ?? i} climb={mapToClimb(c)} compact />
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  backBtn: { paddingVertical: SPACING.xs },
  backText: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.medium },
  scrollContent: { paddingBottom: SPACING.xxl * 2 },

  // Profile header — matches account page
  profileHeader: { flexDirection: 'column', paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxl, paddingBottom: SPACING.xl, gap: SPACING.lg },
  profileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xl },
  profileInfo: { flex: 1, gap: 2, paddingTop: SPACING.xs },
  profileName: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.family.bold },
  profileUsername: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium, marginTop: 1 },
  profileHometown: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, marginTop: 2 },
  profileBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countsRow: { flexDirection: 'row', gap: SPACING.xl },
  countItem: { alignItems: 'flex-start' },
  countNumber: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold },
  countLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginBottom: 2 },
  friendBtn: { borderWidth: 1.5, borderRadius: 20, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg },
  friendBtnText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.semibold },

  loadingBox: { paddingTop: 60, alignItems: 'center' },

  // Stats wrapper — matches account page padding
  statsWrapper: { marginHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  sectionLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: SPACING.lg },

  // This month
  monthRow: { flexDirection: 'row', gap: SPACING.xxl, marginBottom: SPACING.lg },
  monthItem: { alignItems: 'flex-start' },
  monthValue: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.family.bold },
  monthLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginBottom: 2 },

  // Hardest / Totals
  hardestRow: { flexDirection: 'column', gap: SPACING.sm, marginBottom: SPACING.lg, alignSelf: 'flex-start', minWidth: 180 },
  hardestItem: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.lg },
  hardestLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, width: 96 },
  hardestGrade: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.family.heavy, letterSpacing: -0.5 },

  // Sessions
  emptyText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  sessionBlock: { borderRadius: 14, borderWidth: 1, marginBottom: SPACING.sm, overflow: 'hidden' },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, paddingVertical: SPACING.xl },
  sessionDate: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold },
  sessionSub: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 },
  chevron: { fontSize: 22, fontFamily: FONTS.family.regular },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  sessionContent: { borderTopWidth: 1, padding: SPACING.lg, gap: SPACING.sm },
});


// ─── Main FriendsScreen ───────────────────────────────────────────────────────

export default function FriendsScreen() {
  const { colors } = useTheme();
  const { navigate, screen, setReturnTo, friendsOpen, openFriends, closeFriends, navCount } = useNav();
  const { user, pendingRequestCount, refreshPendingCount, profileName, avatarUrl, username } = useAuth();

  // Activity feed state
  type SessionSummary = {
    friend: FriendProfile;
    sessionDate: string;
    sessionId?: string;  // set for own sessions, use to load climbs by id
    sessionTime?: string; // ISO timestamp used to determine morning/afternoon/evening
    climbCount: number;
    sends: number;
    flashes: number;
    hardestGrade: string | null;
    hardestGradeSystem: string | null;
    environment?: string;
    climbType?: string;
    partners?: { id: string; name: string; avatar_url?: string | null }[];
  };
  const [activityFeed, setActivityFeed] = useState<SessionSummary[]>([]);
  const [preferredBoulder, setPreferredBoulder] = useState('v-scale');
  const [preferredRope, setPreferredRope] = useState('yds');

  const BOULDER_SYSTEMS = new Set(['v-scale', 'font']);
  function displayGrade(grade: string | null, fromSystem: string | null): string {
    if (!grade || !fromSystem) return grade ?? '—';
    const preferred = BOULDER_SYSTEMS.has(fromSystem) ? preferredBoulder : preferredRope;
    return convertGrade(grade, fromSystem, preferred);
  }
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [friends, setFriends] = useState<FriendWithActivity[]>([]);

  // Friends manager modal state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);

  // Requests state
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [actingOnRequest, setActingOnRequest] = useState<string | null>(null);

  // Expandable session cards (activity feed)
  const [expandedSessionKey, setExpandedSessionKey] = useState<string | null>(null);
  const [sessionClimbsMap, setSessionClimbsMap] = useState<Record<string, any[]>>({});
  const [loadingClimbsFor, setLoadingClimbsFor] = useState<string | null>(null);

  // Inline friend profile sub-screen
  const [viewingFriend, setViewingFriend] = useState<FriendProfile | null>(null);
  const [friendSource, setFriendSource] = useState<'activity' | 'friends'>('activity');

  // Clear friend/session views on any navigation
  useEffect(() => {
    setViewingFriend(null);
    setViewingSession(null);
  }, [navCount]);

  // Session detail full-screen view
  const [viewingSession, setViewingSession] = useState<{ entry: SessionSummary; climbs: any[] } | null>(null);

  // Likes & comments
  const [likesMap, setLikesMap] = useState<Record<string, SessionLike[]>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, SessionComment[]>>({});
  const [commentingKey, setCommentingKey] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [expandedCommentsKeys, setExpandedCommentsKeys] = useState<Record<string, boolean>>({});

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getPreferredDisplayGrades().then(({ boulder, rope }) => {
      setPreferredBoulder(boulder);
      setPreferredRope(rope);
    });
  }, [screen]);

  useEffect(() => {
    if (!user || screen !== 'friends') return;
    loadFeed();
    loadRequests();
  }, [user, screen]);

  useEffect(() => {
    if (friendsOpen && user) loadRequests();
  }, [friendsOpen]);

  async function loadFeed() {
    if (!user) return;
    setLoadingFeed(true);
    try {
      const normDate = (d: string) => (d ?? '').slice(0, 10);

      const [accepted, allSessions, allClimbs] = await Promise.all([
        getAcceptedFriends(user.id),
        getAllSessions(),
        getAllClimbs(),
      ]);
      setFriends(accepted.map(f => ({ ...f, recentClimbCount: 0 })));

      const summaries: SessionSummary[] = [];

      // Add user's own recent sessions (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoff = sevenDaysAgo.toISOString().slice(0, 10);
      const activeSessionId = getActiveSessionId();
      const recentSessions = allSessions.filter(s => normDate(s.date) >= cutoff && s.id !== activeSessionId);
      const selfProfile = { id: user.id, name: 'You', username: username ?? '', avatar_url: avatarUrl };
      recentSessions.forEach(s => {
        const sessionClimbs = allClimbs.filter(c => c.sessionId === s.id);
        if (sessionClimbs.length === 0) return;
        const sends = sessionClimbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
        const flashes = sessionClimbs.filter(c => c.outcome === 'flash').length;
        let hardestGrade: string | null = null;
        let hardestGradeSystem: string | null = null;
        let hardestClimb = sessionClimbs[0];
        const gradedClimbs = sessionClimbs.filter(c => c.grade && c.gradeSystem);
        if (gradedClimbs.length > 0) {
          gradedClimbs.sort((a, b) => getGradeDifficulty(b.grade, b.gradeSystem) - getGradeDifficulty(a.grade, a.gradeSystem));
          hardestGrade = gradedClimbs[0].grade;
          hardestGradeSystem = gradedClimbs[0].gradeSystem;
          hardestClimb = gradedClimbs[0];
        }
        const climbType = hardestClimb?.type ?? undefined;
        const partners = s.friends?.length
          ? s.friends.map((f: any) => {
              const raw = typeof f === 'string' ? { id: f, name: f } : f;
              const match = accepted.find(a => a.id === raw.id || a.name?.toLowerCase() === raw.name?.toLowerCase());
              return { ...raw, avatar_url: match?.avatar_url ?? null };
            })
          : undefined;
        summaries.push({ friend: selfProfile, sessionDate: normDate(s.date), sessionId: s.id, sessionTime: s.startedAt, climbCount: sessionClimbs.length, sends, flashes, hardestGrade, hardestGradeSystem, environment: s.environment, climbType, partners });
      });

      // Add friends' recent sessions
      await Promise.all(
        accepted.map(async (f) => {
          try {
            const climbs = await getFriendRecentClimbs(f.id);
            if (climbs.length === 0) return;
            const mostRecentDate = climbs.reduce((latest: string, c: any) =>
              normDate(c.date) > latest ? normDate(c.date) : latest, normDate(climbs[0].date));
            const sessionClimbs = climbs.filter((c: any) => normDate(c.date) === mostRecentDate);
            const sends = sessionClimbs.filter((c: any) => c.outcome === 'send' || c.outcome === 'flash').length;
            const flashes = sessionClimbs.filter((c: any) => c.outcome === 'flash').length;
            let hardestGrade: string | null = null;
            let hardestGradeSystem: string | null = null;
            let hardestClimb: any = sessionClimbs[0];
            const gradedClimbs = sessionClimbs.filter((c: any) => c.grade && c.grade_system);
            if (gradedClimbs.length > 0) {
              gradedClimbs.sort((a: any, b: any) => getGradeDifficulty(b.grade, b.grade_system) - getGradeDifficulty(a.grade, a.grade_system));
              hardestGrade = gradedClimbs[0].grade;
              hardestGradeSystem = gradedClimbs[0].grade_system;
              hardestClimb = gradedClimbs[0];
            }
            const environment = sessionClimbs[0]?.environment ?? 'indoor';
            const firstClimbTime = sessionClimbs[0]?.date ?? undefined;
            const climbType = hardestClimb?.type ?? undefined;
            summaries.push({ friend: f, sessionDate: mostRecentDate, sessionTime: firstClimbTime, climbCount: sessionClimbs.length, sends, flashes, hardestGrade, hardestGradeSystem, environment, climbType });
          } catch {}
        })
      );
      summaries.sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
      // Deduplicate by key to prevent React key collisions
      const seen = new Set<string>();
      const deduped = summaries.filter(e => {
        const k = e.sessionId ? `sid-${e.sessionId}` : `fid-${e.friend.id}|${e.sessionDate}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setActivityFeed(deduped);

      // Load likes & comments for sessions that have an ID
      deduped.forEach(e => {
        if (e.sessionId) {
          const key = `sid-${e.sessionId}`;
          loadLikesAndComments(key, e.sessionId);
        }
      });
    } catch {
      setActivityFeed([]);
    }
    setLoadingFeed(false);
  }

  async function loadRequests() {
    if (!user) return;
    setLoadingRequests(true);
    try {
      const pending = await getPendingRequests(user.id);
      setRequests(pending);
    } catch {
      setRequests([]);
    }
    setLoadingRequests(false);
  }

  // Search with debounce
  useEffect(() => {
    if (!user || !friendsOpen) return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      try {
        const results = await searchByUsername(searchQuery.trim().replace(/^@/, ''), user.id);
        const withStatus: SearchResult[] = await Promise.all(
          results.map(async (r) => {
            try {
              const status = await getFriendshipStatus(user.id, r.id);
              return { ...r, friendshipStatus: status };
            } catch {
              return { ...r, friendshipStatus: 'none' as const };
            }
          })
        );
        setSearchResults(withStatus);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 500);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQuery, user, friendsOpen]);

  async function handleSendRequest(receiverId: string) {
    if (!user) return;
    setSendingRequest(receiverId);
    try {
      const target = searchResults.find(r => r.id === receiverId);
      const isPrivate = target?.is_private ?? false;
      const { error } = await sendFriendRequest(user.id, receiverId, isPrivate);
      if (error) Alert.alert('Error', error);
      else setSearchResults(prev => prev.map(r => r.id === receiverId
        ? { ...r, friendshipStatus: isPrivate ? 'pending_sent' : 'accepted' }
        : r
      ));
    } catch {
      Alert.alert('Error', 'Failed to follow user.');
    }
    setSendingRequest(null);
  }

  async function handleAccept(requestId: string) {
    setActingOnRequest(requestId);
    try {
      await acceptFriendRequest(requestId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
      await refreshPendingCount();
      loadFeed();
    } catch {
      Alert.alert('Error', 'Failed to accept request.');
    }
    setActingOnRequest(null);
  }

  async function handleDecline(requestId: string) {
    setActingOnRequest(requestId);
    try {
      await declineFriendRequest(requestId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
      await refreshPendingCount();
    } catch {
      Alert.alert('Error', 'Failed to decline request.');
    }
    setActingOnRequest(null);
  }

  async function handleRemoveFriend(friendId: string, friendName: string) {
    if (!user) return;
    Alert.alert('Remove Friend', `Remove ${friendName} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await removeFriend(user.id, friendId);
            setFriends(prev => prev.filter(f => f.id !== friendId));
            setActivityFeed(prev => prev.filter(e => e.friend.id !== friendId));
          } catch {
            Alert.alert('Error', 'Failed to remove friend.');
          }
        },
      },
    ]);
  }

  function openFriendProfile(friend: FriendProfile, source: 'activity' | 'friends' = 'activity') {
    setFriendSource(source);
    setViewingFriend(friend);
  }

  async function handleToggleSession(entry: SessionSummary) {
    const sessionKey = entry.sessionId ? `sid-${entry.sessionId}` : `fid-${entry.friend.id}|${entry.sessionDate}`;
    if (expandedSessionKey === sessionKey) {
      setExpandedSessionKey(null);
      return;
    }
    setExpandedSessionKey(sessionKey);
    if (!sessionClimbsMap[sessionKey]) {
      setLoadingClimbsFor(sessionKey);
      try {
        let mapped: any[];
        if (entry.friend.id === user?.id) {
          // Own session — load from local storage by sessionId
          const localClimbs = await getAllClimbs();
          mapped = entry.sessionId
            ? localClimbs.filter(c => c.sessionId === entry.sessionId)
            : localClimbs.filter(c => (c.date ?? '').slice(0, 10) === entry.sessionDate);
        } else {
          const climbs = await getFriendRecentClimbs(entry.friend.id);
          const normDate = (d: string) => (d ?? '').slice(0, 10);
          const sessionClimbs = climbs.filter((c: any) => normDate(c.date) === normDate(entry.sessionDate));
          mapped = sessionClimbs.map((c: any) => ({
            id: c.id,
            date: c.date,
            sessionId: c.session_id,
            type: c.type,
            outcome: c.outcome,
            styles: c.styles ?? [],
            environment: c.environment,
            grade: c.grade,
            gradeSystem: c.grade_system,
            routeName: c.route_name,
            location: c.location,
            notes: c.notes,
            attempts: c.attempts,
            mediaUri: c.media_uri,
            mediaType: c.media_type,
            projectId: c.project_id,
            projectName: c.project_name,
          }));
        }
                setSessionClimbsMap(prev => ({ ...prev, [sessionKey]: mapped }));
      } catch {
        setSessionClimbsMap(prev => ({ ...prev, [sessionKey]: [] }));
      }
      setLoadingClimbsFor(null);
    }
  }

  async function handleOpenSession(entry: SessionSummary) {
    const sessionKey = entry.sessionId ? `sid-${entry.sessionId}` : `fid-${entry.friend.id}|${entry.sessionDate}`;
    let climbs = sessionClimbsMap[sessionKey];
    if (!climbs) {
      setLoadingClimbsFor(sessionKey);
      try {
        let mapped: any[];
        if (entry.friend.id === user?.id) {
          const localClimbs = await getAllClimbs();
          mapped = entry.sessionId
            ? localClimbs.filter(c => c.sessionId === entry.sessionId)
            : localClimbs.filter(c => (c.date ?? '').slice(0, 10) === entry.sessionDate);
        } else {
          const fetched = await getFriendRecentClimbs(entry.friend.id);
          const normDate = (d: string) => (d ?? '').slice(0, 10);
          mapped = fetched
            .filter((c: any) => normDate(c.date) === normDate(entry.sessionDate))
            .map((c: any) => ({
              id: c.id, date: c.date, sessionId: c.session_id,
              type: c.type, outcome: c.outcome, styles: c.styles ?? [],
              environment: c.environment, grade: c.grade, gradeSystem: c.grade_system,
              routeName: c.route_name, location: c.location, notes: c.notes,
              attempts: c.attempts, mediaUri: c.media_uri, mediaType: c.media_type,
              projectId: c.project_id, projectName: c.project_name,
            }));
        }
        setSessionClimbsMap(prev => ({ ...prev, [sessionKey]: mapped }));
        climbs = mapped;
      } catch {
        climbs = [];
      }
      setLoadingClimbsFor(null);
    }
    setViewingSession({ entry, climbs });
  }

  async function loadLikesAndComments(sessionKey: string, sessionId: string) {
    const [likes, comments] = await Promise.all([
      getSessionLikes(sessionId),
      getSessionComments(sessionId),
    ]);
    setLikesMap(prev => ({ ...prev, [sessionKey]: likes }));
    setCommentsMap(prev => ({ ...prev, [sessionKey]: comments }));
  }

  async function handleLike(sessionKey: string, sessionId: string) {
    if (!user) return;
    const likes = likesMap[sessionKey] ?? [];
    const alreadyLiked = likes.some(l => l.user_id === user.id);
    if (alreadyLiked) {
      await unlikeSession(sessionId, user.id);
    } else {
      await likeSession(sessionId, user.id);
    }
    const updated = await getSessionLikes(sessionId);
    setLikesMap(prev => ({ ...prev, [sessionKey]: updated }));
  }

  async function handleDeleteComment(sessionKey: string, sessionId: string, commentId: string) {
    await deleteSessionComment(commentId);
    const updated = await getSessionComments(sessionId);
    setCommentsMap(prev => ({ ...prev, [sessionKey]: updated }));
  }

  async function handleSendComment(sessionKey: string, sessionId: string) {
    if (!user || !commentText.trim()) return;
    await addSessionComment(sessionId, user.id, commentText.trim());
    setCommentText('');
    const updated = await getSessionComments(sessionId);
    setCommentsMap(prev => ({ ...prev, [sessionKey]: updated }));
  }

  function outcomeLabel(outcome: string) {
    if (outcome === 'flash') return 'Flash';
    if (outcome === 'send') return 'Send';
    if (outcome === 'attempt') return 'Attempt';
    return outcome;
  }

  function outcomeColor(outcome: string) {
    if (outcome === 'flash') return colors.accentGold;
    if (outcome === 'send') return colors.accentGreen;
    if (outcome === 'attempt') return colors.accentBlue;
    return colors.textMuted;
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
      const date = new Date(dateStr);
      const today = new Date();
      const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays} days ago`;
    } catch {
      return dateStr;
    }
  }

  function renderAddFriendButton(item: SearchResult) {
    if (sendingRequest === item.id) return <ActivityIndicator color={colors.accent} size="small" />;
    if (item.friendshipStatus === 'accepted') return (
      <View style={[styles.statusBadge, { backgroundColor: colors.accentGreenSoft }]}>
        <Text style={[styles.statusBadgeText, { color: colors.accentGreen }]}>Following</Text>
      </View>
    );
    if (item.friendshipStatus === 'pending_sent') return (
      <View style={[styles.statusBadge, { backgroundColor: colors.bgElevated }]}>
        <Text style={[styles.statusBadgeText, { color: colors.textMuted }]}>Requested</Text>
      </View>
    );
    if (item.friendshipStatus === 'pending_received') return (
      <View style={[styles.statusBadge, { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.statusBadgeText, { color: colors.accent }]}>Follow Back</Text>
      </View>
    );
    return (
      <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.accent }]} onPress={() => handleSendRequest(item.id)} activeOpacity={0.8}>
        <Text style={styles.addButtonText}>Follow</Text>
      </TouchableOpacity>
    );
  }

  // Guest view
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.guestContainer}>
          <Text style={[styles.guestTitle, { color: colors.textPrimary }]}>Friends</Text>
          <Text style={[styles.guestDesc, { color: colors.textSecondary }]}>
            Sign in to connect with other climbers, share your progress, and see what your friends are climbing.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={() => { setReturnTo('friends'); navigate('login'); }}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Sign In to Use Friends</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show friend detail sub-screen when a friend is selected
  if (viewingFriend) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 100 }]}>
        <FriendDetailView
          friend={viewingFriend}
          onBack={() => { setViewingFriend(null); if (friendSource === 'friends') openFriends(); }}
          colors={colors}
        />
      </View>
    );
  }

  // Show session detail full-screen
  if (viewingSession) {
    const { entry, climbs } = viewingSession;
    const swipeBack = PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx > 20 && Math.abs(g.dy) < 60,
      onPanResponderRelease: (_, g) => { if (g.dx > 60) setViewingSession(null); },
    });
    const date = parseISO(entry.sessionDate);
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]} {...swipeBack.panHandlers}>
        {/* Back bar */}
        <View style={[styles.detailTopBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setViewingSession(null)} style={styles.detailBackBtn} activeOpacity={0.7}>
            <Text style={[styles.detailBackTxt, { color: colors.accent }]}>← Back</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.detailContent}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <ProfileAvatar
              name={entry.friend.name}
              avatarUrl={entry.friend.id === user?.id ? (avatarUrl ?? null) : (entry.friend.avatar_url ?? null)}
              size={44}
              colors={colors}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardName, { color: colors.textPrimary }]}>{entry.friend.name}</Text>
              <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                {format(date, 'EEE, MMM d, yyyy')} · {sessionTimeOfDay(entry.sessionTime)}
              </Text>
            </View>
          </View>
          {/* Stats */}
          <View style={[styles.detailStatsRow, { borderColor: colors.border }]}>
            <View style={styles.detailStat}>
              <Text style={[styles.detailStatNum, { color: colors.textPrimary }]}>{entry.climbCount}</Text>
              <Text style={[styles.detailStatLbl, { color: colors.textMuted }]}>Climbs</Text>
            </View>
            <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailStat}>
              <Text style={[styles.detailStatNum, { color: colors.accentGreen }]}>{entry.sends}</Text>
              <Text style={[styles.detailStatLbl, { color: colors.textMuted }]}>Sends</Text>
            </View>
            {entry.hardestGrade && (
              <>
                <View style={[styles.cardStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailStat}>
                  <Text style={[styles.detailStatNum, { color: colors.accent }]}>{displayGrade(entry.hardestGrade, entry.hardestGradeSystem)}</Text>
                  <Text style={[styles.detailStatLbl, { color: colors.textMuted }]}>Hardest</Text>
                </View>
              </>
            )}
          </View>
          {/* Climbs */}
          {climbs.length === 0
            ? <Text style={[styles.cardNoClimbs, { color: colors.textMuted }]}>No climbs found</Text>
            : climbs.map((c: any) => <ClimbCard key={c.id} climb={c} compact />)
          }
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={screen === 'friends' ? [styles.container, { backgroundColor: colors.bg }] : { position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      {/* Activity feed — only when on friends screen */}
      {screen === 'friends' && (loadingFeed ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : activityFeed.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>No recent activity</Text>
          <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
            {friends.length === 0
              ? 'Add friends to see their recent climbs here.'
              : 'None of your friends have logged climbs in the last 7 days.'}
          </Text>
          {friends.length === 0 && (
            <TouchableOpacity
              style={[styles.addFriendsButton, { backgroundColor: colors.accent }]}
              onPress={() => openFriends()}
              activeOpacity={0.8}
            >
              <Text style={styles.addFriendsButtonText}>Add Friends</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loadingFeed} onRefresh={loadFeed} />}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RECENT ACTIVITY</Text>
          {activityFeed.map((entry) => {
            const sessionKey = entry.sessionId ? `sid-${entry.sessionId}` : `fid-${entry.friend.id}|${entry.sessionDate}`;
            const date = parseISO(entry.sessionDate);
            const isOutdoor = entry.environment === 'outdoor';

            return (
              <View key={sessionKey} style={[styles.activityCard, { borderBottomColor: colors.border }]}>

                {/* ── Header: avatar + name + date + env ── */}
                <TouchableOpacity style={styles.cardHeader} onPress={() => openFriendProfile(entry.friend, 'activity')} activeOpacity={0.75}>
                  <ProfileAvatar
                    name={entry.friend.name}
                    avatarUrl={entry.friend.id === user?.id ? (avatarUrl ?? null) : (entry.friend.avatar_url ?? null)}
                    size={44}
                    colors={colors}
                  />
                  <View style={styles.cardHeaderInfo}>
                    <Text style={[styles.cardName, { color: colors.textPrimary }]}>{entry.friend.name}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                      {formatRelativeDate(entry.sessionDate)} · {isOutdoor ? 'Outdoor' : 'Indoor'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* ── Activity title row ── */}
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                    {sessionTimeOfDay(entry.sessionTime)}
                  </Text>
                </View>

                {/* ── Partners row ── */}
                {entry.partners?.length ? (
                  <View style={styles.partnersRow}>
                    <Text style={[styles.partnersLabel, { color: colors.textMuted }]}>with </Text>
                    {entry.partners.map((p, i) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.partnerChip}
                        activeOpacity={0.7}
                        onPress={async () => {
                          const results = await searchByUsername(p.name, user?.id ?? '');
                          const byId = results.find(r => r.id === p.id);
                          const byName = results.find(r => r.name.toLowerCase() === p.name.toLowerCase());
                          const profile = byId ?? byName ?? { id: p.id, name: p.name, username: '', avatar_url: null };
                          openFriendProfile(profile, 'activity');
                        }}
                      >
                        <ProfileAvatar name={p.name} avatarUrl={p.avatar_url ?? null} size={20} colors={colors} />
                        <Text style={[styles.partnerName, { color: colors.accent }]}>
                          {p.name}{i < entry.partners!.length - 1 ? ',' : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {/* ── Stats ── */}
                <TouchableOpacity style={styles.cardStatsRow} onPress={() => handleToggleSession(entry)} activeOpacity={0.75}>
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
                </TouchableOpacity>

                {/* ── View climbs button ── */}
                <TouchableOpacity
                  onPress={() => handleOpenSession(entry)}
                  activeOpacity={0.7}
                  style={[styles.cardExpandBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.cardExpandTxt, { color: colors.textPrimary }]}>View climbs</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>

                {/* ── Like / Comment / Share ── */}
                {(() => {
                  const likes = likesMap[sessionKey] ?? [];
                  const comments = commentsMap[sessionKey] ?? [];
                  const liked = likes.some(l => l.user_id === user?.id);
                  const isCommenting = commentingKey === sessionKey;
                  return (
                    <>
                      {/* Like/comment counts */}
                      {(likes.length > 0 || comments.length > 0) && (
                        <View style={styles.cardCounts}>
                          {likes.length > 0 && (
                            <View style={styles.likeCountRow}>
                              <View style={styles.avatarStack}>
                                {likes.slice(0, 3).map((l, i) => {
                                  const url = l.user_id === user?.id ? avatarUrl : l.profile?.avatar_url;
                                  return url
                                    ? <Image key={l.id} source={{ uri: url }} style={[styles.likeAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]} />
                                    : <View key={l.id} style={[styles.likeAvatar, styles.likeAvatarFallback, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, backgroundColor: colors.border }]} />;
                                })}
                              </View>
                              <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
                                {likes.length} {likes.length === 1 ? 'like' : 'likes'}
                              </Text>
                            </View>
                          )}
                          {comments.length > 0 && (
                            <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
                              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                            </Text>
                          )}
                        </View>
                      )}
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          activeOpacity={0.7}
                          onPress={() => entry.sessionId && handleLike(sessionKey, entry.sessionId)}
                        >
                          <Ionicons
                            name={liked ? 'thumbs-up' : 'thumbs-up-outline'}
                            size={22}
                            color={liked ? colors.accent : colors.textMuted}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cardActionBtn}
                          activeOpacity={0.7}
                          onPress={() => {
                            setCommentingKey(isCommenting ? null : sessionKey);
                            setCommentText('');
                            if (!isCommenting && entry.sessionId) {
                              getSessionComments(entry.sessionId).then(c =>
                                setCommentsMap(prev => ({ ...prev, [sessionKey]: c }))
                              );
                            }
                          }}
                        >
                          <Ionicons
                            name={isCommenting ? 'chatbubble' : 'chatbubble-outline'}
                            size={22}
                            color={isCommenting ? colors.accent : colors.textMuted}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cardActionBtn} activeOpacity={0.7}>
                          <Ionicons name="share-outline" size={22} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>

                      {/* Comment section */}
                      {(comments.length > 0 || isCommenting) && (
                        <View style={[styles.commentSection, { borderTopColor: colors.border }]}>
                          {(() => {
                            const isExpanded = expandedCommentsKeys[sessionKey];
                            const visible = isExpanded ? comments : comments.slice(0, 3);
                            const hidden = comments.length - 3;
                            return (
                              <>
                                {visible.map(c => (
                                  <SwipeableComment
                                    key={c.id}
                                    c={c}
                                    isOwn={c.user_id === user?.id}
                                    onDelete={() => entry.sessionId && handleDeleteComment(sessionKey, entry.sessionId, c.id)}
                                    colors={colors}
                                    commentAvatarUrl={c.user_id === user?.id ? avatarUrl : (c.profile?.avatar_url ?? null)}
                                  />
                                ))}
                                {!isExpanded && hidden > 0 && (
                                  <TouchableOpacity onPress={() => setExpandedCommentsKeys(prev => ({ ...prev, [sessionKey]: true }))} activeOpacity={0.7}>
                                    <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>View {hidden} more comment{hidden > 1 ? 's' : ''}</Text>
                                  </TouchableOpacity>
                                )}
                                {isExpanded && comments.length > 3 && (
                                  <TouchableOpacity onPress={() => setExpandedCommentsKeys(prev => ({ ...prev, [sessionKey]: false }))} activeOpacity={0.7}>
                                    <Text style={[styles.commentShowMore, { color: colors.textMuted }]}>Show less</Text>
                                  </TouchableOpacity>
                                )}
                              </>
                            );
                          })()}
                          {isCommenting && (
                            <View style={styles.commentInputRow}>
                              {avatarUrl
                                ? <Image source={{ uri: avatarUrl }} style={styles.commentAvatar} />
                                : <View style={[styles.commentAvatar, { backgroundColor: colors.border }]} />
                              }
                              <View style={[styles.commentInput, { borderColor: colors.border, backgroundColor: colors.bgCard, flex: 1 }]}>
                                <TextInput
                                  style={[styles.commentInputText, { color: colors.textPrimary }]}
                                  placeholder="Add a comment..."
                                  placeholderTextColor={colors.textMuted}
                                  value={commentText}
                                  onChangeText={setCommentText}
                                  multiline
                                  blurOnSubmit
                                  onSubmitEditing={() => entry.sessionId && handleSendComment(sessionKey, entry.sessionId)}
                                />
                                <TouchableOpacity
                                  onPress={() => entry.sessionId && handleSendComment(sessionKey, entry.sessionId)}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="send" size={18} color={commentText.trim() ? colors.accent : colors.textMuted} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      )}
                    </>
                  );
                })()}
              </View>
            );
          })}
        </ScrollView>
      ))}

      {/* ── Friends Manager Modal ── */}
      <Modal
        visible={friendsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => closeFriends()}
      >
        <View style={[styles.manageModalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.manageModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.manageModalTitle, { color: colors.textPrimary }]}>Friends</Text>
            <TouchableOpacity onPress={() => { closeFriends(); setSearchQuery(''); }} activeOpacity={0.7}>
              <Text style={[styles.doneButton, { color: colors.accent }]}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Search */}
            <View style={[styles.searchBar, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search @username"
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                  <Text style={[styles.clearSearch, { color: colors.textMuted }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {searchQuery.trim().length > 0 ? (
              /* Search results */
              <View>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RESULTS</Text>
                {searching ? (
                  <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.lg }} />
                ) : searchResults.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No users found.</Text>
                ) : (
                  searchResults.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.personCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                      onPress={() => { closeFriends(); setSearchQuery(''); openFriendProfile(item, 'friends'); }}
                      activeOpacity={0.75}
                    >
                      <AvatarCircle name={item.name} colors={colors} />
                      <View style={styles.personInfo}>
                        <Text style={[styles.personName, { color: colors.textPrimary }]}>{item.name}</Text>
                        {item.username ? <Text style={[styles.personUsername, { color: colors.textMuted }]}>@{item.username}</Text> : null}
                      </View>
                      {renderAddFriendButton(item)}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : (
              <>
                {/* Pending requests */}
                {pendingRequestCount > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 0 }]}>REQUESTS</Text>
                      <View style={[styles.badgeDot, { backgroundColor: colors.accent }]}>
                        <Text style={styles.badgeDotText}>{pendingRequestCount > 9 ? '9+' : pendingRequestCount}</Text>
                      </View>
                    </View>
                    <View style={{ height: SPACING.md }} />
                    {loadingRequests ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      requests.map(req => (
                        <View key={req.id} style={[styles.requestCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                          <View style={styles.requestLeft}>
                            <AvatarCircle name={req.profile.name} colors={colors} />
                            <View style={styles.personInfo}>
                              <Text style={[styles.personName, { color: colors.textPrimary }]}>{req.profile.name}</Text>
                              {req.profile.username ? <Text style={[styles.personUsername, { color: colors.textMuted }]}>@{req.profile.username}</Text> : null}
                            </View>
                          </View>
                          <View style={styles.requestActions}>
                            {actingOnRequest === req.id ? (
                              <ActivityIndicator color={colors.accent} size="small" />
                            ) : (
                              <>
                                <TouchableOpacity style={[styles.acceptButton, { backgroundColor: colors.accent }]} onPress={() => handleAccept(req.id)} activeOpacity={0.8}>
                                  <Text style={styles.acceptButtonText}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.declineButton, { borderColor: colors.border }]} onPress={() => handleDecline(req.id)} activeOpacity={0.8}>
                                  <Text style={[styles.declineButtonText, { color: colors.textSecondary }]}>Decline</Text>
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* Friends list */}
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MY FRIENDS</Text>
                  {friends.length === 0 ? (
                    <View style={styles.emptyStateContainer}>
                      <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>Search above to add friends.</Text>
                    </View>
                  ) : (
                    friends.map(friend => (
                      <TouchableOpacity
                        key={friend.id}
                        style={[styles.personCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                        onPress={() => { closeFriends(); setSearchQuery(''); openFriendProfile(friend, 'friends'); }}
                        onLongPress={() => handleRemoveFriend(friend.id, friend.name)}
                        activeOpacity={0.75}
                      >
                        <AvatarCircle name={friend.name} colors={colors} />
                        <View style={styles.personInfo}>
                          <Text style={[styles.personName, { color: colors.textPrimary }]}>{friend.name}</Text>
                          {friend.username ? <Text style={[styles.personUsername, { color: colors.textMuted }]}>@{friend.username}</Text> : null}
                        </View>
                        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  guestContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: SPACING.xxl,
    paddingTop: 120,
  },
  guestTitle: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.family.bold,
    marginBottom: SPACING.md,
  },
  guestDesc: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
  },
  screenTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  manageButtonText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  badgeDot: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeDotText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: FONTS.family.bold,
    lineHeight: 14,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: SPACING.xxl,
    paddingTop: 75,
  },
  emptyStateTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    marginBottom: SPACING.sm,
  },
  emptyStateText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  addFriendsButton: {
    borderRadius: 12,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
  },
  addFriendsButtonText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
  },
  scrollArea: { flex: 1 },
  scrollContent: {
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl * 2,
  },
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  sessionBlock: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  sessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  sessionStatVal: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    textAlign: 'center',
  },
  sessionStatLabel: {
    fontSize: 10,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
  },
  hardestBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  hardestText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.bold,
  },
  chevron: {
    fontSize: 22,
    fontFamily: FONTS.family.regular,
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  sessionContent: {
    borderTopWidth: 1,
    padding: SPACING.lg,
  },
  noClimbs: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  // ── Activity card (feed-style, no card) ──
  activityCard: {
    borderBottomWidth: 3,
    paddingVertical: SPACING.xl,
    marginHorizontal: -SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  cardHeaderInfo: { flex: 1 },
  cardName: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
  },
  cardTitleRow: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  cardTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    letterSpacing: -0.2,
  },
  partnersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingBottom: SPACING.md,
    gap: SPACING.xs,
  },
  partnersLabel: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
  },
  partnerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  partnerName: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
  },
  cardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: 0,
  },
  cardStat: { flex: 1, alignItems: 'center' },
  cardStatNum: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    letterSpacing: -0.3,
    marginBottom: 2,
    textAlign: 'center',
  },
  cardStatLbl: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardStatDivider: { width: 1, height: 32 },
  cardExpandTxt: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  cardClimbs: { paddingTop: SPACING.sm, gap: SPACING.sm },
  cardNoClimbs: { fontSize: FONTS.sizes.sm, textAlign: 'center', paddingVertical: SPACING.md },
  cardCounts: { flexDirection: 'row', gap: SPACING.md, paddingBottom: SPACING.xs, marginTop: SPACING.md, alignItems: 'center' },
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  likeCountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  likeAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#fff' },
  likeAvatarFallback: {},
  commentSection: { borderTopWidth: 1, marginTop: SPACING.md, paddingTop: SPACING.lg, gap: SPACING.sm },
  commentRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start' },
  commentAvatar: { width: 20, height: 20, borderRadius: 10, marginTop: 2 },
  commentName: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  commentText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  commentTime: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, marginTop: 2 },
  commentShowMore: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium, paddingVertical: 2 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  commentInput: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 20, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm },
  commentInputText: { flex: 1, fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular },
  detailTopBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  detailBackBtn: { paddingVertical: SPACING.xs },
  detailBackTxt: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.medium },
  detailContent: { padding: SPACING.lg, gap: SPACING.md },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
  detailStatsRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: SPACING.lg, marginBottom: SPACING.sm },
  detailStat: { flex: 1, alignItems: 'center' },
  detailStatNum: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.family.heavy, marginBottom: 2 },
  detailStatLbl: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: SPACING.xs,
    marginBottom: 0,
  },
  cardActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: 30,
    lineHeight: 34,
    fontFamily: FONTS.family.regular,
    marginTop: -1,
  },
  manageModalContainer: { flex: 1 },
  manageModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
  },
  manageModalTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
  },
  doneButton: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    padding: 0,
  },
  clearSearch: {
    fontSize: FONTS.sizes.md,
    paddingHorizontal: SPACING.xs,
  },
  emptyText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    marginTop: SPACING.md,
  },
  section: { marginBottom: SPACING.xl },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  personInfo: { flex: 1, gap: 2 },
  personName: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  personUsername: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
  },
  chevron: {
    fontSize: 22,
    fontFamily: FONTS.family.regular,
  },
  addButton: {
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  addButtonText: {
    color: '#fff',
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  statusBadge: {
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  statusBadgeText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  requestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
  },
  requestActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  acceptButton: {
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  declineButton: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  declineButtonText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
});
