import type {
  Database,
  Dish,
  DishCost,
  Ingredient,
  IssueCode,
  LineCost,
  Product,
  RecipeLine,
} from "@/lib/food-cost/types";
import {
  isSpoon,
  measureOf,
  NONSENSE_PRICE,
  payForQuantity,
  purchaseBasis,
  spoonMillilitres,
  type Basis,
  type Measure,
} from "@/lib/food-cost/units";

type Indexes = {
  dish: Map<string, Dish>;
  ingredient: Map<string, Ingredient>;
  product: Map<string, Product>;
};

export function indexDb(db: Database): Indexes {
  return {
    dish: new Map(db.dishes.map((dish) => [dish.id, dish])),
    ingredient: new Map(db.ingredients.map((ingredient) => [ingredient.id, ingredient])),
    product: new Map(db.products.map((product) => [product.id, product])),
  };
}

export type ProductResolution =
  | { kind: "none" }
  | { kind: "choose"; options: Product[] }
  | { kind: "use"; product: Product };

export function resolveProduct(
  ingredient: Ingredient,
  products: Map<string, Product>,
): ProductResolution {
  const options = ingredient.productIds
    .map((id) => products.get(id))
    .filter((product): product is Product => product != null);
  if (options.length === 0) return { kind: "none" };
  if (options.length === 1) return { kind: "use", product: options[0] };
  const preferred = options.find((product) => product.id === ingredient.preferredProductId);
  if (preferred) return { kind: "use", product: preferred };
  return { kind: "choose", options };
}

export function costDish(db: Database, dishId: string): DishCost {
  return costDishWith(db, indexDb(db), dishId, new Set());
}

/** Cost a recipe that is still being edited, using saved preparations around it. */
export function previewDish(db: Database, draft: Dish): DishCost {
  const dishes = db.dishes.some((dish) => dish.id === draft.id)
    ? db.dishes.map((dish) => (dish.id === draft.id ? draft : dish))
    : [...db.dishes, draft];
  return costDish({ ...db, dishes }, draft.id);
}

function costDishWith(
  db: Database,
  indexes: Indexes,
  dishId: string,
  stack: Set<string>,
): DishCost {
  const dish = indexes.dish.get(dishId);
  if (!dish || stack.has(dishId)) {
    return {
      lines: [],
      knownBatchCost: 0,
      batchCost: null,
      batchComplete: false,
      portionCost: null,
      suggested: null,
      noPortions: true,
    };
  }
  const next = new Set(stack);
  next.add(dishId);
  const lines = dish.lines.map((line) => costLine(db, indexes, line, next));
  const knownBatchCost = lines.reduce((sum, line) => sum + (line.knownCost ?? 0), 0);
  const batchComplete = lines.length > 0 && lines.every((line) => line.complete);
  const batchCost = batchComplete
    ? lines.reduce((sum, line) => sum + (line.cost ?? 0), 0)
    : null;
  const noPortions = dish.portions == null || dish.portions <= 0;
  const portionCost =
    batchCost != null && !noPortions ? batchCost / dish.portions! : null;
  const suggested =
    portionCost != null ? portionCost / db.targetFoodCost : null;
  return {
    lines,
    knownBatchCost,
    batchCost,
    batchComplete,
    portionCost,
    suggested,
    noPortions,
  };
}

function costLine(
  db: Database,
  indexes: Indexes,
  line: RecipeLine,
  stack: Set<string>,
): LineCost {
  const payFor = payForQuantity(line.quantity, line.spillagePercent);
  const base: LineCost = {
    onPlate: line.quantity,
    payFor,
    unit: line.unit,
    cost: null,
    knownCost: null,
    complete: false,
    productId: null,
    issues: [],
  };
  if (payFor == null) {
    base.issues = ["bad-spillage"];
    return base;
  }
  const factor = line.quantity === 0 ? 1 : payFor / line.quantity;

  if (line.componentDishId) {
    return costComponent(db, indexes, line, base, factor, stack);
  }

  const ingredient = indexes.ingredient.get(line.ingredientId);
  if (!ingredient) {
    base.issues = ["missing-ingredient"];
    return base;
  }
  if (ingredient.free) {
    return { ...base, cost: 0, knownCost: 0, complete: true };
  }
  if (ingredient.preparationDishId) {
    return costComponent(db, indexes, { ...line, componentDishId: ingredient.preparationDishId }, base, factor, stack);
  }

  const resolution = resolveProduct(ingredient, indexes.product);
  if (resolution.kind === "none") {
    base.issues = ["no-product"];
    return base;
  }
  if (resolution.kind === "choose") {
    base.issues = ["choose-supplier"];
    return base;
  }
  const product = resolution.product;
  base.productId = product.id;
  if (product.flags.includes("nonsense-price") || (product.price != null && product.price >= NONSENSE_PRICE)) {
    base.issues = ["nonsense-price"];
    return base;
  }
  if (product.price == null || product.flags.includes("missing-price")) {
    base.issues = ["missing-price"];
    return base;
  }

  const priced = priceQuantity(payFor, line.unit, product, ingredient);
  if (priced.issue) {
    base.issues = [priced.issue];
    return base;
  }
  return { ...base, cost: priced.cost, knownCost: priced.cost, complete: true };
}

function costComponent(
  db: Database,
  indexes: Indexes,
  line: RecipeLine,
  base: LineCost,
  factor: number,
  stack: Set<string>,
): LineCost {
  const prepId = line.componentDishId;
  if (!prepId) {
    base.issues = ["no-product"];
    return base;
  }
  if (stack.has(prepId)) {
    base.issues = ["cycle"];
    return base;
  }
  const prep = indexes.dish.get(prepId);
  if (!prep) {
    base.issues = ["no-product"];
    return base;
  }
  const fraction = fractionOfBatch(line, prep);
  if (fraction == null) {
    base.issues = ["need-portion-size"];
    return base;
  }
  const prepCost = costDishWith(db, indexes, prepId, stack);
  const known = prepCost.knownBatchCost * fraction * factor;
  if (!prepCost.batchComplete || prepCost.batchCost == null) {
    return {
      ...base,
      knownCost: known,
      complete: false,
      issues: ["component-unfinished"],
    };
  }
  const cost = prepCost.batchCost * fraction * factor;
  return { ...base, cost, knownCost: cost, complete: true };
}

/** Share of the preparation's batch this line uses, before spillage. */
function fractionOfBatch(line: RecipeLine, prep: Dish): number | null {
  if (prep.portions == null || prep.portions <= 0) return null;
  if (line.unit === "portion" || line.unit === "piece") {
    return line.quantity / prep.portions;
  }
  if (prep.portionAmount == null || prep.portionAmount <= 0 || !prep.portionUnit) {
    return null;
  }
  const lineMeasure = measureOf(line.quantity, line.unit);
  const portionMeasure = measureOf(prep.portionAmount, prep.portionUnit);
  if (!lineMeasure || !portionMeasure) return null;
  if (lineMeasure.kind === "weight" && portionMeasure.kind === "weight") {
    const batch = portionMeasure.grams * prep.portions;
    return batch > 0 ? lineMeasure.grams / batch : null;
  }
  if (lineMeasure.kind === "volume" && portionMeasure.kind === "volume") {
    const batch = portionMeasure.ml * prep.portions;
    return batch > 0 ? lineMeasure.ml / batch : null;
  }
  return null;
}

function priceQuantity(
  quantity: number,
  unit: string,
  product: Product,
  ingredient: Ingredient,
): { cost: number | null; issue?: IssueCode } {
  const price = product.price;
  if (price == null) return { cost: null, issue: "missing-price" };
  let measure: Measure | null;
  if (isSpoon(unit)) {
    const ml = spoonMillilitres(ingredient, unit);
    if (ml == null) {
      return { cost: null, issue: spoonIssue(unit) };
    }
    measure = { kind: "volume", ml: quantity * ml };
  } else {
    measure = measureOf(quantity, unit);
    if (!measure) return { cost: null, issue: "unknown-unit" };
  }
  const basis = purchaseBasis(product);
  if (!basis) return { cost: null, issue: "need-usable" };
  const converted = convert(measure, basis, product, ingredient);
  if (converted.issue || converted.units == null) return { cost: null, issue: converted.issue };
  return { cost: price * converted.units };
}

function spoonIssue(unit: string): IssueCode {
  if (unit === "tsp") return "need-teaspoon";
  if (unit === "cup") return "need-cup";
  if (unit === "pinch") return "need-pinch";
  return "need-tablespoon";
}

/** How many purchases this measure needs. */
function convert(
  measure: Measure,
  basis: Basis,
  product: Product,
  ingredient: Ingredient,
): { units: number | null; issue?: IssueCode } {
  if (measure.kind === "weight" && basis.kind === "weight") {
    return { units: measure.grams / basis.grams };
  }
  if (measure.kind === "volume" && basis.kind === "volume") {
    return { units: measure.ml / basis.ml };
  }
  if (measure.kind === "count" && basis.kind === "each") {
    return { units: measure.each / basis.each };
  }
  if (measure.kind === "count" && basis.kind === "weight") {
    if (product.countPerKg == null || product.countPerKg <= 0) {
      return { units: null, issue: "need-count-per-kg" };
    }
    const pricePerKg = 1 / (basis.grams / 1000);
    return { units: (pricePerKg / product.countPerKg) * measure.each };
  }
  if (measure.kind === "weight" && basis.kind === "each") {
    if (product.gramsPerEach == null || product.gramsPerEach <= 0) {
      return { units: null, issue: "need-grams-per-each" };
    }
    return { units: measure.grams / product.gramsPerEach / basis.each };
  }
  if (measure.kind === "volume" && basis.kind === "weight") {
    if (ingredient.gramsPerLitre == null || ingredient.gramsPerLitre <= 0) {
      return { units: null, issue: "need-grams-per-litre" };
    }
    const grams = (measure.ml / 1000) * ingredient.gramsPerLitre;
    return { units: grams / basis.grams };
  }
  if (measure.kind === "weight" && basis.kind === "volume") {
    if (ingredient.gramsPerLitre == null || ingredient.gramsPerLitre <= 0) {
      return { units: null, issue: "need-grams-per-litre" };
    }
    const ml = (measure.grams / ingredient.gramsPerLitre) * 1000;
    return { units: ml / basis.ml };
  }
  return { units: null, issue: "need-usable" };
}
