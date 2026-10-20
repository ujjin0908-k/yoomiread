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

export function useObjectUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
