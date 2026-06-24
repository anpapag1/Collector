import { useMemo } from 'react';
import { AppColors } from './colors';
import { useThemeStore } from '../store/themeStore';
import { colors, darkColors } from './colors';

export function useAppColors() {
  const mode = useThemeStore((state) => state.mode);
  return useMemo(() => (mode === 'dark' ? darkColors : colors), [mode]);
}

export function useThemedStyles<T>(factory: (colors: AppColors) => T): T {
  const activeColors = useAppColors();
  return useMemo(() => factory(activeColors), [activeColors, factory]);
}
