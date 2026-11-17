'use client';

import { useLayoutEffect } from 'react';
import { getThemeSnapshot, subscribeToTheme } from '@/lib/theme';

export default function ThemeController() {
  useLayoutEffect(() => {
    const applyTheme = () => { document.documentElement.dataset.theme = getThemeSnapshot(); };
    applyTheme();
    return subscribeToTheme(applyTheme);
  }, []);
  return null;
}
