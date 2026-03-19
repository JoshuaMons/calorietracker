/**
 * Willekeurige recepten van TheMealDB (publieke API, geen key).
 * Gebruikt voor het vrije schema-tabblad; bij fout/CORS val je terug op null.
 */

const THEMEALDB_RANDOM = "https://www.themealdb.com/api/json/v1/1/random.php";

function estimateKcalFromCategory(category) {
  const c = String(category || "").toLowerCase();
  if (c.includes("dessert") || c.includes("sweet")) return 320;
  if (c.includes("breakfast")) return 380;
  if (c.includes("beef") || c.includes("lamb")) return 520;
  if (c.includes("pork")) return 500;
  if (c.includes("chicken") || c.includes("poultry")) return 480;
  if (c.includes("seafood") || c.includes("fish")) return 450;
  if (c.includes("pasta")) return 520;
  if (c.includes("vegetarian") || c.includes("vegan")) return 380;
  if (c.includes("side")) return 280;
  return 430;
}

function estimateProteinFromCategory(category) {
  const c = String(category || "").toLowerCase();
  if (c.includes("beef") || c.includes("chicken") || c.includes("lamb") || c.includes("pork")) return 38;
  if (c.includes("seafood") || c.includes("fish")) return 34;
  if (c.includes("vegetarian") || c.includes("vegan") || c.includes("dessert")) return 14;
  return 28;
}

function extractMealDbIngredients(m) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const ing = m[`strIngredient${i}`];
    const meas = m[`strMeasure${i}`];
    const ingT = ing && String(ing).trim();
    if (!ingT) continue;
    const measT = meas && String(meas).trim();
    out.push(measT ? `${measT} ${ingT}` : ingT);
  }
  return out;
}

function instructionsToSteps(text) {
  const raw = String(text || "").trim();
  if (!raw) return ["Bereiden volgens het originele recept (bron: TheMealDB)."];

  let parts = raw
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);

  if (parts.length < 2) {
    parts = raw
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4);
  }

  if (parts.length === 0) parts = [raw.slice(0, 280) + (raw.length > 280 ? "…" : "")];
  return parts.slice(0, 10);
}

/**
 * @returns {Promise<null | { title: string, steps: string[], ingredients: string[], kcal: number, protein: number, sourceNote: string }>}
 */
export async function fetchTheMealDbMeal() {
  try {
    const res = await fetch(THEMEALDB_RANDOM, { mode: "cors" });
    if (!res.ok) return null;
    const data = await res.json();
    const m = data?.meals?.[0];
    if (!m?.strMeal) return null;

    const cat = m.strCategory || "";
    const title = `${m.strMeal} (TheMealDB)`;
    const ingredients = extractMealDbIngredients(m);
    const steps = instructionsToSteps(m.strInstructions);
    return {
      title,
      steps,
      ingredients: ingredients.length ? ingredients : steps,
      kcal: estimateKcalFromCategory(cat),
      protein: estimateProteinFromCategory(cat),
      sourceNote: [cat, m.strArea].filter(Boolean).join(" · "),
    };
  } catch {
    return null;
  }
}
