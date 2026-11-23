"""Kaikki (Wiktionary) Korean JSONL -> {word: [pron, "line per sense"]} gzipped JSON. Inflected forms point to their
dictionary word as {form: ["=먹다", ""]}, so a tapped 먹었다 finds 먹다."""
import gzip, json, re, sys
src, out = sys.argv[1], sys.argv[2]
SKIP = {'character', 'syllable', 'root', 'romanization', 'symbol'}
POS = {'noun': 'noun', 'verb': 'verb', 'adj': 'adjective', 'adv': 'adverb', 'name': 'name', 'num': 'number', 'pron': 'pronoun',
       'intj': 'interjection', 'suffix': 'suffix', 'prefix': 'prefix', 'particle': 'particle', 'det': 'determiner', 'phrase': 'phrase', 'counter': 'counter'}
HANGUL = re.compile(r'^[가-힣]+$')
words, forms = {}, {}
with open(src, encoding='utf-8') as f:
    for line in f:
        o = json.loads(line)
        w, pos = o.get('word', ''), o.get('pos', '')
        if not w or pos in SKIP: continue
        glosses = []
        for s in o.get('senses', [])[:3]:
            g = '; '.join(x for x in s.get('glosses', [])[:2] if x)
            if g and 'form-of' not in s.get('tags', []): glosses.append(g)
        if not glosses: continue
        label = POS.get(pos, '')
        text = '\n'.join((f'({label}) ' if label else '') + g for g in glosses)
        roman = next((x['form'] for x in o.get('forms', []) if 'romanization' in (x.get('tags') or [])), '')
        hanja = next((x['form'] for x in o.get('forms', []) if 'hanja' in (x.get('tags') or [])), '')
        pron = ' · '.join(p for p in (roman, hanja) if p)
        if w in words:
            if text not in words[w][1] and len(words[w][1]) < 300: words[w][1] += '\n' + text
            if not words[w][0]: words[w][0] = pron
        else:
            words[w] = [pron, text]
        if pos in ('verb', 'adj'):
            for x in o.get('forms', []):
                form = x.get('form', '')
                if form != w and HANGUL.match(form or ''): forms.setdefault(form, w)
d = dict(words)
for form, lemma in forms.items():
    if form not in d: d[form] = ['=' + lemma, '']
for k in d: d[k][1] = d[k][1][:400]
with gzip.open(out, 'wt', encoding='utf-8', compresslevel=9) as f:
    json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
print('words', len(words), 'forms', len(forms))
