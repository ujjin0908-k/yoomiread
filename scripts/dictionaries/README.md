# Rebuilding the Japanese and Korean dictionaries

The files in `public/dict/` are built from public dictionary data (credits: `public/dict/NOTICE.txt`).

Japanese, from JMdict (EDRDG, CC BY-SA 4.0):

```sh
curl -o JMdict_e.gz http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
python3 -I scripts/dictionaries/build_ja.py JMdict_e.gz public/dict/ja.json.gz public/dict/ja-more.json.gz
```

Korean, from Wiktionary via Kaikki (CC BY-SA 4.0), about 200 MB to download:

```sh
curl -o korean.jsonl https://kaikki.org/dictionary/Korean/kaikki.org-dictionary-Korean.jsonl
python3 -I scripts/dictionaries/build_ko.py korean.jsonl public/dict/ko.json.gz
```

Built 2026-11-23: Japanese 67,973 common spellings (1.3 MB) and 247,227 more (5.9 MB); Korean 34,937 words and
324,227 inflected forms (2.3 MB).
