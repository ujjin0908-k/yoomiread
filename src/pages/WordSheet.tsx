import { useEffect, useState } from 'react';
import { Sheet } from '../components';
import { db } from '../db';
import { newId } from '../logic';

interface Definition {
  partOfSpeech: string;
  text: string;
}

async function englishDefinitions(word: string): Promise<Definition[]> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!res.ok) return [];
  const entries = (await res.json()) as { meanings?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[] }[];
  return (entries[0]?.meanings ?? []).flatMap((m) =>
    (m.definitions ?? []).slice(0, 2).map((d) => ({ partOfSpeech: m.partOfSpeech ?? '', text: d.definition ?? '' })),
  ).filter((d) => d.text).slice(0, 5);
}

async function wikiSummary(word: string, lang: 'en' | 'zh'): Promise<string | undefined> {
  const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`);
  if (!res.ok) return undefined;
  const body = (await res.json()) as { extract?: string };
  return body.extract || undefined;
}

/** A word tapped in the reader: its meaning from a dictionary and Wikipedia, and a way to keep it. */
export function WordSheet({ word, bookId, lang, onClose }: { word: string; bookId: string; lang: 'en' | 'zh'; onClose: () => void }) {
  const [defs, setDefs] = useState<Definition[] | undefined>();
  const [wiki, setWiki] = useState<string | undefined>();
  const [english, setEnglish] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    setDefs(undefined);
    setWiki(undefined);
    const dictionary = lang === 'en' ? englishDefinitions(word) : Promise.resolve([]);
    dictionary.then((d) => live && setDefs(d)).catch(() => live && setDefs([]));
    wikiSummary(word, lang).then((w) => live && setWiki(w ?? '')).catch(() => live && setWiki(''));
    return () => {
      live = false;
    };
  }, [word, lang]);

  async function keep() {
    const now = Date.now();
    await db.glossary.add({
      id: newId(),
      bookId,
      original: word,
      english: english.trim(),
      kind: 'term',
      locked: false,
      status: 'ok',
      createdAt: now,
      updatedAt: now,
    });
    setSaved(true);
  }

  const wikiPage = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(word)}`;
  const mdbg = `https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=${encodeURIComponent(word)}`;

  return (
    <Sheet title={word} onClose={onClose}>
      <div className="form">
        <p className="small muted">Dictionary</p>
        {defs === undefined && <p className="small">Looking up…</p>}
        {defs?.length === 0 && <p className="small">No dictionary entry found.</p>}
        {defs?.map((d, i) => (
          <p key={i} className="small">
            <em>{d.partOfSpeech}</em> {d.text}
          </p>
        ))}
        {lang === 'zh' && (
          <a className="btn ghost" href={mdbg} target="_blank" rel="noopener noreferrer">
            Open in MDBG dictionary
          </a>
        )}

        <p className="small muted">Wikipedia</p>
        {wiki === undefined && <p className="small">Looking up…</p>}
        {wiki === '' && <p className="small">No Wikipedia article found.</p>}
        {wiki && <p className="small">{wiki}</p>}
        <a className="btn ghost" href={wikiPage} target="_blank" rel="noopener noreferrer">
          Open on Wikipedia
        </a>

        <p className="small muted">Keep it in the glossary</p>
        {saved ? (
          <p className="small">Saved to the glossary.</p>
        ) : (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void keep();
            }}
          >
            <label>
              English
              <input value={english} onChange={(e) => setEnglish(e.target.value)} required />
            </label>
            <button className="btn primary" type="submit" disabled={!english.trim()}>
              Add to glossary
            </button>
          </form>
        )}
      </div>
    </Sheet>
  );
}
