import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import PhotoViewer, { usePhotoOrigins, PhotoClipContext } from './PhotoViewer';

interface Props {
  climb: Climb;
  // Tapping the header — opens the detail sheet or edit form, as the card would
  onPress?: () => void;
}

// A lift/hangboard entry laid out like its detail sheet — ROUTINE, NOTES and MEDIA
// boxes in full — for sessions made up only of training, so there's no need to
// tap in to read it. ClimbCard renders this when given `expandRoutine`.
export default function TrainingEntry({ climb, onPress }: Props) {
  const { colors } = useTheme();
  const { origins, register } = usePhotoOrigins();
  const clip = useContext(PhotoClipContext);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const label = CLIMB_TYPES.find(t => t.id === climb.type)?.label ?? climb.type;
  const time = (() => {
    try { return format(parseISO(climb.date), 'h:mm a'); } catch { return ''; }
  })();
  const routine = climb.routine?.trim();
  const uris = climb.mediaUris && climb.mediaUris.length > 0
    ? climb.mediaUris
    : climb.mediaUri ? [climb.mediaUri] : [];
  const types = uris.map((_, i) => climb.mediaTypes?.[i] ?? climb.mediaType ?? 'photo');
  // Only photos open in the viewer; a video tap falls through to the detail sheet
  const photos = uris.filter((_, i) => types[i] === 'photo');

  const box = [styles.box, { backgroundColor: colors.bgCard, borderColor: colors.border }];
  const sectionLabel = [styles.sectionLabel, { color: colors.textMuted }];

  return (
    <View style={styles.entry}>
      <TouchableOpacity style={styles.header} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{label}</Text>
        {time ? <Text style={[styles.time, { color: colors.textMuted }]}>{time}</Text> : null}
        <View style={{ flex: 1 }} />
        {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
      </TouchableOpacity>

      {routine ? (
        <View style={box}>
          <Text style={sectionLabel}>ROUTINE</Text>
          <Text style={[styles.body, { color: colors.textPrimary }]}>{routine}</Text>
        </View>
      ) : null}

      {climb.notes ? (
        <View style={box}>
          <Text style={sectionLabel}>NOTES</Text>
          <Text style={[styles.body, { color: colors.textPrimary }]}>{climb.notes}</Text>
        </View>
      ) : null}

      {uris.length > 0 ? (
        <View style={box}>
          <Text style={sectionLabel}>MEDIA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
            {uris.map((uri, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.85}
                onPress={() => types[i] === 'photo' ? setViewerIndex(photos.indexOf(uri)) : onPress?.()}
              >
                <Image ref={register(uri)} source={{ uri }} style={styles.media} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {!routine && !climb.notes && uris.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No routine logged</Text>
      ) : null}

      {viewerIndex !== null && (
        <PhotoViewer uris={photos} initialIndex={viewerIndex} origins={origins} clipTo={clip} onClose={() => setViewerIndex(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { gap: SPACING.sm, marginBottom: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: 2 },
  title: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold },
  time: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  box: { borderRadius: 12, borderWidth: 1, padding: SPACING.lg },
  sectionLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, letterSpacing: 1.5, marginBottom: SPACING.sm },
  body: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.regular, lineHeight: 22 },
  media: { width: 280, height: 240, borderRadius: 8 },
  empty: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, paddingHorizontal: 2 },
});
