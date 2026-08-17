import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { FONTS, SPACING } from '../utils/theme';
import Avatar from './Avatar';

export interface Liker {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
}

const STACK_AVATAR = 20;
const STACK_RING = 1.5;
const STACK_OUTER = STACK_AVATAR + STACK_RING * 2;
const STACK_STEP = 12;

export default function LikesAvatarRow({
  likers,
  onPressLiker,
  currentUserId,
  colors,
}: {
  likers: Liker[];
  onPressLiker?: (liker: Liker) => void;
  currentUserId?: string;
  colors: any;
}) {
  const [modalVisible, setModalVisible] = useState(false);

  if (likers.length === 0) return null;

  return (
    <>
      <TouchableOpacity style={styles.likeCountRow} onPress={() => setModalVisible(true)} activeOpacity={0.7}>
        <View style={[styles.avatarStack, { width: STACK_OUTER + (Math.min(likers.length, 3) - 1) * STACK_STEP }]}>
          {/* Two rounds of z-order/render-order fixes here (zIndex, then
              reverse-render) changed nothing visually — the real culprit
              wasn't paint order at all. React Native can render a View's
              borderWidth stroke on a different compositing pass than its
              fill, so a bordered circle's ring can visually leak across an
              overlapping sibling regardless of z-order. Fixed by dropping
              borderWidth entirely: each avatar sits inside its own solid
              white "ring" circle (a plain filled View, not a border stroke),
              so there's no separate stroke layer left to leak. */}
          {likers.slice(0, 3).map((l, i) => (
            <View
              key={l.id}
              style={{
                position: 'absolute', left: i * STACK_STEP, zIndex: 3 - i,
                width: STACK_OUTER, height: STACK_OUTER, borderRadius: STACK_OUTER / 2,
                backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Avatar name={l.name} avatarUrl={l.avatarUrl} size={STACK_AVATAR} backgroundColor={colors.accentSoft} textColor={colors.accent} />
            </View>
          )).reverse()}
        </View>
        <Text style={[styles.cardCountTxt, { color: colors.textMuted }]}>
          {likers.length} {likers.length === 1 ? 'like' : 'likes'}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Likes</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} activeOpacity={0.7}>
              <Text style={[styles.modalDone, { color: colors.accent }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalList}>
            {likers.map(l => {
              const isSelf = l.userId === currentUserId;
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.modalRow, { borderBottomColor: colors.border }]}
                  activeOpacity={isSelf ? 1 : 0.7}
                  disabled={isSelf}
                  onPress={() => { setModalVisible(false); onPressLiker?.(l); }}
                >
                  <Avatar
                    name={l.name}
                    avatarUrl={l.avatarUrl}
                    size={44}
                    backgroundColor={colors.accentSoft}
                    textColor={colors.accent}
                  />
                  <Text style={[styles.modalName, { color: colors.textPrimary }]}>{l.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  likeCountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatarStack: { height: STACK_OUTER },
  cardCountTxt: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.regular },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.bold },
  modalDone: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.medium },
  modalList: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalName: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold },
});
