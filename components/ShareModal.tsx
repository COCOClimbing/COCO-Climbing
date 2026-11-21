import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Alert, Dimensions,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
let RNShare: any = null;
try { RNShare = require('react-native-share').default; } catch (_) {}

import EssentialsCard from './share/EssentialsCard';
import RecapCard from './share/RecapCard';
import HomageCard from './share/HomageCard';
import { computeShareStats, ShareClimb } from './share/shareStats';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING } from '../utils/theme';
import { TabSwipeGuard } from '../utils/useTabSwipe';

export interface ShareData {
  date: string;
  climbs?: ShareClimb[];
  location?: string;
  title?: string;
  climbCount?: number;
  sendCount?: number;
  flashCount?: number;
  hardestGrade?: string | null;
  climbType?: string;
  friendName?: string;
  climbingWith?: string[];
}

interface Props {
  visible: boolean;
  data: ShareData | null;
  accentColor: string;
  onDismiss: () => void;
}

const FACEBOOK_APP_ID = '2188945488595075';

// All three designs are transparent stickers: white type meant to sit over
// the climber's own photo or video in a story.
const SHARE_CARDS = [
  { label: 'The Essentials', kind: 'essentials', layout: 'vertical' },
  { label: 'The Essentials', kind: 'essentials', layout: 'horizontal' },
  { label: 'Session Recap',  kind: 'recap',      layout: 'vertical' },
  { label: 'Session Recap',  kind: 'recap',      layout: 'horizontal' },
  { label: 'Homage',         kind: 'homage',     layout: 'vertical' },
] as const;
const STICKER_HINT = 'Save & place as story sticker';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Shrinks a card's on-screen preview to fit its page without changing the
// card's own layout, so the ViewShot capture inside stays full size. The card
// keeps its natural size in normal flow; negative margins give back the space
// the scale-down frees. (Absolute positioning made the card re-measure against
// the shrunken box and collapse to a sliver.)
function FitPreview({ maxHeight, children }: { maxHeight: number; children: React.ReactNode }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const scale = size ? Math.min(1, maxHeight / size.h, (SCREEN_WIDTH - 32) / size.w) : 1;
  const trimV = size ? (size.h * (1 - scale)) / 2 : 0;
  return (
    <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
      <View
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
        }}
        style={{ transform: [{ scale }], marginVertical: -trimV }}
      >
        {children}
      </View>
    </View>
  );
}

export default function ShareModal({ visible, data, accentColor, onDismiss }: Props) {
  const [cardIndex, setCardIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const cardRefs = useRef<(ViewShot | null)[]>([]);
  const preCapturedUri = useRef<string | null>(null);
  const [pageHeight, setPageHeight] = useState(10000);
  const stats = useMemo(() => (data ? computeShareStats(data) : null), [data]);

  // The carousel remounts at the first card each time the sheet opens, so the
  // index must too — otherwise the dots and Share pointed at the last card
  // viewed in a previous opening while the first card was on screen.
  useEffect(() => {
    if (visible) setCardIndex(0);
  }, [visible]);

  // Pre-capture the current card in the background after the modal finishes opening,
  // so tapping Share doesn't have to wait for capture on the critical path.
  useEffect(() => {
    if (!visible) {
      preCapturedUri.current = null;
      return;
    }
    preCapturedUri.current = null;
    const timer = setTimeout(async () => {
      const ref = cardRefs.current[cardIndex];
      if (ref) {
        try {
          preCapturedUri.current = await (ref as any).capture();
        } catch {}
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [visible, cardIndex]);

  async function handleShareToInstagram() {
    try {
      const ref = cardRefs.current[cardIndex];
      const uri = preCapturedUri.current ?? await (ref as any)?.capture();
      if (!uri) { Alert.alert('Error', 'Card not ready yet. Try again.'); return; }
            await RNShare.shareSingle({
        social: RNShare.Social.INSTAGRAM_STORIES,
        appId: FACEBOOK_APP_ID,
        stickerImage: uri,
        backgroundTopColor: '#0A0A0A',
        backgroundBottomColor: '#0A0A0A',
        attributionURL: 'https://apps.apple.com/app/id6762497120',
      } as any);
    } catch (e: any) {
      if (String(e?.message ?? e).toLowerCase().includes('cancel')) return;
      Alert.alert('Instagram not available', 'Make sure Instagram is installed and try again.');
    }
  }

  async function handleShare() {
    try {
      const ref = cardRefs.current[cardIndex];
      const uri = preCapturedUri.current ?? await (ref as any)?.capture();
      if (!uri) {
        Alert.alert('Error', 'Card not ready yet. Try again.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Session' });
    } catch (e: any) {
      Alert.alert('Share Error', String(e?.message ?? e));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      {/* Touches inside a Modal still bubble up the component tree to the screen
          behind it, so swiping past the last card changed the Sessions tab
          (to Projects). The guard stops the tab swipe from claiming them. */}
      <TabSwipeGuard style={{ flex: 1 }}>
      <View style={styles.overlay}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={e => {
            setCardIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
          }}
          style={{ flex: 1 }}
          onLayout={e => setPageHeight(e.nativeEvent.layout.height - 64)}
          contentContainerStyle={{ alignItems: 'stretch' }}
        >
          {SHARE_CARDS.map((card, i) => (
            <View key={i} style={styles.cardPage}>
              <FitPreview maxHeight={pageHeight - 48}>
                <ViewShot ref={ref => { cardRefs.current[i] = ref; }} options={{ format: 'png', quality: 1 }}>
                  {stats && (
                    card.kind === 'essentials' ? <EssentialsCard stats={stats} layout={card.layout} />
                    : card.kind === 'recap' ? <RecapCard stats={stats} layout={card.layout} />
                    : <HomageCard stats={stats} />
                  )}
                </ViewShot>
              </FitPreview>
              <Text style={styles.cardLabel}>{card.label}</Text>
              <Text style={styles.cardHint}>{STICKER_HINT}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dotsRow}>
          {SHARE_CARDS.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === cardIndex ? '#fff' : 'rgba(255,255,255,0.3)' }]} />
          ))}
        </View>

        <View style={styles.buttons}>
          <View style={{ flexDirection: 'row', gap: SPACING.md }}>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: accentColor, flex: 1 }]} onPress={handleShare} activeOpacity={0.8}>
              <Text style={styles.confirmText}>Share</Text>
            </TouchableOpacity>
            {RNShare && (
              <TouchableOpacity style={styles.instagramIconBtn} onPress={handleShareToInstagram} activeOpacity={0.8}>
                <Ionicons name="logo-instagram" size={26} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
      </TabSwipeGuard>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  cardPage: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,   // clear the Dynamic Island; tall cards (Recap) need the room
    paddingBottom: SPACING.sm,
  },
  cardLabel: {
    marginTop: SPACING.sm,
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  cardHint: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.3)',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  buttons: {
    gap: SPACING.md,
    width: 320,
    marginBottom: SPACING.xl,
  },
  confirmBtn: {
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
  },
  instagramIconBtn: {
    borderRadius: 12,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C13584',
  },
  cancelBtn: {
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cancelText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    color: 'rgba(255,255,255,0.5)',
  },
});
