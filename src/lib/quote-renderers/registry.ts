import type { QuoteRenderer } from "./types";
import { cartaUfV1 } from "./carta-uf-v1";
import { reutilityReplicaV1 } from "./reutility-replica-v1";

/**
 * Output-format key (matches `quote_formats.key` in the DB) -> renderer
 * implementation. Add new quote formats here without touching the wizard
 * pages — the "generar" step just looks the key up.
 */
export const QUOTE_RENDERERS: Record<string, QuoteRenderer> = {
  reutility_replica_v1: reutilityReplicaV1,
  carta_uf_v1: cartaUfV1,
};

export function getQuoteRenderer(key: string): QuoteRenderer {
  const renderer = QUOTE_RENDERERS[key];
  if (!renderer) {
    throw new Error(`No hay un generador registrado para el formato "${key}"`);
  }
  return renderer;
}
