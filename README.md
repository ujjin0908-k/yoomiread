# YoomiRead

A reading companion: a reading journal, a reader for your own books, a Chinese-to-English novel translator, and
"The Living Book", a spoiler-free guide to each book's people, places and events that only shows what you have
reached. iPhone first (installed from Safari), works on a computer too.

Plans, decisions and dated logs of every change live in the Obsidian vault
(`ujjin0908-k/obsidian-vault`, `skeloton/ai_workspace_skeleton/Obsidian/Projects/YoomiRead/`).

## Where your data lives

- **On your device, always.** Books, notes, highlights, progress, translations and the guide are stored in the
  browser's database (IndexedDB) and work offline. A backup file (Settings → Your data) holds everything.
- **In your account, only if you sign in** (builds with accounts only). Sync keeps your library the same on all your
  devices. It stores your library rows on the app's Supabase project, readable only by your account. You can leave
  book text and translations on the device ("Include book text" off). Keys and device settings never sync.
  Safeguards: "Undo last sync", a question before a sync removes several books, and a question before a
  different account takes over a phone's library.
- **AI, only when you use it.** Translation, character profiles, the story search and the cat's chat send the text
  they need to an AI service:
  - **YoomiRead AI** (signed in): requests go through the app's server (`functions/api/ai`), which holds the
    provider key, checks the sign-in, and applies a per-reader monthly limit and a daily ceiling for everyone. Every
    call's cost is recorded.
  - **Your own service:** requests go to the address and key you enter. The key stays on your device and is never
    in a backup.

## What it does

- **Library and journal:** shelves, ratings, reviews, quotes, reading stats, chapter comments, highlights with notes.
- **Import:** PDF (cover, title, chapters), ePub, pasted chapters, or a book written down by hand. A free sample
  book: *The Wonderful Wizard of Oz* (public domain).
- **Reader:** themes, fonts, offline dictionaries (English and Chinese), read aloud, faces of who is speaking, scene
  pictures.
- **Translation (Chinese → English):** a glossary that keeps names the same, genre-aware, translate ahead, cost shown
  first.
- **The Living Book:** people web, places map, timeline and "Previously on…", hidden past your reading line. Genre
  presets (Fantasy, Cultivation, Science fiction, Romance & drama, Mystery & thriller) name the world to fit the book.

## Editions

- **Owner's build** (default): every feature, including reading from web links.
- **Public build** (`VITE_EDITION=public`): leaves out the link reader, built-in guides for other people's novels,
  and the Novel Updates field. Accounts, YoomiRead AI and sync appear when `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` are set. Server setup: the vault note "YoomiRead AI setup", plus
  `supabase/ai_usage.sql` and `supabase/sync.sql`.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build in dist/
```

Deploy: Cloudflare Pages builds `main` (functions in `functions/`). On iPhone: open the site in Safari, Share,
"Add to Home Screen".
