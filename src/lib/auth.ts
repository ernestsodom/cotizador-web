/**
 * Minimal shared-password gate for v1.
 *
 * There is no per-user account system yet — the whole app sits behind a
 * single password (APP_PASSWORD) so it isn't left open on the public
 * internet. All data access happens server-side with a Supabase key that
 * has full table access, so this gate is the only barrier; if the app
 * later needs per-user accounts or audit trails, replace this with
 * Supabase Auth and scope RLS policies to authenticated users.
 */

export const SESSION_COOKIE = "cw_session";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedSessionToken(): Promise<string> {
  const password = process.env.APP_PASSWORD ?? "";
  const secret = process.env.APP_SESSION_SECRET ?? "cotizador-dev-secret";
  return sha256Hex(`${password}::${secret}`);
}

export async function isValidPassword(candidate: string): Promise<boolean> {
  const password = process.env.APP_PASSWORD ?? "";
  if (!password) return false;
  return candidate === password;
}
