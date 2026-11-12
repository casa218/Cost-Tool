import { CATEGORIES, GROUPS, type Category, type Group } from "@/lib/food-cost/types";
import { trimNumber, unitLabel, weightAside } from "@/lib/food-cost/units";

export function hkd(value: number): string {
  const absolute = Math.abs(value);
  const digits = absolute > 0 && absolute < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function categoryLabel(category: Category): string {
  return CATEGORIES.find(([id]) => id === category)?.[1] ?? category;
}

export function groupLabel(group: Group): string {
  return GROUPS.find(([id]) => id === group)?.[1] ?? group;
}

export function quantityLabel(quantity: number, unit: string): string {
  const text = `${trimNumber(quantity)} ${unitLabel(unit)}`;
  const aside = weightAside(quantity, unit);
  return aside ? `${text} · ${aside}` : text;
}

export function yieldSentence(dish: {
  portions: number | null;
  portionAmount: number | null;
  portionUnit: string | null;
  portionLabel: string | null;
}): string {
  const portions =
    dish.portions != null && dish.portions > 0
      ? `This batch makes ${trimNumber(dish.portions)} ${dish.portions === 1 ? "portion" : "portions"}.`
      : "The sheet does not say how many portions this batch makes.";
  if (dish.portionAmount != null && dish.portionUnit) {
    return `${portions} One portion is ${trimNumber(dish.portionAmount)} ${unitLabel(dish.portionUnit)}.`;
  }
  if (dish.portionLabel) {
    return `${portions} The sheet's size box says ${dish.portionLabel}, without a unit.`;
  }
  return `${portions} One portion's size was not written down.`;
}

export function methodBlocks(method: string): string[] {
  return method
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}
