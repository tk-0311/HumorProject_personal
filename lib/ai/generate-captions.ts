import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaptionPromptChain } from './prompt-chain';
import type { GenerationStyle } from './caption-choices';
import { validateAllCaptionOptions } from './caption-choices';
import { callPromptChain } from './prompt-chain-client';
import { ProviderError } from './ai-provider';
export async function generateWithChain(client: SupabaseClient, chain: CaptionPromptChain, style: GenerationStyle, image: { mimeType: string; base64: string }, onAttempt: (model: string, status?: number) => void): Promise<{ captions: string[]; model: string }> {
  const result = await callPromptChain(client, '/api/v1/captions', { surface: 'humor_project', chain_id: chain.id, revision: chain.revision, style, image: { mime_type: image.mimeType, base64: image.base64 } });
  if (result.chain_id !== chain.id || result.chain_revision !== chain.revision || typeof result.model !== 'string' || result.model.length > 100) throw new ProviderError('Prompt Studio returned an invalid chain result.', 502);
  let captions: string[];
  try {
    if (style === 'all') captions = validateAllCaptionOptions(result.captions);
    else { if (!Array.isArray(result.captions) || result.captions.length !== 3 || result.captions.some(c => typeof c !== 'string' || !c.trim() || c.length > 280) || new Set(result.captions.map(c=>String(c).trim().toLowerCase())).size !== 3) throw new Error(); captions = result.captions as string[]; }
  } catch { throw new ProviderError('Prompt Studio returned invalid caption options.', 502); }
  onAttempt(result.model, 200);
  return { captions, model: result.model };
}
