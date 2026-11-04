import { ProviderError } from './ai-provider';
import type { AiModel } from './model-types';
import type { CaptionPromptChain } from './prompt-chain';

export type FailurePhase = 'input_validation' | 'chain_configuration' | 'credentials' | 'provider_request' | 'provider_response' | 'output_validation' | 'image_upload' | 'draft_save';
export type ChainFailureContext = {
  surface?: 'admin_panel' | 'humor_project'; phase: FailurePhase;
  stepId?: string; stepIndex?: number; stepCount?: number; stepPosition?: number;
  stepTitle?: string; stepDurationMs?: number; provider?: AiModel['provider']; includeImage?: boolean;
};

export class ChainFailure extends ProviderError {
  readonly httpStatus: number;
  readonly errorCategory: string;
  constructor(message: string, public context: ChainFailureContext, public model?: string, status?: number) {
    super(message, status);
    this.httpStatus = ['chain_configuration', 'credentials'].includes(context.phase) ? 503 : 502;
    this.errorCategory = context.phase === 'chain_configuration' ? 'chain_configuration_error' : `chain_${context.phase}_error`;
  }
}

export function stepFailure(
  chain: CaptionPromptChain, index: number, phase: FailurePhase, message: string,
  model?: AiModel, status?: number, startedAt?: number,
): ChainFailure {
  const step = chain.steps[index];
  return new ChainFailure(message, { phase, stepId: step?.id, stepIndex: index + 1,
    stepCount: chain.steps.length, stepPosition: (step?.position ?? index) + 1,
    stepTitle: step?.title, provider: model?.provider, includeImage: step?.includeImage,
    ...(startedAt === undefined ? {} : { stepDurationMs: Math.min(120000, Math.max(0, Date.now() - startedAt)) }),
  }, model?.model_id, status);
}

/** Allow-listed metadata only. Never store provider error messages or outputs. */
export function telemetryChainContext(value?: ChainFailureContext): ChainFailureContext | null {
  if (!value) return null;
  return { surface: value.surface, phase: value.phase, stepId: value.stepId,
    stepIndex: value.stepIndex, stepCount: value.stepCount, stepPosition: value.stepPosition,
    stepTitle: value.stepTitle?.slice(0, 80), stepDurationMs: value.stepDurationMs,
    provider: value.provider, includeImage: value.includeImage };
}
