/**
 * Shared-password gate.
 *
 * There is no per-user account system: the whole app sits behind a single
 * password so it isn't left open on the internet. The password is stored
 * (hashed) in the `app_settings` table rather than in an environment
 * variable, so it can be changed from the app itself without a redeploy —
 * and because the session cookie is derived from the stored hash, changing
 * the password signs everyone out.
 *
 * This module runs in the Edge middleware as well as in Node route
 * handlers, so it uses Web Crypto and plain fetch rather than node:crypto
 * or the Supabase client.
 */

export const SESSION_COOKIE = "cw_session";
const PASSWORD_KEY = "access_password";
const PBKDF2_ITERATIONS = 120_000;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toBase64(new Uint8Array(bits));
}

/** Encodes a password as `pbkdf2$<iterations>$<salt>$<hash>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${hash}`;
}

async function verifyAgainstRecord(password: string, record: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltB64, expected] = record.split("$");
  if (scheme !== "pbkdf2" || !saltB64 || !expected) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const actual = await pbkdf2(password, fromBase64(saltB64), iterations);
  // constant-time-ish comparison
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * The stored password record, cached briefly. The middleware needs it on
 * every request, so without the cache each page view would cost a database
 * round trip.
 */
let cached: { record: string | null; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function clearPasswordCache(): void {
  cached = null;
}

async function fetchStoredRecord(): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/app_settings?key=eq.${PASSWORD_KEY}&select=value`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { value: string }[];
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function storedRecord(): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.record;
  const record = await fetchStoredRecord();
  cached = { record, at: Date.now() };
  return record;
}

/**
 * The value the session cookie must carry. Derived from the stored password
 * record, so rotating the password invalidates every existing session.
 * Falls back to APP_PASSWORD when nothing is stored yet, which keeps the
 * app reachable before the first password is set.
 */
export async function expectedSessionToken(): Promise<string> {
  const secret = process.env.APP_SESSION_SECRET ?? "cotizador-dev-secret";
  const record = (await storedRecord()) ?? `env:${process.env.APP_PASSWORD ?? ""}`;
  return sha256Hex(`${record}::${secret}`);
}

export async function isValidPassword(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  const record = await storedRecord();
  if (record) return verifyAgainstRecord(candidate, record);
  const fallback = process.env.APP_PASSWORD ?? "";
  return fallback !== "" && candidate === fallback;
}

/** True once a password has been stored, i.e. the app no longer depends on the env var. */
export async function hasStoredPassword(): Promise<boolean> {
  return (await storedRecord()) !== null;
}
