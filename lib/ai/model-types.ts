export const PROVIDERS = {
  gemini: 'Google Gemini', openai: 'OpenAI', grok: 'Grok (xAI)',
  anthropic: 'Anthropic', openai_compatible: 'Other (OpenAI-compatible)',
} as const;
export type AiProvider = keyof typeof PROVIDERS;
export type AiModel = { id: string; name: string; model_id: string; provider: AiProvider; api_base_url?: string | null; has_api_key?: boolean };
export type ModelSurface = 'admin_panel' | 'humor_project';
export type ModelCatalog = { models: AiModel[]; defaults: Partial<Record<ModelSurface, string>> };

export function publicModel(model: AiModel): AiModel {
  return { id: model.id, name: model.name, model_id: model.model_id, provider: model.provider,
    api_base_url: model.api_base_url ?? null, has_api_key: model.has_api_key === true };
}

export function compatibleBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new Error('Enter the provider’s HTTPS API base URL.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid HTTPS API base URL.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port
    || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')
    || /\.(localhost|local|internal|test|invalid|example)$/.test(host) || host.endsWith('.')
    || /\/chat\/completions\/?$/.test(url.pathname)) {
    throw new Error('Use a public HTTPS API base URL, such as https://openrouter.ai/api/v1, without credentials, a port, or /chat/completions.');
  }
  return url.href.replace(/\/+$/, '');
}

export function apiKeyPayload(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 4096 || /\s/.test(value.trim()) || !value.trim()) throw new Error('Enter a valid API key without spaces (up to 4096 characters).');
  return value.trim();
}

export function modelPayload(value: unknown): { name: string; model_id: string; provider: AiProvider; api_base_url: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter a model name, provider, and model ID.');
  const body = value as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const modelId = typeof body.model_id === 'string' ? body.model_id.trim() : '';
  if (!name || name.length > 80) throw new Error('Use a model name of 1–80 characters.');
  const provider = body.provider ?? 'gemini';
  if (typeof provider !== 'string' || !Object.hasOwn(PROVIDERS, provider)) throw new Error('Choose a supported provider.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(modelId) || modelId.includes('://') || modelId.length > 100) throw new Error('Enter the provider’s exact model ID (up to 100 characters).');
  if (provider === 'gemini' && !/^gemini-[a-zA-Z0-9.-]+$/.test(modelId)) throw new Error('Gemini model IDs must start with gemini-.');
  if (provider !== 'openai_compatible' && body.api_base_url) throw new Error('Custom API URLs are only supported for OpenAI-compatible providers.');
  return { name, model_id: modelId, provider: provider as AiProvider, api_base_url: provider === 'openai_compatible' ? compatibleBaseUrl(body.api_base_url) : null };
}

export function selectModel(catalog: ModelCatalog, surface: ModelSurface, requested: unknown): AiModel | undefined {
  if (requested !== null && requested !== undefined && requested !== '' && typeof requested !== 'string') return undefined;
  const id = requested || catalog.defaults[surface];
  return catalog.models.find(model => model.id === id);
}
