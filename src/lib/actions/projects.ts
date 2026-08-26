"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function createProject(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre de la carpeta no puede estar vacío.");

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("projects")
    .insert({ name: trimmed })
    .select("id")
    .single();
  if (error || !data) throw new Error("No se pudo crear la carpeta.");

  revalidatePath("/documents");
  return data.id as string;
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre de la carpeta no puede estar vacío.");

  const sb = supabaseServer();
  const { error } = await sb.from("projects").update({ name: trimmed }).eq("id", projectId);
  if (error) throw new Error("No se pudo renombrar la carpeta.");

  revalidatePath("/documents");
}
