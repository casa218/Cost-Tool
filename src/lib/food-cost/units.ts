import type { Ingredient, Product } from "@/lib/food-cost/types";

export const GRAMS_PER_OUNCE = 28.349523125;
export const GRAMS_PER_POUND = 453.59237;

/** A price that cannot be a real kitchen invoice. The two Los Ibéricos meat lines sit here. */
export const NONSENSE_PRICE = 1_000_000;

export const PACK_UNITS = ["g", "kg", "ml", "l"] as const;
export type PackUnit = (typeof PACK_UNITS)[number];

/**
 * The pack form must show the stored unit. Mapping kg to g, or l to ml,
 * without scaling the number makes the next save a thousand times too small.
 */
export function packFormValue(product: {
  usableAmount: number | null;
  usableUnit: string | null;
}): { amount: string; unit: PackUnit } {
  const unit: PackUnit =
    product.usableUnit === "kg" || product.usableUnit === "ml" || product.usableUnit === "l"
      ? product.usableUnit
      : "g";
  return {
    amount: product.usableAmount == null ? "" : String(product.usableAmount),
    unit,
  };
}

export type Measure =
  | { kind: "weight"; grams: number }
  | { kind: "volume"; ml: number }
  | { kind: "count"; each: number };

export type Basis =
  | { kind: "weight"; grams: number }
  | { kind: "volume"; ml: number }
  | { kind: "each"; each: number };

const SPOONS = new Set(["tbsp", "tsp", "cup", "pinch"]);

export function isSpoon(unit: string): boolean {
  return SPOONS.has(unit);
}

export function measureOf(quantity: number, unit: string): Measure | null {
  switch (unit) {
    case "g":
      return { kind: "weight", grams: quantity };
    case "kg":
      return { kind: "weight", grams: quantity * 1000 };
    case "oz":
      return { kind: "weight", grams: quantity * GRAMS_PER_OUNCE };
    case "lb":
      return { kind: "weight", grams: quantity * GRAMS_PER_POUND };
    case "ml":
      return { kind: "volume", ml: quantity };
    case "l":
      return { kind: "volume", ml: quantity * 1000 };
    case "piece":
    case "bunch":
    case "portion":
      return { kind: "count", each: quantity };
    default:
      return null;
  }
}

/** Millilitres in one of these spoon units, for this ingredient. Teaspoons and cups follow the tablespoon when that is the only answer on file. */
export function spoonMillilitres(ingredient: Ingredient, unit: string): number | null {
  if (unit === "tbsp") return positive(ingredient.tablespoonMl);
  if (unit === "tsp") {
    return positive(ingredient.teaspoonMl) ?? scale(ingredient.tablespoonMl, 1 / 3);
  }
  if (unit === "cup") {
    return positive(ingredient.cupMl) ?? scale(ingredient.tablespoonMl, 16);
  }
  if (unit === "pinch") return positive(ingredient.pinchMl);
  return null;
}

function positive(value: number | null): number | null {
  return value != null && value > 0 ? value : null;
}

function scale(value: number | null, factor: number): number | null {
  const base = positive(value);
  return base == null ? null : base * factor;
}

/** What one purchase of this product contains. A recorded usable amount wins over the pack label. */
export function purchaseBasis(product: Product): Basis | null {
  if (product.usableAmount != null && product.usableAmount > 0 && product.usableUnit) {
    const measured = measureOf(product.usableAmount, product.usableUnit);
    if (measured?.kind === "weight") return { kind: "weight", grams: measured.grams };
    if (measured?.kind === "volume") return { kind: "volume", ml: measured.ml };
  }
  return parsePack(product.packLabel);
}

function parsePack(pack: string | null): Basis | null {
  if (!pack) return null;
  const compact = pack.trim().toLowerCase().replace(/\s+/g, "");
  const sized = compact.match(/^(\d+(?:\.\d+)?)(kg|g|lb|l|lt|ml)(?:\/pk)?$/);
  if (sized) {
    const amount = Number(sized[1]);
    switch (sized[2]) {
      case "kg":
        return { kind: "weight", grams: amount * 1000 };
      case "g":
        return { kind: "weight", grams: amount };
      case "lb":
        return { kind: "weight", grams: amount * GRAMS_PER_POUND };
      case "l":
      case "lt":
        return { kind: "volume", ml: amount * 1000 };
      case "ml":
        return { kind: "volume", ml: amount };
      default:
        return null;
    }
  }
  if (compact === "kg") return { kind: "weight", grams: 1000 };
  if (compact === "g" || compact === "gr") return { kind: "weight", grams: 1 };
  if (compact === "lb") return { kind: "weight", grams: GRAMS_PER_POUND };
  if (compact === "oz") return { kind: "weight", grams: GRAMS_PER_OUNCE };
  if (["l", "lt", "ltr", "litre", "liter"].includes(compact)) {
    return { kind: "volume", ml: 1000 };
  }
  if (compact === "ml") return { kind: "volume", ml: 1 };
  if (["pc", "pcs", "ea", "piece", "each", "bun", "bunch"].includes(compact)) {
    return { kind: "each", each: 1 };
  }
  return null;
}

export function payForQuantity(onPlate: number, spillagePercent: number): number | null {
  if (spillagePercent < 0 || spillagePercent >= 100) return null;
  return onPlate / (1 - spillagePercent / 100);
}

/** The other weighing system, so 100 g shows as about 3.5 oz and 4 oz shows as grams. */
export function weightAside(quantity: number, unit: string): string | null {
  if (unit === "g" || unit === "kg") {
    const grams = unit === "kg" ? quantity * 1000 : quantity;
    return `${trimNumber(grams / GRAMS_PER_OUNCE)} oz`;
  }
  if (unit === "oz" || unit === "lb") {
    const grams = unit === "lb" ? quantity * GRAMS_PER_POUND : quantity * GRAMS_PER_OUNCE;
    return `${trimNumber(grams)} g`;
  }
  return null;
}

export function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

export function unitLabel(unit: string): string {
  switch (unit) {
    case "g":
      return "g";
    case "kg":
      return "kg";
    case "ml":
      return "ml";
    case "l":
      return "L";
    case "oz":
      return "oz";
    case "lb":
      return "lb";
    case "tbsp":
      return "tbsp";
    case "tsp":
      return "tsp";
    case "cup":
      return "cup";
    case "pinch":
      return "pinch";
    case "piece":
      return "piece";
    case "bunch":
      return "bunch";
    case "portion":
      return "portion";
    default:
      return unit;
  }
}
