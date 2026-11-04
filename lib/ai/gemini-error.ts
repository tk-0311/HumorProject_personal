type JsonObject = Record<string, unknown>;
const asObject = (value: unknown): JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {};

export function shouldFallbackGeminiModel(httpStatus: number, googleStatus: string): boolean {
  return httpStatus === 503 || googleStatus === 'UNAVAILABLE';
}

// Provider errors can echo credentials or inline image data. Never log the
// request, headers, full response, or Google's error metadata.
export function describeGeminiError(httpStatus: number, body: unknown, apiKey: string) {
  const error = asObject(asObject(body).error);
  const redact = (value: unknown) => {
    if (typeof value !== 'string') return '';
    let text = value;
    for (const secret of [apiKey, encodeURIComponent(apiKey)]) {
      if (secret) text = text.split(secret).join('[REDACTED]');
    }
    return text
      .replace(/AIza[\w-]+/g, '[REDACTED]')
      .replace(/((?:[?&](?:key|api_key)=|x-goog-api-key["'\s:=]+))[^\s&"']+/gi, '$1[REDACTED]')
      .replace(/[A-Za-z0-9+/_=-]{80,}/g, '[DATA REDACTED]')
      .replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ')
      .slice(0, 600);
  };
  const token = (value: unknown) => {
    const text = redact(value);
    return /^[A-Z][A-Z_]{1,79}$/.test(text) ? text : '';
  };
  const googleStatus = token(error.status);
  const details = Array.isArray(error.details) ? error.details : [];
  const reason = details.map(detail => token(asObject(detail).reason)).find(Boolean) ?? '';
  const detail = redact(error.message);

  let message = 'Gemini rejected the caption request. Please try another photo.';
  if (/API_KEY|CREDENTIAL/.test(reason) || httpStatus === 401) {
    message = 'Caption generation has an API key configuration problem. The site owner needs to check the Gemini key.';
  } else if (httpStatus === 403) {
    message = 'Caption generation does not have permission to use Gemini. The site owner needs to check API access.';
  } else if (httpStatus === 404) {
    message = 'The configured Gemini model is unavailable. The site owner needs to check the model setting.';
  } else if (httpStatus === 429) {
    message = 'Gemini is busy or its quota is exhausted. Please try later.';
  } else if (httpStatus >= 500) {
    message = 'Gemini is temporarily unavailable. Please try again shortly.';
  } else if (httpStatus === 400) {
    message = 'Gemini could not accept this generation request. The site owner needs to check the request configuration.';
  }

  return { message, diagnostic: { httpStatus, googleStatus, reason, detail } };
}
