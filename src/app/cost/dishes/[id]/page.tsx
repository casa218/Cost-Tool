import Link from "next/link";
import { notFound } from "next/navigation";
import { BridgePromptForm, ChooseSupplier } from "@/components/cost/prompts";
import { costDish } from "@/lib/food-cost/cost";
import { categoryLabel, hkd, methodBlocks, yieldSentence } from "@/lib/food-cost/format";
import { presentLine } from "@/lib/food-cost/present";
import { readDb } from "@/lib/food-cost/store";

export const dynamic = "force-dynamic";

export default async function TechnicalFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = readDb();
  const dish = db.dishes.find((item) => item.id === id);
  if (!dish) notFound();
  const cost = costDish(db, dish.id);
  const steps = methodBlocks(dish.method);

  return (
    <article>
      <p className="text-sm text-ink-muted">{categoryLabel(dish.category)}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-semibold">{dish.name}</h1>
        <Link
          href={`/cost/dishes/${dish.id}/edit`}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium print:hidden"
        >
          Edit recipe
        </Link>
      </div>
      {dish.sheetName && dish.sheetName.toLowerCase() !== dish.name.toLowerCase() ? (
        <p className="mt-1 text-sm text-ink-muted">Sheet: {dish.sheetName}</p>
      ) : null}
      <p className="mt-3 text-lg">{yieldSentence(dish)}</p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Method</h2>
        {steps.length === 0 ? (
          <p className="mt-2 text-ink-muted">No method was written on this sheet.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {steps.map((step, index) => (
              <li key={index} className="leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Ingredients</h2>
        {dish.lines.length === 0 ? (
          <p className="mt-2 text-ink-muted">This sheet has no ingredients.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {dish.lines.map((line, index) => {
              const view = presentLine(db, line, cost.lines[index]);
              return (
                <li key={line.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-medium">
                      {view.componentHref ? (
                        <Link href={view.componentHref} className="hover:underline">
                          {view.name}
                        </Link>
                      ) : (
                        view.name
                      )}
                    </h3>
                    <p className="font-medium">{view.cost ?? "—"}</p>
                  </div>
                  <p className="mt-1 text-sm">
                    On the plate: {view.onPlate}
                    {view.payFor ? ` · You pay for: ${view.payFor}` : ""}
                    {view.spillage > 0 ? ` · Spillage ${view.spillage}%` : ""}
                  </p>
                  {view.supplier ? <p className="text-sm text-ink-muted">{view.supplier}</p> : null}
                  {view.componentName ? (
                    <p className="text-sm text-ink-muted">From the {view.componentName} preparation.</p>
                  ) : null}
                  {view.known ? (
                    <p className="text-sm text-ink-muted">{view.known} of this line can be costed so far.</p>
                  ) : null}
                  {view.note ? <p className="mt-1 text-sm text-ink-muted">{view.note}</p> : null}
                  {view.issues.filter(Boolean).map((issue) => (
                    <p key={issue} className="mt-1 text-sm text-warning">
                      {issue}
                    </p>
                  ))}
                  {view.choice ? (
                    <ChooseSupplier ingredientId={view.choice.ingredientId} options={view.choice.options} />
                  ) : null}
                  {view.bridge ? <BridgePromptForm prompt={view.bridge} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-border bg-surface p-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-ink-muted">Batch cost</dt>
            <dd className="text-2xl font-semibold">{cost.batchCost == null ? "—" : hkd(cost.batchCost)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Food cost per portion</dt>
            <dd className="text-2xl font-semibold">{cost.portionCost == null ? "—" : hkd(cost.portionCost)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Suggested menu price</dt>
            <dd className="text-2xl font-semibold">{cost.suggested == null ? "—" : hkd(cost.suggested)}</dd>
            <dd className="text-xs text-ink-muted">Food cost per portion ÷ 30%</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Menu price on the sheet</dt>
            <dd className="text-2xl font-semibold">{dish.menuPrice == null ? "—" : hkd(dish.menuPrice)}</dd>
          </div>
        </dl>
        {!cost.batchComplete ? (
          <p className="mt-3 text-sm text-warning">
            This file is unfinished, so there is no suggested price yet.
            {cost.knownBatchCost > 0 ? ` Costed so far: ${hkd(cost.knownBatchCost)}.` : ""}
          </p>
        ) : null}
      </section>
    </article>
  );
}
