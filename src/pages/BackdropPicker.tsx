import { DEFAULT_COVER, saveBookBackdrop } from '../backdrop';
import { shrinkImage } from '../images';
import { toPicture, usePictureUrl } from '../picture';
import type { Book } from '../types';
import { useState } from 'react';

/** This book's reading background: a picture of your own behind the pages, under the page colour. */
export function BackdropPicker({ book }: { book: Book }) {
  const backdrop = book.backdrop;
  const url = usePictureUrl(backdrop?.picture, `backdrop-${book.id}`);
  const [busy, setBusy] = useState(false);
  return (
    <div className="backdrop-pick">
      <span className="backdrop-title">Background for this book</span>
      {url && (
        <div className="backdrop-preview" style={{ backgroundImage: `url(${url})` }}>
          <span style={{ opacity: backdrop!.cover }} />
          <p>How a page looks over it.</p>
        </div>
      )}
      <div className="row">
        <label className="btn">
          {busy ? 'Saving…' : backdrop ? 'Change picture' : 'Choose a picture'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              try {
                await saveBookBackdrop(book.id, { picture: await toPicture(await shrinkImage(f, 1800)), cover: backdrop?.cover ?? DEFAULT_COVER });
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {backdrop && (
          <button type="button" className="btn ghost" onClick={() => void saveBookBackdrop(book.id, undefined)}>
            Remove
          </button>
        )}
      </div>
      {backdrop && (
        <label>
          Picture strength
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.05}
            value={1.45 - backdrop.cover}
            onChange={(e) => void saveBookBackdrop(book.id, { ...backdrop, cover: Math.round((1.45 - Number(e.target.value)) * 100) / 100 })}
          />
        </label>
      )}
    </div>
  );
}
