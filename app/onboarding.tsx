import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONTS, SPACING, ACCENT_COLORS, AccentId } from '../utils/theme';
import { useNav } from '../utils/NavigationContext';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { upsertProfile } from '../utils/cloudSync';

export const ONBOARDING_PREFS_KEY = '@coco_onboarding_prefs';

export interface OnboardingPrefs {
  boulderGradeSystem: 'v-scale' | 'font';
  ropeGradeSystem: 'yds' | 'french' | 'british';
}

export async function getOnboardingPrefs(): Promise<OnboardingPrefs | null> {
  const raw = await AsyncStorage.getItem(ONBOARDING_PREFS_KEY);
  return raw ? JSON.parse(raw) : null;
}

const BOULDER_OPTIONS: { id: OnboardingPrefs['boulderGradeSystem']; label: string; example: string }[] = [
  { id: 'v-scale', label: 'V-Scale',        example: 'VB · V0 · V5 · V10 · V17' },
  { id: 'font',    label: 'Fontainebleau',  example: '4 · 6a · 7b · 8a · 9a' },
];

const ROPE_OPTIONS: { id: OnboardingPrefs['ropeGradeSystem']; label: string; example: string }[] = [
  { id: 'yds',     label: 'YDS',           example: '5.9 · 5.11a · 5.13c · 5.15d' },
  { id: 'french',  label: 'French Sport',  example: '5c · 6b+ · 7a · 8c+' },
  { id: 'british', label: 'British Trad',  example: 'VS · HVS · E3 · E6 · E12' },
];

const TOTAL_STEPS = 5;
export const TERMS_ACCEPTED_KEY = '@coco_terms_accepted';

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { navigate } = useNav();
  const { colors, mode, accentId, setMode, setAccent } = useTheme();
  const { user, profileName, avatarUrl, username, hometown, bio, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);
  const [boulderGrade, setBoulderGrade] = useState<OnboardingPrefs['boulderGradeSystem']>('v-scale');
  const [ropeGrade, setRopeGrade] = useState<OnboardingPrefs['ropeGradeSystem']>('yds');
  const [isPrivate, setIsPrivate] = useState(false);

  const accent = colors.accent;
  const accentSoft = colors.accentSoft;

  async function finish() {
    const prefs: OnboardingPrefs = { boulderGradeSystem: boulderGrade, ropeGradeSystem: ropeGrade };
    await AsyncStorage.multiSet([
      [ONBOARDING_PREFS_KEY, JSON.stringify(prefs)],
      [TERMS_ACCEPTED_KEY, 'true'],
    ]);
    // Save privacy setting to profile
    if (user) {
      try {
        await upsertProfile(user.id, profileName ?? '', avatarUrl ?? undefined, username ?? undefined, hometown ?? undefined, bio ?? undefined, isPrivate, true);
        await refreshProfile();
      } catch {
        // Non-critical — user can change in Settings
      }
    }
    onDone();
    navigate('friends');
  }

  function next() {
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1);
    else finish();
  }

  function back() {
    if (step > 0) setStep(s => s - 1);
  }

  function renderOptionCard<T extends string>(
    id: T,
    label: string,
    example: string,
    selected: boolean,
    onPress: () => void,
  ) {
    return (
      <TouchableOpacity
        key={id}
        style={[
          styles.optionCard,
          {
            backgroundColor: selected ? accentSoft : colors.bgCard,
            borderColor: selected ? accent : colors.border,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.optionLeft}>
          <Text style={[styles.optionLabel, { color: selected ? accent : colors.textPrimary }]}>
            {label}
          </Text>
          <Text style={[styles.optionExample, { color: colors.textMuted }]}>{example}</Text>
        </View>
        {selected && (
          <View style={[styles.checkCircle, { backgroundColor: accent }]}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress */}
        <View style={styles.progressRow}>
          <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
            {step + 1} of {TOTAL_STEPS}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: accent, width: `${((step + 1) / TOTAL_STEPS) * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* ── Step 1: Terms of Service ── */}
        {step === 0 && (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Before you{'\n'}start climbing.
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Please read and agree to our community terms.
            </Text>
            <View style={[styles.termsBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.termsHeading, { color: colors.textPrimary }]}>Community Standards</Text>
              <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                By using COCO, you agree to the following:
              </Text>
              <Text style={[styles.termsBullet, { color: colors.textSecondary }]}>
                • You will not post objectionable, abusive, or harmful content.
              </Text>
              <Text style={[styles.termsBullet, { color: colors.textSecondary }]}>
                • You will not harass, bully, or threaten other users.
              </Text>
              <Text style={[styles.termsBullet, { color: colors.textSecondary }]}>
                • You will not share content that is illegal, sexually explicit, or promotes violence.
              </Text>
              <Text style={[styles.termsBullet, { color: colors.textSecondary }]}>
                • Violations may result in immediate removal of content and account termination.
              </Text>
              <Text style={[styles.termsText, { color: colors.textSecondary, marginTop: 10 }]}>
                Reports of objectionable content will be reviewed within 24 hours. You can report or block users at any time using the menu on any post.
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://cococlimbing.github.io/COCO-Climbing/privacy-policy')} activeOpacity={0.7}>
                <Text style={[styles.termsLink, { color: colors.accent }]}>View Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step 2: Boulder grade ── */}
        {step === 1 && (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Boulder grade{'\n'}system?
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Used in your stats and activity panel.
            </Text>
            <View style={styles.options}>
              {BOULDER_OPTIONS.map(opt =>
                renderOptionCard(
                  opt.id, opt.label, opt.example,
                  boulderGrade === opt.id,
                  () => setBoulderGrade(opt.id),
                )
              )}
            </View>
          </>
        )}

        {/* ── Step 3: Rope grade ── */}
        {step === 2 && (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Rope grade{'\n'}system?
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Used in your stats and activity panel.
            </Text>
            <View style={styles.options}>
              {ROPE_OPTIONS.map(opt =>
                renderOptionCard(
                  opt.id, opt.label, opt.example,
                  ropeGrade === opt.id,
                  () => setRopeGrade(opt.id),
                )
              )}
            </View>
          </>
        )}

        {/* ── Step 4: Privacy ── */}
        {step === 3 && (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Who can{'\n'}follow you?
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              You can always change this later in Settings.
            </Text>

            <TouchableOpacity
              style={[
                styles.privacyCard,
                {
                  backgroundColor: !isPrivate ? colors.accentSoft : colors.bgCard,
                  borderColor: !isPrivate ? accent : colors.border,
                },
              ]}
              onPress={() => setIsPrivate(false)}
              activeOpacity={0.7}
            >
              <View style={styles.privacyCardLeft}>
                <Text style={[styles.privacyCardTitle, { color: !isPrivate ? accent : colors.textPrimary }]}>Public</Text>
                <Text style={[styles.privacyCardDesc, { color: colors.textMuted }]}>Anyone can follow you automatically</Text>
              </View>
              {!isPrivate && (
                <View style={[styles.checkCircle, { backgroundColor: accent }]}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.privacyCard,
                {
                  backgroundColor: isPrivate ? colors.accentSoft : colors.bgCard,
                  borderColor: isPrivate ? accent : colors.border,
                },
              ]}
              onPress={() => setIsPrivate(true)}
              activeOpacity={0.7}
            >
              <View style={styles.privacyCardLeft}>
                <Text style={[styles.privacyCardTitle, { color: isPrivate ? accent : colors.textPrimary }]}>Private</Text>
                <Text style={[styles.privacyCardDesc, { color: colors.textMuted }]}>You approve who can follow you</Text>
              </View>
              {isPrivate && (
                <View style={[styles.checkCircle, { backgroundColor: accent }]}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 5: Theme ── */}
        {step === 4 && (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Make it{'\n'}yours.
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Pick a look that feels right.
            </Text>

            {/* Dark / Light */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APPEARANCE</Text>
            <View style={styles.modeRow}>
              {(['dark', 'light'] as const).map(m => {
                const selected = mode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.modeCard,
                      {
                        backgroundColor: selected ? accentSoft : colors.bgCard,
                        borderColor: selected ? accent : colors.border,
                      },
                    ]}
                    onPress={() => setMode(m)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modeLabel, { color: selected ? accent : colors.textPrimary }]}>
                      {m === 'dark' ? 'Dark' : 'Light'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Accent color */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACCENT COLOR</Text>
            <View style={styles.accentGrid}>
              {(Object.entries(ACCENT_COLORS) as [AccentId, { name: string; color: string }][]).map(([id, val]) => {
                const selected = accentId === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[
                      styles.accentSwatch,
                      { backgroundColor: val.color },
                      selected && styles.accentSwatchSelected,
                    ]}
                    onPress={() => setAccent(id)}
                    activeOpacity={0.8}
                  >
                    {selected && <Text style={styles.accentCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Live preview pill */}
            <View style={[styles.previewPill, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={[styles.previewDot, { backgroundColor: accent }]} />
              <Text style={[styles.previewText, { color: colors.textSecondary }]}>
                Preview — looks good!
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: colors.bg }]}>
        <View style={styles.footerRow}>
          {step > 0 && (
            <TouchableOpacity
              style={[styles.backButton, { borderColor: colors.border }]}
              onPress={back}
              activeOpacity={0.7}
            >
              <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: accent, flex: 1 }]}
            onPress={next}
            activeOpacity={0.85}
          >
            <Text style={styles.nextText}>
              {step === 0 ? 'I Agree & Continue' : step === TOTAL_STEPS - 1 ? 'Start Climbing' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: 120,
  },
  progressRow: {
    marginBottom: SPACING.xxl,
    gap: SPACING.sm,
  },
  stepLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  title: {
    fontSize: FONTS.sizes.xxl + 4,
    fontFamily: FONTS.family.heavy,
    lineHeight: 40,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    marginBottom: SPACING.xl + SPACING.md,
    lineHeight: 20,
  },
  options: {
    gap: SPACING.md,
  },
  privacyCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  privacyCardLeft: { flex: 1, gap: 3 },
  privacyCardTitle: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  privacyCardDesc: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
  },
  optionCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  optionLeft: { flex: 1, gap: 3 },
  optionLabel: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  optionExample: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONTS.family.bold,
  },
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
    letterSpacing: 1.2,
    marginBottom: SPACING.md,
    marginTop: SPACING.lg,
  },
  modeRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  modeCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  modeLabel: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  accentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  accentSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentSwatchSelected: {
    transform: [{ scale: 1.2 }],
  },
  accentCheck: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FONTS.family.bold,
  },
  previewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl * 2,
    paddingTop: SPACING.lg,
  },
  footerRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  backButton: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: SPACING.lg + 2,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  backText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  nextButton: {
    borderRadius: 14,
    paddingVertical: SPACING.lg + 2,
    alignItems: 'center',
  },
  nextText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  termsBox: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  termsHeading: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    marginBottom: SPACING.xs,
  },
  termsText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    lineHeight: 20,
  },
  termsBullet: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    lineHeight: 20,
    paddingLeft: SPACING.xs,
  },
  termsLink: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
    marginTop: SPACING.xs,
    textDecorationLine: 'underline',
  },
});
