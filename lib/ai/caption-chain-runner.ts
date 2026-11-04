import type { AiModel, ModelCatalog } from './model-types';
import { ProviderError, requestCaptionStage } from './ai-provider';
import { buildCaptionStagePrompt, type CaptionPromptChain } from './prompt-chain';
import { parseCaptionOptions } from './caption-options';
import { parseAllCaptionOptions, type GenerationStyle } from './caption-choices';
import { stepFailure } from './chain-diagnostics';
import type { ResponseObserver } from './chain-responses';

export async function runCaptionChain(
  catalog: ModelCatalog, chain: CaptionPromptChain, style: GenerationStyle,
  image: { mimeType: string; base64: string }, loadKey: (model: AiModel) => Promise<string>,
  onAttempt: (model: string, status?: number) => void,
  request = requestCaptionStage,
  onResponse?: ResponseObserver,
): Promise<{ captions: string[]; model: string }> {
  if (!chain.steps.length || !chain.steps[0].includeImage) throw stepFailure(chain, 0, 'chain_configuration', 'The first active prompt link must receive the photo.');
  const models = chain.steps.map((step, index) => {
    const model = catalog.models.find(item => item.id === step.modelId);
    if (!model) throw stepFailure(chain, index, 'chain_configuration', 'A prompt link’s model is unavailable. Choose a registered model for every link in Prompt Studio.');
    return model;
  });
  // Check all credentials before spending provider credits on the first link.
  const keys = new Map(await Promise.all([...new Map(models.map(model => [model.id, model])).values()]
    .map(async model => {
      const startedAt = Date.now();
      try { return [model.id, await loadKey(model)] as const; }
      catch { throw stepFailure(chain, models.findIndex(item => item.id === model.id), 'credentials', 'Could not load this link’s API key. Check its saved key and server configuration.', model, undefined, startedAt); }
    })));
  let previous = '';
  let lastStartedAt = Date.now();
  for (let index = 0; index < chain.steps.length; index += 1) {
    const model = models[index];
    const stage = { prompt: buildCaptionStagePrompt(chain, style, index, previous),
      image: chain.steps[index].includeImage ? image : undefined, final: index === chain.steps.length - 1, allStyles: style === 'all' };
    onAttempt(model.model_id);
    lastStartedAt = Date.now();
    try { previous = await request(model, keys.get(model.id)!, stage); onAttempt(model.model_id, 200); }
    catch (error) {
      const status = error instanceof ProviderError ? error.status : undefined;
      onAttempt(model.model_id, status);
      throw stepFailure(chain, index, error instanceof ProviderError ? error.phase : 'provider_request',
        error instanceof ProviderError ? error.message : 'The provider request failed. Please try again.', model, status, lastStartedAt);
    }
    onResponse?.(index, previous, Date.now() - lastStartedAt);
    if (!stage.final && previous.length > 5000) throw stepFailure(chain, index, 'output_validation', 'A prompt step returned unusable content. Please try again.', model, 200, lastStartedAt);
  }
  let captions: string[];
  try { captions = style === 'all' ? parseAllCaptionOptions(previous) : parseCaptionOptions(previous); }
  catch { throw stepFailure(chain, models.length - 1, 'output_validation', 'The model returned unusable captions. Please try again.', models[models.length - 1], 200, lastStartedAt); }
  return { captions, model: models[models.length - 1].model_id };
}
