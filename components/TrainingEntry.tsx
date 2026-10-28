import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { format, parseISO } from 'date-fns';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import PhotoViewer, { usePhotoOrigins, PhotoClipContext } from './PhotoViewer';
import { GradeBadge } from './UI';
interface Props {
  climb: Climb;
  // Shows an Edit button (own entries). There's no tap-through otherwise: this
  // already shows everything the detail sheet would.
  onEdit?: () => void;
  // Session-level photos to show in this entry's MEDIA box, ahead of its own — for
  // a session with a single lift/hangboard entry, so all its photos sit together.
  extraMedia?: string[];
}

// A lift/hangboard entry laid out like its detail sheet — ROUTINE, NOTES and MEDIA
// boxes in full — for sessions made up only of training, so there's no need to
// tap in to read it. ClimbCard renders this when given `expandRoutine`.
export default function TrainingEntry({ climb, onEdit, extraMedia }: Props) {
  const { colors } = useTheme();

  const label = CLIMB_TYPES.find(t => t.id === climb.type)?.label ?? climb.type;
  const time = (() => {
    try { return format(parseISO(climb.date), 'h:mm a'); } catch { return ''; }
  })();
  const routine = climb.routine?.trim();
  const notes = climb.notes?.trim();
  const ownUris = climb.mediaUris && climb.mediaUris.length > 0
    ? climb.mediaUris
    : climb.mediaUri ? [climb.mediaUri] : [];
  const ownTypes = ownUris.map((_, i) => climb.mediaTypes?.[i] ?? climb.mediaType ?? 'photo');
  const extra = (extraMedia ?? []).filter(u => !ownUris.includes(u));
  const uris = [...extra, ...ownUris];
  const types: ('photo' | 'video')[] = [...extra.map(() => 'photo' as const), ...ownTypes];

  const box = [styles.box, { backgroundColor: colors.bgCard, borderColor: colors.border }];
  const sectionLabel = [styles.sectionLabel, { color: colors.textMuted }];

  return (
    <View style={styles.entry}>
      <View style={styles.header}>
        {/* Badge in the type's color (lift grey, hangboard green), same format as a V-grade */}
        <GradeBadge grade={label} outcome="" colorOverride={CLIMB_TYPES.find(t => t.id === climb.type)?.color} />
        {time ? <Text style={[styles.time, { color: colors.textMuted }]}>{time}</Text> : null}
        <View style={{ flex: 1 }} />
        {onEdit && (
          <TouchableOpacity
            onPress={onEdit}
            style={[styles.editPill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.editPillTxt, { color: colors.accent }]}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Routine and notes together in one box */}
      {routine || notes ? (
        <View style={box}>
          {routine ? (
            <>
              <Text style={sectionLabel}>ROUTINE</Text>
              <Text style={[styles.body, { color: colors.textPrimary }]}>{routine}</Text>
            </>
          ) : null}
          {notes ? (
            <>
              <Text style={[sectionLabel, routine ? { marginTop: SPACING.lg } : null]}>NOTES</Text>
              <Text style={[styles.body, { color: colors.textPrimary }]}>{notes}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      <MediaBox uris={uris} types={types} />

      {!routine && !notes && uris.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No routine logged</Text>
      ) : null}
    </View>
  );
}

// The boxed MEDIA strip used by TrainingEntry, also on its own for session-level
// photos in a training-only session with several entries. Photos open in the
// full-screen viewer (videos show as a still — the viewer can't play them).
export function MediaBox({ uris, types }: { uris: string[]; types?: ('photo' | 'video')[] }) {
  const { colors } = useTheme();
  const { origins, register } = usePhotoOrigins();
  const clip = useContext(PhotoClipContext);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (uris.length === 0) return null;

  const isPhoto = (i: number) => (types?.[i] ?? 'photo') === 'photo';
  const photos = uris.filter((_, i) => isPhoto(i));

  return (
    <View style={[styles.box, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MEDIA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
        {uris.map((uri, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.85}
            disabled={!isPhoto(i)}
            onPress={() => setViewerIndex(photos.indexOf(uri))}
          >
            <Image ref={register(uri)} source={{ uri }} style={styles.media} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  editPill: { borderRadius: 7, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 3 },
  editPillTxt: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold },
  box: { borderRadius: 12, borderWidth: 1, padding: SPACING.lg },
  sectionLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular, letterSpacing: 1.5, marginBottom: SPACING.sm },
  body: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.regular, lineHeight: 22 },
  media: { width: 280, height: 240, borderRadius: 8 },
  empty: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, paddingHorizontal: 2 },
});
