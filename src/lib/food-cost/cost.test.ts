import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { costDish } from "@/lib/food-cost/cost";
import { searchIngredients } from "@/lib/food-cost/search";
import { packFormValue } from "@/lib/food-cost/units";
import type { Database, Dish, Ingredient, Product, RecipeLine } from "@/lib/food-cost/types";

function product(partial: Partial<Product> & Pick<Product, "id" | "price" | "packLabel">): Product {
  return {
    supplierId: "shop",
    name: partial.id,
    nameEn: partial.id,
    nameZh: null,
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

function ingredient(
  partial: Partial<Ingredient> & Pick<Ingredient, "id" | "productIds">,
): Ingredient {
  return {
    name: partial.id,
    nameZh: null,
    group: "vegetables",
    usualSpillagePercent: 0,
    favorite: false,
    preferredProductId: null,
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

function line(
  partial: Partial<RecipeLine> & Pick<RecipeLine, "ingredientId" | "quantity" | "unit">,
): RecipeLine {
  return {
    id: partial.ingredientId + partial.unit,
    componentDishId: null,
    spillagePercent: 0,
    sourceName: partial.ingredientId,
    sourceSupplier: null,
    sourceUnit: null,
    note: null,
    ...partial,
  };
}

function dish(partial: Partial<Dish> & Pick<Dish, "id" | "lines">): Dish {
  return {
    sheetName: partial.id,
    name: partial.id,
    category: "tapas",
    portions: 1,
    portionAmount: null,
    portionUnit: null,
    portionLabel: null,
    menuPrice: null,
    method: "",
    ...partial,
  };
}

function database(dishes: Dish[], products: Product[], ingredients: Ingredient[]): Database {
  return {
    currency: "HKD",
    targetFoodCost: 0.3,
    recentIngredientIds: [],
    suppliers: [{ id: "shop", name: "Shop", sort: 0 }],
    products,
    ingredients,
    dishes,
  };
}

describe("food cost", () => {
  it("converts grams to a price per kilogram", () => {
    const db = database(
      [dish({ id: "d", lines: [line({ ingredientId: "tomato", quantity: 100, unit: "g" })] })],
      [product({ id: "tomato", price: 15.8, packLabel: "kg" })],
      [ingredient({ id: "tomato", productIds: ["tomato"] })],
    );
    const cost = costDish(db, "d");
    expect(cost.batchComplete).toBe(true);
    expect(cost.batchCost).toBeCloseTo(1.58, 5);
  });

  it("treats spillage as the percent thrown away", () => {
    const db = database(
      [
        dish({
          id: "d",
          lines: [line({ ingredientId: "tomato", quantity: 100, unit: "g", spillagePercent: 3 })],
        }),
      ],
      [product({ id: "tomato", price: 10, packLabel: "kg" })],
      [ingredient({ id: "tomato", productIds: ["tomato"] })],
    );
    const cost = costDish(db, "d");
    expect(cost.lines[0].payFor).toBeCloseTo(100 / 0.97, 5);
    expect(cost.batchCost).toBeCloseTo(10 * (100 / 0.97) / 1000, 5);
    expect(cost.lines[0].onPlate).toBe(100);
  });

  it("suggests a menu price of portion cost divided by 30%", () => {
    const db = database(
      [
        dish({
          id: "d",
          portions: 1,
          lines: [line({ ingredientId: "tomato", quantity: 2000, unit: "g" })],
        }),
      ],
      [product({ id: "tomato", price: 10, packLabel: "kg" })],
      [ingredient({ id: "tomato", productIds: ["tomato"] })],
    );
    const cost = costDish(db, "d");
    expect(cost.portionCost).toBeCloseTo(20, 5);
    expect(cost.suggested).toBeCloseTo(20 / 0.3, 5);
  });

  it("asks once how many pieces are in a kilogram, then reuses the answer", () => {
    const cucumber = product({ id: "cuke", price: 15.8, packLabel: "kg", countPerKg: null });
    const asking = database(
      [dish({ id: "d", lines: [line({ ingredientId: "cuke", quantity: 1, unit: "piece" })] })],
      [cucumber],
      [ingredient({ id: "cuke", name: "Cucumber", productIds: ["cuke"] })],
    );
    expect(costDish(asking, "d").lines[0].issues).toContain("need-count-per-kg");

    cucumber.countPerKg = 4;
    const cost = costDish(asking, "d");
    expect(cost.batchComplete).toBe(true);
    expect(cost.batchCost).toBeCloseTo(15.8 / 4, 5);

    const byWeight = database(
      [dish({ id: "d", lines: [line({ ingredientId: "cuke", quantity: 10, unit: "g" })] })],
      [cucumber],
      [ingredient({ id: "cuke", productIds: ["cuke"] })],
    );
    expect(costDish(byWeight, "d").lines[0].issues).not.toContain("need-count-per-kg");
    expect(costDish(byWeight, "d").batchCost).toBeCloseTo(15.8 * 0.01, 5);
  });

  it("costs a tablespoon from the millilitres stored for that ingredient", () => {
    const db = database(
      [dish({ id: "d", lines: [line({ ingredientId: "oil", quantity: 1, unit: "tbsp" })] })],
      [product({ id: "oil", price: 100, packLabel: "l" })],
      [ingredient({ id: "oil", name: "Olive oil", productIds: ["oil"], tablespoonMl: 15 })],
    );
    expect(costDish(db, "d").batchCost).toBeCloseTo(1.5, 5);
    const salt = database(
      [dish({ id: "d", lines: [line({ ingredientId: "salt", quantity: 1, unit: "tbsp" })] })],
      [product({ id: "salt", price: 3, packLabel: "kg" })],
      [ingredient({ id: "salt", productIds: ["salt"], tablespoonMl: null })],
    );
    expect(costDish(salt, "d").lines[0].issues).toContain("need-tablespoon");
  });

  it("flows a preparation into the dish that uses it", () => {
    const products = [
      product({ id: "egg", price: 2, packLabel: "pc" }),
      product({ id: "oil", price: 100, packLabel: "l" }),
    ];
    const ingredients = [
      ingredient({ id: "egg", productIds: ["egg"], group: "dairy-eggs" }),
      ingredient({ id: "oil", productIds: ["oil"], group: "oils-vinegar-wine" }),
      ingredient({
        id: "aioli",
        name: "Aioli",
        productIds: [],
        group: "made-in-house",
        preparationDishId: "aioli",
      }),
    ];
    const aioli = dish({
      id: "aioli",
      category: "preparations",
      portions: 10,
      portionAmount: 15,
      portionUnit: "g",
      lines: [
        line({ ingredientId: "egg", quantity: 2, unit: "piece" }),
        line({ ingredientId: "oil", quantity: 100, unit: "ml" }),
      ],
    });
    const patatas = dish({
      id: "patatas",
      lines: [
        line({
          ingredientId: "aioli",
          componentDishId: "aioli",
          quantity: 30,
          unit: "g",
        }),
      ],
    });
    const db = database([aioli, patatas], products, ingredients);
    const first = costDish(db, "patatas");
    expect(first.batchComplete).toBe(true);
    expect(first.batchCost).toBeCloseTo((4 + 10) * (30 / 150), 5);

    aioli.lines[0].quantity = 4;
    const second = costDish(db, "patatas");
    expect(second.batchCost).toBeCloseTo((8 + 10) * (30 / 150), 5);
    expect(second.batchCost).not.toBeCloseTo(first.batchCost!, 5);
  });

  it("refuses a nonsense price instead of inventing one", () => {
    const db = database(
      [dish({ id: "d", lines: [line({ ingredientId: "meat", quantity: 100, unit: "g" })] })],
      [product({ id: "meat", price: 54_800_000, packLabel: "kg", flags: ["nonsense-price"] })],
      [ingredient({ id: "meat", productIds: ["meat"], group: "meat" })],
    );
    const cost = costDish(db, "d");
    expect(cost.batchComplete).toBe(false);
    expect(cost.batchCost).toBeNull();
    expect(cost.lines[0].issues).toContain("nonsense-price");
  });

  it("keeps a kilogram pack in kilograms, so an unchanged save does not multiply the cost", () => {
    const form = packFormValue({ usableAmount: 0.7, usableUnit: "kg" });
    expect(form).toEqual({ amount: "0.7", unit: "kg" });
    expect(packFormValue({ usableAmount: 5, usableUnit: "l" })).toEqual({ amount: "5", unit: "l" });
    const saved = product({
      id: "anchovy",
      price: 308,
      packLabel: "tray",
      usableAmount: Number(form.amount),
      usableUnit: form.unit,
    });
    const db = database(
      [dish({ id: "d", lines: [line({ ingredientId: "anchovy", quantity: 100, unit: "g" })] })],
      [saved],
      [ingredient({ id: "anchovy", productIds: ["anchovy"] })],
    );
    expect(costDish(db, "d").batchCost).toBeCloseTo(308 * (100 / 700), 5);
  });

  it("keeps a chosen supplier until it is changed", () => {
    const products = [
      product({ id: "a", price: 20, packLabel: "kg", supplierId: "one" }),
      product({ id: "b", price: 35, packLabel: "kg", supplierId: "two" }),
    ];
    const ing = ingredient({ id: "sole", productIds: ["a", "b"], group: "seafood" });
    const db = database(
      [dish({ id: "d", lines: [line({ ingredientId: "sole", quantity: 1000, unit: "g" })] })],
      products,
      [ing],
    );
    expect(costDish(db, "d").lines[0].issues).toContain("choose-supplier");
    ing.preferredProductId = "b";
    expect(costDish(db, "d").batchCost).toBeCloseTo(35, 5);
  });
});

describe("seeded spreadsheet", () => {
  const db = JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "food-cost.json"), "utf8"),
  ) as Database;

  it("prices Hong Kong dollars and suggests portion cost divided by 0.30", () => {
    expect(db.currency).toBe("HKD");
    expect(db.targetFoodCost).toBe(0.3);
    const jamon = db.dishes.find((item) => item.sheetName === "JAMON IBERICO");
    expect(jamon).toBeTruthy();
    const cost = costDish(db, jamon!.id);
    expect(cost.batchComplete).toBe(true);
    expect(cost.portionCost).toBeCloseTo(cost.batchCost! / jamon!.portions!, 5);
    expect(cost.suggested).toBeCloseTo(cost.portionCost! / 0.3, 5);
    expect(cost.batchCost).toBeCloseTo(62.4, 5);
  });

  it("keeps party platters separate and links aioli into Patatas Bravas", () => {
    const patatas = db.dishes.find((item) => item.sheetName === "PATATAS BRAVAS");
    const party = db.dishes.find((item) => item.sheetName === "PARTY PATATAS BRAVAS");
    expect(patatas?.category).toBe("tapas");
    expect(party?.category).toBe("party");
    expect(patatas?.id).not.toBe(party?.id);
    expect(patatas?.lines.some((item) => item.componentDishId === "dish-aoli-oli")).toBe(true);
    expect(patatas?.method.length).toBeGreaterThan(100);
  });

  it("flags the broken prices and keeps non-food out of the ingredient list", () => {
    const flagged = db.products.filter((item) => item.flags.includes("nonsense-price"));
    expect(flagged.map((item) => item.price).sort()).toEqual([23_800_000, 54_800_000]);
    expect(db.products.some((item) => item.name.includes("Mayonnaise") && item.price == null)).toBe(
      true,
    );
    expect(db.products.some((item) => item.name.includes("Baguette") && item.price == null)).toBe(
      true,
    );
    const nonFood = new Set(
      db.products.filter((item) => item.flags.includes("non-food")).map((item) => item.id),
    );
    expect(nonFood.size).toBeGreaterThan(0);
    expect(
      db.ingredients.some((item) => item.productIds.some((id) => nonFood.has(id))),
    ).toBe(false);
  });

  it("finds a Chinese catalogue name from an English or Chinese query", () => {
    const english = searchIngredients(db, "cucu").map((item) => item.name);
    const chinese = searchIngredients(db, "番茄").map((item) => item.name);
    expect(english).toContain("Cucumber");
    expect(chinese).toContain("Tomato");
  });
});
