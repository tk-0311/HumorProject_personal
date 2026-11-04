import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiModel } from './model-types';
import { decryptApiKey } from './api-key-crypto';

export async function loadModelApiKey(client: SupabaseClient, model: AiModel): Promise<string> {
  const { data, error } = await client.from('ai_models').select('encrypted_api_key').eq('id', model.id).single();
  if (error || !data) throw new Error('Could not load the model’s API configuration. Please try again.');
  if (data.encrypted_api_key) return decryptApiKey(data.encrypted_api_key, model);
  const envKeys = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', grok: 'XAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai_compatible: '' };
  const key = process.env[envKeys[model.provider]] || (model.provider === 'grok' ? process.env.GROK_API_KEY : undefined);
  if (!key) throw new Error('This model needs an API key. Add one on the Models page or choose another model.');
  return key;
}
