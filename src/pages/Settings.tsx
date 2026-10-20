import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TopBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { makeBackup, parseBackup } from '../backup';
import { chat } from '../translate/api';
import { EMPTY_SETTINGS, loadSettings, saveSettings } from '../translate/run';
import type { ModelOption, TranslateSettings } from '../types';

export function Settings() {
  const counts = useLive(
    async () => ({ books: await db.books.count(), chapters: await db.chapters.count(), notes: await db.notes.count() }),
    [],
  );
  const [persisted, setPersisted] = useState<boolean>();
  const [message, setMessage] = useState('');

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  async function exportBackup() {
    const blob = new Blob([JSON.stringify(await makeBackup(await db.exportAll()))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yoomiread-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage('Backup saved. Keep it somewhere safe (Files, iCloud Drive).');
  }

  async function importBackup(file: File) {
    try {
      const backup = parseBackup(await file.text());
      const ok = confirm(
        `Replace everything here with this backup? (${backup.books.length} books, ${backup.notes.length} notes)`,
      );
      if (!ok) return;
      await db.restore(backup);
      setMessage('Backup restored.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read the backup.');
    }
  }

  async function keepData() {
    const ok = await navigator.storage?.persist?.();
    setPersisted(!!ok);
    setMessage(ok ? 'The browser will keep your data.' : 'The browser did not agree. Make backups often.');
  }

  return (
    <>
      <TopBar back="" title="Settings" />
      <main className="page">
        <section className="card">
          <h3>Your data</h3>
          <p className="muted">
            {counts ? `${counts.books} books, ${counts.chapters} chapters, ${counts.notes} notes and highlights.` : '…'}{' '}
            Everything is saved on this device only.
          </p>
          <div className="stack">
            <button type="button" className="btn primary" onClick={() => void exportBackup()}>
              Download backup
            </button>
            <label className="btn">
              Restore from backup
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importBackup(f);
                  e.target.value = '';
                }}
              />
            </label>
            {persisted === false && (
              <button type="button" className="btn" onClick={() => void keepData()}>
                Ask the browser to keep my data
              </button>
            )}
          </div>
          {message && <p className="small">{message}</p>}
        </section>
        <TranslationSettings />
        <section className="card">
          <h3>On iPhone</h3>
          <p className="muted">
            Open this page in Safari, tap Share, then “Add to Home Screen”. It opens full screen like an app.
          </p>
        </section>
        <section className="card">
          <h3>Coming next</h3>
          <p className="muted">Import ePub and chapter links, OCR for scanned PDFs, then the AI novel writer.</p>
        </section>
      </main>
    </>
  );
}

/** Provider address, API key and models. Saved on this device only, never in a backup. */
function TranslationSettings() {
  const [s, setS] = useState<TranslateSettings>();
  const [showKey, setShowKey] = useState(false);
  const [note, setNote] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void loadSettings().then(setS);
  }, []);
  if (!s) return null;

  const update = (change: Partial<TranslateSettings>) => {
    const next = { ...s, ...change };
    setS(next);
    void saveSettings(next);
    setNote('Saved on this phone.');
  };
  const setModel = (i: number, change: Partial<ModelOption>) =>
    update({ models: s.models.map((m, j) => (j === i ? { ...m, ...change } : m)) });
  const price = (v: string) => (v.trim() === '' ? undefined : Number(v));

  async function test() {
    setTesting(true);
    setNote('Testing…');
    try {
      const r = await chat(s!, s!.defaultModel, [{ role: 'user', content: 'Translate to English and reply with only the translation: 你好' }]);
      setNote(`It works: "${r.text.trim().slice(0, 40)}"`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The test failed.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="card form translate-settings">
      <h3>Translation</h3>
      <p className="muted small">
        Any OpenAI-compatible provider. The key stays on this phone and is never put in a backup. Set a spending limit with
        your provider.
      </p>
      <label>
        Provider address
        <input
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://…/v1"
          value={s.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
        />
      </label>
      <label>
        API key
        <span className="key-row">
          <input
            type={showKey ? 'text' : 'password'}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            value={s.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
          <button type="button" className="round-btn plain" aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey(!showKey)}>
            {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>

      <div className="models">
        <span className="label">Models and prices (US$ per million tokens)</span>
        {s.models.map((m, i) => (
          <div className="model-row" key={i}>
            <label className="radio">
              <input
                type="radio"
                name="default-model"
                checked={s.defaultModel === m.id}
                onChange={() => update({ defaultModel: m.id })}
                aria-label={`Use ${m.label} by default`}
              />
            </label>
            <div className="model-fields">
              <input aria-label="Name" value={m.label} onChange={(e) => setModel(i, { label: e.target.value })} />
              <input
                aria-label="Model id"
                className="mono"
                autoCapitalize="off"
                autoCorrect="off"
                value={m.id}
                onChange={(e) => {
                  const wasDefault = s.defaultModel === m.id;
                  const models = s.models.map((x, j) => (j === i ? { ...x, id: e.target.value } : x));
                  update({ models, defaultModel: wasDefault ? e.target.value : s.defaultModel });
                }}
              />
              <span className="row-2">
                <input aria-label="Input price" inputMode="decimal" placeholder="in" value={m.inputPrice ?? ''} onChange={(e) => setModel(i, { inputPrice: price(e.target.value) })} />
                <input aria-label="Output price" inputMode="decimal" placeholder="out" value={m.outputPrice ?? ''} onChange={(e) => setModel(i, { outputPrice: price(e.target.value) })} />
              </span>
            </div>
            {s.models.length > 1 && (
              <button
                type="button"
                className="round-btn plain"
                aria-label={`Remove ${m.label}`}
                onClick={() => {
                  const models = s.models.filter((_, j) => j !== i);
                  update({ models, defaultModel: s.defaultModel === m.id ? models[0].id : s.defaultModel });
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        <div className="row between">
          <button type="button" className="link" onClick={() => update({ models: [...s.models, { id: '', label: 'New model' }] })}>
            <Plus size={16} /> Add model
          </button>
          <button type="button" className="link" onClick={() => update({ models: EMPTY_SETTINGS.models })}>
            Reset prices
          </button>
        </div>
      </div>

      <button type="button" className="btn" disabled={testing} onClick={() => void test()}>
        Test connection
      </button>
      {note && <p className="small">{note}</p>}
    </section>
  );
}
