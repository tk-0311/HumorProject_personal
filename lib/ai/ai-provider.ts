// Provider calls are owned by prompt_chain. This error type is retained for application diagnostics.
export class ProviderError extends Error {
  constructor(message: string, public status?: number, public phase: 'provider_request' | 'provider_response' | 'output_validation' = status === undefined ? 'provider_request' : 'provider_response') { super(message); }
}
