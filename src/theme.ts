import { useStudyStore } from './studyStore';

export const Accent = {
  blue: '#3B82F6',
  blueMuted: '#1D4ED8',
  indigo: '#6366F1',
  slate: '#64748B',
  green: '#22C55E',
  amber: '#F59E0B',
  red: '#EF4444',
};

export interface Palette {
  background: string;
  surface: string;
  card: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  heatmap: string[]; // empty -> L4
}

const darkPalette: Palette = {
  background: '#000000',
  surface: '#0B0C0E',
  card: '#13151A',
  border: '#20232B',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  heatmap: ['#161B22', '#0E4429', '#006D32', '#26A641', '#39D353'],
};

const lightPalette: Palette = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#F1F5F9',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  heatmap: ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'],
};

export function useTheme(): Palette & { isDark: boolean } {
  const isDark = useStudyStore((s) => s.isDarkTheme);
  return { ...(isDark ? darkPalette : lightPalette), isDark };
}
