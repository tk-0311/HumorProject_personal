// Server-to-server authentication. Keep identical in all three repositories.
import { createHash, createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';

function signingKey(secret = process.env.AI_MODEL_ENCRYPTION_KEY) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error('Set the same AI_MODEL_ENCRYPTION_KEY on the calling app and Prompt Studio.');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'hex'), Buffer.from('prompt-chain-service-v1'), Buffer.from('request-signing'), 32));
}
function signature(path: string, body: string, token: string, timestamp: string, nonce: string, secret?: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  return createHmac('sha256', signingKey(secret)).update(['v1', 'POST', path, timestamp, nonce, digest(token), digest(body)].join('\n')).digest('hex');
}
export function serviceHeaders(path: string, body: string, token: string, secret?: string, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000)); const nonce = randomUUID();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Prompt-Chain-Time': timestamp, 'X-Prompt-Chain-Nonce': nonce, 'X-Prompt-Chain-Signature': signature(path, body, token, timestamp, nonce, secret) };
}
export function verifyServiceRequest(request: Request, body: string, secret?: string, now = Date.now()): string | null {
  if (request.method !== 'POST') return null;
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]{1,8192})$/)?.[1];
  const timestamp = request.headers.get('x-prompt-chain-time') ?? ''; const nonce = request.headers.get('x-prompt-chain-nonce') ?? ''; const supplied = request.headers.get('x-prompt-chain-signature') ?? '';
  if (!token || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 120 || !/^[a-f0-9-]{36}$/i.test(nonce) || !/^[a-f0-9]{64}$/.test(supplied)) return null;
  const expected = signature(new URL(request.url).pathname, body, token, timestamp, nonce, secret);
  return timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex')) ? token : null;
}
