import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, Image,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING, CLIMB_TYPES, CLIMB_OUTCOMES, Climb } from '../utils/theme';
import { GradeBadge, OutcomeBadge } from './UI';
import { format, parseISO } from 'date-fns';

interface Props {
  visible: boolean;
  climb: Climb | null;
  onClose: () => void;
  onEdit: () => void;
}

export default function ClimbDetailModal({ visible, climb, onClose, onEdit }: Props) {
  const { colors } = useTheme();

  if (!climb) return null;

  const typeInfo = CLIMB_TYPES.find(t => t.id === climb.type);
  const outcomeInfo = CLIMB_OUTCOMES.find(o => o.id === climb.outcome);
  const count = climb.attempts ?? 0;
  const unit = climb.outcome === 'hang'
    ? (count === 1 ? 'hang' : 'hangs')
    : (count === 1 ? 'attempt' : 'attempts');

  const dateStr = (() => {
    try { return format(parseISO(climb.date), 'EEEE, MMM d yyyy · h:mm a'); }
    catch { return ''; }
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onClose}>
      <View style={[ss.container, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[ss.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[ss.backTxt, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>← Back</Text>
          </TouchableOpacity>
          <View style={ss.headerCenter}>
            <Text style={[ss.headerGrade, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>
              {climb.grade}
            </Text>
            {(climb.routeName || climb.projectName) ? (
              <Text style={[ss.headerName, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]} numberOfLines={1}>
                {climb.routeName || climb.projectName}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={onEdit}
            style={[ss.editPill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[ss.editPillTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Edit</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={ss.content} showsVerticalScrollIndicator={false}>
          {/* Grade + outcome row */}
          <View style={[ss.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={ss.mainRow}>
              <GradeBadge grade={climb.grade} outcome={climb.outcome} />
              <View style={ss.mainInfo}>
                <Text style={[ss.typeText, { color: colors.textPrimary, fontFamily: FONTS.family.semibold }]}>
                  {typeInfo?.label ?? climb.type}
                  {' · '}
                  <Text style={{ color: colors.textSecondary, fontFamily: FONTS.family.regular }}>
                    {climb.environment === 'outdoor' ? 'Outdoor' : 'Indoor'}
                  </Text>
                </Text>
                {dateStr ? (
                  <Text style={[ss.dateText, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>{dateStr}</Text>
                ) : null}
              </View>
            </View>
            <View style={ss.badgeRow}>
              <OutcomeBadge outcome={climb.outcome} />
              {count > 0 && climb.outcome !== 'flash' && (
                <Text style={[ss.countText, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                  {count} {unit}
                </Text>
              )}
            </View>
          </View>

          {/* Styles */}
          {climb.styles.length > 0 && (
            <View style={[ss.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[ss.sectionLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>STYLE</Text>
              <View style={ss.tagsRow}>
                {climb.styles.map(s => (
                  <View key={s} style={[ss.tag, { backgroundColor: colors.bgElevated }]}>
                    <Text style={[ss.tagText, { color: colors.textSecondary, fontFamily: FONTS.family.medium }]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          {climb.notes ? (
            <View style={[ss.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[ss.sectionLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>NOTES</Text>
              <Text style={[ss.notesText, { color: colors.textPrimary, fontFamily: FONTS.family.regular }]}>
                {climb.notes}
              </Text>
            </View>
          ) : null}

          {/* Media */}
          {(() => {
            const uris = climb.mediaUris && climb.mediaUris.length > 0
              ? climb.mediaUris
              : climb.mediaUri ? [climb.mediaUri] : [];
            if (uris.length === 0) return null;
            return (
              <View style={[ss.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[ss.sectionLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>MEDIA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {uris.map((uri, i) => (
                    <Image
                      key={i}
                      source={{ uri }}
                      style={[ss.media, i < uris.length - 1 && { marginRight: SPACING.sm }]}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
              </View>
            );
          })()}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  backTxt: { fontSize: FONTS.sizes.md, minWidth: 60 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.sm },
  headerGrade: { fontSize: FONTS.sizes.lg },
  headerName: { fontSize: FONTS.sizes.sm, marginTop: 1 },
  editPill: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    minWidth: 60, alignItems: 'center',
  },
  editPillTxt: { fontSize: FONTS.sizes.sm },
  content: { padding: SPACING.lg, gap: SPACING.md },
  card: {
    borderRadius: 12, borderWidth: 1,
    padding: SPACING.lg,
  },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  mainInfo: { flex: 1 },
  typeText: { fontSize: FONTS.sizes.md, marginBottom: 3 },
  dateText: { fontSize: FONTS.sizes.xs },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  countText: { fontSize: FONTS.sizes.sm },
  sectionLabel: { fontSize: FONTS.sizes.xs, letterSpacing: 1.5, marginBottom: SPACING.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tag: { borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  tagText: { fontSize: FONTS.sizes.sm },
  notesText: { fontSize: FONTS.sizes.md, lineHeight: 22 },
  media: { width: 280, height: 240, borderRadius: 8 },
});
