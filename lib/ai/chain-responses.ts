import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModelCatalog } from './model-types';
import type { CaptionPromptChain } from './prompt-chain';
import { ChainFailure } from './chain-diagnostics';

export type ChainResponseStep = {
  index: number; position: number; title: string;
  model: string | null; modelName: string | null; provider: string | null; includeImage: boolean;
  status: 'not_run' | 'completed' | 'failed'; response: string | null; durationMs: number | null;
};
export type ResponseObserver = (index: number, response: string, durationMs: number) => void;

// Keep response content in its own admin-only history, outside aggregate telemetry
// and the result returned to community users.
export async function withChainResponseHistory<T>(
  client: Pick<SupabaseClient, 'rpc'>, catalog: ModelCatalog, chain: CaptionPromptChain,
  surface: 'admin_panel' | 'humor_project', execute: (capture: ResponseObserver) => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const steps: ChainResponseStep[] = chain.steps.map((step, index) => {
    const model = catalog.models.find(item => item.id === step.modelId);
    return { index: index + 1, position: (step.position ?? index) + 1, title: step.title.slice(0, 80),
      model: model?.model_id ?? null, modelName: model?.name.slice(0, 100) ?? null,
      provider: model?.provider ?? null, includeImage: step.includeImage,
      status: 'not_run', response: null, durationMs: null };
  });
  let status: 'completed' | 'failed' = 'completed';
  let failurePhase: string | null = null;
  try {
    return await execute((index, response, durationMs) => {
      const step = steps[index];
      if (!step) return;
      step.status = 'completed';
      step.response = response.slice(0, 12000);
      step.durationMs = Math.min(120000, Math.max(0, Math.round(durationMs)));
    });
  } catch (error) {
    status = 'failed';
    failurePhase = error instanceof ChainFailure ? error.context.phase : 'unknown';
    const step = error instanceof ChainFailure && error.context.stepIndex
      ? steps[error.context.stepIndex - 1] : undefined;
    if (step) {
      step.status = 'failed';
      step.durationMs ??= error instanceof ChainFailure ? error.context.stepDurationMs ?? null : null;
    }
    throw error;
  } finally {
    try {
      const { error } = await client.rpc('record_caption_chain_run', {
        p_surface: surface, p_status: status, p_duration_ms: Math.min(600000, Math.max(0, Date.now() - startedAt)),
        p_steps: steps, p_failure_phase: failurePhase,
      }).abortSignal(AbortSignal.timeout(5000));
      if (error) console.warn('[chain-responses] Could not save response history:', error.code);
    } catch {
      console.warn('[chain-responses] Could not save response history.');
    }
  }
}

