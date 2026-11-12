import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preparationIngredientId, syncPreparationCatalogue } from "@/lib/food-cost/catalogue";
import { costDish } from "@/lib/food-cost/cost";
import { searchIngredients } from "@/lib/food-cost/search";
import type { Database, Dish, Ingredient, Product, RecipeLine } from "@/lib/food-cost/types";

function product(partial: Partial<Product> & Pick<Product, "id" | "price">): Product {
  return {
    supplierId: "shop",
    name: partial.id,
    nameEn: partial.id,
    nameZh: null,
    packLabel: "kg",
    usableAmount: null,
    usableUnit: null,
    note: null,
    confirmed: null,
    flags: [],
    countPerKg: null,
    gramsPerEach: null,
    ...partial,
  };
}

function ingredient(partial: Partial<Ingredient> & Pick<Ingredient, "id">): Ingredient {
  return {
    name: partial.id,
    nameZh: null,
    group: "vegetables",
    usualSpillagePercent: 0,
    favorite: false,
    preferredProductId: null,
    productIds: [],
    preparationDishId: null,
    free: false,
    tablespoonMl: null,
    teaspoonMl: null,
    cupMl: null,
    pinchMl: null,
    gramsPerLitre: null,
    ...partial,
  };
}

function line(partial: Partial<RecipeLine> & Pick<RecipeLine, "ingredientId" | "quantity" | "unit">): RecipeLine {
  return {
    id: `${partial.ingredientId}-${partial.unit}`,
    componentDishId: null,
    spillagePercent: 0,
    sourceName: partial.ingredientId,
    sourceSupplier: null,
    sourceUnit: null,
    note: null,
    ...partial,
  };
}

function dish(partial: Partial<Dish> & Pick<Dish, "id">): Dish {
  return {
    sheetName: partial.id,
    name: partial.name ?? partial.id,
    category: "tapas",
    portions: 1,
    portionAmount: 100,
    portionUnit: "g",
    portionLabel: null,
    menuPrice: null,
    method: "",
    lines: [],
    ...partial,
  };
}

function database(dishes: Dish[], ingredients: Ingredient[], products: Product[] = []): Database {
  return {
    currency: "HKD",
    targetFoodCost: 0.3,
    recentIngredientIds: [],
    suppliers: [],
    products,
    ingredients,
    dishes,
  };
}

describe("preparation catalogue", () => {
  it("adds a made-in-house ingredient when a preparation is saved", () => {
    const prep = dish({
      id: "dish-new-salsa",
      name: "New salsa",
      category: "preparations",
      lines: [line({ ingredientId: "tomato", quantity: 100, unit: "g" })],
    });
    const db = database(
      [prep],
      [ingredient({ id: "tomato", productIds: ["tomato"] })],
      [product({ id: "tomato", price: 10 })],
    );
    syncPreparationCatalogue(db, prep);
    const made = db.ingredients.find((item) => item.preparationDishId === prep.id);
    expect(made?.id).toBe(preparationIngredientId(prep.id));
    expect(made?.group).toBe("made-in-house");
    expect(searchIngredients(db, "salsa").map((item) => item.id)).toContain(made!.id);

    const parent = dish({ id: "dish-tapa", lines: [] });
    db.dishes.push(parent);
    parent.lines.push(
      line({
        ingredientId: made!.id,
        componentDishId: made!.preparationDishId,
        quantity: 50,
        unit: "g",
      }),
    );
    expect(costDish(db, parent.id).batchCost).toBeCloseTo(0.5, 5);
  });

  it("creates the ingredient when a dish is moved into kitchen preparations", () => {
    const prep = dish({ id: "dish-mojo", name: "Mojo", category: "tapas" });
    const db = database([prep], []);
    syncPreparationCatalogue(db, prep);
    expect(db.ingredients.some((item) => item.preparationDishId === prep.id)).toBe(false);
    prep.category = "preparations";
    syncPreparationCatalogue(db, prep);
    expect(db.ingredients.filter((item) => item.preparationDishId === prep.id)).toHaveLength(1);
  });

  it("renames the existing ingredient and does not add a second one", () => {
    const prep = dish({ id: "dish-aoli-oli", name: "Aoli - Oli", category: "preparations" });
    const db = database(
      [prep],
      [ingredient({ id: "ing-prep-aoli-oli", name: "Aoli - Oli", group: "made-in-house", preparationDishId: prep.id })],
    );
    prep.name = "Aioli";
    syncPreparationCatalogue(db, prep);
    const matches = db.ingredients.filter((item) => item.preparationDishId === prep.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("Aioli");
  });

  it("drops the ingredient when the dish leaves preparations and nothing uses it", () => {
    const prep = dish({ id: "dish-salsa", name: "Salsa", category: "tapas" });
    const db = database(
      [prep],
      [ingredient({ id: "ing-prep-salsa", name: "Salsa", group: "made-in-house", preparationDishId: prep.id })],
    );
    db.recentIngredientIds = ["ing-prep-salsa"];
    syncPreparationCatalogue(db, prep);
    expect(db.ingredients.some((item) => item.id === "ing-prep-salsa")).toBe(false);
    expect(db.recentIngredientIds).not.toContain("ing-prep-salsa");
  });

  it("keeps the ingredient when another dish still uses the preparation", () => {
    const prep = dish({ id: "dish-salsa", name: "Salsa", category: "tapas" });
    const parent = dish({
      id: "dish-tapa",
      lines: [line({ ingredientId: "ing-prep-salsa", componentDishId: "dish-salsa", quantity: 10, unit: "g" })],
    });
    const db = database(
      [prep, parent],
      [ingredient({ id: "ing-prep-salsa", name: "Salsa", group: "made-in-house", preparationDishId: prep.id })],
    );
    syncPreparationCatalogue(db, prep);
    expect(db.ingredients.some((item) => item.preparationDishId === prep.id)).toBe(true);
  });
});

describe("writable data file", () => {
  it("keeps the cost database in a data directory the server can write, and traces it", () => {
    const store = readFileSync("src/lib/food-cost/store.ts", "utf8");
    const config = readFileSync("next.config.ts", "utf8");
    expect(store).toContain('path.join(process.cwd(), "data", "food-cost.json")');
    expect(store).toContain("writeFileSync");
    expect(config).toContain('"/cost/**": ["./data/food-cost.json"]');
  });
});
