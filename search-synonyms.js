/**
 * NL ↔ EN (en veelvoorkomende varianten) voor productzoeken.
 * Elke groep: woorden die elkaar als zoekterm mogen vervangen.
 */
export const SYNONYM_GROUPS = [
  ["rijst", "rice", "riz", "arroz", "riso"],
  ["kip", "chicken", "poultry", "poulet", "huhn"],
  ["rund", "beef", "boeuf", "carne"],
  ["varken", "pork", "porc", "spek", "bacon"],
  ["vis", "fish", "poisson", "zalm", "salmon", "tonijn", "tuna", "makreel", "mackerel"],
  ["ei", "eieren", "egg", "eggs", "oeuf"],
  ["melk", "milk", "lait", "latte"],
  ["kaas", "cheese", "fromage", "cheddar", "gouda"],
  ["yoghurt", "yogurt", "yoghourt", "kwark", "quark", "skyr"],
  ["brood", "bread", "pain", "toast", "bagel"],
  ["pasta", "spaghetti", "macaroni", "noodles", "noedels"],
  ["aardappel", "potato", "patat", "friet", "fries", "pommes"],
  ["tomaat", "tomato", "tomaten", "tomatoes"],
  ["ui", "onion", "onions", "sjalot", "shallot"],
  ["wortel", "carrot", "carrots", "wortelen"],
  ["sla", "lettuce", "salade", "salad"],
  ["komkommer", "cucumber"],
  ["paprika", "pepper", "peper"],
  ["bonen", "beans", "kidney", "zwarte", "black"],
  ["linzen", "lentils"],
  ["erwten", "peas"],
  ["mais", "corn"],
  ["appel", "apple", "apples"],
  ["banaan", "banana", "bananas"],
  ["sinaasappel", "orange", "oranges", "mandarijn", "mandarin"],
  ["aardbei", "strawberry", "strawberries"],
  ["druif", "grape", "grapes"],
  ["noten", "nuts", "walnut", "amandel", "almond", "hazelnoot"],
  ["chocolade", "chocolate", "cacao", "cocoa"],
  ["suiker", "sugar", "sucre"],
  ["honing", "honey", "miel"],
  ["olie", "oil", "olive", "olijf", "zonnebloem", "sunflower"],
  ["boter", "butter", "beurre", "margarine"],
  ["water", "eau", "spa", "mineraal"],
  ["thee", "tea", "chai", "earl"],
  ["koffie", "coffee", "espresso", "cappuccino", "latte"],
  ["sap", "juice", "jus", "vruchtensap"],
  ["frisdrank", "soda", "cola", "limonade", "soft"],
  ["bier", "beer", "ale"],
  ["wijn", "wine", "vin"],
  ["soep", "soup", "bouillon", "broth"],
  ["saus", "sauce", "dressing", "mayo", "mayonnaise", "ketchup"],
  ["muesli", "granola", "cereal", "ontbijtgranen"],
  ["haver", "oats", "oatmeal", "havermout"],
  ["quinoa"],
  ["couscous"],
  ["tofu", "soja", "soy", "soya"],
  ["hummus", "humus"],
  ["pizza"],
  ["burger", "hamburger"],
  ["wrap", "burrito", "taco"],
  ["ijs", "ice", "gelato", "sorbet", "roomijs"],
  ["koek", "cookie", "biscuit", "biscuits", "koekjes"],
  ["chips", "crisps", "snack"],
];

let _aliasMap = null;

function normalizeToken(w) {
  return String(w || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildAliasMap() {
  const map = new Map();
  for (const group of SYNONYM_GROUPS) {
    const tokens = [...new Set(group.map((g) => normalizeToken(g)).filter(Boolean))];
    for (const t of tokens) {
      if (!map.has(t)) map.set(t, new Set());
      for (const o of tokens) {
        if (o !== t) map.get(t).add(o);
      }
    }
  }
  return map;
}

function getAliasMap() {
  if (!_aliasMap) _aliasMap = buildAliasMap();
  return _aliasMap;
}

/** Alle varianten van één woord (incl. het woord zelf) voor substring-match. */
export function expandSearchToken(word) {
  const n = normalizeToken(word);
  if (!n) return [];
  const out = new Set([n]);
  const aliases = getAliasMap().get(n);
  if (aliases) {
    for (const a of aliases) out.add(a);
  }
  return [...out];
}

export function normalizeFoodSearchHaystack(food) {
  const parts = [
    food?.name,
    food?.category,
    food?.imageQuery,
    ...(Array.isArray(food?.tags) ? food.tags : []),
    ...(Array.isArray(food?.ingredients) ? food.ingredients : []),
  ];
  return normalizeToken(parts.join(" "));
}

const STOPWORDS = new Set([
  "de",
  "het",
  "een",
  "en",
  "van",
  "der",
  "die",
  "dat",
  "the",
  "a",
  "an",
  "and",
  "of",
  "for",
  "with",
  "aux",
  "la",
  "le",
  "les",
]);

/**
 * Zoekstring: alle woorden moeten matchen (EN-of: per woord één van de synoniemen in de haystack).
 */
export function matchesFoodSearchQuery(food, rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return true;
  const words = q
    .split(/\s+/)
    .map((w) => normalizeToken(w))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  if (!words.length) return true;
  const hay = normalizeFoodSearchHaystack(food);
  if (!hay) return false;
  return words.every((w) => {
    const variants = expandSearchToken(w);
    return variants.some((v) => v && hay.includes(v));
  });
}
