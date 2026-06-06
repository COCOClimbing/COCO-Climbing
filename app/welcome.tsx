import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  useColorScheme,
} from 'react-native';
import Svg, { Polygon, Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, SPACING } from '../utils/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WELCOME_SEEN_KEY = '@coco_welcome_seen';

export async function markWelcomeSeen() {
  await AsyncStorage.setItem(WELCOME_SEEN_KEY, 'true');
}

export async function hasSeenWelcome(): Promise<boolean> {
  const val = await AsyncStorage.getItem(WELCOME_SEEN_KEY);
  return val === 'true';
}

// ─── Illustrations ────────────────────────────────────────────────────────────

function MountainIllustration({ accent }: { accent: string; muted: string }) {
  return (
    <Svg width={280} height={160} viewBox="0 0 200 120">
      {/* Left dark peak */}
      <Path d="M -5,100 L 10,62 L 30,42 L 55,16 L 72,8 L 90,22 L 115,100 Z" fill="#1A1A1A" />
      {/* Middle peak */}
      <Path d="M 75,100 L 95,58 L 112,40 L 130,26 L 150,42 L 168,100 Z" fill="#222222" />
      {/* Right grey peak */}
      <Path d="M 130,100 L 140,62 L 152,46 L 164,34 L 176,48 L 188,62 L 205,100 Z" fill="#2A2A2A" />
      {/* Front orange range */}
      <Path d="M 2,100 L 30,68 L 52,55 L 72,28 L 84,22 L 96,32 L 114,48 L 132,38 L 152,58 L 172,68 L 198,100 Z" fill={accent} />
      {/* Shadow left peak */}
      <Polygon points="84,22 96,32 108,100 76,100" fill="#7A3D1A" opacity={0.5} />
      {/* Shadow right peak */}
      <Polygon points="132,38 152,58 160,100 134,100" fill="#7A3D1A" opacity={0.4} />
    </Svg>
  );
}

function ChartIllustration({ accent, muted }: { accent: string; muted: string }) {
  const bars = [40, 60, 45, 80, 65, 95];
  return (
    <View style={ill.container}>
      <View style={ill.chartArea}>
        {bars.map((h, i) => (
          <View key={i} style={ill.barWrap}>
            <View
              style={[
                ill.bar,
                {
                  height: h,
                  backgroundColor: i === bars.length - 1 ? accent : muted,
                  borderRadius: 4,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={[ill.ground, { backgroundColor: muted }]} />
    </View>
  );
}

function WallIllustration({ accent, muted }: { accent: string; muted: string }) {
  const holds = [
    [0,0,1,0,0,0], [0,1,0,0,1,0], [1,0,0,1,0,1],
    [0,0,1,0,1,0], [0,1,0,0,0,1], [1,0,0,1,0,0],
  ];
  const highlighted = [[0,2],[1,1],[1,4],[2,0],[2,3],[3,2],[3,4],[4,1],[4,5],[5,0],[5,3]];
  const isHighlighted = (r: number, c: number) =>
    highlighted.some(([hr, hc]) => hr === r && hc === c);

  return (
    <View style={ill.container}>
      <View style={[ill.wall, { borderColor: muted }]}>
        {holds.map((row, r) => (
          <View key={r} style={ill.holdRow}>
            {row.map((show, c) =>
              show ? (
                <View
                  key={c}
                  style={[
                    ill.hold,
                    { backgroundColor: isHighlighted(r, c) ? accent : muted },
                  ]}
                />
              ) : (
                <View key={c} style={ill.holdSpace} />
              )
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function FriendsIllustration({ accent, muted }: { accent: string; muted: string }) {
  return (
    <View style={ill.container}>
      <View style={ill.friendsRow}>
        {/* Person 1 */}
        <View style={ill.person}>
          <View style={[ill.head, { backgroundColor: muted }]} />
          <View style={[ill.body, { backgroundColor: muted }]} />
          <View style={ill.legs}>
            <View style={[ill.leg, { backgroundColor: muted }]} />
            <View style={[ill.leg, { backgroundColor: muted }]} />
          </View>
        </View>

        {/* Connecting line */}
        <View style={[ill.connector, { backgroundColor: accent }]} />

        {/* Person 2 */}
        <View style={ill.person}>
          <View style={[ill.head, { backgroundColor: accent }]} />
          <View style={[ill.body, { backgroundColor: accent }]} />
          <View style={ill.legs}>
            <View style={[ill.leg, { backgroundColor: accent }]} />
            <View style={[ill.leg, { backgroundColor: accent }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const ILLUSTRATIONS = [
  MountainIllustration,
  ChartIllustration,
  WallIllustration,
  FriendsIllustration,
];

// ─── Slides ───────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    title: 'Your climbing\njournal.',
    subtitle: 'Log every route, track every session, and watch yourself improve.',
  },
  {
    title: 'Crush your\ngoals.',
    subtitle: 'Visualize your progress with stats, streaks, and grade trends.',
  },
  {
    title: 'Work your\nprojects.',
    subtitle: "Save routes you're projecting and track your attempts over time.",
  },
  {
    title: 'Climb with\nfriends.',
    subtitle: "Follow your crew, share sessions, and see what they're sending.",
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const colorScheme = useColorScheme();
  const dark = colorScheme !== 'light';
  const insets = useSafeAreaInsets();

  const bg = dark ? '#0A0A0A' : '#F5F5F2';
  const textPrimary = dark ? '#E4E2DD' : '#1A1A18';
  const textMuted = dark ? '#555550' : '#9E9E96';
  const accent = '#BF5F29';
  const muted = dark ? '#2A2A2A' : '#D8D8D4';

  function handleScroll(e: any) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(idx);
  }

  function goNext() {
    if (activeIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (activeIndex + 1) * SCREEN_WIDTH, animated: true });
    } else {
      handleGetStarted();
    }
  }

  async function handleGetStarted() {
    await markWelcomeSeen();
    onDone();
  }

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.slider}
      >
        {SLIDES.map((slide, i) => {
          const Illustration = ILLUSTRATIONS[i];
          return (
            <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <Text style={[styles.cocoLogo, { color: accent }]}>COCO</Text>
              <View style={styles.illustration}>
                <Illustration accent={accent} muted={muted} />
              </View>
              <Text style={[styles.title, { color: textPrimary }]}>{slide.title}</Text>
              <Text style={[styles.subtitle, { color: textMuted }]}>{slide.subtitle}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom || SPACING.xl * 2 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === activeIndex ? accent : (dark ? '#2A2A2A' : '#D0D0CC'),
                  width: i === activeIndex ? 20 : 6,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: accent }]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  slider: { flex: 1 },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: SPACING.xl * 2,
    paddingTop: SPACING.xl * 4,
  },
  cocoLogo: {
    fontSize: 48,
    fontFamily: 'OilvareBase-Regular',
    letterSpacing: 10,
    marginBottom: SPACING.xl * 2,
  },
  illustration: {
    width: 280,
    height: 160,
    marginBottom: SPACING.xl + SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: FONTS.sizes.hero,
    fontFamily: 'OilvareBase-Regular',
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: SPACING.lg,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottom: {
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.xl,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  button: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: SPACING.lg + 2,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  appName: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.heavy,
    letterSpacing: 4,
  },
});

// ─── Illustration styles ──────────────────────────────────────────────────────

const ill = StyleSheet.create({
  container: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // Mountain scene container
  mountainScene: {
    width: 160,
    height: 120,
    position: 'relative',
  },
  triangleLeft: {
    position: 'absolute',
    bottom: 0,
    left: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 40,
    borderRightWidth: 40,
    borderBottomWidth: 82,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  triangleRight: {
    position: 'absolute',
    bottom: 0,
    right: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 36,
    borderRightWidth: 36,
    borderBottomWidth: 72,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  triangleFront: {
    position: 'absolute',
    bottom: 0,
    left: 25,
    width: 0,
    height: 0,
    borderLeftWidth: 55,
    borderRightWidth: 55,
    borderBottomWidth: 108,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  ground: {
    width: 160,
    height: 3,
    borderRadius: 2,
  },
  // Chart
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 6,
    marginBottom: 4,
  },
  barWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 120,
  },
  bar: {
    width: '100%',
  },
  // Wall
  wall: {
    width: 140,
    height: 140,
    borderWidth: 2,
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  holdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    alignItems: 'center',
  },
  hold: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  holdSpace: {
    width: 14,
    height: 14,
  },
  // Friends
  friendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  person: {
    alignItems: 'center',
    gap: 4,
  },
  head: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  body: {
    width: 22,
    height: 36,
    borderRadius: 6,
  },
  legs: {
    flexDirection: 'row',
    gap: 6,
  },
  leg: {
    width: 8,
    height: 28,
    borderRadius: 4,
  },
  connector: {
    height: 2,
    width: 24,
    borderRadius: 1,
    marginBottom: 20,
  },
});
