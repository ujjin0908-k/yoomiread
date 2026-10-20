import { useEffect, useState } from 'react';
import { Header } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { makeBackup, parseBackup } from '../logic';

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
    const { books, chapters, notes } = await db.exportAll();
    const blob = new Blob([JSON.stringify(makeBackup(books, chapters, notes), null, 2)], { type: 'application/json' });
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
      <Header title="Settings" back="" />
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
        <section className="card">
          <h3>On iPhone</h3>
          <p className="muted">
            Open this page in Safari, tap Share, then “Add to Home Screen”. It opens full screen like an app.
          </p>
        </section>
        <section className="card">
          <h3>Coming next</h3>
          <p className="muted">Import ePub, PDF and chapter links, then Chinese to English translation.</p>
        </section>
      </main>
    </>
  );
}
