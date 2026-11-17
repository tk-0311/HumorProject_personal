// Imported mock posts use Imgflip's public template CDN. Ordinary uploads
// continue to resolve through the private caption-images bucket.
export function mockMemeImageUrl(path: string | null | undefined): string | null {
  return path && /^https:\/\/i\.imgflip\.com\/[a-z0-9]+\.(?:jpg|png|webp)$/.test(path) ? path : null;
}
