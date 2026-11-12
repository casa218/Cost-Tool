import { hkd, quantityLabel } from "@/lib/food-cost/format";
import type {
  Database,
  Dish,
  Ingredient,
  IssueCode,
  LineCost,
  Product,
  RecipeLine,
} from "@/lib/food-cost/types";
import { purchaseBasis, trimNumber, unitLabel } from "@/lib/food-cost/units";

export type BridgePrompt =
  | { kind: "count-per-kg"; productId: string; question: string }
  | { kind: "grams-per-each"; productId: string; question: string }
  | { kind: "usable"; productId: string; question: string }
  | { kind: "tablespoon-ml"; ingredientId: string; question: string }
  | { kind: "teaspoon-ml"; ingredientId: string; question: string }
  | { kind: "cup-ml"; ingredientId: string; question: string }
  | { kind: "pinch-ml"; ingredientId: string; question: string }
  | { kind: "grams-per-litre"; ingredientId: string; question: string }
  | { kind: "portion-size"; dishId: string; unit: "g" | "ml"; question: string };

export type SupplierOption = {
  productId: string;
  title: string;
  detail: string;
  warning: string | null;
};

export type LinePresentation = {
  name: string;
  note: string | null;
  onPlate: string;
  payFor: string | null;
  spillage: number;
  supplier: string | null;
  cost: string | null;
  known: string | null;
  componentHref: string | null;
  componentName: string | null;
  issues: string[];
  bridge: BridgePrompt | null;
  choice: { ingredientId: string; options: SupplierOption[] } | null;
};

export function presentLine(
  db: Database,
  line: RecipeLine,
  cost: LineCost,
): LinePresentation {
  const ingredient = db.ingredients.find((item) => item.id === line.ingredientId);
  const product = cost.productId
    ? db.products.find((item) => item.id === cost.productId) ?? null
    : null;
  const supplier = product
    ? db.suppliers.find((item) => item.id === product.supplierId) ?? null
    : null;
  const componentId = line.componentDishId ?? ingredient?.preparationDishId ?? null;
  const component = componentId ? db.dishes.find((dish) => dish.id === componentId) ?? null : null;
  const choice =
    cost.issues.includes("choose-supplier") && ingredient
      ? {
          ingredientId: ingredient.id,
          options: supplierOptions(db, ingredient),
        }
      : null;
  return {
    name: ingredient?.name ?? line.sourceName,
    note: line.note ?? ingredient?.note ?? null,
    onPlate: quantityLabel(cost.onPlate, cost.unit),
    payFor:
      cost.payFor == null ? null : quantityLabel(cost.payFor, cost.unit),
    spillage: line.spillagePercent,
    supplier: supplier && product ? `${supplier.name} · ${packPhrase(product)}` : null,
    cost: cost.cost == null ? null : hkd(cost.cost),
    known: !cost.complete && cost.knownCost != null && cost.knownCost > 0 ? hkd(cost.knownCost) : null,
    componentHref: component ? `/cost/dishes/${component.id}` : null,
    componentName: component?.name ?? null,
    issues: cost.issues.map((issue) => issueText(issue, ingredient ?? null, product, component)),
    bridge: choice ? null : bridgeFor(cost.issues, ingredient ?? null, product, component, line),
    choice,
  };
}

export function supplierOptions(db: Database, ingredient: Ingredient): SupplierOption[] {
  return ingredient.productIds.flatMap((id) => {
    const product = db.products.find((item) => item.id === id);
    if (!product) return [];
    const supplier = db.suppliers.find((item) => item.id === product.supplierId);
    return [
      {
        productId: product.id,
        title: product.nameEn || product.name,
        detail: `${supplier?.name ?? "Supplier"} · ${packPhrase(product)} · ${pricePhrase(product)}`,
        warning: productWarning(product),
      },
    ];
  });
}

export function packPhrase(product: Product): string {
  const pack = product.packLabel || "pack";
  if (product.usableAmount != null && product.usableUnit) {
    return `${pack}, ${trimNumber(product.usableAmount)} ${unitLabel(product.usableUnit)} usable`;
  }
  const basis = purchaseBasis(product);
  if (basis?.kind === "weight" && product.packLabel && !/^\d/.test(product.packLabel)) {
    return pack;
  }
  return pack;
}

export function pricePhrase(product: Product): string {
  if (product.flags.includes("nonsense-price")) return "price looks wrong";
  if (product.price == null) return "no price";
  const pack = product.packLabel ? ` / ${product.packLabel}` : "";
  return `${hkd(product.price)}${pack}`;
}

function productWarning(product: Product): string | null {
  if (product.flags.includes("nonsense-price")) return "This price is not usable.";
  if (product.price == null || product.flags.includes("missing-price")) return "No price on the sheet.";
  if (product.flags.includes("unmatched")) return "The sheet was not sure which catalogue line this is.";
  return null;
}

function bridgeFor(
  issues: IssueCode[],
  ingredient: Ingredient | null,
  product: Product | null,
  component: Dish | null,
  line: RecipeLine,
): BridgePrompt | null {
  const name = ingredient?.name ?? line.sourceName;
  if (issues.includes("need-count-per-kg") && product) {
    return {
      kind: "count-per-kg",
      productId: product.id,
      question: `${product.nameEn} is ${pricePhrase(product)}. About how many are in 1 kg?`,
    };
  }
  if (issues.includes("need-grams-per-each") && product) {
    return {
      kind: "grams-per-each",
      productId: product.id,
      question: `${product.nameEn} is bought by the piece. How many grams are in one?`,
    };
  }
  if (issues.includes("need-usable") && product) {
    return {
      kind: "usable",
      productId: product.id,
      question: `${product.nameEn} is sold as a ${product.packLabel || "pack"}. How much usable food is in it?`,
    };
  }
  if (issues.includes("need-tablespoon") && ingredient) {
    return {
      kind: "tablespoon-ml",
      ingredientId: ingredient.id,
      question: `How many millilitres are in 1 tablespoon of ${name}?`,
    };
  }
  if (issues.includes("need-teaspoon") && ingredient) {
    return {
      kind: "teaspoon-ml",
      ingredientId: ingredient.id,
      question: `How many millilitres are in 1 teaspoon of ${name}?`,
    };
  }
  if (issues.includes("need-cup") && ingredient) {
    return {
      kind: "cup-ml",
      ingredientId: ingredient.id,
      question: `How many millilitres are in 1 cup of ${name}?`,
    };
  }
  if (issues.includes("need-pinch") && ingredient) {
    return {
      kind: "pinch-ml",
      ingredientId: ingredient.id,
      question: `How many millilitres are in 1 pinch of ${name}?`,
    };
  }
  if (issues.includes("need-grams-per-litre") && ingredient) {
    return {
      kind: "grams-per-litre",
      ingredientId: ingredient.id,
      question: `${name} is bought in one unit and the recipe uses another. How many grams are in 1 litre?`,
    };
  }
  if (issues.includes("need-portion-size") && component) {
    const unit = line.unit === "ml" || line.unit === "l" ? "ml" : "g";
    return {
      kind: "portion-size",
      dishId: component.id,
      unit,
      question: `How many ${unit === "ml" ? "millilitres" : "grams"} is one portion of ${component.name}?`,
    };
  }
  return null;
}

function issueText(
  issue: IssueCode,
  ingredient: Ingredient | null,
  product: Product | null,
  component: Dish | null,
): string {
  switch (issue) {
    case "choose-supplier":
      return "More than one supplier sells this. Choose one, and it will be kept.";
    case "missing-price":
      return `${product?.nameEn ?? "This product"} has no price.`;
    case "nonsense-price":
      return `${product?.nameEn ?? "This product"} has a price that cannot be right. It is flagged, not replaced.`;
    case "no-product":
      return ingredient?.note || "No price list line matches this, so it is not costed.";
    case "unknown-unit":
      return "This unit is not one the tool can cost yet.";
    case "component-unfinished":
      return component
        ? `${component.name} still has lines without a cost, so this dish is not finished.`
        : "The preparation still has lines without a cost.";
    case "cycle":
      return "This recipe refers back to itself.";
    case "bad-spillage":
      return "Spillage has to be under 100%.";
    case "missing-ingredient":
      return "This line's ingredient is missing.";
    default:
      return "";
  }
}

export function unfinishedProduct(product: Product): boolean {
  return (
    product.flags.includes("missing-price") ||
    product.flags.includes("nonsense-price") ||
    product.flags.includes("unmatched")
  );
}

export function flagLabel(flag: string): string {
  switch (flag) {
    case "missing-price":
      return "Missing price";
    case "nonsense-price":
      return "Nonsense price";
    case "unmatched":
      return "Which one?";
    case "non-food":
      return "Not food";
    default:
      return flag;
  }
}
