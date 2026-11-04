import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AiModel } from './model-types';

function encryptionKey(value = process.env.AI_MODEL_ENCRYPTION_KEY): Buffer {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('API key storage needs the same AI_MODEL_ENCRYPTION_KEY on both app servers.');
  return Buffer.from(value, 'hex');
}
const context = (model: AiModel) => Buffer.from(JSON.stringify([model.id, model.provider, model.model_id, model.api_base_url ?? null]));

export function encryptApiKey(value: string, model: AiModel, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(context(model));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptApiKey(value: string, model: AiModel, secret?: string): string {
  try {
    const [version, iv, tag, encrypted, extra] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted || extra !== undefined) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAAD(context(model));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch { throw new Error('Could not open the saved API key. Check that both servers use the same AI_MODEL_ENCRYPTION_KEY, or replace the key on the Models page.'); }
}
