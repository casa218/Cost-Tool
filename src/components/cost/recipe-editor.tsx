"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDish } from "@/app/cost/actions";
import { BridgePromptForm, ChooseSupplier } from "@/components/cost/prompts";
import { previewDish } from "@/lib/food-cost/cost";
import { categoryLabel, hkd } from "@/lib/food-cost/format";
import { presentLine, pricePhrase, supplierOptions } from "@/lib/food-cost/present";
import { groupHits, searchIngredients, supplierName } from "@/lib/food-cost/search";
import { CATEGORIES, type Category, type Database, type Dish, type Ingredient, type RecipeLine } from "@/lib/food-cost/types";
import { unitLabel } from "@/lib/food-cost/units";

const UNITS = ["g", "kg", "oz", "lb", "ml", "l", "tbsp", "tsp", "cup", "pinch", "piece", "bunch", "portion"];

export function RecipeEditor({ db, dish, creating }: { db: Database; dish: Dish; creating: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(dish.name);
  const [category, setCategory] = useState<Category>(dish.category);
  const [portions, setPortions] = useState(dish.portions?.toString() ?? "");
  const [portionAmount, setPortionAmount] = useState(dish.portionAmount?.toString() ?? "");
  const [portionUnit, setPortionUnit] = useState(dish.portionUnit ?? "");
  const [menuPrice, setMenuPrice] = useState(dish.menuPrice?.toString() ?? "");
  const [method, setMethod] = useState(dish.method);
  const [lines, setLines] = useState<RecipeLine[]>(dish.lines);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ ingredientId: string; mode: "add" | "change" } | null>(null);
  const [preferred, setPreferred] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const viewDb = useMemo(() => withPreferred(db, preferred), [db, preferred]);
  const draft = useMemo<Dish>(
    () => ({
      ...dish,
      name: name || dish.name || "Untitled",
      category,
      portions: numberOrNull(portions),
      portionAmount: numberOrNull(portionAmount),
      portionUnit: portionUnit || null,
      menuPrice: numberOrNull(menuPrice),
      method,
      lines,
    }),
    [dish, name, category, portions, portionAmount, portionUnit, menuPrice, method, lines],
  );
  const cost = previewDish(viewDb, draft);
  const favorites = viewDb.ingredients.filter((item) => item.favorite);
  const recent = viewDb.recentIngredientIds
    .map((id) => viewDb.ingredients.find((item) => item.id === id))
    .filter((item): item is Ingredient => item != null);
  const grouped = query.trim() ? groupHits(searchIngredients(viewDb, query)) : [];
  const pendingIngredient = pending
    ? viewDb.ingredients.find((item) => item.id === pending.ingredientId) ?? null
    : null;

  function addLine(ingredient: Ingredient) {
    setLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ingredientId: ingredient.id,
        componentDishId: ingredient.preparationDishId,
        quantity: 1,
        unit: "g",
        spillagePercent: ingredient.usualSpillagePercent,
        sourceName: ingredient.name,
        sourceSupplier: null,
        sourceUnit: null,
        note: null,
      },
    ]);
    setQuery("");
    setPending(null);
  }

  function choose(ingredient: Ingredient) {
    const options = supplierOptions(viewDb, ingredient);
    const remembered = preferred[ingredient.id] ?? ingredient.preferredProductId;
    const mustAsk =
      !ingredient.preparationDishId &&
      !ingredient.free &&
      options.length > 1 &&
      !remembered;
    if (mustAsk) {
      setPending({ ingredientId: ingredient.id, mode: "add" });
      return;
    }
    addLine(ingredient);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const portionsValue = numberOrNull(portions);
    const portionAmountValue = numberOrNull(portionAmount);
    const menuValue = numberOrNull(menuPrice);
    if (portions.trim() && portionsValue == null) {
      setSaving(false);
      setError("Portions has to be a number greater than zero.");
      return;
    }
    if (portionAmount.trim() && (portionAmountValue == null || !portionUnit)) {
      setSaving(false);
      setError("A portion size needs a number and a unit.");
      return;
    }
    if (menuPrice.trim() && menuValue == null) {
      setSaving(false);
      setError("Menu price has to be a number, or blank.");
      return;
    }
    if (lines.some((line) => !(line.quantity > 0))) {
      setSaving(false);
      setError("Every ingredient needs a quantity greater than zero.");
      return;
    }
    const result = await saveDish({
      id: creating ? null : dish.id,
      name,
      category,
      portions: portionsValue,
      portionAmount: portionAmountValue,
      portionUnit: portionUnit || null,
      menuPrice: menuValue,
      method,
      lines,
    });
    setSaving(false);
    if (result && !result.ok) setError(result.error);
    else if (!creating) router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm text-ink-muted">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-muted">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
          >
            {CATEGORIES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-ink-muted">Menu price already known (HK$)</span>
          <input
            value={menuPrice}
            onChange={(event) => setMenuPrice(event.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-muted">Portions this batch makes</span>
          <input
            value={portions}
            onChange={(event) => setPortions(event.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <label className="block">
            <span className="text-sm text-ink-muted">One portion is</span>
            <input
              value={portionAmount}
              onChange={(event) => setPortionAmount(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-muted">Unit</span>
            <select
              value={portionUnit}
              onChange={(event) => setPortionUnit(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
            >
              <option value="">—</option>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unitLabel(unit)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold">Ingredients</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Search in English or Chinese. One supplier is used on its own. Several suppliers: you choose, and that choice is kept.
        </p>
        <div className="mt-3">
          <label className="block text-sm text-ink-muted" htmlFor="ingredient-search">
            Find an ingredient
          </label>
          <input
            id="ingredient-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPending(null);
            }}
            placeholder="cucu, 番茄, aioli"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
          />
        </div>
        {!query.trim() ? (
          <div className="mt-3 space-y-3">
            <ChipRow label="Favorites" items={favorites} onPick={choose} />
            <ChipRow label="Recent" items={recent} onPick={choose} />
          </div>
        ) : grouped.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nothing matches that.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {grouped.map((section) => (
              <div key={section.group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{section.label}</h3>
                <ul className="mt-1 divide-y divide-border rounded-lg border border-border bg-surface">
                  {section.items.map((ingredient) => (
                    <li key={ingredient.id}>
                      <button
                        type="button"
                        onClick={() => choose(ingredient)}
                        className="flex w-full flex-col px-3 py-2 text-left hover:bg-brand-50"
                      >
                        <span className="font-medium">
                          {ingredient.name}
                          {ingredient.nameZh ? <span className="ml-2 text-ink-muted">{ingredient.nameZh}</span> : null}
                        </span>
                        <span className="text-sm text-ink-muted">{ingredientSubtitle(viewDb, ingredient, preferred)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {pending && pending.mode === "add" && pendingIngredient ? (
          <ChooseSupplier
            ingredientId={pending.ingredientId}
            options={supplierOptions(viewDb, pendingIngredient)}
            onChosen={(productId) => {
              setPreferred((current) => ({ ...current, [pending.ingredientId]: productId }));
              addLine(pendingIngredient);
            }}
          />
        ) : null}
      </section>

      <ol className="space-y-4">
        {lines.map((line, index) => {
          const lineCost = cost.lines[index];
          const view = lineCost ? presentLine(viewDb, line, lineCost) : null;
          const ingredient = viewDb.ingredients.find((item) => item.id === line.ingredientId);
          const several = ingredient ? supplierOptions(viewDb, ingredient).length > 1 : false;
          return (
            <li key={line.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{view?.name ?? line.sourceName}</p>
                  {view?.supplier ? <p className="text-sm text-ink-muted">{view.supplier}</p> : null}
                  {view?.componentName ? (
                    <p className="text-sm text-ink-muted">Made in house · {view.componentName}</p>
                  ) : null}
                </div>
                <div className="flex gap-2 text-sm">
                  <button type="button" className="text-ink-muted" onClick={() => move(setLines, index, -1)} disabled={index === 0}>
                    Up
                  </button>
                  <button
                    type="button"
                    className="text-ink-muted"
                    onClick={() => move(setLines, index, 1)}
                    disabled={index === lines.length - 1}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="text-danger"
                    onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="text-ink-muted">Quantity</span>
                  <input
                    value={line.quantity}
                    onChange={(event) => updateLine(setLines, line.id, { quantity: Number(event.target.value) })}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-md border border-border px-2 py-1.5"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-muted">Unit</span>
                  <select
                    value={line.unit}
                    onChange={(event) => updateLine(setLines, line.id, { unit: event.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5"
                  >
                    {UNITS.includes(line.unit) ? null : <option value={line.unit}>{line.unit}</option>}
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unitLabel(unit)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-ink-muted">Spillage %</span>
                  <input
                    value={line.spillagePercent}
                    onChange={(event) =>
                      updateLine(setLines, line.id, { spillagePercent: Number(event.target.value) })
                    }
                    inputMode="decimal"
                    className="mt-1 w-full rounded-md border border-border px-2 py-1.5"
                  />
                </label>
              </div>
              {view ? (
                <p className="mt-3 text-sm">
                  On the plate: {view.onPlate}
                  {view.payFor ? <span className="text-ink-muted"> · You pay for: {view.payFor}</span> : null}
                  {view.cost ? <span className="ml-2 font-medium">{view.cost}</span> : null}
                  {view.known ? <span className="ml-2 text-ink-muted">{view.known} so far</span> : null}
                </p>
              ) : null}
              {view?.issues.filter(Boolean).map((issue) => (
                <p key={issue} className="mt-1 text-sm text-warning">
                  {issue}
                </p>
              ))}
              {view?.note ? <p className="mt-1 text-sm text-ink-muted">{view.note}</p> : null}
              {several && ingredient ? (
                <button
                  type="button"
                  className="mt-2 text-sm font-medium text-brand-700"
                  onClick={() => setPending({ ingredientId: ingredient.id, mode: "change" })}
                >
                  Change supplier
                </button>
              ) : null}
              {pending?.mode === "change" && pending.ingredientId === line.ingredientId && ingredient ? (
                <ChooseSupplier
                  ingredientId={ingredient.id}
                  options={supplierOptions(viewDb, ingredient)}
                  onChosen={(productId) => {
                    setPreferred((current) => ({ ...current, [ingredient.id]: productId }));
                    setPending(null);
                  }}
                />
              ) : null}
              {view?.bridge ? <BridgePromptForm prompt={view.bridge} /> : null}
            </li>
          );
        })}
      </ol>

      <section>
        <h2 className="text-lg font-semibold">Method</h2>
        <textarea
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          rows={10}
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2"
        />
      </section>

      <CostSummary category={categoryLabel(category)} cost={cost} />

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-full bg-brand-500 px-5 py-2.5 font-medium text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save recipe"}
      </button>
    </div>
  );
}

function ChipRow({
  label,
  items,
  onPick,
}: {
  label: string;
  items: Ingredient[];
  onPick: (ingredient: Ingredient) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item)}
            className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:bg-brand-50"
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function CostSummary({
  category,
  cost,
}: {
  category: string;
  cost: ReturnType<typeof previewDish>;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-ink-muted">{category}</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-ink-muted">Batch cost</dt>
          <dd className="text-xl font-semibold">{cost.batchCost == null ? "—" : hkd(cost.batchCost)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Food cost per portion</dt>
          <dd className="text-xl font-semibold">{cost.portionCost == null ? "—" : hkd(cost.portionCost)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Suggested menu price</dt>
          <dd className="text-xl font-semibold">{cost.suggested == null ? "—" : hkd(cost.suggested)}</dd>
          <dd className="text-xs text-ink-muted">Food cost per portion ÷ 30%</dd>
        </div>
      </dl>
      {!cost.batchComplete ? (
        <p className="mt-2 text-sm text-warning">
          The suggested price waits until every line has a cost.
          {cost.knownBatchCost > 0 ? ` Costed so far: ${hkd(cost.knownBatchCost)}.` : ""}
        </p>
      ) : null}
      {cost.noPortions ? (
        <p className="mt-2 text-sm text-warning">Set how many portions this batch makes.</p>
      ) : null}
    </section>
  );
}

function ingredientSubtitle(
  db: Database,
  ingredient: Ingredient,
  preferred: Record<string, string>,
): string {
  if (ingredient.preparationDishId) return "Made in house";
  if (ingredient.free) return "No cost";
  const options = supplierOptions(db, ingredient);
  if (options.length === 0) return "No supplier price";
  const remembered = preferred[ingredient.id] ?? ingredient.preferredProductId;
  if (options.length > 1 && !remembered) return `${options.length} suppliers — you will be asked`;
  const productId = remembered ?? options[0]?.productId;
  const product = db.products.find((item) => item.id === productId);
  if (!product) return "No supplier price";
  return `${supplierName(db.suppliers, product.supplierId)} · ${pricePhrase(product)}`;
}

function withPreferred(db: Database, preferred: Record<string, string>): Database {
  if (Object.keys(preferred).length === 0) return db;
  return {
    ...db,
    ingredients: db.ingredients.map((ingredient) =>
      preferred[ingredient.id]
        ? { ...ingredient, preferredProductId: preferred[ingredient.id] }
        : ingredient,
    ),
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function updateLine(
  setLines: React.Dispatch<React.SetStateAction<RecipeLine[]>>,
  id: string,
  patch: Partial<RecipeLine>,
) {
  setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
}

function move(
  setLines: React.Dispatch<React.SetStateAction<RecipeLine[]>>,
  index: number,
  direction: -1 | 1,
) {
  setLines((current) => {
    const next = current.slice();
    const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return next;
  });
}
