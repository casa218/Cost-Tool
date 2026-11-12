import Link from "next/link";
import { costDish } from "@/lib/food-cost/cost";
import { categoryLabel, hkd, yieldSentence } from "@/lib/food-cost/format";
import { readDb } from "@/lib/food-cost/store";
import { CATEGORIES } from "@/lib/food-cost/types";

export const dynamic = "force-dynamic";

export default function DishListPage() {
  const db = readDb();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dishes</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Food cost per portion, and a suggested menu price so that food is 30% of the price. Prices are Hong Kong dollars.
          </p>
        </div>
        <Link
          href="/cost/dishes/new"
          className="rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white"
        >
          New recipe
        </Link>
      </div>
      <div className="mt-6 space-y-8">
        {CATEGORIES.map(([category, label]) => {
          const dishes = db.dishes
            .filter((dish) => dish.category === category)
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <section key={category}>
              <h2 className="text-lg font-semibold">{label}</h2>
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {dishes.map((dish) => {
                  const cost = costDish(db, dish.id);
                  return (
                    <li key={dish.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/cost/dishes/${dish.id}`} className="text-lg font-medium hover:underline">
                          {dish.name}
                        </Link>
                        <Link href={`/cost/dishes/${dish.id}/edit`} className="text-sm text-brand-700 print:hidden">
                          Edit
                        </Link>
                      </div>
                      <p className="text-sm text-ink-muted">{yieldSentence(dish)}</p>
                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                        <div>
                          <dt className="inline text-ink-muted">Food cost </dt>
                          <dd className="inline font-medium">
                            {cost.portionCost == null ? "—" : hkd(cost.portionCost)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-ink-muted">Suggested </dt>
                          <dd className="inline font-medium">
                            {cost.suggested == null ? "—" : hkd(cost.suggested)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-ink-muted">Menu price </dt>
                          <dd className="inline font-medium">
                            {dish.menuPrice == null ? "—" : hkd(dish.menuPrice)}
                          </dd>
                        </div>
                      </dl>
                      {!cost.batchComplete ? (
                        <p className="mt-1 text-sm text-warning">
                          Unfinished
                          {cost.knownBatchCost > 0 ? ` · ${hkd(cost.knownBatchCost)} of the batch costed so far` : ""}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {dishes.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">Nothing in {categoryLabel(category).toLowerCase()} yet.</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
