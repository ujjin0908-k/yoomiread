import { useState } from 'react';
import { saveBackupFile } from './backupNow';

/** Saves a backup file, with `saving` true while it is being built so the button can say so. */
export function useBackupSave(): { saving: boolean; save: () => Promise<Awaited<ReturnType<typeof saveBackupFile>> | undefined> } {
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return undefined;
    setSaving(true);
    try {
      return await saveBackupFile();
    } finally {
      setSaving(false);
    }
  }
  return { saving, save };
}
