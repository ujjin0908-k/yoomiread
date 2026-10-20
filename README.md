# YoomiRead

My personal reading journal and (soon) Chinese novel translator. iPhone first, works on PC.
Plans and decisions live in the Obsidian vault
(`ujjin0908-k/obsidian-vault`, `skeloton/ai_workspace_skeleton/Obsidian/Projects/YoomiRead/`).

## What it does now (v0.1, journal)

- Library with shelves: Reading, Want to read, Read, Dropped. Search across all books.
- Add a book (title, author, original Chinese title, language).
- Chapters: add them, paste the text, tick them off as read.
- Comment on any chapter. Select a few lines to highlight them and add a note.
- "I finished this book": rate it (half stars) and write a review. It shows on the Read shelf.
- Backup: download everything as one file and restore it later (Settings).

Everything is saved on the device (IndexedDB). Nothing leaves the phone.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build in dist/
```

Deploy: Netlify reads `netlify.toml` (build `npm run build`, publish `dist`).
On iPhone: open the site in Safari, Share, "Add to Home Screen".

## Next

1. Import ePub, PDF and chapter links.
2. Chinese to English translation with a glossary.
