"use client";

import { useState } from "react";
import { rememberSupplier, saveBridge, type BridgeInput } from "@/app/cost/actions";
import type { BridgePrompt, SupplierOption } from "@/lib/food-cost/present";

function bridgeInput(prompt: BridgePrompt, amount: number, usableUnit: "g" | "ml"): BridgeInput {
  switch (prompt.kind) {
    case "usable":
      return { kind: "usable", productId: prompt.productId, amount, unit: usableUnit };
    case "portion-size":
      return { kind: "portion-size", dishId: prompt.dishId, amount, unit: prompt.unit };
    case "count-per-kg":
    case "grams-per-each":
      return { kind: prompt.kind, productId: prompt.productId, amount };
    default:
      return { kind: prompt.kind, ingredientId: prompt.ingredientId, amount };
  }
}

export function BridgePromptForm({ prompt }: { prompt: BridgePrompt }) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"g" | "ml">(prompt.kind === "usable" ? "g" : "g");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a number greater than zero.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await saveBridge(bridgeInput(prompt, value, unit));
    setPending(false);
    if (!result.ok) setError(result.error);
    else setAmount("");
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-lg bg-brand-50 px-3 py-3">
      <p className="text-sm text-ink">{prompt.question}</p>
      <p className="mt-1 text-xs text-ink-muted">Asked once. The answer is kept for every recipe.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          aria-label={prompt.question}
          className="w-28 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
        {prompt.kind === "usable" ? (
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value as "g" | "ml")}
            aria-label="Unit"
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            <option value="g">grams</option>
            <option value="ml">millilitres</option>
          </select>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save answer"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </form>
  );
}

export function ChooseSupplier({
  ingredientId,
  options,
  onChosen,
}: {
  ingredientId: string;
  options: SupplierOption[];
  onChosen?: (productId: string) => void;
}) {
  const [picked, setPicked] = useState(options[0]?.productId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!picked) return;
    setPending(true);
    setError(null);
    const result = await rememberSupplier(ingredientId, picked);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChosen?.(picked);
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-3">
      <p className="text-sm font-medium text-ink">Which one do you buy?</p>
      <div className="mt-2 space-y-2">
        {options.map((option) => (
          <label key={option.productId} className="flex cursor-pointer gap-2 text-sm">
            <input
              type="radio"
              name={`supplier-${ingredientId}`}
              value={option.productId}
              checked={picked === option.productId}
              onChange={() => setPicked(option.productId)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{option.title}</span>
              <span className="block text-ink-muted">{option.detail}</span>
              {option.warning ? <span className="block text-warning">{option.warning}</span> : null}
            </span>
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={pending || !picked}
        className="mt-3 rounded-full bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Use this one"}
      </button>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </form>
  );
}
