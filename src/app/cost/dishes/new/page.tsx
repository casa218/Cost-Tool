import Link from "next/link";
import { RecipeEditor } from "@/components/cost/recipe-editor";
import { readDb } from "@/lib/food-cost/store";
import type { Database, Dish } from "@/lib/food-cost/types";

export const dynamic = "force-dynamic";

const blank: Dish = {
  id: "new",
  sheetName: "",
  name: "",
  category: "tapas",
  portions: 1,
  portionAmount: null,
  portionUnit: null,
  portionLabel: null,
  menuPrice: null,
  method: "",
  lines: [],
};

export default function NewDishPage() {
  const db = readDb();
  return (
    <div>
      <Link href="/cost" className="text-sm text-brand-700">
        Back to dishes
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New recipe</h1>
      <div className="mt-6">
        <RecipeEditor db={catalogue(db)} dish={blank} creating />
      </div>
    </div>
  );
}

function catalogue(db: Database): Database {
  return { ...db, dishes: db.dishes.map((dish) => ({ ...dish, method: "" })) };
}
