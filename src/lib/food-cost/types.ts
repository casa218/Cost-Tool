export const CATEGORIES = [
  ["tapas", "Tapas"],
  ["mains", "Main courses"],
  ["desserts", "Desserts"],
  ["party", "Party platters"],
  ["preparations", "Kitchen preparations"],
] as const;

export const GROUPS = [
  ["vegetables", "Vegetables"],
  ["meat", "Meat"],
  ["seafood", "Seafood"],
  ["dairy-eggs", "Dairy and eggs"],
  ["dry-goods", "Dry goods"],
  ["oils-vinegar-wine", "Oils, vinegar, and wine"],
  ["spices", "Spices"],
  ["made-in-house", "Made in house"],
] as const;

export type Category = (typeof CATEGORIES)[number][0];
export type Group = (typeof GROUPS)[number][0];

export type Supplier = {
  id: string;
  name: string;
  sort: number;
};

export type Product = {
  id: string;
  supplierId: string;
  name: string;
  nameEn: string;
  nameZh: string | null;
  packLabel: string | null;
  price: number | null;
  usableAmount: number | null;
  usableUnit: "g" | "kg" | "ml" | "l" | null;
  note: string | null;
  confirmed: string | null;
  flags: string[];
  /** How many pieces are in 1 kg, when a recipe counts them and the product is sold by weight. */
  countPerKg: number | null;
  /** Grams in one piece, when a recipe weighs them and the product is sold by the piece. */
  gramsPerEach: number | null;
};

export type Ingredient = {
  id: string;
  name: string;
  nameZh: string | null;
  group: Group;
  usualSpillagePercent: number;
  favorite: boolean;
  preferredProductId: string | null;
  productIds: string[];
  preparationDishId: string | null;
  free: boolean;
  tablespoonMl: number | null;
  teaspoonMl: number | null;
  cupMl: number | null;
  pinchMl: number | null;
  gramsPerLitre: number | null;
  note?: string | null;
};

export type RecipeLine = {
  id: string;
  ingredientId: string;
  componentDishId: string | null;
  quantity: number;
  unit: string;
  spillagePercent: number;
  sourceName: string;
  sourceSupplier: string | null;
  sourceUnit: string | null;
  note: string | null;
};

export type Dish = {
  id: string;
  sheetName: string;
  name: string;
  category: Category;
  portions: number | null;
  portionAmount: number | null;
  portionUnit: string | null;
  portionLabel: string | null;
  menuPrice: number | null;
  method: string;
  lines: RecipeLine[];
};

export type Database = {
  currency: "HKD";
  targetFoodCost: number;
  recentIngredientIds: string[];
  suppliers: Supplier[];
  products: Product[];
  ingredients: Ingredient[];
  dishes: Dish[];
};

export type IssueCode =
  | "choose-supplier"
  | "missing-price"
  | "nonsense-price"
  | "no-product"
  | "unknown-unit"
  | "need-count-per-kg"
  | "need-grams-per-each"
  | "need-usable"
  | "need-tablespoon"
  | "need-teaspoon"
  | "need-cup"
  | "need-pinch"
  | "need-grams-per-litre"
  | "need-portion-size"
  | "component-unfinished"
  | "cycle"
  | "bad-spillage"
  | "missing-ingredient";

export type LineCost = {
  onPlate: number;
  payFor: number | null;
  unit: string;
  cost: number | null;
  knownCost: number | null;
  complete: boolean;
  productId: string | null;
  issues: IssueCode[];
};

export type DishCost = {
  lines: LineCost[];
  knownBatchCost: number;
  batchCost: number | null;
  batchComplete: boolean;
  portionCost: number | null;
  suggested: number | null;
  noPortions: boolean;
};
