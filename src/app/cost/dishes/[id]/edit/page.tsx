import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipeEditor } from "@/components/cost/recipe-editor";
import { readDb } from "@/lib/food-cost/store";
import type { Database } from "@/lib/food-cost/types";

export const dynamic = "force-dynamic";

export default async function EditDishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = readDb();
  const dish = db.dishes.find((item) => item.id === id);
  if (!dish) notFound();
  return (
    <div>
      <Link href={`/cost/dishes/${dish.id}`} className="text-sm text-brand-700">
        Back to the technical file
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit {dish.name}</h1>
      <div className="mt-6">
        <RecipeEditor db={catalogue(db)} dish={dish} creating={false} />
      </div>
    </div>
  );
}

function catalogue(db: Database): Database {
  return { ...db, dishes: db.dishes.map((dish) => ({ ...dish, method: "" })) };
}
