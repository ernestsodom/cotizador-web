import "server-only";
import { supabaseServer } from "./server";

export const BUCKETS = {
  sourceDocuments: "source-documents",
  documentImages: "document-images",
  quotePhotos: "quote-photos",
  logos: "logos",
  signatures: "signatures",
  generatedQuotes: "generated-quotes",
} as const;

/**
 * Storage keys reject spaces, accents and other non-ASCII characters.
 * Uploaded files keep their real name in the database for display — this
 * is only for the key we hand to Storage.
 */
export function sanitizeStorageFilename(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9.\-_]/g, "_") // anything else -> underscore
    .replace(/_+/g, "_");
  return normalized || "archivo";
}

export function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const sb = supabaseServer();
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function signedDownloadUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 600
): Promise<string | null> {
  const sb = supabaseServer();
  const { data, error } = await sb.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}

export async function downloadFile(bucket: string, path: string): Promise<Buffer> {
  const sb = supabaseServer();
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`No se pudo descargar ${bucket}/${path}: ${error?.message ?? "desconocido"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadFile(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const sb = supabaseServer();
  const { error } = await sb.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`No se pudo subir ${bucket}/${path}: ${error.message}`);
}

export async function removeFile(bucket: string, path: string): Promise<void> {
  const sb = supabaseServer();
  await sb.storage.from(bucket).remove([path]);
}
