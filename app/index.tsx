import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl
} from 'react-native';
import { FONTS, SPACING, Climb } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import { getAllClimbs, deleteClimb } from '../utils/storage';
import LogClimbModal from '../components/LogClimbModal';
import ClimbCard from '../components/ClimbCard';
import { EmptyState, SectionHeader } from '../components/UI';
import SwipeToDelete from '../components/SwipeToDelete';
import { isToday, parseISO, format } from 'date-fns';

export default function LogScreen() {
  const { colors } = useTheme();
  const [climbs, setClimbs] = useState<Climb[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClimb, setEditingClimb] = useState<Climb | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const all = await getAllClimbs();
    setClimbs(all);
  }, []);

  useEffect(() => { load(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openNew() {
    setEditingClimb(undefined);
    setModalVisible(true);
  }

  const todayClimbs = climbs.filter(c => isToday(parseISO(c.date)));
  const olderClimbs = climbs.filter(c => !isToday(parseISO(c.date))).slice(0, 15);
  const todaySends = todayClimbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <FlatList
        data={olderClimbs}
        keyExtractor={item => item.id}
        renderItem={({ item: c }) => (
          <SwipeToDelete onDelete={async () => { await deleteClimb(c.id); load(); }}>
            <ClimbCard climb={c} onPress={() => { setEditingClimb(c); setModalVisible(true); }} compact />
          </SwipeToDelete>
        )}
        ListHeaderComponent={
          <View style={styles.content}>
            {/* Hero + FAB */}
            <View style={styles.hero}>
              <View>
                <Text style={[styles.heroDate, { color: colors.textMuted }]}>
                  {format(new Date(), 'EEEE, MMM d').toUpperCase()}
                </Text>
                {todayClimbs.length > 0 && (
                  <Text style={[styles.heroSub, { color: colors.accent }]}>
                    {todayClimbs.length} climb{todayClimbs.length !== 1 ? 's' : ''} · {todaySends} send{todaySends !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
                onPress={openNew}
                activeOpacity={0.85}
              >
                <Text style={styles.fabText}>+</Text>
              </TouchableOpacity>
            </View>

            {todayClimbs.length > 0 ? (
              <>
                <SectionHeader title="Today" />
                {todayClimbs.map(c => (
                  <SwipeToDelete key={c.id} onDelete={async () => { await deleteClimb(c.id); load(); }}>
                    <ClimbCard climb={c} onPress={() => { setEditingClimb(c); setModalVisible(true); }} />
                  </SwipeToDelete>
                ))}
              </>
            ) : (
              <View style={styles.emptyWrap}>
                <EmptyState icon="" title="No climbs yet today" subtitle="Tap + to log your first climb" />
              </View>
            )}

            {olderClimbs.length > 0 && (
              <View style={{ marginTop: SPACING.lg }}>
                <SectionHeader title="Recent" />
              </View>
            )}
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      />

      <LogClimbModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditingClimb(undefined); }}
        onSaved={load}
        existingClimb={editingClimb}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg },
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  emptyWrap: { marginBottom: SPACING.xxl },
  heroDate: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabText: {
    color: '#000',
    fontSize: 28,
    fontFamily: FONTS.family.bold,
    lineHeight: 32,
  },

});
