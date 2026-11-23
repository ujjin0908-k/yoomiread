import type Dexie from 'dexie';

/**
 * Keeps the app safe when its stored data and its code are different versions (an installed app can run an older
 * cached copy for a moment after an update):
 * - A newer copy wants to upgrade the data while this one is open: this one lets go and reloads, so the upgrade is
 *   never blocked and this page never writes in the old shape.
 * - This copy is older than the data: Dexie 4 opens it anyway (tested), so books stay visible. Should opening ever fail
 *   with a VersionError, it asks for the new version and reloads, once; if that does not help, it says so instead of
 *   showing an empty library.
 */
export interface OpenHooks {
  reload: () => void;
  /** Asks the service worker to fetch the newest app. */
  update: () => Promise<void>;
  /** Remembers, for this tab only, that a reload was already tried. */
  tried: { get: () => boolean; set: () => void };
  /** Shows a short message while the app updates, or when it could not. */
  say: (text: string) => void;
}

export function guardVersions(db: Dexie, hooks: OpenHooks): Promise<void> {
  db.on('versionchange', () => {
    db.close();
    hooks.reload();
    return false;
  });
  return db.open().then(
    () => undefined,
    async (e: unknown) => {
      if ((e as { name?: string })?.name !== 'VersionError') throw e;
      if (hooks.tried.get()) {
        hooks.say('This copy of YoomiRead is older than your saved books. Close the app completely and open it again while online.');
        return;
      }
      hooks.tried.set();
      hooks.say('Updating YoomiRead…');
      await hooks.update().catch(() => undefined);
      hooks.reload();
    },
  );
}

/** The real hooks, for the browser. */
export function browserHooks(): OpenHooks {
  const KEY = 'yoomiread-version-reload';
  return {
    reload: () => window.location.reload(),
    update: async () => {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    },
    tried: {
      get: () => {
        try {
          return sessionStorage.getItem(KEY) === '1';
        } catch {
          return false;
        }
      },
      set: () => {
        try {
          sessionStorage.setItem(KEY, '1');
        } catch {
          // Without storage a second try can happen once more; reloads still stop when the versions match.
        }
      },
    },
    say: (text) => {
      const el = document.createElement('p');
      el.className = 'version-note';
      el.setAttribute('role', 'status');
      el.textContent = text;
      document.body.appendChild(el);
    },
  };
}
