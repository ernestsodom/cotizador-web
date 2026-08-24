"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKETS, uploadFile, removeFile } from "@/lib/supabase/storage";

export async function createLogo(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const file = formData.get("file");
  if (!name) throw new Error("Ingresa un nombre para el logo.");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona una imagen para el logo.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "png";
  const path = `${randomUUID()}.${ext}`;
  await uploadFile(BUCKETS.logos, path, buffer, file.type || "image/png");

  const sb = supabaseServer();
  await sb.from("logos").insert({ name, storage_path: path });
  revalidatePath("/logos");
}

export async function deleteLogo(logoId: string): Promise<void> {
  const sb = supabaseServer();
  const { data: logo } = await sb.from("logos").select("storage_path").eq("id", logoId).single();
  const { error } = await sb.from("logos").delete().eq("id", logoId);
  if (error) {
    throw new Error("No se puede eliminar: este logo está en uso por alguna cotización.");
  }
  if (logo) await removeFile(BUCKETS.logos, logo.storage_path);
  revalidatePath("/logos");
}
