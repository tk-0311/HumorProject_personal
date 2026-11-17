export type Theme = 'light' | 'dark' | 'system';

const storageKey = 'humor-project-theme';
const changeEvent = 'humor-project-theme-change';
let unsavedTheme: Theme | null = null;

export function parseTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function getThemeSnapshot(): Theme {
  if (unsavedTheme) return unsavedTheme;
  try {
    return parseTheme(window.localStorage.getItem(storageKey));
  } catch {
    return typeof document === 'undefined' ? 'system' : parseTheme(document.documentElement.dataset.theme);
  }
}

export function subscribeToTheme(listener: () => void): () => void {
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== null && event.key !== storageKey) return;
    unsavedTheme = null;
    listener();
  };
  window.addEventListener('storage', storageChanged);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener(changeEvent, listener);
  };
}

export function selectTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(storageKey, theme);
    unsavedTheme = null;
  } catch {
    unsavedTheme = theme;
  }
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(changeEvent));
}

// Runs before paint on every route, including pages without an account menu.
export const themeInitializationScript = `(()=>{let theme="system";try{const saved=localStorage.getItem(${JSON.stringify(storageKey)});if(saved==="light"||saved==="dark")theme=saved;}catch{}document.documentElement.dataset.theme=theme;})()`;
