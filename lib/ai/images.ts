export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const CAPTION_IMAGE_BUCKET = 'caption-images';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = typeof IMAGE_TYPES[number];
export function imageFileError(size: number, type: string): string | null {
  if (size <= 0) return 'Choose an image that is not empty.';
  if (size > MAX_IMAGE_BYTES) return 'Choose an image smaller than 3 MB.';
  if (!IMAGE_TYPES.includes(type as ImageType)) return 'Choose a JPEG, PNG, or WebP image.';
  return null;
}
/** Reject disguised SVG/HTML and mismatched content types before storage or Gemini. */
export function matchesImageSignature(bytes: Uint8Array, type: string): boolean {
  if (bytes.length < 12) return false;
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  if (type === 'image/webp') return String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  return false;
}
export function imageExtension(type: ImageType) { return type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'; }
