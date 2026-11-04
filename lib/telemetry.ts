import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { telemetryChainContext, type ChainFailureContext } from '@/lib/ai/chain-diagnostics';

export type TelemetryEvent = {
  route: string;
  method: 'SERVER_ACTION' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  success: boolean;
  httpStatus: number;
  durationMs: number;
  errorCategory?: string;
  providerStatus?: number;
  model?: string;
  chainContext?: ChainFailureContext;
};

/** Best-effort, allow-listed telemetry. Never pass request or user data here. */
export async function recordTelemetry(event: TelemetryEvent): Promise<void> {
  try {
    const supabase = createClient(await cookies());
    await supabase.rpc('record_app_telemetry_v3', {
      p_route: event.route,
      p_method: event.method,
      p_success: event.success,
      p_duration_ms: Math.min(120000, Math.max(0, Math.round(event.durationMs))),
      p_http_status: event.httpStatus,
      p_error_category: event.errorCategory ?? null,
      p_provider_status: event.providerStatus ?? null,
      p_model: event.model ?? null,
      p_chain_context: event.success ? null : telemetryChainContext(event.chainContext),
    });
  } catch {
    // Telemetry is deliberately non-critical to product requests.
  }
}
