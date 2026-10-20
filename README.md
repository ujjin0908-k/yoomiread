# YoomiRead

My personal reading journal and (soon) Chinese novel translator. iPhone first, works on PC.
Plans and decisions live in the Obsidian vault
(`ujjin0908-k/obsidian-vault`, `skeloton/ai_workspace_skeleton/Obsidian/Projects/YoomiRead/`).

## What it does now (v0.2)

Look: cream paper, serif titles, dark pill buttons, olive accents and arched covers
(inspired by the owner's reference shots; our own build).

- **Home:** "Continue Reading" card with cover, % read and minutes left; recent books.
- **Library:** shelves (Reading, Want to read, Read, Dropped), arched cover grid, search.
- **Import a PDF:** cover from the first page (white margins trimmed), title and author from the cover,
  chapters split at headings (第一章, Chapter 1, 楔子 …), contents pages skipped. Scanned PDFs keep the cover
  and say OCR is needed.
- **Covers:** add or change a cover photo on any book.
- **Reader:** chapter label, big title, drop cap, highlights with notes, chapter comments,
  progress bar with % and minutes left, remembers where I stopped, chapter list.
  Settings sheet: text size, paper / sepia / night, serif or sans, line spacing, drop cap.
- **Finish a book:** half-star rating and review, shown on the Read shelf.
- **Quotes:** every highlight across books, grouped by book; tap one for a big quote card.
- **Stats:** reading time, sessions, day streak, books read this year, average rating, minutes per day.
- **Backup:** one file with everything, covers included (Settings).

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

1. Import ePub and chapter links; OCR for scanned PDFs.
2. Chinese to English translation with a glossary.
