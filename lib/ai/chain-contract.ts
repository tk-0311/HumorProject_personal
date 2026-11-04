// Shared wire format: keep identical in all three repositories.
export type PromptStep = { id: string; position?: number; title: string; prompt: string; model: string; model_id: string; include_image: boolean; output_type: 'text' | 'image'; enabled?: boolean };
export type CaptionPromptChain = { id: string; revision: number; name: string; description: string; surface?: 'humor_project' | 'admin_panel'; steps: PromptStep[] };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseCaptionPromptChain(value: unknown): CaptionPromptChain | null {
  if (!value || typeof value !== 'object') return null;
  const chain = value as CaptionPromptChain;
  if (!UUID.test(chain.id) || !Number.isInteger(chain.revision) || chain.revision < 1 || typeof chain.name !== 'string' || !chain.name.trim() || chain.name.length > 100 || typeof chain.description !== 'string' || chain.description.length > 1000 || !Array.isArray(chain.steps) || chain.steps.length < 1 || chain.steps.length > 20) return null;
  const ids = new Set<string>();
  for (const step of chain.steps) {
    if (!step || typeof step !== 'object' || !UUID.test(step.id) || ids.has(step.id) || !UUID.test(step.model_id) || typeof step.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(step.model) || step.model.includes('://') || typeof step.title !== 'string' || !step.title.trim() || step.title.length > 100 || typeof step.prompt !== 'string' || !step.prompt.trim() || step.prompt.length > 12000 || typeof step.include_image !== 'boolean' || !['text','image'].includes(step.output_type) || (step.enabled !== undefined && typeof step.enabled !== 'boolean') || (step.position !== undefined && (!Number.isInteger(step.position) || step.position < 0 || step.position > 19))) return null;
    ids.add(step.id);
  }
  const active = chain.steps.filter(step => step.enabled !== false);
  if (!active.length || !active[0].include_image || active.some(step => step.output_type !== 'text')) return null;
  for (const [index, step] of active.entries()) for (const match of step.prompt.matchAll(/\{\{step:(\d+)\}\}/g)) if (+match[1] < 1 || +match[1] > index) return null;
  return chain;
}
