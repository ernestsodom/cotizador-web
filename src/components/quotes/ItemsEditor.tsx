"use client";

import { useState, useTransition } from "react";
import { updateQuoteItem, addQuoteItem, removeQuoteItem } from "@/lib/actions/quotes";
import { formatMoney } from "@/lib/format";
import { ui } from "@/lib/ui";

interface Item {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  included: boolean;
  order_index: number;
}

export function ItemsEditor({
  quoteId,
  initialItems,
  defaultCurrency,
}: {
  quoteId: string;
  initialItems: Item[];
  defaultCurrency: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  function patchLocal(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function save(id: string, patch: Parameters<typeof updateQuoteItem>[1]) {
    startTransition(() => {
      updateQuoteItem(id, patch);
    });
  }

  function handleRemove(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    startTransition(() => {
      removeQuoteItem(id);
    });
  }

  const total = items
    .filter((i) => i.included)
    .reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className={`${ui.card} ${item.included ? "" : "opacity-50"} transition-opacity`}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={item.included}
              onChange={(e) => {
                patchLocal(item.id, { included: e.target.checked });
                save(item.id, { included: e.target.checked });
              }}
              className="mt-1.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => patchLocal(item.id, { name: e.target.value })}
                onBlur={(e) => save(item.id, { name: e.target.value })}
                className={`${ui.input} font-medium`}
              />
              <textarea
                value={item.description ?? ""}
                onChange={(e) => patchLocal(item.id, { description: e.target.value })}
                onBlur={(e) => save(item.id, { description: e.target.value || null })}
                rows={2}
                placeholder="Descripción (opcional)"
                className={`${ui.input} text-xs text-slate-600`}
              />
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Cantidad
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      patchLocal(item.id, { quantity: v });
                      save(item.id, { quantity: v });
                    }}
                    className={`${ui.input} w-20`}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Precio unitario
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      patchLocal(item.id, { unit_price: v });
                      save(item.id, { unitPrice: v });
                    }}
                    className={`${ui.input} w-28`}
                  />
                  <span>{item.currency}</span>
                </label>
                <span className="ml-auto text-sm font-semibold text-slate-800">
                  {formatMoney(item.quantity * item.unit_price, item.currency)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className={ui.btnDanger}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No hay ítems. Agrega uno manualmente abajo.
        </p>
      )}

      <div className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-3">
        <span className="text-sm font-medium text-slate-600">Total ítems incluidos</span>
        <span className="text-base font-semibold text-slate-900">
          {formatMoney(total, defaultCurrency)}
        </span>
      </div>

      {showAdd ? (
        <AddItemForm
          quoteId={quoteId}
          defaultCurrency={defaultCurrency}
          onAdded={(item) => {
            setItems((prev) => [...prev, item]);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button type="button" onClick={() => setShowAdd(true)} className={ui.btnSecondary}>
          + Agregar ítem
        </button>
      )}
    </div>
  );
}

function AddItemForm({
  quoteId,
  defaultCurrency,
  onAdded,
  onCancel,
}: {
  quoteId: string;
  defaultCurrency: string;
  onAdded: (item: Item) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await addQuoteItem(quoteId, {
        name: name.trim(),
        description: description.trim() || undefined,
        quantity,
        unitPrice,
      });
      onAdded({
        id: crypto.randomUUID(),
        name,
        description: description || null,
        quantity,
        unit_price: unitPrice,
        currency: defaultCurrency,
        included: true,
        order_index: 9999,
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className={`${ui.card} space-y-3`}>
      <h3 className="text-sm font-semibold text-slate-900">Nuevo ítem</h3>
      <input
        type="text"
        placeholder="Nombre del ítem"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className={ui.input}
      />
      <textarea
        placeholder="Descripción (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className={ui.input}
      />
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Cantidad
          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className={`${ui.input} w-20`}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Precio unitario
          <input
            type="number"
            min={0}
            step="0.01"
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            className={`${ui.input} w-28`}
          />
          <span>{defaultCurrency}</span>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={ui.btnPrimary}>
          {pending ? "Agregando…" : "Agregar"}
        </button>
        <button type="button" onClick={onCancel} className={ui.btnSecondary}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
