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
- Translate when a book is added (`src/translate/onImport.ts`): the first chapters (3 by default; Settings → AI)
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
- Chapter order (2026-11-16): "First to last / Last to first" on the book page's chapter list and in the reader's
  chapter list (`src/chapterOrder.ts`), remembered per book on the phone. The reader's list opens scrolled to the
  chapter being read. Hooks must stay above BookPage's early returns (a misplaced one crashed the page in testing).
- Guide, 2026-11-15 additions: ~25 more characters (Qin Xin, Long Jing, Wang Weijin, 0221, Xiao Qi, Wei Mu,
  Zayinjier, Lao Jia, Li Wufang, Chun, Meng Youfang, An Jing…), six more heralds, new facts on existing people, and a
  picture description for every person (imagined from role, path and class: the sources barely describe looks).
  Character cards show "How it looks" with Copy picture prompt (portrait format for people).
- Reading background (2026-11-15; per book since 2026-11-17): each book can have its own picture behind the reader
  (`Book.backdrop`, `src/backdrop.ts`, `BackdropPicker` in the book's Edit details and the reader's T settings), under the
  theme's page colour at "Picture strength". In backups like the cover. The first phone-wide version (settings key
  `readerBackdrop`) is moved once, at start-up, to the most recently read book (`movePhoneBackdropToBook`). The iPhone
  status bar is painted by iOS in the theme colour, so with a background the reader sets that colour from the top of
  the picture (`topColour`, `mix`).
- Picture book (2026-11-15, owner's ask). Places, gods, groups and terms (paths, items) can have a picture (saved up to 1600 px) and a
  "How it looks" description (`GlossaryEntry.look`). "Copy picture prompt" (entry editor and glossary card) copies
  what it is + the description + the book's art style (`Book.artStyle`, set by a guide; `src/art.ts`) + wide format, to
  paste into ChatGPT. The Foolish Game guide has a description for every place, god, group and path
  (`src/guides/foolish-game-looks.ts`) and a dark-fantasy style in the spirit of Elden Ring. In the reader, a place,
  god or group with a picture shows big after the paragraph that first names it, once per chapter (`scenesFor` in
  `src/scenes.ts`); a one-word name counts only in brackets or capitalised mid-sentence, so "at that time" is not the
  god Time. Since 2026-11-16 a one-word god counts only in brackets ("[Fate]"), and a name inside a longer glossary name ("Die of Fate") never counts. Switch: "Pictures in the story" in the reader's look settings. Other names now save for every kind.
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
  and the face shows on every line they speak (it used to show once until someone else spoke). Every name a person goes by counts, English and original alike (`speakersFrom`, 2026-11-17): before, an English book looked only for the original name, so a cast with Chinese originals (程实 for Cheng Shi) almost never got a face.
- Pictures (covers, character pictures, sticker photos) are saved as bytes (`src/picture.ts`), not Blobs. Safari on
  iPhone often failed to save a record again once it held a Blob read back from storage ("Error preparing Blob/File data
  to be stored in object store"), so every later change to a book with a cover failed (found 2026-11-12 via the cast
  scan). Old Blobs are converted at start-up (`storePicturesAsBytes` in `src/db.ts`); one Safari can no longer read is
  dropped so the record works again. Never store a Blob in the database again.

- The Living Book, groundwork (2026-11-17; spec in the vault, "Plan - The Living Book"). Data and rules only, no screens
  yet. `src/world/`: `readingLine` (furthest chapter read, or the one I am in), `worldAt` (the one place the no-spoiler
  rule lives: facts, links, events and notes past the line are dropped; my own items always show; guide items with no
  chapter show only with `Book.worldSpoilers`; a guide link marked `safe` (a setup fact, not a twist) shows once both ends
  are met; an entry's note, other names and look are hidden without spoilers), `firstSeen` (the chapter each name is first
  named in, found on the phone with the reader's name rules, one pass per chapter) and `loadWorld(bookId, line?)` (the
  scan is cached in settings as `world-seen:<bookId>` and redone when names or chapters change). New tables
  `worldLinks` and `worldEvents` (database v5, backup v4), place nesting `GlossaryEntry.within`. Guides can carry
  `links`, `events` and `within`; the Foolish Game guide has ~150 links in `src/guides/foolish-game-world.ts`, each one
  restating a line of the guide. Dev only: `?seed=world` on the dev server adds a 300-chapter test book
  (`src/dev/seedWorld.ts`, filler text marked "(test)", read to chapter 120). Tests: `src/world/world.test.ts`.

- The Living Book, screens (2026-11-17, built on the groundwork above; screenshots in `shots/living-book/`). One page
  per book, "The world" (`#/world/<bookId>[/people|places|timeline|recap]`, `src/pages/World.tsx`), opened from the
  book page (the dark "The world" tool), the top of the reader's chapter list, and a "Previously on…" note on Home when
  the book being read was last opened 3 or more days ago. Back goes to the chapter it was opened from.
  - **People** (`src/world/PeopleWeb.tsx`, logic in `graph.ts`): faces joined by lines on a canvas. Every person, plus
    gods, groups, terms and places that have a link. The layout is worked out once for the reading line (`layoutWeb`:
    same world, same picture), and earlier chapters show part of it, so nothing jumps when the slider moves. Lines are
    coloured by `toneOf` the label: bonds (gold), faith (violet), conflict (red); the three chips switch each on and
    off. Tap a face: the rest dim, its lines show their labels with an arrow (the label reads from → to), and a card
    lists its links (tap one to hop). Main cast have a red ring, gods a gold ring with rays, groups are squares with a
    soft cloud over their members. The search button finds a name; the arrows button shows everything again.
  - **Places** (`PlacesMap.tsx`, `map.ts`): the books give no geography, so each top-level place is an island on a
    chart, places inside it (`GlossaryEntry.within`) are marked on it, and a dotted route joins places in the order
    the story first reached them; the newest has rings round it. A place with a picture shows it in a medallion.
  - **The chapter slider** (People and Places): drag back to any earlier chapter, or press play to watch the world
    grow from chapter 1. It cannot pass the reading line.
  - **Timeline** (`Timeline.tsx`, `timeline.ts`): events, first appearances (free, from the first-seen scan, so it is
    never empty) and my highlights and comments, by chapter, under arcs (or runs of 25 chapters when no event names
    an arc). Tap a chapter number to open it, a name to see it on the web or map.
  - **Recap** (`Recap.tsx`, `recap.ts`): free part made on the phone (where I stopped, the saved story-so-far summary
    of the latest translated chapter at or before the line, last events, who was on the page in the last 3 chapters,
    new faces, my last marks). "Ask the cat" sends the last 3 chapters at or before the line (and only names already
    met) for a ~150-word telling, or ~350 with "Longer"; kept as `recap:<bookId>:<line>:<short|long>` in settings, so
    each reading line is paid for once, and added to the book's spend.
  - **The eye button** opens "This world": the spoilers switch (`Book.worldSpoilers`, off by default) and "Links and
    events from the story", which reads finished chapters for dated links and events (`searchStory` with
    `linksOnly`, from `Book.linksUpTo`; price shown first). The cast's "New in the story" now asks for links and events
    in the same request. Rules (`parseWorldReply`, `addWorldLinks`): an item must name a chapter that was sent; a link
    label is at most 5 words; at most 2 events a chapter; names must be in the glossary; nothing is added twice.
  - Drawing: `Stage.tsx` is the shared canvas (drag, pinch, fling, tap, glide-to). It draws only when something
    changed. While moving it draws at 2× instead of 3× sharpness, then once more at full. Controls over the canvases
    are not frosted (a blur over a moving canvas is redone every frame). Not yet measured on a real iPhone.
  - The class names `world-card`, `world-list`, `world-note`, `world-art`, `world-hint` belong to the glossary's world
    cards in `loud.css`; the Living Book's card is `lb-card`.
  - A live query may only read: `loadFirstSeen` saves its scan a moment later, outside the query.
  - "Full card" on a person leads to the cast's character page, which shows everything known (guide lines included),
    as it always has. The world's own cards stay inside the reading line.

- **Read aloud (2026-11-21).** The headphones button in the reader reads the English (the translation, or an English
  book's text) with the phone's own voices (Web Speech API, `src/speech/player.ts`): free, instant, offline. Voice
  sheet (tap the bar): the phone's English voices, Premium and Enhanced first (`englishVoices`), each with ▶ to hear
  it; speed 0.8× to 1.5×; "Go on to the next chapter" (stops with a note when the next one has no translation). The
  paragraph being read is marked and kept in view. Better iPhone voices: Settings → Accessibility → Read & Speak →
  Voices → English (Premium/Enhanced), then reopen the app. Pause stops the sentence and restarts it on play (iPhone's
  own pause is unreliable). The chapter is cut into sentences by `chunks.ts`.
  - **ElevenLabs (2026-11-21, owner's ask, Flash only: the better model was too dear).** Voice sheet → "ElevenLabs":
    the owner's API key and voice ID (default QAmlwgbPtjxpk7u98Qs9), kept in device settings (never in a backup).
    The phone calls api.elevenlabs.io directly (it allows browsers), no server. `src/speech/eleven.ts`: the chapter's
    sentences are grouped into parts of up to 1,500 characters (`partsOf`), each spoken with `eleven_flash_v2_5`
    (half a credit per character, about $0.04 per 1,000 characters pay-as-you-go) and saved in cache storage
    `yoomiread-audio` (kept across app updates by `sw.js`), keyed by chapter, voice, speed and the text, so a chapter
    is paid for once. Before a chapter uses credits the bar shows characters, credits and dollars with a Listen
    button ("ask first", on by default). The next part is made while one plays; the paragraph mark follows the audio
    by sentence length (`chunkAtTime`). "Check key" shows credits left; "Delete saved audio" frees the space.
    Errors in plain words (bad key, out of credits, unknown voice, free account blocked).
  - Kokoro (an on-device AI voice) was tried first the same day and removed: on the owner's iPhone it stayed on
    "Making the voice", too slow to make speech live. ElevenLabs was discussed: its free plan covers less than one
    chapter a month, so it would need a paid plan.

- **Chapter titles in English (2026-11-21).** A chapter's translation now also returns its title in English
  (`===TITLE===` line, `splitReply`), saved as `Chapter.titleEn` and shown wherever a chapter is listed or read
  (`titleOf` in `src/logic.ts`; the reader shows it over the English view). "English titles" on a translated book's
  chapter list puts every remaining title into English, 120 per request (`translateTitles` in `src/translate/run.ts`),
  with the glossary names found in those titles.
- **"Retry" to the cat (2026-11-21).** Typing "retry", "translate it again", "retry with the other model" in his chat
  translates the chapter that failed (or the one open) again in the background, with no chat call
  (`src/mascot/retry.ts`); he says when it is done or why it failed. A failure now remembers the chapter id and the
  error (`Trouble.chapterId`, `Trouble.error`), and his cross line names the reason.

- **Genre presets (2026-11-22):** Edit details → Genre: General, Fantasy, Cultivation, Science fiction, Romance &
  drama, Mystery & thriller (`src/genres.ts`). A preset renames the kinds (Fantasy: Factions, Powers, Lore; Cultivation:
  Sects & clans, Gods & paths; Mystery: Clues), hides kinds the genre does not use unless the book already has entries
  of them, and tells "New in the story" what to look for and which links and events matter. Stored kinds are
  unchanged, so old books and backups need nothing. A book with no genre is "General", exactly as before. The sheet
  offers a free guess from the first five chapters (counted on the phone).
  Also (same day): "Your own names for the kinds" in Edit details renames places, gods, groups or terms for one book
  (`Book.kindNames`); naming a kind the genre leaves out turns it on, and the story search is told the book's word.
  The translator gets one line about the genre (not for General). A guide file can carry `"genre"`, used when the
  book has none.

- **Public build and the sample book (2026-11-22):** `src/edition.ts`. The default build is the owner's app, with
  everything. `VITE_EDITION=public` at build time leaves out the link reader ("From a web link", "Many from a link",
  covers from a link), the Foolish Game guide (not even in the files) and the Novel Updates field; the page reader
  function (`functions/api/fetch.ts`) also refuses when that variable is set on the Cloudflare project. Both builds
  offer a free sample book on an empty Home or Library: "The Wonderful Wizard of Oz" (public domain, from Standard
  Ebooks, `public/samples/oz.json.gz`) with its own guide (`src/guides/oz.ts`: cast, places, links and events, each
  dated by chapter), genre Fantasy, ready offline with no key. The translation prompts no longer say "for a single
  reader". `.json.gz` files (sample, dictionaries) now open whether or not the server unpacks them (`src/gzipJson.ts`).

- **First-run tour (2026-11-22):** `src/pages/Tour.tsx`. Four cards after the welcome screen (bring your books, read
  with help, a world that grows without spoilers, translate with AI if you want), ending with "Try the free sample
  book" or "Add my own book" (opens Home with the add sheet). Shown once, only on a device with no books, so the
  owner's app never shows it; Settings → Getting started → "Show the tour again" brings it back on the next open.
  Stored in `settings` as `tourSeen` (true, or 'again').

- **YoomiRead AI (2026-11-22, item 3 part 1):** AI without the reader's own key. Settings → AI → "AI from":
  YoomiRead or My own service. The owner's build keeps "My own service" as the default, and the choice appears only
  when the build has accounts (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
  - Sign-in: Supabase (email link, Google, Apple), `src/account.ts`; the library loads only when used.
  - Server: `src/server/aiGateway.ts`, run by `functions/api/ai/[[path]].ts` (`/api/ai/models`, `/usage`, `/chat`).
    It checks the sign-in, offers only the models in `AI_MODELS`, caps request size and answer length, applies a
    monthly safety limit per reader (`AI_MONTHLY_LIMIT_USD`, default $1; not a price), and records every call's
    tokens and cost in Supabase (`supabase/ai_usage.sql`: table `ai_usage`, views `ai_spend_by_month` and
    `ai_spend_by_kind` for the expense check). The provider key (`AI_API_KEY`) stays on the server.
  - Switching modes keeps each mode's own models (`setAiMode`). Ten key checks became one `aiReady`.
  - Setup steps: vault note "YoomiRead AI setup".

- **Sync between devices (2026-11-22, item 3 part 2):** Settings → Account (shown when the build has Supabase):
  sign in once for both sync and YoomiRead AI; "Sync this phone" on or off, "Sync now", last synced.
  - Engine: `src/sync.ts`. Every row's fingerprint from the last sync is kept, so changed, new and deleted rows are
    found without any write in the app knowing about sync. Same row changed on two devices: the newer `updatedAt`
    wins; an edit beats a delete. Pictures travel as data URLs. Device settings (keys, AI choice) never sync.
  - Schedule: `src/syncRun.ts`: on open, after sign-in, every 5 minutes while open, when the app is put away, when
    back online. Signing out forgets the sync record, so another account on the phone starts fresh.
  - Server: `supabase/sync.sql`, table `sync_rows` (one row per table and id, server-set time, readers see only
    their own rows) and a size view per reader.

- **Trust step (2026-11-23, after an outside review):**
  - **AI:** stopped answers are recorded; each call reserves its likely cost first in one locked step (`ai_reserve`),
    so calls at the same moment cannot pass the limits; a daily ceiling for everyone (`AI_DAILY_LIMIT_USD`); a
    confirmed email is required.
  - **Sync:** "Undo last sync"; a question before removing more than 2 books or a quarter of the library; a question
    when a different account signs in; an "Include book text" switch.
  - **Updates:** an open copy lets a newer version upgrade the data (`src/dbOpen.ts`).
  - **Docs:** the README describes where data lives. A terms draft is in the vault.

- **Delete my account (2026-11-23):** Settings → Account → "Delete my account". The reader types DELETE; a backup is
  offered first. The server (`src/server/accountDelete.ts`, `functions/api/account`) deletes the sign-in with the
  service key, and the database removes the synced library and AI records with it. "Also erase everything on this
  phone" (off by default) clears every table on the device (`src/erase.ts`).

- **Book text: asked once, and "Fill in from file" (2026-11-23):** in the public app the first sync waits for one
  question, "Also sync your books' text?", with "off" preselected. The owner's app keeps it on without asking. The
  free sample's text always syncs (`Book.sample`, `textAlways`). A book whose text stayed on another device shows
  "Fill in from file" on its page (`src/pages/FillText.tsx`, `src/fillText.ts`): pick the same PDF or ePub; chapters
  are matched by number and title, never overwritten, and a different book is refused.

- **Japanese and Korean (2026-11-23, item 4):** books can be Japanese (`ja`) or Korean (`ko`) as well as Chinese.
  - `src/languages.ts` holds each source language's name, script, how names are romanized (pinyin, Hepburn, Revised
    Romanization), and reading speed. The language is guessed from the text: kana means Japanese, hangul Korean,
    Han alone Chinese.
  - Translation, glossary scan, chapter and book titles, and "Check the original" all use the book's language.
    Chinese books get exactly the same instructions as before (tested).
  - PDF chapter headings: 第1話, プロローグ, 제1화, 12화, 프롤로그. Korean chapter numbers. Japanese and Korean genre words.
  - Reader: Noto Serif JP and KR, a Japanese first-line indent, Korean keep-all line breaks.
  - Tapping a word: Wikipedia in that language, plus a Jisho or Naver link (no offline dictionary yet).
  - Chapter titles in CJK are now upright in their own serif (Chinese titles too, instead of a fake italic).

- **Japanese and Korean dictionaries (2026-11-23):** tap a word in a Japanese or Korean book for an offline meaning.
  - Japanese: JMdict in two files, common words (`ja.json.gz`, 1.3 MB) loaded first and the rest (`ja-more.json.gz`,
    5.9 MB) only on a miss; conjugated words are traced back (つぶやいた → つぶやく).
  - Korean: Wiktionary via Kaikki (`ko.json.gz`, 2.3 MB); inflected forms point to their dictionary word (먹었다 →
    먹다), and particles are dropped (도시를 → 도시).
  - Credits: `public/dict/NOTICE.txt` and Settings → Dictionaries. Rebuild: `scripts/dictionaries/`.

- **Translate into Spanish or French (2026-11-23):** Edit details → "Translate into" (Chinese, Japanese and Korean
  books): English (default), Spanish or French (`Book.target`, `TARGETS` in `src/languages.ts`).
  - Uses the book's language: the translator, tone and honorific rules, chapter titles, "Check the original", the
    reader's switch (日本語 / Español), the word sheet (RAE and Larousse links; no offline Spanish or French dictionary
    yet), and the chapter chip (ES).
  - Each translation records its language (`Translation.lang`; older ones are English), so changing a book's language
    never mislabels chapters already translated.
  - The story-so-far summary, profiles and the world stay English, like the app.

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
- **Adding chapters to a book that is already here (2026-11-20, owner's ask):** for a book imported up to some chapter
  (Foolish Game: PDF to 520) whose later chapters come from elsewhere. New chapters join the same book, so its cast,
  places, links, events, reading line and glossary carry on; there is no copying between books.
  - "From a file" on the book page (`src/pages/ChapterFile.tsx`): pick an ePub or PDF, choose "From … to …" (From starts
    after the book's last chapter), add. Numbers come from the titles (`guessNumbers` in `src/import/range.ts`; a title
    without one counts on from the one before); a number already in the book moves to the next free one (`placeNumbers`).
  - "Many from a link" has the same "From … to … · Tick these" row, so a long contents page needs no tapping one by one.
  - WTR-LAB: a link now says why it cannot be read and points to "From a file" (`scriptOnlyReason` in `src/import/web.ts`);
    "Many from a link" refuses it up front so a batch of hundreds of failing reads never starts.
- **Copy the world (2026-11-20, owner's ask):** a second copy of a novel (the Chinese original next to the English
  edition) takes over the first one's whole world without touching it. The owner reads Foolish Game in English to 520
  (PDF) and carries on from 521 in Chinese with the app's translator.
  - Importing an ePub or PDF now numbers chapters from their titles when they run in order (`numbersFor` in
    `src/import/range.ts`): a book starting "第521章" starts at 521. Empty pages (a volume title alone) are left out.
    When the same novel is already in the library (`sameNovel`: a title or original title in common), the first
    chapters are not auto-translated, so nothing is translated before the glossary is copied.
  - The book page then offers "Copy the world from …" (`src/pages/CopyWorld.tsx`, logic `src/world/copyWorld.ts`):
    glossary entries with profiles, pictures, looks and places nested, links, events, art style, spoiler switch, scan
    marks (`worldUpTo`, `castUpTo`, `linksUpTo`) and translation style. Names the new book already has are not added twice.
  - For a Chinese copy, names the English book only knows in English get their Chinese from the guide (`chineseNames`),
    and the guide then adds its remaining names. The translator only sends glossary names found in a chapter's text,
    so this is what makes the glossary work on Chinese text. The style notes gain a rule: 【命运】 → [Fate].
  - Style sample: a passage of the English edition (`passageFrom`, from the furthest chapter read), editable, with
    "Take another passage". The story so far (`Book.storySoFar`, editable in Edit details) starts from the newest
    "Ask the cat" recap of the English book, and is used as the translator's story so far until a translated chapter has one.
  - `Book.startLine` (the English book's reading line) counts chapters before the copy's first chapter as read, and
    `Book.seenBefore` keeps who was first seen where in the English book, so the Living Book is not empty at 521.
  - Guide (2026-11-20): Chinese for ~60 more names (people, gods, groups, places, terms), each checked against the
    Chinese ePub text (程实 15,309 times, 秦薪 1,522, 【源初】 910 …); Chinese nicknames (大猫, 瞎子, 杜期瑜); six new
    names common after 521 (Peraya 裴拉娅, Sun Miao 孙缈, Ais 艾思, Old Gallon 老加仑, Dragon King 龙王, Dagger of the
    Stars 群星匕首). Left without Chinese on purpose: names that are also common words (An Jing 安静, Ji Ran 既然) and
    early characters that do not appear after 520.
- **Check the original (2026-11-20, owner's ask: "Granny's—" in a translation was 姥姥的, Da Yi's catchphrase):** in a
  translated chapter, select English words; the bar shows "Original" (`src/pages/FixLine.tsx`, logic
  `src/translate/fixLine.ts`). It shows the English paragraph and the Chinese one it came from (same paragraph number;
  a best guess when the counts differ). "Find the Chinese" asks the model which words became the selection, what they
  mean and a better English (one small call, added to the book's spend; the Chinese must be in the paragraph or it is
  not trusted), or "Use my selection" takes Chinese selected by hand, for free. "Save the fix" changes those words in
  this chapter's saved translation and adds a locked glossary entry (or updates the one with the same Chinese), so later
  chapters follow it. The guide now has 姥姥的 too.
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
npm test          # 215 unit tests
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
