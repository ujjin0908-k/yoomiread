import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Writes sw.js with the list of every built file, so the phone saves the whole app on the first visit. */
function offlineFiles(): Plugin {
  return {
    name: 'yoomiread-offline-files',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && f !== 'index.html')
        .map((f) => `/${f}`)
        .sort();
      // File names carry content hashes, so the list itself tells versions apart.
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('self.BUILD_FILES', JSON.stringify(files))
        .replace('self.VERSION', JSON.stringify(version));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineFiles()],
  test: { environment: 'node' },
} as never);
