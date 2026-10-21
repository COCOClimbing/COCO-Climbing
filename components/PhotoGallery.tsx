import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING } from '../utils/theme';
import PhotoViewer, { usePhotoOrigins } from './PhotoViewer';

const COLUMNS = 3;
const GAP = 2;

// Square-thumbnail grid of photos, newest first; tapping one opens the
// full-screen viewer, which can swipe through the rest.
export default function PhotoGallery({ uris, loading, emptyText }: {
  uris: string[];
  loading?: boolean;
  emptyText: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { origins, register } = usePhotoOrigins();
  const size = width > 0 ? (width - GAP * (COLUMNS - 1)) / COLUMNS : 0;

  if (loading) {
    return <ActivityIndicator color={colors.accent} style={{ marginVertical: SPACING.xl }} />;
  }
  if (uris.length === 0) {
    return <Text style={[styles.empty, { color: colors.textMuted }]}>{emptyText}</Text>;
  }

  return (
    <View style={styles.grid} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {size > 0 && uris.map((uri, i) => (
        <TouchableOpacity
          key={uri}
          ref={register(uri) as any}
          onPress={() => setViewerIndex(i)}
          activeOpacity={0.85}
          style={{ width: size, height: size, marginRight: i % COLUMNS === COLUMNS - 1 ? 0 : GAP, marginBottom: GAP }}
        >
          <Image source={{ uri }} style={[styles.thumb, { backgroundColor: colors.bgElevated }]} />
        </TouchableOpacity>
      ))}
      {viewerIndex !== null && (
        <PhotoViewer uris={uris} initialIndex={viewerIndex} origins={origins} onClose={() => setViewerIndex(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: { width: '100%', height: '100%' },
  empty: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    marginVertical: SPACING.xl,
  },
});
