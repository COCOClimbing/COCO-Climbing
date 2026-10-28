import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, Modal, Dimensions, PanResponder, Animated, FlatList
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useTabBarSpace } from './BottomTabBar';
import { FONTS, SPACING } from '../utils/theme';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isToday, differenceInCalendarMonths, parseISO
} from 'date-fns';

const SCREEN_W = Dimensions.get('window').width;
const H_PAD = SPACING.md * 2;
const CELL_W = Math.floor((SCREEN_W - H_PAD) / 7);
const DAY_SIZE = 36;

interface Props {
  visible: boolean;
  onClose: () => void;
  activeDates: string[];
  // Optional: each date's climbing-type colours. A day gets one ring per type
  // (nested); days without an entry fall back to a single accent ring.
  dateTypeColors?: Record<string, string[]>;
  onSelectDate: (date: string) => void;
  selectedDate?: string;
  mode: 'view' | 'pick';
  // Render in place (e.g. as a tab) as a vertically scrolling list of months
  // instead of as a modal sheet that swipes between months.
  inline?: boolean;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_PER_PAGE = 12;

// Day cells for one month. Shared by the modal and the scrolling list.
function MonthGrid({ month, activeDates, dateTypeColors, selectedDate, onPressDay }: {
  month: Date; activeDates: string[]; dateTypeColors?: Record<string, string[]>; selectedDate?: string; onPressDay: (iso: string) => void;
}) {
  const { colors } = useTheme();
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const startPad = getDay(startOfMonth(month));
  return (
    <>
      {Array.from({ length: startPad }).map((_, i) => (
        <View key={`pad-${i}`} style={styles.cell} />
      ))}
      {days.map(day => {
        const iso = format(day, 'yyyy-MM-dd');
        const hasClimbs = activeDates.includes(iso);
        const isSelected = selectedDate === iso;
        const today = isToday(day);
        const ringColors = hasClimbs ? (dateTypeColors?.[iso]?.length ? dateTypeColors[iso] : [colors.accent]) : [];
        const mainColor = ringColors[0] ?? colors.accent;
        // Extra types get extra rings outside the first, spaced tighter past three so they fit the cell
        const extraRings = ringColors.slice(1);
        const ringStep = extraRings.length > 2 ? 3 : 4;
        return (
          <TouchableOpacity key={iso} style={styles.cell} onPress={() => onPressDay(iso)} activeOpacity={0.7}>
            {extraRings.map((c, i) => {
              const size = DAY_SIZE + ringStep * 2 * (i + 1);
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2.25, borderColor: c }}
                />
              );
            })}
            <View style={[
              styles.dayCircle,
              hasClimbs && !today && { borderWidth: 2.25, borderColor: mainColor },
              isSelected && !today && { backgroundColor: colors.accentSoft, borderWidth: 2.25, borderColor: colors.accent },
              today && { backgroundColor: colors.accent },
            ]}>
              <Text style={[styles.dayNum, {
                color: today ? '#000' : hasClimbs ? mainColor : isSelected ? colors.accent : colors.textPrimary,
                fontFamily: FONTS.family.bold,
                fontSize: isSelected && !today ? FONTS.sizes.md * 1.05 : FONTS.sizes.md,
              }]}>
                {format(day, 'd')}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

// Chronological, like the iOS Calendar: the current month sits at the bottom
// and scrolling up goes into the past. Starts far enough back to cover the
// oldest session and loads another year whenever you reach the top. The list
// is inverted, so item 0 (this month) renders at the bottom and "end reached"
// fires at the top.
function ScrollingMonths({ activeDates, dateTypeColors, selectedDate, onSelectDate }: {
  activeDates: string[]; dateTypeColors?: Record<string, string[]>; selectedDate?: string; onSelectDate: (date: string) => void;
}) {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const oldest = activeDates.reduce<string | null>((min, d) => (min === null || d < min ? d : min), null);
  const monthsToOldest = oldest ? differenceInCalendarMonths(new Date(), parseISO(oldest)) + 1 : 0;
  const [monthCount, setMonthCount] = useState(Math.max(MONTHS_PER_PAGE, monthsToOldest));
  const offsets = Array.from({ length: monthCount }, (_, i) => i);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.row, styles.stickyDays, { borderBottomColor: colors.border }]}>
        {DAYS.map((d, i) => (
          <View key={i} style={styles.dayHeaderCell}>
            <Text style={[styles.dayHeader, { color: colors.textMuted, fontFamily: FONTS.family.medium }]}>{d}</Text>
          </View>
        ))}
      </View>
      <FlatList
        data={offsets}
        keyExtractor={i => String(i)}
        inverted
        // Inverted, so paddingTop is the visual bottom — room for the tab bar.
        contentContainerStyle={{ paddingTop: tabBarSpace }}
        showsVerticalScrollIndicator={false}
        onEndReached={() => setMonthCount(c => c + MONTHS_PER_PAGE)}
        onEndReachedThreshold={1}
        initialNumToRender={3}
        renderItem={({ item }) => {
          const month = subMonths(startOfMonth(new Date()), item);
          return (
            <View style={styles.monthBlock}>
              <Text style={[styles.listMonthName, { color: colors.textPrimary, fontFamily: FONTS.family.heavy }]}>
                {format(month, 'MMMM')}
                <Text style={[styles.listYearName, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                  {'  '}{format(month, 'yyyy')}
                </Text>
              </Text>
              <View style={styles.listGrid}>
                <MonthGrid month={month} activeDates={activeDates} dateTypeColors={dateTypeColors} selectedDate={selectedDate} onPressDay={onSelectDate} />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

export default function MiniCalendar({ visible, onClose, activeDates, dateTypeColors, onSelectDate, selectedDate, mode, inline = false }: Props) {
  if (inline) {
    return <ScrollingMonths activeDates={activeDates} dateTypeColors={dateTypeColors} selectedDate={selectedDate} onSelectDate={onSelectDate} />;
  }
  return (
    <ModalCalendar
      visible={visible} onClose={onClose} activeDates={activeDates}
      onSelectDate={onSelectDate} selectedDate={selectedDate} mode={mode}
    />
  );
}

function ModalCalendar({ visible, onClose, activeDates, onSelectDate, selectedDate }: Props) {
  const { colors } = useTheme();
  const [month, setMonth] = useState(new Date());
  // The highlighted day: starts on the date being edited, moves to whatever is tapped
  const [picked, setPicked] = useState(selectedDate);
  // Open on the month of the date being edited
  useEffect(() => {
    if (visible) {
      setMonth(selectedDate ? parseISO(selectedDate) : new Date());
      setPicked(selectedDate);
    }
  }, [visible]);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  function changeMonth(direction: 1 | -1) {
    if (animating.current) return;
    animating.current = true;
    Animated.timing(slideAnim, {
      toValue: direction * -SCREEN_W,
      duration: 80,
      useNativeDriver: true,
    }).start(() => {
      setMonth(m => direction === 1 ? addMonths(m, 1) : subMonths(m, 1));
      slideAnim.setValue(direction * SCREEN_W);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 80,
        useNativeDriver: true,
      }).start(() => { animating.current = false; });
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -30) changeMonth(1);
        else if (g.dx > 30) changeMonth(-1);
      },
    })
  ).current;

  // Tapping a day picks it and highlights it; the sheet stays open until Done
  function handleDay(iso: string) {
    if (iso === picked) return;
    setPicked(iso);
    onSelectDate(iso);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
            <Text style={[styles.navArrow, { color: colors.textSecondary }]}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.monthName, { color: colors.textPrimary, fontFamily: FONTS.family.heavy }]}>
              {format(month, 'MMMM')}
            </Text>
            <Text style={[styles.yearName, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
              {format(month, 'yyyy')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
            <Text style={[styles.navArrow, { color: colors.textSecondary }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day headers */}
        <View style={styles.row}>
          {DAYS.map((d, i) => (
            <View key={i} style={[styles.cell]}>
              <Text style={[styles.dayHeader, { color: colors.textMuted, fontFamily: FONTS.family.medium }]}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Grid — swipe left/right to change month */}
        <Animated.View style={[styles.grid, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
          <MonthGrid month={month} activeDates={activeDates} selectedDate={picked} onPressDay={handleDay} />
        </Animated.View>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <TouchableOpacity onPress={() => setMonth(new Date())} style={styles.todayBtn}>
            <Text style={[styles.todayTxt, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={[styles.doneBtn, { backgroundColor: colors.accent }]}>
            <Text style={[styles.doneTxt, { fontFamily: FONTS.family.semibold }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, borderBottomWidth: 1,
  },
  navBtn: { width: 44, alignItems: 'center', padding: SPACING.sm },
  navArrow: { fontSize: 32, lineHeight: 36 },
  headerCenter: { alignItems: 'center' },
  monthName: { fontSize: 28, letterSpacing: -0.5 },
  yearName: { fontSize: FONTS.sizes.md, marginTop: 2 },
  row: { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, flex: 1, alignContent: 'flex-start' },
  cell: { width: CELL_W, height: CELL_W, alignItems: 'center', justifyContent: 'center' },
  dayHeader: { fontSize: FONTS.sizes.sm },
  dayCircle: { width: DAY_SIZE, height: DAY_SIZE, borderRadius: DAY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: FONTS.sizes.md },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.xl, borderTopWidth: 1,
  },
  todayBtn: { padding: SPACING.md },
  todayTxt: { fontSize: FONTS.sizes.md },
  doneBtn: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: 10 },
  doneTxt: { color: '#000', fontSize: FONTS.sizes.md },
  stickyDays: { alignItems: 'center', borderBottomWidth: 1 },
  dayHeaderCell: { width: CELL_W, alignItems: 'center' },
  monthBlock: { paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  listMonthName: { fontSize: FONTS.sizes.xl, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  listYearName: { fontSize: FONTS.sizes.md },
  listGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md },
});
