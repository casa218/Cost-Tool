import type { Database, Group, Ingredient, Product, Supplier } from "@/lib/food-cost/types";
import { GROUPS } from "@/lib/food-cost/types";

export function fold(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("蕃", "番")
    .replaceAll("裡", "里")
    .replaceAll("裏", "里");
}

export function searchIngredients(db: Database, query: string, limit = 40): Ingredient[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const products = new Map(db.products.map((product) => [product.id, product]));
  const hits: Ingredient[] = [];
  for (const ingredient of db.ingredients) {
    if (matches(ingredient, products, needle)) hits.push(ingredient);
    if (hits.length >= limit) break;
  }
  return hits;
}

function matches(
  ingredient: Ingredient,
  products: Map<string, Product>,
  needle: string,
): boolean {
  const parts = [ingredient.name, ingredient.nameZh ?? ""];
  for (const id of ingredient.productIds) {
    const product = products.get(id);
    if (!product) continue;
    parts.push(product.name, product.nameEn, product.nameZh ?? "");
  }
  return fold(parts.join(" ")).includes(needle);
}

export function groupHits(hits: Ingredient[]): { group: Group; label: string; items: Ingredient[] }[] {
  return GROUPS.map(([group, label]) => ({
    group,
    label,
    items: hits
      .filter((hit) => hit.group === group)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((section) => section.items.length > 0);
}

export function supplierName(suppliers: Supplier[], id: string): string {
  return suppliers.find((supplier) => supplier.id === id)?.name ?? id;
}
