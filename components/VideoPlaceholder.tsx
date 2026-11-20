import React from 'react';
import { TouchableOpacity, Text, Linking, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../utils/theme';

// Videos arrive with COCO 1.1.7, which has a video player. This version can't
// play them (or even show a frame — that needs native code an OTA can't add),
// so wherever a video link turns up it shows this tile instead of a broken
// image. Tapping it opens the App Store to update.

const APP_STORE_URL = 'https://apps.apple.com/app/id6762497120';

// Uploaded videos are stored as .mp4; also catch phone formats just in case
export function isVideoUri(uri: string | null | undefined): boolean {
  return !!uri && /\.(mp4|mov|m4v)(?:[?#]|$)/i.test(uri);
}

export default function VideoPlaceholder({ style, compact }: {
  style?: StyleProp<ViewStyle>;
  // Small thumbnails: play icon only, no text
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.tile, style]}
      onPress={() => Linking.openURL(APP_STORE_URL).catch(() => {})}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Video. Update COCO to watch."
    >
      <Ionicons name="play-circle" size={compact ? 28 : 44} color="#fff" />
      {!compact && <Text style={styles.text}>Update COCO{'\n'}to watch</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#1f1f1f',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 6,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
    fontFamily: FONTS.family.semibold,
  },
});
