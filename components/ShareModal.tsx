import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Alert, Dimensions,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import SessionShareCard from './SessionShareCard';
import SessionShareCardVertical from './SessionShareCardVertical';
import SessionShareCardStrava from './SessionShareCardStrava';
import { FONTS, SPACING, Climb } from '../utils/theme';

export interface ShareData {
  date: string;
  climbs?: Climb[];
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

const SHARE_CARDS = [
  { label: 'Card',                hint: null,                            transparent: false, vertical: true,  strava: false, stravasolid: false },
  { label: 'Transparent Card',    hint: 'Save & place as story sticker', transparent: true,  vertical: true,  strava: false, stravasolid: false },
  { label: 'Sticker',             hint: 'Save & place as story sticker', transparent: false, vertical: false, strava: true,  stravasolid: true  },
  { label: 'Transparent Sticker', hint: 'Save & place as story sticker', transparent: false, vertical: false, strava: true,  stravasolid: false },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ShareModal({ visible, data, accentColor, onDismiss }: Props) {
  const [cardIndex, setCardIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const cardRefs = useRef<(ViewShot | null)[]>([]);

  async function handleShare() {
    const ref = cardRefs.current[cardIndex];
    if (!ref) {
      Alert.alert('Error', 'Card not ready yet. Try again.');
      return;
    }
    try {
      const uri = await (ref as any).capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Session' });
    } catch {
      Alert.alert('Error', 'Could not share this card.');
    } finally {
      onDismiss();
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
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
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {SHARE_CARDS.map((card, i) => (
            <View key={i} style={styles.cardPage}>
              <ViewShot ref={ref => { cardRefs.current[i] = ref; }} options={{ format: 'png', quality: 1 }}>
                {data && (card.strava ? (
                  <SessionShareCardStrava
                    date={data.date}
                    accentColor={accentColor}
                    solid={card.stravasolid}
                    climbs={data.climbs}
                    climbCount={data.climbCount}
                    sendCount={data.sendCount}
                    flashCount={data.flashCount}
                    hardestGrade={data.hardestGrade}
                    climbType={data.climbType}
                    friendName={data.friendName}
                    location={data.location}
                    climbingWith={data.climbingWith}
                  />
                ) : card.vertical ? (
                  <SessionShareCardVertical
                    date={data.date}
                    accentColor={accentColor}
                    variant={card.transparent ? 'transparent' : 'solid'}
                    climbs={data.climbs}
                    climbCount={data.climbCount}
                    sendCount={data.sendCount}
                    flashCount={data.flashCount}
                    hardestGrade={data.hardestGrade}
                    climbType={data.climbType}
                    friendName={data.friendName}
                    location={data.location}
                    title={data.title}
                    climbingWith={data.climbingWith}
                  />
                ) : (
                  <SessionShareCard
                    date={data.date}
                    accentColor={accentColor}
                    transparent={card.transparent}
                    climbs={data.climbs}
                    climbCount={data.climbCount}
                    sendCount={data.sendCount}
                    flashCount={data.flashCount}
                    hardestGrade={data.hardestGrade}
                    climbType={data.climbType}
                    friendName={data.friendName}
                    location={data.location}
                  />
                ))}
              </ViewShot>
              <Text style={styles.cardLabel}>{card.label}</Text>
              {card.hint ? <Text style={styles.cardHint}>{card.hint}</Text> : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.dotsRow}>
          {SHARE_CARDS.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === cardIndex ? '#fff' : 'rgba(255,255,255,0.3)' }]} />
          ))}
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: accentColor }]} onPress={handleShare} activeOpacity={0.8}>
            <Text style={styles.confirmText}>Share...</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    paddingTop: 160,
    paddingBottom: SPACING.xl,
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
