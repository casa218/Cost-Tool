import type { Database, Dish, Ingredient } from "@/lib/food-cost/types";

/** Same id the spreadsheet import uses: `ing-prep-` plus the dish slug. */
export function preparationIngredientId(dishId: string): string {
  const slug = dishId.startsWith("dish-") ? dishId.slice("dish-".length) : dishId;
  return `ing-prep-${slug}`;
}

function blankPreparation(id: string, dish: Dish): Ingredient {
  return {
    id,
    name: dish.name,
    nameZh: null,
    group: "made-in-house",
    usualSpillagePercent: 0,
    favorite: false,
    preferredProductId: null,
    productIds: [],
    preparationDishId: dish.id,
    free: false,
    tablespoonMl: null,
    teaspoonMl: null,
    cupMl: null,
    pinchMl: null,
    gramsPerLitre: null,
  };
}

/**
 * Search and costing find a kitchen preparation only through a catalogue
 * ingredient whose `preparationDishId` points at the dish. Creating one, or
 * moving a dish into that category, has to write that ingredient. Moving it
 * back out removes the ingredient when no recipe still uses it.
 */
export function syncPreparationCatalogue(db: Database, dish: Dish): void {
  const existing = db.ingredients.find((item) => item.preparationDishId === dish.id);
  const referenced = db.dishes.some((other) =>
    other.lines.some(
      (line) => line.componentDishId === dish.id || (existing != null && line.ingredientId === existing.id),
    ),
  );
  const wanted = dish.category === "preparations" || referenced;

  if (!wanted) {
    if (existing && existing.productIds.length === 0) {
      db.ingredients = db.ingredients.filter((item) => item.id !== existing.id);
      db.recentIngredientIds = db.recentIngredientIds.filter((id) => id !== existing.id);
    }
    return;
  }

  if (existing) {
    existing.name = dish.name;
    existing.group = "made-in-house";
    existing.preparationDishId = dish.id;
    return;
  }

  let id = preparationIngredientId(dish.id);
  let n = 2;
  while (db.ingredients.some((item) => item.id === id)) {
    id = `${preparationIngredientId(dish.id)}-${n}`;
    n += 1;
  }
  db.ingredients.push(blankPreparation(id, dish));
}
