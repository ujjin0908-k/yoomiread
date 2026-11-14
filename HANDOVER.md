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
- Import: PDF, ePub, pasted text, and a web link (Kakao Page, Naver Series, futiledevices.blog, chrysanthemumgarden.org,
  wuxiaworld.com and wtr-lab.com, see below).
- Reader: Chinese or English view, font and paper themes, highlights in colours and folders, comments.
- Translation: chapter by chapter or in batches, with a cost estimate; a glossary built from the first chapters
  (names and terms, approved by the reader); translate ahead while reading (next 1 to 3 chapters, set in Settings).
- English books are never translated, even when the book's language setting is wrong.
- Tap a word in the reader to see its meaning from the offline dictionaries (English: ECDICT; Chinese: CC-CEDICT),
  with a Wikipedia summary and a way to add the word to the glossary.
- Cat companion, a cat in a wizard hat (`src/mascot/`): his mood follows your reading (happy, idle, sad, high). Tap him for a line,
  or ask him about the chapters you have read. Answers are remembered on the phone so repeats cost nothing.
  Poses are the owner's animated pictures in `public/mascot/` (changed from the pixel wizard on 2026-11-10); each has a
  still copy shown when animations are off. The angry cat shows after a failed translation.
  `cat-working` (the cat with a star wand in his mouth) replaces the old drawn lizard on the "translating" screens.
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
- Screen changes (2026-11-12): measured at phone speed, they froze for about 120 ms while the new page loaded its data
  and grouped every chapter (a slow, quadratic grouping), then showed both pages through each other, then faded rows
  in late. Now: `useLive(query, deps, key)` remembers each page's last data, so a page draws complete at once, and
  fresh data is applied after the change (`afterPageChange` in `src/motion.ts`); the tabs' data is read ahead in idle
  time (`src/queries.ts`, `App.tsx`); covers keep one picture address per book; tabs use a quick fade-through; pages
  brought in by a page change arrive whole (no late rows); the background light holds still during a change.
- Character profiles (2026-11-12, designed on the canvas row "E · Character profiles"): the glossary page is now
  "The cast", for English books too (one name, nothing to translate). Characters are Main or Side. Each has a card
  (`src/pages/Character.tsx`) with Looks, Who they are and one quote, each line tagged with its chapter. Updates are
  manual: "Update <name>" on a card, or "Choose who to update" on the cast. An update reads only chapters marked read
  since that character's last update, and of those only paragraphs naming the character (or their other names); one
  request is shared by the characters picked together. Details must name a chapter that was sent, and quotes must be
  found in the text, or they are dropped. Lines the owner adds are never changed. "Also look for new people" reads whole
  chapters and adds them to "To check". Logic and tests: `src/translate/profiles.ts`.
- Looking up a word (2026-11-12): select it (press and hold, as on any iPhone page); the selection bar then shows
  "Look up" next to "Highlight" when the selection is a word or short phrase (`lookable` in `ChapterPage.tsx`). The old
  press-and-hold shortcut was removed: it fired before iPhone's own selection, so text could not be highlighted.
- Glossary from the reader (2026-11-14): select a word; when it is a glossary name ("[Fate]", "Deceit's", "the Sea of
  Desire", or a whole word of one name like "Sansui"), the selection bar shows "Glossary" instead of "Look up", and opens
  a short card (`src/pages/GlossaryCard.tsx`): kind, note, the lines with Ch./guide tags, and for people a link to
  their full card. Matching: `glossaryFor` in `src/glossaryMatch.ts`. Faces in the reader open the same card.
- Book guides (2026-11-13, owner: "fill out some info" instead of spending tokens; spoilers are fine). A guide is a
  ready-made glossary (`src/guides/`): people, places, gods, groups, terms with other names, notes and lines. The cast
  page's "Book guide" box fills in from the built-in guide when the book title matches (`guideFor`), or from a guide
  file (.json, same shape as `Guide`). Free: nothing is sent. Names already there keep everything and gain other names,
  note and lines; old-style profiles are settled (old scene lines dropped, no paid rebuild). Guide lines show "· guide"
  and are kept by updates like the owner's. Built-in: Foolish Game of the Gods (诸神愚戏), written from Baidu Baike
  (Chinese and English) and the English translation's chapter titles; Chinese names only where the sources gave them.
  Loaded on demand (own chunk), so it does not grow the main app.
- The world of the story (2026-11-13, owner's ask: the book has great world building). Kinds are now person, place,
  god, group (faction, sect, guild, church, team) and term (power system, rank, title, skill, item, rule). "New in the
  story" on the cast (`searchStory` in `src/translate/profiles.ts`, replaces "Look for new characters") reads the
  chapters finished since `book.worldUpTo` and adds new people, places, gods, groups and terms under "To check", and
  new facts (with chapter) to world entries already there (`profile.about`). Places/gods/groups/terms show as cards with
  those facts. Translation still proposes names only, and a translation request now sends only glossary entries named
  in that chapter (by original or other name), so a big world glossary costs nothing extra.
- Back from the cast or a character goes to the chapter it was opened from (`src/trail.ts`), until the book page or a
  tab is opened.
- Profiles as who / powers / status (2026-11-13, owner's ask: scene-by-scene lines and looks were not wanted). A card
  shows Who they are (identity, role, team, relationships; never "drinks wine"), Powers (abilities, skills, items) and
  Status (rank, title, faction, condition), plus the quote. Status is replaced by the newest, powers add up. Looks are
  no longer asked for or shown (data kept). Profiles without `v: 2` are rebuilt from Ch. 1 on their next update, keeping
  the owner's lines, the one-liner and the quote; the card says so.
- Faces in the reader (2026-11-12): `speakerOf` in `src/logic.ts` finds who speaks in a paragraph, on the phone (no
  tokens). First a name with a speaking verb by the quote ("Chen Chong shouted", "said Song Yawen"), else a name that
  starts a sentence of the narration near the speech ("Cao Sansui frowned. “…”"). Other names (aliases) count; names
  inside the speech, or after "at/to/by…", do not; "he said" gives no face. Every cast member is a possible speaker,
  and the face shows on every line they speak (it used to show once until someone else spoke).
- Pictures (covers, character pictures, sticker photos) are saved as bytes (`src/picture.ts`), not Blobs. Safari on
  iPhone often failed to save a record again once it held a Blob read back from storage ("Error preparing Blob/File data
  to be stored in object store"), so every later change to a book with a cover failed (found 2026-11-12 via the cast
  scan). Old Blobs are converted at start-up (`storePicturesAsBytes` in `src/db.ts`); one Safari can no longer read is
  dropped so the record works again. Never store a Blob in the database again.

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
  Covers (`src/import/cover.ts`): a book made from a link takes the novel's cover, the contents page's share picture
  (`og:image`), fetched by the browser straight from the site's picture host (needs the site to allow it; it does for
  futiledevices.blog). Only pictures taller than wide are accepted, so a site logo is never used. Books without a cover
  also get a "Get cover from the link" button; a cover chosen by hand is never replaced.
- **Added on 2026-11-12 at the owner's request, under the rule above:** `chrysanthemumgarden.org`, `wuxiaworld.com`,
  `wtr-lab.com`. What the page reader gets from each (checked on saved copies of their pages from the build machine):
  - Chrysanthemum Garden: chapters, contents pages (794 chapters on the first novel), cover and batch import all work. The
    list marks most chapters "(Chinese)", the site's own label; the one chapter read came back as English text.
  - Wuxiaworld: single chapters work. The list of chapters is loaded by scripts, so no batch list. Only what the site shows
    without logging in is fetched, so a locked chapter would import as its teaser.
  - WTR-LAB: the chapter text is loaded by scripts after the page opens (like Kakao Page), so the page reader finds none.
    The site is on the list but cannot be read until the app can run those scripts.
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
npm test          # 176 unit tests
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
