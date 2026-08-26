"use client";

import { useState } from "react";
import { ui } from "@/lib/ui";

const NEW_FOLDER = "__new__";

export function FolderPicker({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const [creating, setCreating] = useState(projects.length === 0);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className={ui.label}>Carpeta</span>
        <select
          name={creating ? undefined : "projectId"}
          value={creating ? NEW_FOLDER : projectId}
          onChange={(e) => {
            if (e.target.value === NEW_FOLDER) {
              setCreating(true);
            } else {
              setCreating(false);
              setProjectId(e.target.value);
            }
          }}
          className={ui.input}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW_FOLDER}>+ Nueva carpeta…</option>
        </select>
      </label>
      {creating && (
        <label className="block">
          <span className={ui.label}>Nombre de la carpeta</span>
          <input
            name="newProjectName"
            required
            placeholder="Ej: Municipalidad de Melipilla"
            className={ui.input}
          />
        </label>
      )}
    </div>
  );
}
