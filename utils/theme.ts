// ─── Color Schemes ───────────────────────────────────────────────────────────

export type ThemeId = 'obsidian' | 'slate' | 'forest' | 'crimson' | 'arctic' | 'sand' | 'meadow' | 'rose';
export type ThemeMode = 'dark' | 'light';
export type AccentId = 'amber' | 'orange' | 'green' | 'crimson' | 'lavender' | 'blue';

export const ACCENT_COLORS: Record<AccentId, { name: string; color: string }> = {
  amber:   { name: 'Golden Brown', color: '#C97C38' },
  orange:  { name: 'Orange',       color: '#FF6B35' },
  green:   { name: 'Green',        color: '#3A8C5C' },
  crimson: { name: 'Crimson',      color: '#C0394B' },
  lavender:{ name: 'Lavender',     color: '#9B5DE5' },
  blue:    { name: 'Blue',         color: '#7B9EE0' },
};

export function buildColorScheme(mode: ThemeMode, accentId: AccentId): ColorScheme {
  const accent = ACCENT_COLORS[accentId].color;
  const accentSoft = accent + '22';
  if (mode === 'dark') {
    return {
      id: 'obsidian', name: 'Custom', preview: accent,
      bg: '#0A0A0A', bgCard: '#141414', bgElevated: '#1C1C1C',
      border: '#2A2A2A', borderLight: '#333333',
      accent, accentSoft,
      accentGold: '#F5C842', accentGoldSoft: '#F5C84220',
      accentGreen: '#4CAF72', accentGreenSoft: '#4CAF7220',
      accentBlue: '#4A90D9',
      textPrimary: '#F0EDE8', textSecondary: '#888880', textMuted: '#555550',
      danger: '#E03E3E', drawerBg: '#0F0F0F',
    };
  } else {
    return {
      id: 'arctic', name: 'Custom', preview: accent,
      bg: '#F5F5F2', bgCard: '#FFFFFF', bgElevated: '#EBEBE8',
      border: '#DCDCD8', borderLight: '#D0D0CC',
      accent, accentSoft,
      accentGold: '#D4A017', accentGoldSoft: '#D4A01720',
      accentGreen: '#2D9B6F', accentGreenSoft: '#2D9B6F20',
      accentBlue: '#4A6FA5',
      textPrimary: '#1A1A18', textSecondary: '#66665E', textMuted: '#9E9E96',
      danger: '#D62828', drawerBg: '#EEEEED',
    };
  }
}

export interface ColorScheme {
  id: ThemeId;
  name: string;
  preview: string; // accent color for swatch
  bg: string;
  bgCard: string;
  bgElevated: string;
  border: string;
  borderLight: string;
  accent: string;
  accentSoft: string;
  accentGold: string;
  accentGoldSoft: string;
  accentGreen: string;
  accentGreenSoft: string;
  accentBlue: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  danger: string;
  drawerBg: string;
}

export const COLOR_SCHEMES: Record<ThemeId, ColorScheme> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    preview: '#FF6B35',
    bg: '#0A0A0A',
    bgCard: '#141414',
    bgElevated: '#1C1C1C',
    border: '#2A2A2A',
    borderLight: '#333333',
    accent: '#FF6B35',
    accentSoft: '#FF6B3522',
    accentGold: '#F5C842',
    accentGoldSoft: '#F5C84218',
    accentGreen: '#4CAF72',
    accentGreenSoft: '#4CAF7218',
    accentBlue: '#4A90D9',
    textPrimary: '#F0EDE8',
    textSecondary: '#888880',
    textMuted: '#555550',
    danger: '#E03E3E',
    drawerBg: '#0F0F0F',
  },
  slate: {
    id: 'slate',
    name: 'Slate',
    preview: '#7B9EE0',
    bg: '#0D1117',
    bgCard: '#161B22',
    bgElevated: '#21262D',
    border: '#30363D',
    borderLight: '#3D444D',
    accent: '#7B9EE0',
    accentSoft: '#7B9EE022',
    accentGold: '#E3B341',
    accentGoldSoft: '#E3B34118',
    accentGreen: '#3FB950',
    accentGreenSoft: '#3FB95018',
    accentBlue: '#58A6FF',
    textPrimary: '#E6EDF3',
    textSecondary: '#7D8590',
    textMuted: '#484F58',
    danger: '#F85149',
    drawerBg: '#090D12',
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    preview: '#6BCB77',
    bg: '#0A0F0A',
    bgCard: '#111811',
    bgElevated: '#1A231A',
    border: '#243024',
    borderLight: '#2E3D2E',
    accent: '#6BCB77',
    accentSoft: '#6BCB7722',
    accentGold: '#D4A847',
    accentGoldSoft: '#D4A84718',
    accentGreen: '#52B788',
    accentGreenSoft: '#52B78818',
    accentBlue: '#4895EF',
    textPrimary: '#EAF0EA',
    textSecondary: '#7A8F7A',
    textMuted: '#4A5C4A',
    danger: '#E05252',
    drawerBg: '#070C07',
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    preview: '#E63946',
    bg: '#0C0808',
    bgCard: '#160E0E',
    bgElevated: '#201414',
    border: '#2E1A1A',
    borderLight: '#3D2020',
    accent: '#E63946',
    accentSoft: '#E6394622',
    accentGold: '#F4A261',
    accentGoldSoft: '#F4A26118',
    accentGreen: '#52B788',
    accentGreenSoft: '#52B78818',
    accentBlue: '#457B9D',
    textPrimary: '#F5EAEA',
    textSecondary: '#9A7A7A',
    textMuted: '#5C4040',
    danger: '#FF6B6B',
    drawerBg: '#090505',
  },
  arctic: {
    id: 'arctic',
    name: 'Arctic',
    preview: '#00B4D8',
    bg: '#F0F4F8',
    bgCard: '#FFFFFF',
    bgElevated: '#E8EEF4',
    border: '#D1DCE8',
    borderLight: '#BFD0E0',
    accent: '#0077B6',
    accentSoft: '#0077B618',
    accentGold: '#F4A261',
    accentGoldSoft: '#F4A26118',
    accentGreen: '#2D9B6F',
    accentGreenSoft: '#2D9B6F18',
    accentBlue: '#00B4D8',
    textPrimary: '#1A2E3D',
    textSecondary: '#5A7A90',
    textMuted: '#90A8BC',
    danger: '#D62828',
    drawerBg: '#E4ECF4',
  },
  sand: {
    id: 'sand',
    name: 'Sand',
    preview: '#C97C38',
    bg: '#F5F0E8',
    bgCard: '#FFFDF8',
    bgElevated: '#EDE8DF',
    border: '#DDD5C5',
    borderLight: '#CFC5B0',
    accent: '#C97C38',
    accentSoft: '#C97C3820',
    accentGold: '#D4A017',
    accentGoldSoft: '#D4A01718',
    accentGreen: '#4A7C59',
    accentGreenSoft: '#4A7C5918',
    accentBlue: '#4A6FA5',
    textPrimary: '#2C1A0A',
    textSecondary: '#7A6048',
    textMuted: '#A89070',
    danger: '#C0392B',
    drawerBg: '#EDE7DC',
  },
  meadow: {
    id: 'meadow',
    name: 'Meadow',
    preview: '#3A8C5C',
    bg: '#F2F7F4',
    bgCard: '#FFFFFF',
    bgElevated: '#E6F0EA',
    border: '#C8DDD0',
    borderLight: '#B5CFC0',
    accent: '#3A8C5C',
    accentSoft: '#3A8C5C20',
    accentGold: '#E09A2B',
    accentGoldSoft: '#E09A2B18',
    accentGreen: '#2D7A4F',
    accentGreenSoft: '#2D7A4F18',
    accentBlue: '#4A90A4',
    textPrimary: '#0F2318',
    textSecondary: '#456B52',
    textMuted: '#85A893',
    danger: '#C0392B',
    drawerBg: '#E6F0EA',
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    preview: '#C0394B',
    bg: '#FDF2F3',
    bgCard: '#FFFFFF',
    bgElevated: '#FAE6E8',
    border: '#EDC8CC',
    borderLight: '#E5B5BA',
    accent: '#C0394B',
    accentSoft: '#C0394B20',
    accentGold: '#D4860F',
    accentGoldSoft: '#D4860F18',
    accentGreen: '#3D8B6A',
    accentGreenSoft: '#3D8B6A18',
    accentBlue: '#5A7FBF',
    textPrimary: '#2A0A0D',
    textSecondary: '#7A4048',
    textMuted: '#B08088',
    danger: '#A81E2D',
    drawerBg: '#FAE6E8',
  },
};

// Default — will be overridden at runtime by ThemeContext
export let COLORS: ColorScheme = COLOR_SCHEMES.obsidian;

export function setActiveColors(scheme: ColorScheme) {
  COLORS = scheme;
}

export const FONTS = {
  family: {
    regular:  'Inter_400Regular',
    medium:   'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold:     'Inter_700Bold',
    heavy:    'Inter_900Black',
  },
  sizes: {
    xs:   11,
    sm:   13,
    md:   15,
    lg:   18,
    xl:   22,
    xxl:  28,
    hero: 36,
  },
  weights: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
    heavy:    '800' as const,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// ─── Climb Data ──────────────────────────────────────────────────────────────

export const CLIMB_TYPES = [
  { id: 'boulder',    label: 'Boulder',    icon: 'B',  color: '#E0392D' },
  { id: 'top_rope',  label: 'Top Rope',   icon: 'TR', color: '#00B4D8' },
  { id: 'sport',     label: 'Sport',      icon: 'S',  color: '#4361EE' },
  { id: 'trad',      label: 'Trad',       icon: 'T',  color: '#C77B3E' },
  { id: 'auto_belay',label: 'Auto Belay', icon: 'AB', color: '#E040FB' },
  { id: 'hangboard', label: 'Hangboard',  icon: 'HB', color: '#EF476F' },
  { id: 'lift',      label: 'Lift',       icon: 'LF', color: '#8D99AE' },
] as const;

export const CLIMB_OUTCOMES = [
  { id: 'flash',   label: 'Flash',   icon: '', color: '#F5C842' },
  { id: 'send',    label: 'Send',    icon: '', color: '#4CAF72' },
  { id: 'hang',    label: 'Hang',    icon: '', color: '#9B5DE5' },
  { id: 'attempt', label: 'Attempt', icon: '', color: '#4A90D9' },
] as const;

export const CLIMB_STYLES = [
  { id: 'crimp',     label: 'Crimp' },
  { id: 'pinch',     label: 'Pinch' },
  { id: 'sloper',    label: 'Sloper' },
  { id: 'jug',       label: 'Jug' },
  { id: 'pocket',    label: 'Pocket' },
  { id: 'power',     label: 'Power' },
  { id: 'slab',      label: 'Slab' },
  { id: 'overhang',  label: 'Overhang' },
  { id: 'dyno',      label: 'Dyno' },
  { id: 'technical', label: 'Technical' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'balance',   label: 'Balance' },
] as const;

export const ENVIRONMENTS = [
  { id: 'indoor',  label: 'Indoor',  icon: '' },
  { id: 'outdoor', label: 'Outdoor', icon: '' },
] as const;

export const FRENCH_GRADES = [
  '4', '5a', '5b', '5c',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+',
  '9a',
];

export const FONT_GRADES = [
  '3', '4', '4+',
  '5', '5+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+',
  '9a',
];

export const BRITISH_GRADES = [
  'M', 'D', 'HD', 'VD', 'HVD',
  'S', 'HS', 'VS', 'HVS',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6',
  'E7', 'E8', 'E9', 'E10', 'E11', 'E12',
];

export const V_GRADES = [
  'VB','V0','V0+','V1','V2','V3','V4','V5',
  'V6','V7','V8','V9','V10','V11','V12','V13','V14','V15','V16','V17',
];

export const YDS_GRADES = [
  '5.5','5.6','5.7','5.8','5.9',
  '5.10a','5.10b','5.10c','5.10d',
  '5.11a','5.11b','5.11c','5.11d',
  '5.12a','5.12b','5.12c','5.12d',
  '5.13a','5.13b','5.13c','5.13d',
  '5.14a','5.14b','5.14c','5.14d',
  '5.15a','5.15b','5.15c','5.15d',
];

// ─── Unified grade difficulty ──────────────────────────────────────────────────
// All systems mapped to a common scale anchored to V-grades (10 pts per V-grade).
// Cross-system equivalencies based on: VB≈Font1-3, V0≈Font4≈5.9-5.10a,
// V1≈Font5≈5.10b, V2≈Font5+≈5.11a, V3≈Font6a/6a+≈5.11b/c,
// V4≈Font6b/6b+≈5.12a, V5≈Font6c/6c+≈5.12b/c, V10≈Font7c+≈5.14a, V17≈Font9a≈5.15d+

export const GRADE_DIFFICULTY: Record<string, Record<string, number>> = {
  'v-scale': {
    'VB': 0,  'V0': 10, 'V0+': 15, 'V1': 20,  'V2': 30,  'V3': 40,
    'V4': 50, 'V5': 60, 'V6':  70, 'V7': 80,  'V8': 90,  'V9': 100,
    'V10': 110, 'V11': 120, 'V12': 130, 'V13': 140,
    'V14': 150, 'V15': 160, 'V16': 170, 'V17': 180,
  },
  'font': {
    '3': 0, '4': 10, '4+': 15,
    '5': 20, '5+': 30,
    '6a': 35, '6a+': 40, '6b': 50, '6b+': 55, '6c': 60, '6c+': 65,
    '7a': 70, '7a+': 75, '7b': 80, '7b+': 90, '7c': 100, '7c+': 110,
    '8a': 120, '8a+': 130, '8b': 140, '8b+': 150, '8c': 160, '8c+': 170,
    '9a': 180,
  },
  'yds': {
    '5.5': 3, '5.6': 5, '5.7': 7, '5.8': 9,
    '5.9': 9, '5.10a': 10, '5.10b': 20, '5.10c': 23, '5.10d': 26,
    '5.11a': 30, '5.11b': 40, '5.11c': 43, '5.11d': 46,
    '5.12a': 50, '5.12b': 60, '5.12c': 63, '5.12d': 66,
    '5.13a': 70, '5.13b': 80, '5.13c': 90, '5.13d': 100,
    '5.14a': 110, '5.14b': 120, '5.14c': 130, '5.14d': 140,
    '5.15a': 150, '5.15b': 160, '5.15c': 170, '5.15d': 180,
  },
  'french': {
    '4': 3, '5a': 5, '5b': 7, '5c': 9,
    '6a': 15, '6a+': 22, '6b': 28, '6b+': 35, '6c': 45, '6c+': 52,
    '7a': 58, '7a+': 65, '7b': 73, '7b+': 82, '7c': 92, '7c+': 105,
    '8a': 115, '8a+': 125, '8b': 135, '8b+': 145, '8c': 155, '8c+': 165,
    '9a': 178,
  },
  'british': {
    'M': 0, 'D': 3, 'HD': 5, 'VD': 8, 'HVD': 10,
    'S': 15, 'HS': 22, 'VS': 30, 'HVS': 40,
    'E1': 50, 'E2': 60, 'E3': 70, 'E4': 80, 'E5': 90, 'E6': 100,
    'E7': 110, 'E8': 120, 'E9': 130, 'E10': 140, 'E11': 150, 'E12': 160,
  },
};

export function getGradeDifficulty(grade: string, gradeSystem: string): number {
  return GRADE_DIFFICULTY[gradeSystem]?.[grade] ?? -1;
}

export function convertGrade(grade: string, fromSystem: string, toSystem: string): string {
  if (fromSystem === toSystem) return grade;
  const difficulty = GRADE_DIFFICULTY[fromSystem]?.[grade];
  if (difficulty === undefined) return grade;
  const target = GRADE_DIFFICULTY[toSystem];
  if (!target) return grade;
  let closest = grade;
  let minDiff = Infinity;
  for (const [g, d] of Object.entries(target)) {
    const diff = Math.abs(d - difficulty);
    if (diff < minDiff) { minDiff = diff; closest = g; }
  }
  return closest;
}

export type ClimbTypeId  = typeof CLIMB_TYPES[number]['id'];
export type OutcomeId    = typeof CLIMB_OUTCOMES[number]['id'];
export type StyleId      = typeof CLIMB_STYLES[number]['id'];
export type EnvironmentId = typeof ENVIRONMENTS[number]['id'];

export interface Climb {
  id: string;
  date: string;
  sessionId: string;
  type: ClimbTypeId;
  outcome: OutcomeId | 'project';
  styles: StyleId[];
  environment: EnvironmentId;
  grade: string;
  gradeSystem: 'v-scale' | 'yds' | 'french' | 'british' | 'font';
  notes?: string;
  routeName?: string;
  location?: string;
  attempts?: number;
  mediaUri?: string;
  mediaType?: 'photo' | 'video';
  projectId?: string;    // links this climb to a named project
  projectName?: string;  // display name of the project
}

export interface Session {
  id: string;
  date: string;
  environment: EnvironmentId;
  location?: string;
  notes?: string;
  friends?: { id: string; name: string }[];  // climbing partners
  startedAt: string;      // ISO timestamp — when the session was created
  lastClimbAt?: string;   // ISO timestamp — when the last climb was saved
  endedAt?: string;       // ISO timestamp — when the session was explicitly ended
}
