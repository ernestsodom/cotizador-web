"use client";

import { useRef, useState, useTransition } from "react";
import {
  addQuoteItemPhotoFromLibrary,
  removeQuoteItemPhoto,
  reorderQuoteItemPhotos,
  uploadQuoteItemPhoto,
} from "@/lib/actions/quotes";
import { ui } from "@/lib/ui";

interface Photo {
  id: string;
  url: string;
}

export function PhotosEditor({
  quoteItemId,
  initialPhotos,
  gallery,
}: {
  quoteItemId: string;
  initialPhotos: Photo[];
  gallery: { path: string; url: string; mediaTarget: string | null }[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [showGallery, setShowGallery] = useState(false);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function persistOrder(next: Photo[]) {
    startTransition(() => {
      reorderQuoteItemPhotos(
        quoteItemId,
        next.map((p) => p.id)
      );
    });
  }

  function move(index: number, dir: -1 | 1) {
    setPhotos((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      persistOrder(next);
      return next;
    });
  }

  function handleRemove(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    startTransition(() => {
      removeQuoteItemPhoto(id);
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      await uploadQuoteItemPhoto(quoteItemId, formData);
      setPhotos((prev) => [...prev, { id: crypto.randomUUID(), url: URL.createObjectURL(file) }]);
    });
    e.target.value = "";
  }

  function addFromGallery(entry: { path: string; url: string; mediaTarget: string | null }) {
    setPhotos((prev) => [...prev, { id: crypto.randomUUID(), url: entry.url }]);
    startTransition(() => {
      addQuoteItemPhotoFromLibrary(quoteItemId, entry.path, entry.mediaTarget);
    });
    setShowGallery(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {photos.map((photo, index) => (
          <div key={photo.id} className="group relative h-24 w-32 overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => move(index, -1)}
                className="px-1 text-xs text-white disabled:opacity-30"
                disabled={index === 0}
                title="Mover antes"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => handleRemove(photo.id)}
                className="px-1 text-xs text-white"
                title="Quitar"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                className="px-1 text-xs text-white disabled:opacity-30"
                disabled={index === photos.length - 1}
                title="Mover después"
              >
                ›
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600"
        >
          <span className="text-lg leading-none">⬆</span>
          Subir foto
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

        {gallery.length > 0 && (
          <button
            type="button"
            onClick={() => setShowGallery((v) => !v)}
            className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600"
          >
            <span className="text-lg leading-none">🖼</span>
            Del documento
          </button>
        )}
      </div>

      {showGallery && (
        <div className="mt-3 flex flex-wrap gap-2 rounded-lg bg-slate-50 p-3">
          {gallery.map((g) => (
            <button
              key={g.path}
              type="button"
              onClick={() => addFromGallery(g)}
              className="h-16 w-24 overflow-hidden rounded-md border border-slate-200 hover:ring-2 hover:ring-brand-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
