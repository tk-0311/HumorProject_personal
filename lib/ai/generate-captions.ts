import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModelCatalog } from './model-types';
import type { CaptionPromptChain } from './prompt-chain';
import type { GenerationStyle } from './caption-choices';
import { loadModelApiKey } from './model-credentials';
import { runCaptionChain } from './caption-chain-runner';
import { requestCaptionStage } from './ai-provider';
import { withChainResponseHistory } from './chain-responses';

export async function generateWithChain(
  client: SupabaseClient, catalog: ModelCatalog, chain: CaptionPromptChain,
  style: GenerationStyle, image: { mimeType: string; base64: string },
  onAttempt: (model: string, status?: number) => void,
): Promise<{ captions: string[]; model: string }> {
  return withChainResponseHistory(client, catalog, chain, 'humor_project', capture =>
    runCaptionChain(catalog, chain, style, image, model => loadModelApiKey(client, model), onAttempt, requestCaptionStage, capture));
}
