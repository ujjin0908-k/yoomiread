import { useMemo } from 'react';
import { useObjectUrl } from './images';

/**
 * A picture as it is saved on the phone: its bytes and type, not a Blob.
 * Safari on iPhone often fails to save a record again once it holds a Blob it read back from storage
 * ("Error preparing Blob/File data to be stored in object store"), which broke every later change to that book.
 * Plain bytes have no such problem.
 */
export interface Picture {
  type: string;
  bytes: ArrayBuffer;
}

export function isPicture(value: unknown): value is Picture {
  return !!value && typeof value === 'object' && (value as Picture).bytes instanceof ArrayBuffer && typeof (value as Picture).type === 'string';
}

export async function toPicture(blob: Blob): Promise<Picture> {
  return { type: blob.type || 'image/jpeg', bytes: await blob.arrayBuffer() };
}

/** A Blob to show a picture. Pictures saved by older versions are still Blobs, and are passed through. */
export function pictureBlob(picture: Picture | Blob | undefined): Blob | undefined {
  if (!picture) return undefined;
  if (picture instanceof Blob) return picture;
  return isPicture(picture) ? new Blob([picture.bytes], { type: picture.type }) : undefined;
}

/** A picture address for showing a picture. With a `key` the address lasts across pages (see useObjectUrl). */
export function usePictureUrl(picture: Picture | Blob | undefined, key?: string): string | undefined {
  const blob = useMemo(() => pictureBlob(picture), [picture]);
  return useObjectUrl(blob, key);
}

/**
 * Turns an old Blob value into bytes. A Blob Safari can no longer read comes back empty: the record loses that
 * picture but can be saved again, instead of failing on every change.
 */
export async function asStored(value: unknown): Promise<Picture | undefined> {
  if (value === undefined || value === null) return undefined;
  if (isPicture(value)) return value;
  if (value instanceof Blob) {
    try {
      return await toPicture(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
