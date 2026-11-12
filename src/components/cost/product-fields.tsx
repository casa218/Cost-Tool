"use client";

import { useState } from "react";
import { saveBridge, updateProductPrice } from "@/app/cost/actions";
import type { Product } from "@/lib/food-cost/types";
import { PACK_UNITS, packFormValue, type PackUnit } from "@/lib/food-cost/units";

export function ProductFields({ product }: { product: Product }) {
  const initialPack = packFormValue(product);
  const [price, setPrice] = useState(product.price == null ? "" : String(product.price));
  const [usable, setUsable] = useState(initialPack.amount);
  const [unit, setUnit] = useState<PackUnit>(initialPack.unit);
  const [message, setMessage] = useState<string | null>(null);

  async function savePrice() {
    const trimmed = price.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (!Number.isFinite(next) || next! < 0)) {
      setMessage("Enter a price, or leave it blank.");
      return;
    }
    const result = await updateProductPrice(product.id, next);
    setMessage(result.ok ? "Price saved. Every dish using this updates." : result.error);
  }

  async function saveUsable() {
    const amount = Number(usable);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter how much usable food is in the pack.");
      return;
    }
    const result = await saveBridge({ kind: "usable", productId: product.id, amount, unit });
    setMessage(result.ok ? "Pack size saved." : result.error);
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block text-ink-muted">Price HK$</span>
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          aria-label={`Price of ${product.nameEn}`}
          className="mt-1 w-28 rounded-md border border-border bg-surface px-2 py-1.5"
        />
      </label>
      <button type="button" onClick={savePrice} className="rounded-full border border-border px-3 py-1.5 text-sm">
        Save price
      </button>
      <label className="text-sm">
        <span className="block text-ink-muted">Usable amount</span>
        <input
          value={usable}
          onChange={(event) => setUsable(event.target.value)}
          inputMode="decimal"
          aria-label={`Usable amount of ${product.nameEn}`}
          className="mt-1 w-24 rounded-md border border-border bg-surface px-2 py-1.5"
        />
      </label>
      <select
        value={unit}
        onChange={(event) => setUnit(event.target.value as PackUnit)}
        aria-label={`Usable unit of ${product.nameEn}`}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
      >
        {PACK_UNITS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button type="button" onClick={saveUsable} className="rounded-full border border-border px-3 py-1.5 text-sm">
        Save pack
      </button>
      {message ? <p className="text-sm text-ink-muted">{message}</p> : null}
    </div>
  );
}
