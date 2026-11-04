import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { allCaptionOptionsSchema } from './caption-choices';
import { compatibleBaseUrl, type AiModel } from './model-types';

export class ProviderError extends Error {
  constructor(message: string, public status?: number, public phase: 'provider_request' | 'provider_response' | 'output_validation' = status === undefined ? 'provider_request' : 'provider_response') { super(message); }
}
const captionsSchema = {
  type: 'object', properties: { captions: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 } },
  required: ['captions'], additionalProperties: false,
};
type Stage = { prompt: string; image?: { mimeType: string; base64: string }; final: boolean; allStyles?: boolean };
type ProviderRequest = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

export function buildProviderRequest(model: AiModel, key: string, stage: Stage): ProviderRequest {
  const { prompt, image, final } = stage;
  const schema = stage.allStyles ? allCaptionOptionsSchema() : captionsSchema;
  const imageUrl = image ? `data:${image.mimeType};base64,${image.base64}` : undefined;
  if (model.provider === 'gemini') return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.model_id)}:generateContent`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: { contents: [{ role: 'user', parts: [{ text: prompt }, ...(image ? [{ inlineData: { mimeType: image.mimeType, data: image.base64 } }] : [])] }],
      generationConfig: { maxOutputTokens: final ? 4096 : 2048, ...(final ? { responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } } } : {}) } },
  };
  if (model.provider === 'openai') return {
    url: 'https://api.openai.com/v1/responses', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: { model: model.model_id, store: false, max_output_tokens: final ? 4096 : 2048,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, ...(image ? [{ type: 'input_image', image_url: imageUrl, detail: 'auto' }] : [])] }],
      ...(final ? { text: { format: { type: 'json_schema', name: 'caption_options', strict: true, schema } } } : {}) },
  };
  if (model.provider === 'anthropic') return {
    url: 'https://api.anthropic.com/v1/messages', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: { model: model.model_id, max_tokens: final ? 4096 : 2048,
      messages: [{ role: 'user', content: [...(image ? [{ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } }] : []), { type: 'text', text: prompt }] }],
      // Anthropic only supports minItems 0/1, so cardinality is enforced
      // by the shared caption validator after its structured JSON response.
      ...(final ? { output_config: { format: { type: 'json_schema', schema: stage.allStyles ? allCaptionOptionsSchema(true) : { ...captionsSchema, properties: { captions: { type: 'array', items: { type: 'string' }, description: 'Exactly three distinct captions.' } } } } } } : {}) },
  };
  const base = model.provider === 'grok' ? 'https://api.x.ai/v1' : compatibleBaseUrl(model.api_base_url);
  return {
    url: `${base}/chat/completions`, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: { model: model.model_id, max_tokens: final ? 4096 : 2048,
      messages: [{ role: 'user', content: image ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] : prompt }],
      // Generic compatible APIs vary in JSON-schema support. The prompt and
      // application validation enforce the output contract on these providers.
      ...(final && model.provider === 'grok' ? { response_format: { type: 'json_schema', json_schema: { name: 'caption_options', strict: true, schema } } } : {}) },
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function objects(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(object) : []; }
function joinText(parts: Record<string, unknown>[]): string { return parts.map(part => typeof part.text === 'string' ? part.text : '').join(''); }
export function parseProviderText(provider: AiModel['provider'], body: unknown): string {
  const data = object(body);
  const unfinished = () => new ProviderError('The model could not finish these captions. Try another photo or model.', 200, 'output_validation');
  let text: unknown;
  if (provider === 'gemini') {
    const candidate = objects(data.candidates)[0] ?? {};
    if (candidate.finishReason !== 'STOP') throw unfinished();
    text = joinText(objects(object(candidate.content).parts).filter(part => !part.thought));
  } else if (provider === 'openai') {
    if (data.status !== 'completed') throw unfinished();
    text = joinText(objects(data.output).filter(item => item.type === 'message').flatMap(item => objects(item.content)).filter(part => part.type === 'output_text'));
  } else if (provider === 'anthropic') {
    if (data.stop_reason !== 'end_turn') throw unfinished();
    text = joinText(objects(data.content).filter(part => part.type === 'text'));
  } else {
    const choice = objects(data.choices)[0] ?? {};
    const message = object(choice.message);
    if (choice.finish_reason !== 'stop' || message.refusal) throw unfinished();
    text = message.content;
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 12000) throw new ProviderError('The model returned unusable captions. Please try again.', 200, 'output_validation');
  return text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
}

const blocked = new BlockList();
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(net, prefix, 'ipv4');
const publicV6 = new BlockList(); publicV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && publicV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

async function customRequest(config: ProviderRequest): Promise<{ status: number; body: unknown }> {
  const url = new URL(config.url);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new ProviderError('The custom API must resolve to a public internet address.');
  const target = addresses[0];
  // Connect to the validated IP; TLS still verifies the original hostname.
  // No redirect is followed, so credentials cannot be forwarded to another host.
  return new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: target.address, family: target.family, servername: url.hostname, port: 443,
      path: url.pathname, method: 'POST', headers: { ...config.headers, Host: url.host }, signal: AbortSignal.timeout(25000),
    }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 1024 * 1024) { response.destroy(new Error('Provider response too large')); return; } chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve({ status: response.statusCode ?? 502, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { reject(new ProviderError('The provider returned an invalid response.', response.statusCode, 'output_validation')); }
      });
    });
    request.on('error', () => reject(new ProviderError('Could not reach the AI provider. Please try again.')));
    request.end(JSON.stringify(config.body));
  });
}

export async function requestCaptionStage(model: AiModel, key: string, stage: Stage, transport: typeof fetch = fetch): Promise<string> {
  const config = buildProviderRequest(model, key, stage);
  let status: number; let body: unknown;
  try {
    if (model.provider === 'openai_compatible') ({ status, body } = await customRequest(config));
    else {
      const response = await transport(config.url, { method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25000), headers: config.headers, body: JSON.stringify(config.body) });
      status = response.status;
      body = await response.json().catch(() => null);
    }
  } catch (cause) {
    if (cause instanceof ProviderError) throw cause;
    throw new ProviderError('Could not reach the AI provider. Please try again.');
  }
  if (status < 200 || status >= 300) {
    // Raw provider errors can echo keys, prompts, or image data. Never forward them.
    const message = status === 401 || status === 403 ? 'The provider rejected this API key. Check the model’s key and account access.'
      : status === 429 ? 'The AI provider is busy or its quota is exhausted. Please try later.'
      : status >= 500 ? 'The AI provider is temporarily unavailable. Please try again.'
      : 'The provider rejected this request. Check the model ID, API access, image support, and structured-output support.';
    throw new ProviderError(message, status);
  }
  return parseProviderText(model.provider, body);
}
