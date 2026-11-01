/** Paleta clara y oscura. Los componentes la leen con el hook useTheme(). */
export const Colors = {
  light: {
    text: '#0F172A',
    background: '#FFFFFF',
    backgroundElement: '#F1F5F9',
    backgroundSelected: '#E2E8F0',
    textSecondary: '#475569',
    primary: '#0B7A5C',
    onPrimary: '#FFFFFF',
    primarySoft: '#D9F2EA',
    border: '#CBD5E1',
    danger: '#B42318',
    dangerSoft: '#FDE8E6',
    success: '#067647',
    successSoft: '#DCF5E8',
    warning: '#B54708',
    warningSoft: '#FEF0C7',
    info: '#1D4ED8',
    infoSoft: '#DBEAFE',
    income: '#067647',
    expense: '#B42318',
  },
  dark: {
    text: '#F8FAFC',
    background: '#0B1120',
    backgroundElement: '#162032',
    backgroundSelected: '#223048',
    textSecondary: '#A5B1C5',
    primary: '#34D399',
    onPrimary: '#052E22',
    primarySoft: '#10382D',
    border: '#2B3A52',
    danger: '#F97066',
    dangerSoft: '#3A1B19',
    success: '#47CD89',
    successSoft: '#10301F',
    warning: '#FDB022',
    warningSoft: '#3A2A08',
    info: '#7CB2FF',
    infoSoft: '#14284A',
    income: '#47CD89',
    expense: '#F97066',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Escala de espaciado (múltiplos de 4 px). */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 8, medium: 12, large: 16, pill: 999 } as const;

/** Ancho máximo del contenido en pantallas grandes (tabletas). */
export const MaxContentWidth = 800;
