# YoomiRead: handover

A personal reading journal and Chinese-to-English novel translator. For one reader only, not for publishing.
Installed on the phone as a web app and works offline once loaded. Your books, notes and settings live on the phone.

## Where things are

| What | Where |
| --- | --- |
| Code | this repo, `main` and `claude/serene-pascal-fwxbie` |
| Live app (current) | Netlify: `https://yoomiread.netlify.app` (builds from `main`) |
| Live app (new) | Cloudflare Pages: `https://yoomiread.pages.dev` (builds from `claude/serene-pascal-fwxbie`) |
| Old host | Mini Deploy on the PC (Tailscale). YoomiRead no longer depends on it |
| Project notes | Obsidian vault, `skeloton/ai_workspace_skeleton/Obsidian/Projects/YoomiRead/` |

## Branches (read this before merging)

- `main`: the app as it was merged on 2026-10-24 (last commit `b335594`, welcome screen in cream and blue).
- `claude/serene-pascal-fwxbie`: `main` plus two things not yet merged:
  - `functions/api/ci/[[path]].ts` and `functions/api/fetch.ts`: the translation proxy and link reader for Cloudflare Pages.
  - Vite upgraded from 5.4.11 to 6.4.5. Cloudflare Pages requires Vite 6 or newer to build.
- Cloudflare builds the branch the project is set to. Right now that is the development branch, so the functions
  are live there. After merging, set the project's production branch to `main` in Cloudflare.

## Settings on the phone

- **Provider address:** `https://yoomiread.pages.dev/api/ci/v1` (Netlify equivalent: `https://yoomiread.netlify.app/api/ci/v1`).
- **API key:** entered in Settings. It is stored only on that device and never exported in backups.
- **Models:** Settings has a "Refresh from provider" button. Current entries: Claude Haiku 5.5, DeepSeek v4 Pro,
  `minimax-m2` and `minimax-m3` (prices from the provider's listing on 2026-10-24).

## Main features

- Library with shelves, reading progress, ratings and reviews.
- Import: PDF, ePub, pasted text, and a web link (Kakao Page, Naver Series and futiledevices.blog, see below).
- Reader: Chinese or English view, font and paper themes, highlights in colours and folders, comments.
- Translation: chapter by chapter or in batches, with a cost estimate; a glossary built from the first chapters
  (names and terms, approved by the reader); translate ahead while reading (next 1 to 3 chapters, set in Settings).
- English books are never translated, even when the book's language setting is wrong.
- Tap a word in the reader to see its meaning from the offline dictionaries (English: ECDICT; Chinese: CC-CEDICT),
  with a Wikipedia summary and a way to add the word to the glossary.
- Cat companion, a cat in a wizard hat (`src/mascot/`): his mood follows your reading (happy, idle, sad, high). Tap him for a line,
  or ask him about the chapters you have read. Answers are remembered on the phone so repeats cost nothing.
  Poses are the owner's animated pictures in `public/mascot/` (changed from the pixel wizard on 2026-11-10); each has a
  still copy shown when animations are off. `cat-angry` is there but no mood uses it yet.
- Stats, quotes page, backups (export and restore), a welcome page on every app open.
- Look, "Loud Glass" (`src/loud.css`, chosen 2026-11-10): loud type (Bricolage Grotesque, Instrument Serif italics),
  ink black and one hot red on pale violet, coloured light behind frosted glass. Dark mode follows the phone.
  Home has a 3D book and a strip of small facts; Library shelves are glass pockets with covers tucked in (tap one to
  open it); the reader keeps its paper themes for the text.
- Motion (`src/motion.ts`, `src/motion.css`): pages slide the way you go, a chapter opens like a book cover, the tab
  marker slides, sheets close with a slide or a drag down, stats count up, the cat's poses are animated pictures, and
  finishing a book drops "Finished.", a READ stamp and confetti. Settings → Look and feel → Animations turns it all
  off; the phone's "Reduce Motion" setting does the same.
- Translate when a book is added (`src/translate/onImport.ts`): the first chapters (3 by default; Settings → Translation)
  are translated in the background right after an import. Chinese books only, and only with a key set and internet.
- Backup reminder (`src/backupNow.ts`): Home shows a note when the last backup is a week old (weekly, monthly or off in
  Settings). "Save a backup" opens the phone's share sheet, where "Save to Files" keeps it outside the app. A web app
  cannot write to Files by itself, so it is always one tap, never silent.
- The cat is cross for an hour after a translation fails or has passages skipped (`src/mascot/trouble.ts`), and says
  which chapter. A clean translation calms him.
- Stickers (`src/stickers.tsx`): the sticker button in the Library lets you put stickers, or a photo, on the shelf
  pockets; drag to place, drag off the pocket to remove. Saved on the phone only and not part of a backup.

## Things that do not work or were decided against

- **Kakao Page chapters:** the chapter text is loaded by scripts after the page opens. A plain fetch and a headless
  browser both show no story text without a login. Not built.
- **Naver Series:** answered 403 from the test environment. Untested on a real phone.
- **Novel Updates:** blocked by its Cloudflare check.
- **Link sources, rule changed by the owner on 2026-11-11:** fan-translation sites may be added when the owner asks
  for one by name, for private reading only. Chapters are kept on the owner's phone and nothing is shared onwards.
  First one added: `futiledevices.blog`. The list is `ALLOWED_SITES` in `netlify/edge-functions/fetch-page.ts`.
  Batch import (2026-11-12, asked for by the owner): "Many from a link" on a book page, or pasting a novel's contents page
  in "From a web link", lists the chapters (`extractChapterLinks` in `src/import/web.ts`); the owner ticks which ones and
  they are read one at a time with a pause of 0.7 seconds, saved as they arrive, and chapters already in the book are
  skipped. The pause and the one-at-a-time rule are there so the site is not hammered.
  Pasting a single chapter's link works too: the chapter page's script lists the novel's contents page, which
  `findContentsLink` reads (written for futiledevices.blog's page script; other sites need a contents page link).
- **WTR-LAB, Wuxia World:** declined earlier (before the rule above) and still not on the list.
- **Fanqie:** declined as a link source. It publishes original novels, so the reason is not licensing: a link reader
  would copy the text in bulk, and the site's terms likely restrict that. Use paste or file import for chapters you read there.
- **Highlights:** a highlight shows only in the language it was made in (original or English).

## Open items

1. Decide whether to merge `claude/serene-pascal-fwxbie` into `main`, then switch the Cloudflare production branch to `main`.
2. Test the Cloudflare site on the phone: Provider address, Test connection, and one translation.
3. Compare DeepSeek and Haiku timing on one chapter.
4. Clean up old folders: `relay/` (not used) and `netlify/` (keep until Cloudflare is confirmed).
5. Chapter 3 of one book keeps an old saved "already in English" reply. It is hidden, not deleted.
6. Not built: checking saved links for new chapters (the batch list could be reopened for this), cost by model,
   and "continue where I stopped" after a sync.

## Working on it

```
npm install
npm test          # 124 unit tests
npm run build     # typecheck, then build into dist/
npm run dev       # local dev server
```

- Dictionaries: `public/dict/` (license notes in `NOTICE.txt`). The English list is a shortened copy of ECDICT (MIT);
  the Chinese list is a shortened copy of CC-CEDICT (CC BY-SA 4.0).
- Offline files: `src/sw.js` keeps the app, dictionaries and the cat's pictures for offline use (named by hand in the file). Bump nothing by hand;
  the build fills in the file list.
- Secrets: none are in the repo. The API key lives in the phone's Settings. `relay/.env` is ignored by git.
- Pages Functions run only on Cloudflare Pages. The same logic also runs on Netlify through
  `netlify/edge-functions/`. Keep the two in step if you change one.

## How this was built

Built with Claude Code over many sessions, on the owner's requests. Project notes and decisions are in the vault.
Read `CLAUDE.md` before changing anything: it asks to keep the vault status note up to date.
