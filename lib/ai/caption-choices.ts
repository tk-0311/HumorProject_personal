// Keep the order aligned with the nine-option draft publication function.
export const CAPTION_STYLE_ORDER = ['dry', 'wholesome', 'absurd'] as const;
export type CaptionStyle = typeof CAPTION_STYLE_ORDER[number];
export type GenerationStyle = CaptionStyle | 'all';
export const CAPTIONS_PER_STYLE = 3;
export const ALL_CAPTION_COUNT = CAPTION_STYLE_ORDER.length * CAPTIONS_PER_STYLE;
export const CAPTION_STYLE_LABELS = { dry: 'Dry', wholesome: 'Wholesome', absurd: 'Absurd' } as const;

export function captionStyleForKey(style: CaptionStyle, key: string): CaptionStyle | null {
  const index = CAPTION_STYLE_ORDER.indexOf(style);
  if (key === 'Home') return CAPTION_STYLE_ORDER[0];
  if (key === 'End') return CAPTION_STYLE_ORDER[CAPTION_STYLE_ORDER.length - 1];
  if (key === 'ArrowRight') return CAPTION_STYLE_ORDER[(index + 1) % CAPTION_STYLE_ORDER.length];
  if (key === 'ArrowLeft') return CAPTION_STYLE_ORDER[(index + CAPTION_STYLE_ORDER.length - 1) % CAPTION_STYLE_ORDER.length];
  return null;
}

export function captionStyleAt(index: number): CaptionStyle | null {
  return Number.isInteger(index) && index >= 0 && index < ALL_CAPTION_COUNT
    ? CAPTION_STYLE_ORDER[Math.floor(index / CAPTIONS_PER_STYLE)]
    : null;
}

export function captionChoicesForStyle(captions: string[], style: CaptionStyle) {
  const offset = CAPTION_STYLE_ORDER.indexOf(style) * CAPTIONS_PER_STYLE;
  return captions.slice(offset, offset + CAPTIONS_PER_STYLE).map((caption, index) => ({ caption, index: offset + index }));
}

export function validateAllCaptionOptions(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== ALL_CAPTION_COUNT) throw new Error('Expected nine captions.');
  const captions = value.map((caption: unknown) => {
    if (typeof caption !== 'string' || !caption.trim() || caption.trim().length > 280) throw new Error('Invalid caption.');
    return caption.trim();
  });
  if (new Set(captions.map(caption => caption.toLowerCase())).size !== ALL_CAPTION_COUNT) throw new Error('Captions must be distinct.');
  return captions;
}

export function parseAllCaptionOptions(text: string): string[] {
  const result: unknown = JSON.parse(text);
  if (!result || typeof result !== 'object' || !('captions' in result) || !result.captions || typeof result.captions !== 'object' || Array.isArray(result.captions)) throw new Error('Expected three captions per style.');
  const groups = result.captions as Record<string, unknown>;
  const captions = CAPTION_STYLE_ORDER.flatMap(style => {
    const group = groups[style];
    if (!Array.isArray(group) || group.length !== CAPTIONS_PER_STYLE) throw new Error('Expected three captions per style.');
    return group;
  });
  return validateAllCaptionOptions(captions);
}

export function allCaptionOptionsSchema(anthropic = false) {
  const group = (style: CaptionStyle) => ({
    type: 'array', items: { type: 'string' },
    description: `Exactly three distinct ${style} captions, each 1–280 characters.`,
    ...(anthropic ? {} : { minItems: CAPTIONS_PER_STYLE, maxItems: CAPTIONS_PER_STYLE }),
  });
  return {
    type: 'object',
    properties: { captions: {
      type: 'object',
      properties: { dry: group('dry'), wholesome: group('wholesome'), absurd: group('absurd') },
      required: [...CAPTION_STYLE_ORDER], additionalProperties: false,
    } },
    required: ['captions'], additionalProperties: false,
  };
}

export const ALL_CAPTION_OUTPUT_CONTRACT = 'Required output contract (overrides any different count or format in the prompt step): Return only JSON with a captions object containing exactly three keys: dry, wholesome, absurd. Each key must contain exactly three strings, giving nine captions total. Example shape: {"captions":{"dry":["...","...","..."],"wholesome":["...","...","..."],"absurd":["...","...","..."]}}. All nine captions must be distinct, each 1–280 characters, with a different joke or angle. Dry: understated, deadpan observations. Wholesome: warm, playful, gentle humor. Absurd: surreal, unexpected exaggeration grounded in the photo. No numbering or explanations.';

