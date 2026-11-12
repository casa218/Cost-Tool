import Link from "next/link";
import { ProductFields } from "@/components/cost/product-fields";
import { flagLabel, unfinishedProduct } from "@/lib/food-cost/present";
import { readDb } from "@/lib/food-cost/store";
import type { Product } from "@/lib/food-cost/types";
import { trimNumber, unitLabel } from "@/lib/food-cost/units";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { supplier: supplierId } = await searchParams;
  const db = readDb();
  const selected = db.suppliers.find((item) => item.id === supplierId) ?? db.suppliers[0];
  const products = db.products
    .filter((product) => product.supplierId === selected.id)
    .sort(byAttention);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Supplier prices</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Prices are Hong Kong dollars. Changing a price here updates every dish that uses it. Lines with no price, a nonsense price, or an unsure name stay at the top. Cups, lids, bags, and toothpicks are kept off the recipe list.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {db.suppliers.map((supplier) => {
          const count = db.products.filter(
            (product) => product.supplierId === supplier.id && unfinishedProduct(product),
          ).length;
          const active = supplier.id === selected.id;
          return (
            <Link
              key={supplier.id}
              href={`/cost/suppliers?supplier=${supplier.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-brand-500 text-white" : "border border-border bg-surface"}`}
            >
              {supplier.name}
              {count > 0 ? ` · ${count}` : ""}
            </Link>
          );
        })}
      </div>
      <ul className="mt-6 space-y-3">
        {products.map((product) => (
          <li
            key={product.id}
            className={`rounded-xl border bg-surface p-4 ${unfinishedProduct(product) ? "border-warning" : "border-border"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium">{product.nameEn || product.name}</h2>
              <p className="text-sm text-ink-muted">{product.packLabel || "pack"}</p>
            </div>
            {product.nameZh ? <p className="text-ink-muted">{product.nameZh}</p> : null}
            {product.usableAmount != null && product.usableUnit ? (
              <p className="text-sm text-ink-muted">
                Usable {trimNumber(product.usableAmount)} {unitLabel(product.usableUnit)}
                {product.note ? ` · ${product.note}` : ""}
              </p>
            ) : product.note ? (
              <p className="text-sm text-ink-muted">{product.note}</p>
            ) : null}
            {product.confirmed && !product.flags.includes("unmatched") && product.confirmed.toLowerCase() !== "name" && product.confirmed.toLowerCase() !== "ok" ? (
              <p className="text-sm text-ink-muted">Catalogue note: {product.confirmed}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {product.flags.map((flag) => (
                <span key={flag} className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                  {flagLabel(flag)}
                </span>
              ))}
            </div>
            <ProductFields product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function byAttention(a: Product, b: Product): number {
  const rank = (product: Product) => (unfinishedProduct(product) ? 0 : 1);
  const diff = rank(a) - rank(b);
  if (diff !== 0) return diff;
  return (a.nameEn || a.name).localeCompare(b.nameEn || b.name);
}
