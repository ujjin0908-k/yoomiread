import { useEffect, useState } from 'react';

/** Shrinks a photo to at most `max` px wide and saves it as JPEG. */
export async function shrinkImage(file: Blob, max = 720): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((done, fail) =>
    canvas.toBlob((b) => (b ? done(b) : fail(new Error('Could not read that image.'))), 'image/jpeg', 0.85),
  );
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
