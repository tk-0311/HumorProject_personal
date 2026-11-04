'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { CAPTION_IMAGE_BUCKET } from '@/lib/ai/images';
import { uploadUniqueImage } from '@/lib/storage/image-deduplication';
import { resolveImageInput } from '@/lib/storage/saved-images';
import { validCaptionSelection } from '@/lib/ai/caption-options';
import { parseCaptionPromptChain } from '@/lib/ai/prompt-chain';
import { generateWithChain } from '@/lib/ai/generate-captions';
import { ProviderError } from '@/lib/ai/ai-provider';
import { ChainFailure, type ChainFailureContext } from '@/lib/ai/chain-diagnostics';
import { recordTelemetry } from '@/lib/telemetry';
import { loadModelCatalog, type ModelCatalog } from '@/lib/ai/models';

export type CaptionOptionsState = { error: string; draftId: string; captions: string[] };
export async function generateCaptionOptions(form: FormData): Promise<CaptionOptionsState> {
  const startedAt = Date.now();
  let telemetryRecorded = false;
  let telemetryContext: ChainFailureContext = { surface: 'humor_project', phase: 'input_validation' };
  let telemetryModel: string | undefined;
  let telemetryProviderStatus: number | undefined;
  const finish = async (state: CaptionOptionsState, success: boolean, errorCategory?: string): Promise<CaptionOptionsState> => {
    if (!telemetryRecorded) {
      telemetryRecorded = true;
      await recordTelemetry({ route: 'caption.generate', method: 'SERVER_ACTION', success, httpStatus: 200, durationMs: Date.now() - startedAt, errorCategory, providerStatus: telemetryProviderStatus, model: telemetryModel, chainContext: telemetryContext });
    }
    return state;
  };
  const failure = (error: string, category = 'validation'): Promise<CaptionOptionsState> => finish({ error, draftId: '', captions: [] }, false, category);
  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return failure('Please log in before generating captions.');
  let photo;
  try { photo = await resolveImageInput(supabase, form); }
  catch (error) { return failure((error as Error).message); }
  const imageBytes = Buffer.from(photo.bytes);
  telemetryContext = { surface: 'humor_project', phase: 'chain_configuration' };
  let catalog: ModelCatalog;
  try { catalog = await loadModelCatalog(supabase); }
  catch { return failure('Caption generation is temporarily unavailable. Please try again later.', 'configuration'); }
  const { data: allowed, error: limitError } = await supabase.rpc('claim_caption_attempt');
  if (limitError) return failure('Could not check your generation allowance. Please try again.');
  if (!allowed) return failure('You’ve generated your 10 caption sets for today. Come back tomorrow (UTC).');
  const configuredChainResult = await supabase.rpc('get_humor_project_caption_prompt_chain');
  const promptChain = parseCaptionPromptChain(configuredChainResult.data);
  if (configuredChainResult.error || !promptChain) return failure('Caption generation is temporarily unavailable. Please try again later.', 'configuration');
  const prompt = `Caption chain: ${promptChain.steps.map(step => step.title).join(' → ')}`;
  let captions: string[];
  let modelUsed: string;
  try {
    const result = await generateWithChain(supabase, catalog, promptChain, 'all',
      { mimeType: photo.mime, base64: imageBytes.toString('base64') },
      (model, status) => { telemetryModel = model; telemetryProviderStatus = status; });
    captions = result.captions; modelUsed = result.model;
  } catch (error) {
    if (error instanceof ChainFailure) {
      telemetryContext = { ...error.context, surface: 'humor_project' };
      telemetryModel = error.model; telemetryProviderStatus = error.status;
      return failure(error.status === 429 ? 'Caption generation is busy. Please try again shortly.' : 'Could not generate captions. Please try again later.', error.errorCategory);
    }
    if (error instanceof ProviderError) return failure(error.status === 429
      ? 'Caption generation is busy. Please try again shortly.'
      : 'Could not generate captions. Please try again or use another photo.', 'provider');
    return failure('Caption generation is temporarily unavailable. Please try again later.', 'configuration');
  }
  telemetryContext = { surface: 'humor_project', phase: 'image_upload' };
  let imagePath: string;
  try { imagePath = photo.path ?? (await uploadUniqueImage(supabase, { bucket: CAPTION_IMAGE_BUCKET, userId: user.id, bytes: imageBytes, contentType: photo.mime })).path; }
  catch { return failure('Your photo could not be checked or saved. Please try again.'); }
  telemetryContext = { surface: 'humor_project', phase: 'draft_save' };
  // Options, prompt, and image stay private until the owner chooses a caption.
  const { data, error } = await supabase.from('caption_drafts').insert({ user_id: user.id, image_path: imagePath, prompt, style: 'mixed', model: modelUsed, captions }).select('id').single();
  if (error || !data) {
    // This photo may be shared with a simultaneous draft save. Unused files can
    // be removed from the admin image library without deleting another draft's photo.
    return failure(error?.code === 'P0001'
      ? 'You’ve generated your 10 caption sets for today. Come back tomorrow (UTC).'
      : 'Your caption options could not be saved. Please try again.');
  }
  return finish({ error: '', draftId: data.id, captions }, true);
}

export async function publishCaptionChoice(draftId: string, index: number): Promise<{ error: string; id: string }> {
  const startedAt = Date.now();
  const finish = async (result: { error: string; id: string }, success: boolean, errorCategory?: string) => {
    await recordTelemetry({ route: 'caption.publish', method: 'SERVER_ACTION', success, httpStatus: 200, durationMs: Date.now() - startedAt, errorCategory });
    return result;
  };
  if (!validCaptionSelection(draftId, index)) return finish({ error: 'Choose one of the generated captions.', id: '' }, false, 'validation');
  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return finish({ error: 'Please log in before publishing.', id: '' }, false, 'authentication');
  // Atomic owner check + row lock + insert. A repeated request returns the same post.
  const { data: id, error } = await supabase.rpc('publish_caption_choice', { draft_id: draftId, choice_index: index });
  if (error || !id) return finish({ error: 'Your caption could not be published. Please try again.', id: '' }, false, 'database');
  revalidatePath('/'); revalidatePath('/captions');
  return finish({ error: '', id }, true);
}
