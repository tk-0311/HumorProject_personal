import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { getThemeSnapshot, parseTheme, selectTheme, subscribeToTheme, themeInitializationScript } from '../lib/theme';

test('theme values support light, dark and system with a safe default', () => {
  assert.equal(parseTheme('light'), 'light');
  assert.equal(parseTheme('dark'), 'dark');
  for (const value of ['system', '', 'other', null, undefined, {}]) assert.equal(parseTheme(value), 'system');
});

test('saved themes are applied before paint independently of authentication', () => {
  for (const [saved, expected] of [['dark', 'dark'], ['light', 'light'], ['system', 'system'], ['invalid', 'system'], [null, 'system']]) {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    runInNewContext(themeInitializationScript, { document, localStorage: { getItem: () => saved } });
    assert.equal(document.documentElement.dataset.theme, expected);
  }
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(themeInitializationScript, { document, localStorage: { getItem() { throw new Error('Storage unavailable'); } } });
  assert.equal(document.documentElement.dataset.theme, 'system');
});

function withBrowserStorage(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void }, run: (browser: EventTarget, document: { documentElement: { dataset: Record<string, string> } }) => void) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const browser = Object.assign(new EventTarget(), { localStorage: storage });
  const document = { documentElement: { dataset: { theme: 'dark' } as Record<string, string> } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  try { run(browser, document); }
  finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

test('theme choices persist and notify page-wide subscribers and other tabs', () => {
  const values = new Map([['humor-project-theme', 'dark']]);
  withBrowserStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, (browser, document) => {
    assert.equal(getThemeSnapshot(), 'dark');
    let notifications = 0;
    const stop = subscribeToTheme(() => { notifications++; });
    try {
      selectTheme('light');
      assert.equal(values.get('humor-project-theme'), 'light');
      assert.equal(document.documentElement.dataset.theme, 'light');
      assert.equal(getThemeSnapshot(), 'light');
      assert.equal(notifications, 1);
      browser.dispatchEvent(Object.assign(new Event('storage'), { key: 'unrelated-setting' }));
      assert.equal(notifications, 1);
      values.set('humor-project-theme', 'dark');
      browser.dispatchEvent(Object.assign(new Event('storage'), { key: 'humor-project-theme' }));
      assert.equal(getThemeSnapshot(), 'dark');
      assert.equal(notifications, 2);
      values.delete('humor-project-theme');
      browser.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
      assert.equal(getThemeSnapshot(), 'system');
    } finally { stop(); }
    const count = notifications;
    selectTheme('system');
    assert.equal(notifications, count);
  });
});

test('theme switching still works when browser storage is blocked', () => {
  let blocked = true;
  let value = 'system';
  withBrowserStorage({
    getItem() { if (blocked) throw new Error('Blocked'); return value; },
    setItem(_key, next) { if (blocked) throw new Error('Blocked'); value = next; },
  }, (_browser, document) => {
    assert.equal(getThemeSnapshot(), 'dark');
    selectTheme('light');
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(getThemeSnapshot(), 'light');
    blocked = false;
    selectTheme('system');
    assert.equal(getThemeSnapshot(), 'system');
  });
});
