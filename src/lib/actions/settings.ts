"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  SESSION_COOKIE,
  hashPassword,
  isValidPassword,
  clearPasswordCache,
} from "@/lib/auth";

export async function changeAccessPassword(formData: FormData): Promise<void> {
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!(await isValidPassword(current))) {
    throw new Error("La contraseña actual no es correcta.");
  }
  if (next.length < 6) {
    throw new Error("La nueva contraseña debe tener al menos 6 caracteres.");
  }
  if (next !== confirm) {
    throw new Error("La confirmación no coincide con la nueva contraseña.");
  }

  const record = await hashPassword(next);
  const sb = supabaseServer();
  const { error } = await sb
    .from("app_settings")
    .upsert({ key: "access_password", value: record }, { onConflict: "key" });
  if (error) throw new Error(`No se pudo guardar la contraseña: ${error.message}`);

  clearPasswordCache();

  // The session cookie is derived from the stored password, so every session
  // (including this one) is now invalid. Sign out and ask for the new one.
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login?changed=1");
}
