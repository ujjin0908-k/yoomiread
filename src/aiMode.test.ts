import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { aiReady, EMPTY_SETTINGS, loadSettings, saveSettings, setAiMode } from './translate/run';

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.settings.clear();
});

describe('AI from YoomiRead or the reader’s own service', () => {
  it('keeps the owner’s own service as it was: own mode by default in the owner’s build', async () => {
    expect(EMPTY_SETTINGS.mode).toBe('own');
    expect(aiReady({ ...EMPTY_SETTINGS, baseUrl: 'https://x/v1', apiKey: 'k' })).toBe(true);
    expect(aiReady({ ...EMPTY_SETTINGS })).toBe(false);
    // Without accounts in this build, YoomiRead AI is never ready.
    expect(aiReady({ ...EMPTY_SETTINGS, mode: 'hosted' })).toBe(false);
  });

  it('switching modes and back never loses the own service’s models, choice or key', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ models: [{ id: 'server-model', label: 'Server', input: 1, output: 2 }] })));
    const mine = { ...EMPTY_SETTINGS, baseUrl: 'https://mine/v1', apiKey: 'secret', models: [{ id: 'my-model', label: 'Mine' }], defaultModel: 'my-model' };
    await saveSettings(mine);
    await setAiMode('hosted');
    const hosted = await loadSettings();
    expect(hosted.models.map((m) => m.id)).toEqual(['server-model']);
    expect(hosted.defaultModel).toBe('server-model');
    // A change saved while on YoomiRead AI (picking its model) does not touch the own list.
    await saveSettings({ ...hosted, thinkingOff: true });
    await setAiMode('own');
    const back = await loadSettings();
    expect(back).toMatchObject({ mode: 'own', baseUrl: 'https://mine/v1', apiKey: 'secret', defaultModel: 'my-model', thinkingOff: true });
    expect(back.models.map((m) => m.id)).toContain('my-model');
    expect(back.models.map((m) => m.id)).not.toContain('server-model');
  });
});
