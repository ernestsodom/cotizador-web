"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { BUCKETS, uploadFile, removeFile } from "@/lib/supabase/storage";

export async function createSignatory(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim();
  const file = formData.get("signature");
  if (!name || !position) {
    throw new Error("Ingresa nombre y cargo del firmante.");
  }

  let signaturePath: string | null = null;
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "png";
    signaturePath = `${randomUUID()}.${ext}`;
    await uploadFile(BUCKETS.signatures, signaturePath, buffer, file.type || "image/png");
  }

  const sb = supabaseServer();
  await sb.from("signatories").insert({
    name,
    position,
    signature_storage_path: signaturePath,
  });
  revalidatePath("/signatories");
}

export async function deleteSignatory(signatoryId: string): Promise<void> {
  const sb = supabaseServer();
  const { data: sig } = await sb
    .from("signatories")
    .select("signature_storage_path")
    .eq("id", signatoryId)
    .single();
  const { error } = await sb.from("signatories").delete().eq("id", signatoryId);
  if (error) {
    throw new Error("No se puede eliminar: este firmante está en uso por alguna cotización.");
  }
  if (sig?.signature_storage_path) {
    await removeFile(BUCKETS.signatures, sig.signature_storage_path);
  }
  revalidatePath("/signatories");
}
