import { useEffect, useState } from 'react';

/** Shrinks a photo to at most `max` px wide and saves it as JPEG. */
export async function shrinkImage(file: Blob, max = 720): Promise<Blob> {
  const source = await decode(file);
  const scale = Math.min(1, max / source.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return new Promise((done, fail) =>
    canvas.toBlob((b) => (b ? done(b) : fail(new Error('Could not read that image.'))), 'image/jpeg', 0.85),
  );
}

/** A picture shaped like a book cover (clearly taller than wide), shrunk. Logos and banners come back empty. */
export async function coverShaped(file: Blob, max = 720): Promise<Blob | undefined> {
  const source = await decode(file);
  const tall = source.height / source.width >= 1.15;
  if ('close' in source) source.close();
  return tall ? shrinkImage(file, max) : undefined;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Some browsers only decode iPhone (HEIC) photos through an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error('Could not read that image.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Picture addresses kept per book, so the same cover is not decoded again each time a page is shown. */
const lasting = new Map<string, { blob: Blob; url: string }>();

function lastingUrl(key: string, blob: Blob): string {
  const hit = lasting.get(key);
  // A fresh read of the same picture is a new Blob with the same size and type: keep the address.
  if (hit && (hit.blob === blob || (hit.blob.size === blob.size && hit.blob.type === blob.type))) return hit.url;
  // A new picture: the old address is let go a little later, once nothing on screen still shows it.
  if (hit) window.setTimeout(() => URL.revokeObjectURL(hit.url), 10_000);
  const url = URL.createObjectURL(blob);
  lasting.set(key, { blob, url });
  return url;
}

/**
 * A picture address for a Blob. With a `key` (a book's id) the address lasts across pages and is ready on the
 * first draw, so a cover never flashes in after its page appears.
 */
export function useObjectUrl(blob?: Blob, key?: string): string | undefined {
  const kept = key && blob ? lastingUrl(key, blob) : undefined;
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (kept || !blob) return setUrl(undefined);
    setUrl(URL.createObjectURL(blob));
  }, [blob, kept]);
  // Revoke an old URL only after its replacement is on screen. Revoking it as soon as the blob changes
  // leaves the image pointing at a dead URL for one render, which shows as a broken picture.
  useEffect(() => {
    if (url) return () => URL.revokeObjectURL(url);
  }, [url]);
  return kept ?? url;
}
