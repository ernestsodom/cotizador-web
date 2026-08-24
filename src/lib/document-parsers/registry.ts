import type { DocumentParser } from "./types";
import { parseCartaCotizacionV1 } from "./carta-cotizacion-v1";

/**
 * Document-type key (matches `document_types.key` in the DB) -> parser
 * implementation. Add new document types here without touching the rest
 * of the app — upload/analysis flow just looks the key up.
 */
export const DOCUMENT_PARSERS: Record<string, DocumentParser> = {
  carta_cotizacion_v1: parseCartaCotizacionV1,
};

export function getDocumentParser(key: string): DocumentParser {
  const parser = DOCUMENT_PARSERS[key];
  if (!parser) {
    throw new Error(`No hay un analizador registrado para el tipo de documento "${key}"`);
  }
  return parser;
}
