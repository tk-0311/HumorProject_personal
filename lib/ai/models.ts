import type { SupabaseClient } from '@supabase/supabase-js';

import { publicModel, type ModelCatalog } from './model-types';
export { selectModel } from './model-types';
export type { AiModel, ModelSurface, ModelCatalog } from './model-types';

export async function loadModelCatalog(client: SupabaseClient): Promise<ModelCatalog> {
  const [models, defaults] = await Promise.all([
    client.from('ai_models').select('id,name,model_id,provider,api_base_url,has_api_key').order('name').order('id'),
    client.from('ai_model_defaults').select('surface,model_id'),
  ]);
  if (models.error || defaults.error) throw new Error('Could not load AI models. Please try again later.');
  return { models: models.data.map(publicModel), defaults: Object.fromEntries(defaults.data.map(row => [row.surface, row.model_id])) };
}
