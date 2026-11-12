"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { syncPreparationCatalogue } from "@/lib/food-cost/catalogue";
import { NONSENSE_PRICE } from "@/lib/food-cost/units";
import { readDb, writeDb } from "@/lib/food-cost/store";
import type { Category, Dish, RecipeLine } from "@/lib/food-cost/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const categories = ["tapas", "mains", "desserts", "party", "preparations"] as const;

const lineSchema = z.object({
  id: z.string().min(1),
  ingredientId: z.string().min(1),
  componentDishId: z.string().nullable(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  spillagePercent: z.number().min(0).lt(100),
  sourceName: z.string(),
  sourceSupplier: z.string().nullable(),
  sourceUnit: z.string().nullable(),
  note: z.string().nullable(),
});

const dishSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "Give the dish a name."),
  category: z.enum(categories),
  portions: z.number().positive().nullable(),
  portionAmount: z.number().positive().nullable(),
  portionUnit: z.string().nullable(),
  menuPrice: z.number().nonnegative().nullable(),
  method: z.string(),
  lines: z.array(lineSchema),
});

export type DishInput = z.infer<typeof dishSchema>;

const bridgeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count-per-kg"), productId: z.string(), amount: z.number().positive() }),
  z.object({ kind: z.literal("grams-per-each"), productId: z.string(), amount: z.number().positive() }),
  z.object({ kind: z.literal("usable"), productId: z.string(), amount: z.number().positive(), unit: z.enum(["g", "kg", "ml", "l"]) }),
  z.object({ kind: z.literal("tablespoon-ml"), ingredientId: z.string(), amount: z.number().positive() }),
  z.object({ kind: z.literal("teaspoon-ml"), ingredientId: z.string(), amount: z.number().positive() }),
  z.object({ kind: z.literal("cup-ml"), ingredientId: z.string(), amount: z.number().positive() }),
  z.object({ kind: z.literal("pinch-ml"), ingredientId: z.string(), amount: z.number().positive() }),
  z.object({ kind: z.literal("grams-per-litre"), ingredientId: z.string(), amount: z.number().positive() }),
  z.object({
    kind: z.literal("portion-size"),
    dishId: z.string(),
    amount: z.number().positive(),
    unit: z.enum(["g", "ml"]),
  }),
]);

export type BridgeInput = z.infer<typeof bridgeSchema>;

function refresh() {
  revalidatePath("/cost", "layout");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "dish";
}

export async function saveDish(input: DishInput): Promise<ActionResult> {
  const parsed = dishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the recipe." };
  }
  const draft = parsed.data;
  const db = readDb();
  if (draft.lines.some((line) => !db.ingredients.some((item) => item.id === line.ingredientId))) {
    return { ok: false, error: "One of the ingredients is no longer in the catalogue." };
  }
  const creating = !draft.id;
  let id = draft.id ?? "";
  if (creating) {
    const base = `dish-${slugify(draft.name)}`;
    id = base;
    let n = 2;
    while (db.dishes.some((dish) => dish.id === id)) {
      id = `${base}-${n}`;
      n += 1;
    }
  } else if (!db.dishes.some((dish) => dish.id === id)) {
    return { ok: false, error: "That dish is not in the file." };
  }

  const existing = db.dishes.find((dish) => dish.id === id);
  const next: Dish = {
    id,
    sheetName: existing?.sheetName || draft.name,
    name: draft.name,
    category: draft.category as Category,
    portions: draft.portions,
    portionAmount: draft.portionAmount,
    portionUnit: draft.portionAmount != null ? draft.portionUnit : null,
    portionLabel: existing?.portionLabel ?? null,
    menuPrice: draft.menuPrice,
    method: draft.method.trim(),
    lines: draft.lines.map((line) => line as RecipeLine),
  };
  db.dishes = existing
    ? db.dishes.map((dish) => (dish.id === id ? next : dish))
    : [...db.dishes, next];
  syncPreparationCatalogue(db, next);

  const recent = [...db.recentIngredientIds];
  for (const line of [...next.lines].reverse()) {
    const index = recent.indexOf(line.ingredientId);
    if (index >= 0) recent.splice(index, 1);
    recent.unshift(line.ingredientId);
  }
  db.recentIngredientIds = recent.slice(0, 8);
  writeDb(db);
  refresh();
  if (creating) redirect(`/cost/dishes/${id}`);
  return { ok: true };
}

export async function rememberSupplier(ingredientId: string, productId: string): Promise<ActionResult> {
  const db = readDb();
  const ingredient = db.ingredients.find((item) => item.id === ingredientId);
  if (!ingredient || !ingredient.productIds.includes(productId)) {
    return { ok: false, error: "That product is not one of the choices." };
  }
  ingredient.preferredProductId = productId;
  writeDb(db);
  refresh();
  return { ok: true };
}

export async function updateProductPrice(productId: string, price: number | null): Promise<ActionResult> {
  if (price != null && (!Number.isFinite(price) || price < 0)) {
    return { ok: false, error: "Enter a price, or leave it blank." };
  }
  const db = readDb();
  const product = db.products.find((item) => item.id === productId);
  if (!product) return { ok: false, error: "That product is not on a price list." };
  product.price = price;
  product.flags = product.flags.filter((flag) => flag !== "missing-price" && flag !== "nonsense-price");
  if (price == null) product.flags.push("missing-price");
  else if (price >= NONSENSE_PRICE) product.flags.push("nonsense-price");
  writeDb(db);
  refresh();
  return { ok: true };
}

export async function saveBridge(input: BridgeInput): Promise<ActionResult> {
  const parsed = bridgeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a number greater than zero." };
  const bridge = parsed.data;
  const db = readDb();
  if (bridge.kind === "count-per-kg" || bridge.kind === "grams-per-each" || bridge.kind === "usable") {
    const product = db.products.find((item) => item.id === bridge.productId);
    if (!product) return { ok: false, error: "That product is not on a price list." };
    if (bridge.kind === "count-per-kg") product.countPerKg = bridge.amount;
    if (bridge.kind === "grams-per-each") product.gramsPerEach = bridge.amount;
    if (bridge.kind === "usable") {
      product.usableAmount = bridge.amount;
      product.usableUnit = bridge.unit;
    }
  } else if (bridge.kind === "portion-size") {
    const dish = db.dishes.find((item) => item.id === bridge.dishId);
    if (!dish) return { ok: false, error: "That preparation is not in the file." };
    dish.portionAmount = bridge.amount;
    dish.portionUnit = bridge.unit;
  } else {
    const ingredient = db.ingredients.find((item) => item.id === bridge.ingredientId);
    if (!ingredient) return { ok: false, error: "That ingredient is not in the catalogue." };
    if (bridge.kind === "tablespoon-ml") ingredient.tablespoonMl = bridge.amount;
    if (bridge.kind === "teaspoon-ml") ingredient.teaspoonMl = bridge.amount;
    if (bridge.kind === "cup-ml") ingredient.cupMl = bridge.amount;
    if (bridge.kind === "pinch-ml") ingredient.pinchMl = bridge.amount;
    if (bridge.kind === "grams-per-litre") ingredient.gramsPerLitre = bridge.amount;
  }
  writeDb(db);
  refresh();
  return { ok: true };
}
