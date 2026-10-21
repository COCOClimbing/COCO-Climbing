import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import PushScreen from './PushScreen';
import { useTabBarSpace } from './BottomTabBar';
import { FONTS, SPACING, CLIMB_TYPES, CLIMB_OUTCOMES, HOLD_COLORS, Climb } from '../utils/theme';
import { GradeBadge, OutcomeBadge, HoldColorDot } from './UI';
import { format, parseISO } from 'date-fns';

interface Props {
  visible: boolean;
  climb: Climb | null;
  onClose: () => void;
  // Omit for climbs the viewer can't edit (e.g. a friend's, opened from the feed)
  onEdit?: () => void;
  // Runs once the page has fully slid away. Open any follow-up modal (e.g. the
  // edit form) from here: iOS can't present one while this is still closing,
  // and trying leaves an invisible layer that blocks every tap.
  onClosed?: () => void;
  // Modals to present on top of this page (e.g. the edit form). They must be
  // rendered in here: iOS only stacks a modal on the one that presents it.
  children?: React.ReactNode;
}

export default function ClimbDetailModal({ visible, climb: climbProp, onClose, onEdit, onClosed, children }: Props) {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  // Callers clear the climb as they close, so keep showing the last one while
  // the page slides away.
  const lastClimb = useRef(climbProp);
  if (climbProp) lastClimb.current = climbProp;
  const climb = climbProp ?? lastClimb.current;

  if (!climb) return null;

  const typeInfo = CLIMB_TYPES.find(t => t.id === climb.type);
  const isTraining = climb.type === 'hangboard' || climb.type === 'lift';
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
    <PushScreen
      visible={visible}
      title={isTraining ? (typeInfo?.label ?? climb.type) : climb.grade}
      subtitle={climb.routeName || climb.projectName || undefined}
      onBack={onClose}
      onDismiss={onClosed}
      headerRight={onEdit ? (
        <TouchableOpacity
          onPress={onEdit}
          style={[ss.editPill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[ss.editPillTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Edit</Text>
        </TouchableOpacity>
      ) : null}
    >
        <ScrollView contentContainerStyle={[ss.content, { paddingBottom: tabBarSpace }]} showsVerticalScrollIndicator={false}>
          {/* Grade + outcome row */}
          <View style={[ss.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={ss.mainRow}>
              {!isTraining && <GradeBadge grade={climb.grade} outcome={climb.outcome} />}
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
            {/* Hangboard/lift entries have no grade or outcome */}
            {!isTraining && <View style={ss.badgeRow}>
              <OutcomeBadge outcome={climb.outcome} />
              {count > 0 && climb.outcome !== 'flash' && (
                <Text style={[ss.countText, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                  {count} {unit}
                </Text>
              )}
            </View>}
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

          {/* Hold color */}
          {climb.holdColor ? (
            <View style={[ss.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[ss.sectionLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>HOLD COLOR</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <HoldColorDot colorId={climb.holdColor} size={18} />
                <Text style={[ss.notesText, { color: colors.textPrimary, fontFamily: FONTS.family.medium }]}>
                  {HOLD_COLORS.find(c => c.id === climb.holdColor)?.label ?? climb.holdColor}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Routine (hangboard/lift) */}
          {climb.routine ? (
            <View style={[ss.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[ss.sectionLabel, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>ROUTINE</Text>
              <Text style={[ss.notesText, { color: colors.textPrimary, fontFamily: FONTS.family.regular }]}>
                {climb.routine}
              </Text>
            </View>
          ) : null}

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
        {children}
    </PushScreen>
  );
}

const ss = StyleSheet.create({
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
