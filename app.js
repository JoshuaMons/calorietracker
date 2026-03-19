import { BUILTIN_FOODS, normalizeFoodForStorage } from "./foods.js";
import { ui } from "./i18n.js";
import {
  buildMealPlan,
  finalizeDaySlotsFromPicks,
  makePlanRng,
  pickDrinkTip,
  pickNearSlot,
  SLOT_FRACS,
} from "./plan-data.js";
import { fetchTheMealDbMeal } from "./plan-web.js";
import { matchesFoodSearchQuery } from "./search-synonyms.js";

const STORAGE_KEY = "calorieTracker.v1";
const LOCALE = "nl-NL";

function catLabel(category) {
  return ui.categories[category] || category || "—";
}

const $ = (sel) => document.querySelector(sel);

const BUILTIN_FOOD_IDS = new Set(BUILTIN_FOODS.map((f) => f.id));
const BUILTIN_NORMALIZED = BUILTIN_FOODS.map(normalizeFoodForStorage);

let nlFoodsNormalized = [];
let nlFoodsLoading = true;
let NL_FOOD_IDS = new Set();
let nlFoodsFullLoaded = false;
let nlFoodsFullLoading = false;
let nlFoodsFullTimer = null;

let foodsVersion = 0;
let foodsIndexVersion = -1;
let foodByIdMap = new Map();

function markFoodsDirty() {
  foodsVersion++;
}

function rebuildFoodIndex() {
  const custom = state.customFoods.map(normalizeFoodForStorage);
  const all = [...BUILTIN_NORMALIZED, ...custom, ...nlFoodsNormalized];
  foodByIdMap = new Map();
  for (const f of all) {
    if (!f || !f.id) continue;
    foodByIdMap.set(f.id, f);
  }
  foodsIndexVersion = foodsVersion;
}

function getFoodByIdMap() {
  if (foodsIndexVersion !== foodsVersion) rebuildFoodIndex();
  return foodByIdMap;
}

// Open Food Facts (OFF) is used as the online food source.
// We keep OFF results in memory (not localStorage) and persist any selected item
// into `customFoods` so your logged calories remain correct after refresh.
const OPEN_FOOD_FACTS_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";

let webFoods = [];
let webLoading = false;
let webLastQuery = "";

const stateDefault = () => {
  const today = toYMD(new Date());
  return {
    version: 1,
    schedule: {
      startDate: today,
      days: 7,
    },
    goals: {
      daily: 2000,
      weekly: 14000,
    },
    /** Welk doel het maaltijdschema gebruikt: dag / week÷7 */
    planGoalBasis: "daily",
    /** Subtab op Schema: "goalPlan" | "freePlan" | "status" */
    schemaSubTab: "goalPlan",
    /** Dagen voor doelenplan (1–7), gekozen op Start */
    goalPlanDays: 7,
    /** Vrij schema: eigen kcal/dag en lengte (los van doelen) */
    freePlanKcalPerDay: 2000,
    freePlanDurationDays: 3,
    freeMealPlan: null,
    /** Laatst gegenereerd doelenplan (voor weergave na refresh) */
    mealPlan: null,
    selectedDate: today,
    customFoods: [],
    logs: {}, // { "YYYY-MM-DD": { [foodId]: quantity } }
  };
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return stateDefault();
    const parsed = JSON.parse(raw);
    const st = { ...stateDefault(), ...parsed };
    st.schedule = st.schedule || stateDefault().schedule;
    st.selectedDate = st.selectedDate || st.schedule.startDate;
    st.customFoods = Array.isArray(st.customFoods) ? st.customFoods : [];
    st.logs = st.logs && typeof st.logs === "object" ? st.logs : {};
    st.goals = st.goals && typeof st.goals === "object" ? st.goals : {};
    const legacyDaily = Number(st.schedule?.dailyGoal);
    const baseDaily = Number.isFinite(legacyDaily) && legacyDaily > 0 ? legacyDaily : 2000;
    if (!Number.isFinite(Number(st.goals.daily)) || Number(st.goals.daily) <= 0) st.goals.daily = baseDaily;
    if (!Number.isFinite(Number(st.goals.weekly)) || Number(st.goals.weekly) <= 0) {
      st.goals.weekly = Number(st.goals.daily) * 7;
    }
    if ("monthly" in st.goals) delete st.goals.monthly;

    const okBasis = ["daily", "weekly"];
    if (st.planGoalBasis === "monthly") st.planGoalBasis = "daily";
    if (!okBasis.includes(st.planGoalBasis)) st.planGoalBasis = "daily";
    if (st.schemaSubTab === "plan") st.schemaSubTab = "goalPlan";
    const okTabs = ["goalPlan", "freePlan", "status"];
    if (!okTabs.includes(st.schemaSubTab)) st.schemaSubTab = "goalPlan";
    st.goalPlanDays = clampInt(Number(st.goalPlanDays) || Number(st.schedule?.days) || 7, 1, 7);
    st.freePlanKcalPerDay = clampInt(Number(st.freePlanKcalPerDay) || 2000, 100, 5000);
    st.freePlanDurationDays = clampInt(Number(st.freePlanDurationDays) || 3, 1, 7);
    if (st.mealPlan != null && typeof st.mealPlan !== "object") st.mealPlan = null;
    if (st.freeMealPlan != null && typeof st.freeMealPlan !== "object") st.freeMealPlan = null;

    // Migration: older versions stored log values as numbers. Now we store { qty, servingAmount? }.
    for (const [dateYMD, dayLog] of Object.entries(st.logs)) {
      if (!dayLog || typeof dayLog !== "object") continue;
      for (const [foodId, v] of Object.entries(dayLog)) {
        if (typeof v === "number") {
          dayLog[foodId] = { qty: v };
        } else if (v && typeof v === "object" && typeof v.qty !== "number") {
          // Try to recover qty if it was stored under another key.
          const recoveredQty = typeof v.quantity === "number" ? v.quantity : Number(v.qty);
          dayLog[foodId] = { qty: Number.isFinite(recoveredQty) ? recoveredQty : 0, servingAmount: v.servingAmount };
        } else if (v && typeof v === "object") {
          if (v.servingAmount === undefined && v.servingGrams !== undefined) {
            v.servingAmount = v.servingGrams;
          }
        }
      }
      st.logs[dateYMD] = dayLog;
    }
    return st;
  } catch {
    return stateDefault();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysYMD(startYMD, deltaDays) {
  const [y, m, d] = startYMD.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toYMD(dt);
}

function ymdToTime(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function sumConsumedBetweenInclusive(startYMD, endYMD) {
  let sum = 0;
  let cur = startYMD;
  const endT = ymdToTime(endYMD);
  while (ymdToTime(cur) <= endT) {
    sum += calcTotalsForDate(cur).consumed;
    cur = addDaysYMD(cur, 1);
  }
  return sum;
}

function calendarWeekRangeContaining(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const offsetMon = (day + 6) % 7;
  const start = addDaysYMD(ymd, -offsetMon);
  const end = addDaysYMD(start, 6);
  return { start, end };
}

function formatNiceDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(LOCALE, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function formatShortDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.toLocaleDateString(LOCALE, { weekday: "short" });
  return `${dow} ${d}`;
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function hashCode(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Maakt zoektermen schoner zodat Openverse/Wikipedia beter matchen (minder marketingtekst). */
function simplifyProductNameForImage(name) {
  let s = String(name || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]{0,80}\)/g, " ")
    .replace(/\b\d+\s*\/\s*\d+\s*(less|minder)\s*(fat|vet)\b/gi, " ")
    .replace(/\b(reduced|low|less)\s+(fat|sugar|salt|calories)\b|\blight\b|\bdiet\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, 100);
}

function makeImageQuery(food) {
  const baseRaw = (food?.imageQuery || food?.name || "").trim();
  const simplified = simplifyProductNameForImage(baseRaw);
  const base = (simplified || baseRaw).trim();
  const cat = String(food?.category || "").toLowerCase();
  const catHint =
    cat === "drink"
      ? "drink beverage"
      : cat === "snack"
        ? "snack food"
        : cat === "meal"
          ? "meal dish plate"
          : cat === "ingredient"
            ? "ingredient cooking"
            : "food";
  const tags = Array.isArray(food?.tags) ? food.tags.slice(0, 2).join(" ") : "";
  const raw = [base, catHint, tags].filter(Boolean).join(" ");
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024f ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

const IMAGE_PLACEHOLDER_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#f3f4f7"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="18" fill="#6b7280">Food</text></svg>`,
  );

function attachImageErrorFallback(imgEl) {
  if (!imgEl) return;
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = IMAGE_PLACEHOLDER_URL;
  };
}

/** Openverse — officiële API (engineering-domein is verouderd / faalt vaak in de browser) */
const OPENVERSE_IMAGES_API = "https://api.openverse.org/v1/images/";
const openverseImageCache = new Map();

const ovWaiters = [];
let ovInFlight = 0;
const OV_MAX_CONCURRENT = 6;

async function ovAcquire() {
  if (ovInFlight < OV_MAX_CONCURRENT) {
    ovInFlight++;
    return;
  }
  await new Promise((resolve) => ovWaiters.push(resolve));
  ovInFlight++;
}

function ovRelease() {
  ovInFlight = Math.max(0, ovInFlight - 1);
  const next = ovWaiters.shift();
  if (next) next();
}

async function fetchOpenverseThumbnailForQueryQueued(query) {
  await ovAcquire();
  try {
    return await fetchOpenverseThumbnailForQuery(query);
  } finally {
    ovRelease();
  }
}

let foodThumbObserver;

/** Laadt productfoto: eerst Open Food Facts-URL indien aanwezig, anders Openverse + Wikipedia. */
async function loadFoodThumbFromFood(img, food) {
  if (!img || !food) return;
  img.decoding = "async";
  const direct = String(food.imageUrl || "").trim();
  if (/^https?:\/\//i.test(direct)) {
    img.onerror = () => {
      img.onerror = null;
      void (async () => {
        const u = await fetchOpenverseThumbnailForQueryQueued(makeImageQuery(food));
        if (!img.isConnected) return;
        if (u) {
          attachImageErrorFallback(img);
          img.src = u;
        } else {
          img.src = IMAGE_PLACEHOLDER_URL;
        }
      })();
    };
    img.src = direct;
    return;
  }
  img.src = IMAGE_PLACEHOLDER_URL;
  const u = await fetchOpenverseThumbnailForQueryQueued(makeImageQuery(food));
  if (!img.isConnected) return;
  if (u) {
    attachImageErrorFallback(img);
    img.src = u;
  }
}

function observeFoodThumb(img, food) {
  if (!img) return;
  if (!foodThumbObserver) {
    foodThumbObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          foodThumbObserver.unobserve(el);
          const f = el._foodForThumb;
          if (f) void loadFoodThumbFromFood(el, f);
          else void loadOpenverseIntoImg(el, el.dataset.ovQ || "");
        }
      },
      { root: null, rootMargin: "140px", threshold: 0.01 },
    );
  }
  img._foodForThumb = food || null;
  foodThumbObserver.observe(img);
}

async function loadOpenverseIntoImg(img, queryText) {
  if (!img) return;
  img.decoding = "async";
  const url = await fetchOpenverseThumbnailForQueryQueued(queryText || "food");
  if (!img.isConnected) return;
  if (url) {
    attachImageErrorFallback(img);
    img.src = url;
  }
}

async function fetchWikipediaThumbForQuery(query) {
  const raw = String(query || "")
    .trim()
    .slice(0, 72);
  if (!raw) return null;
  const simplified = simplifyProductNameForImage(raw).slice(0, 72) || raw;
  const searchVariants = [
    { host: "nl.wikipedia.org", term: `${raw} eten` },
    { host: "nl.wikipedia.org", term: raw },
    { host: "en.wikipedia.org", term: `${raw} food` },
    { host: "en.wikipedia.org", term: raw },
    { host: "en.wikipedia.org", term: `${simplified} cheese` },
    { host: "en.wikipedia.org", term: simplified },
  ];
  for (const { host, term } of searchVariants) {
    const searchQ = encodeURIComponent(term.slice(0, 280));
    try {
      const apiUrl =
        `https://${host}/w/api.php?action=query&format=json&origin=*` +
        `&generator=search&gsrsearch=${searchQ}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=320`;
      const res = await fetch(apiUrl);
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) continue;
      const first = Object.values(pages)[0];
      if (first?.missing) continue;
      const src = first?.thumbnail?.source;
      if (src) return src;
    } catch {
      /* volgende variant */
    }
  }
  return null;
}

async function fetchOpenverseOnce(searchQ) {
  const key = searchQ.toLowerCase().trim().slice(0, 120);
  if (openverseImageCache.has(key)) {
    return openverseImageCache.get(key);
  }
  try {
    const params = new URLSearchParams({ q: key, page_size: "1" });
    const res = await fetch(`${OPENVERSE_IMAGES_API}?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.results?.[0];
    const url = hit?.thumbnail || hit?.url || null;
    if (url) openverseImageCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

async function fetchOpenverseThumbnailForQuery(query) {
  const wikiHint = String(query || "")
    .trim()
    .slice(0, 72);
  const qBase = (query || "healthy food")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024f ]+/gi, " ")
    .replace(/\s+/g, " ");
  const words = qBase.split(/\s+/).filter((w) => w.length > 1);
  const shortQ = words.slice(0, 6).join(" ");
  const tinyQ = words.slice(0, 3).join(" ");

  const attempts = [
    `${qBase || "healthy"} food`,
    qBase || "healthy meal",
    shortQ,
    tinyQ,
    words[0] ? `${words[0]} food` : null,
  ].filter(Boolean);

  let url = null;
  for (const a of [...new Set(attempts)]) {
    url = await fetchOpenverseOnce(String(a).slice(0, 120));
    if (url) break;
  }
  if (!url) {
    url = await fetchWikipediaThumbForQuery(wikiHint || qBase || "maaltijd");
  }
  return url;
}

function getScheduleDays(schedule) {
  const days = clampInt(schedule?.days ?? 7, 1, 365);
  const start = schedule?.startDate || toYMD(new Date());
  const out = [];
  for (let i = 0; i < days; i++) out.push(addDaysYMD(start, i));
  return out;
}

function dailyGoal() {
  return clampInt(state.goals?.daily ?? state.schedule?.dailyGoal ?? 2000, 100, 200000);
}

function weeklyGoal() {
  return clampInt(state.goals?.weekly ?? dailyGoal() * 7, 200, 5000000);
}

function planBasisKey() {
  const b = state.planGoalBasis;
  return b === "weekly" ? b : "daily";
}

function effectivePlanKcalPerDay() {
  const b = planBasisKey();
  if (b === "weekly") return clampInt(Math.round(weeklyGoal() / 7), 100, 200000);
  return dailyGoal();
}

function planBasisUiLabel() {
  const b = planBasisKey();
  if (b === "weekly") return ui.schemaPlan.basisWeekly;
  return ui.schemaPlan.basisDaily;
}

function ensureFoodInCustom(food) {
  // For web foods: persist a snapshot in `customFoods` so logs stay correct after refresh.
  if (!food || !food.id) return;
  if (BUILTIN_FOOD_IDS.has(food.id)) return;
  if (NL_FOOD_IDS.has(food.id)) return;
  if (state.customFoods.some((f) => f.id === food.id)) return;
  state.customFoods = [...state.customFoods, normalizeFoodForStorage(food)];
  markFoodsDirty();
  saveState();
}

function guessCategoryFromTags(tags) {
  const t = Array.isArray(tags) ? tags.join(" ").toLowerCase() : String(tags || "").toLowerCase();
  const isDrink =
    t.includes("beverages") ||
    t.includes("drinks") ||
    t.includes("soda") ||
    t.includes("water") ||
    t.includes("coffee") ||
    t.includes("tea") ||
    t.includes("juice");
  if (isDrink) return "Drink";

  const isMeal = t.includes("meals") || t.includes("ready-meals") || t.includes("main-dishes");
  if (isMeal) return "Meal";

  const isSnack = t.includes("snacks") || t.includes("snack") || t.includes("bars") || t.includes("desserts");
  if (isSnack) return "Snack";

  return "Snack";
}

async function fetchOpenFoodFacts(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const url =
    `${OPEN_FOOD_FACTS_SEARCH_URL}` +
    `?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1` +
    `&action=process` +
    `&json=1` +
    `&fields=product_name,brands,categories_tags,ingredients_text,nutriments,image_front_small_url,image_front_url,image_url` +
    `&page_size=24` +
    `&page=1`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Food Facts request failed: ${res.status}`);
  const data = await res.json();

  const products = Array.isArray(data?.products) ? data.products : [];
  return products
    .map((p) => {
      const name = p.product_name || p.brands || p.name || "";
      if (!name) return null;

      const code = p.code || p.id || p._id || name;
      const stableKey = `${code}|${p.brands || ""}|${p.product_name || ""}`;
      const id = `off:${stableKey}-${hashCode(stableKey)}`;

      const kcal100gRaw = p?.nutriments?.["energy-kcal_100g"];
      const kcalRawAlt = p?.nutriments?.["energy-kcal"];
      const kcal = Number(kcal100gRaw ?? kcalRawAlt);

      // Macro data is (usually) provided per 100g.
      const protein =
        Number(p?.nutriments?.["proteins_100g"] ?? p?.nutriments?.["protein_100g"] ?? p?.nutriments?.["proteins"]);
      const carbs =
        Number(p?.nutriments?.["carbohydrates_100g"] ?? p?.nutriments?.["carbohydrate_100g"] ?? p?.nutriments?.["carbohydrates"]);
      const fat = Number(p?.nutriments?.["fat_100g"] ?? p?.nutriments?.["fat"]);

      const ingredientsText = p.ingredients_text || "";
      const ingredients = ingredientsText
        ? ingredientsText
            .split(/[,;]/g)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 18)
        : [];

      const imageUrl =
        [p.image_front_small_url, p.image_front_url, p.image_url].find((u) => u && String(u).startsWith("http")) || "";

      return normalizeFoodForStorage({
        id,
        name,
        category: guessCategoryFromTags(p.categories_tags),
        caloriesPerServing: Number.isFinite(kcal) ? kcal : 0,
        servingLabel: "100g",
        imageUrl: String(imageUrl).trim(),
        imageQuery: `${p.product_name || name} ${p.brands || ""}`.trim(),
        proteinPerBaseAmount: Number.isFinite(protein) ? protein : undefined,
        carbsPerBaseAmount: Number.isFinite(carbs) ? carbs : undefined,
        fatPerBaseAmount: Number.isFinite(fat) ? fat : undefined,
        ingredients: ingredients.length ? ingredients : [],
        tags: Array.isArray(p.categories_tags) ? p.categories_tags : [],
      });
    })
    .filter(Boolean);
}

let openFetchTimer = null;
function scheduleWebSearch(query) {
  const q = normalizeSearch(query);
  if (q.length < 2) {
    webFoods = [];
    webLoading = false;
    webLastQuery = "";
    renderAll();
    return;
  }

  webLastQuery = q;
  if (openFetchTimer) window.clearTimeout(openFetchTimer);
  openFetchTimer = window.setTimeout(async () => {
    try {
      webLoading = true;
      renderFoodGrid();
      const results = await fetchOpenFoodFacts(q);
      if (webLastQuery !== q) return;
      webFoods = results;
    } catch {
      webFoods = [];
    } finally {
      webLoading = false;
      renderAll();
    }
  }, 450);
}

function scheduleNlFoodsFullLoad() {
  if (nlFoodsFullLoaded || nlFoodsFullLoading) return;
  if (nlFoodsFullTimer) window.clearTimeout(nlFoodsFullTimer);
  nlFoodsFullTimer = window.setTimeout(() => {
    nlFoodsFullTimer = null;
    void loadNlFoodsFull();
  }, 250);
}

async function loadNlFoodsCore() {
  nlFoodsLoading = true;
  try {
    const res = await fetch("./data/nl-foods-core.json", { cache: "force-cache" });
    if (!res.ok) throw new Error(`nl-foods-core.json ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("nl-foods-core.json invalid");
    nlFoodsNormalized = data.map(normalizeFoodForStorage);
    NL_FOOD_IDS = new Set(nlFoodsNormalized.map((f) => f.id));
  } catch (err) {
    console.warn(err?.message || String(err));
    nlFoodsNormalized = [];
    NL_FOOD_IDS = new Set();
  } finally {
    nlFoodsLoading = false;
    markFoodsDirty();
    renderAll();
  }
}

async function loadNlFoodsFull() {
  if (nlFoodsFullLoaded || nlFoodsFullLoading) return;
  nlFoodsFullLoading = true;
  renderFoodGrid();
  try {
    const res = await fetch("./data/nl-foods.json", { cache: "force-cache" });
    if (!res.ok) throw new Error(`nl-foods.json ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("nl-foods.json invalid");
    nlFoodsNormalized = data.map(normalizeFoodForStorage);
    NL_FOOD_IDS = new Set(nlFoodsNormalized.map((f) => f.id));
    nlFoodsFullLoaded = true;
  } catch (err) {
    console.warn(err?.message || String(err));
  } finally {
    nlFoodsFullLoading = false;
    markFoodsDirty();
    renderAll();
  }
}

function foodLibrary() {
  const custom = state.customFoods.map(normalizeFoodForStorage);
  return [...BUILTIN_NORMALIZED, ...custom, ...nlFoodsNormalized];
}

function foodById() {
  return getFoodByIdMap();
}

function getLogForDate(ymd) {
  return state.logs[ymd] && typeof state.logs[ymd] === "object" ? state.logs[ymd] : {};
}

function setQtyForFood(dateYMD, foodId, qty) {
  const q = clampInt(qty, 0, 999);
  const log = getLogForDate(dateYMD);
  if (q <= 0) {
    delete log[foodId];
  } else {
    const food = foodById().get(foodId);
    if (food?.caloriesBaseUnit === "g") {
      const base = Number(food.caloriesBaseAmount ?? 100);
      const prev = log[foodId];
      const prevAmount = prev && typeof prev === "object" ? prev.servingAmount : undefined;
      const servingAmount = Number.isFinite(prevAmount) && prevAmount > 0 ? prevAmount : base;
      log[foodId] = { qty: q, servingAmount: clampInt(servingAmount, 0, 5000) };
    } else {
      log[foodId] = { qty: q };
    }
  }
  state.logs[dateYMD] = log;
  saveState();
}

function setServingAmountForFood(dateYMD, foodId, servingAmount) {
  const log = getLogForDate(dateYMD);
  const entry = log[foodId];
  if (!entry || typeof entry !== "object") return;
  if (!entry.qty || entry.qty <= 0) return;

  const food = foodById().get(foodId);
  if (food?.caloriesBaseUnit !== "g") return;

  const amt = clampInt(servingAmount, 0, 5000);
  log[foodId] = { ...entry, servingAmount: amt };
  state.logs[dateYMD] = log;
  saveState();
}

function calcTotalsForDate(dateYMD) {
  const byId = foodById();
  const log = getLogForDate(dateYMD);
  let consumed = 0;
  let proteinGrams = 0;
  let carbsGrams = 0;
  let fatGrams = 0;
  let hasAnyMacro = false;
  const items = [];
  for (const [foodId, entry] of Object.entries(log)) {
    const food = byId.get(foodId);
    const qty = entry && typeof entry === "object" ? entry.qty : 0;
    if (!food || !Number.isFinite(food.caloriesPerServing) || !qty) continue;

    let cals = 0;
    let p = undefined;
    let c = undefined;
    let f = undefined;
    if (food.caloriesBaseUnit === "g") {
      const base = Number(food.caloriesBaseAmount ?? 100);
      const servingAmount = entry.servingAmount ?? base;
      if (Number.isFinite(base) && base > 0 && Number.isFinite(servingAmount)) {
        cals = (food.caloriesPerServing / base) * servingAmount * qty;
        if (Number.isFinite(food.proteinPerBaseAmount)) {
          p = (food.proteinPerBaseAmount / base) * servingAmount * qty;
        }
        if (Number.isFinite(food.carbsPerBaseAmount)) {
          c = (food.carbsPerBaseAmount / base) * servingAmount * qty;
        }
        if (Number.isFinite(food.fatPerBaseAmount)) {
          f = (food.fatPerBaseAmount / base) * servingAmount * qty;
        }
      } else {
        cals = food.caloriesPerServing * qty;
      }
    } else {
      cals = food.caloriesPerServing * qty;
      if (Number.isFinite(food.proteinPerBaseAmount)) p = food.proteinPerBaseAmount * qty;
      if (Number.isFinite(food.carbsPerBaseAmount)) c = food.carbsPerBaseAmount * qty;
      if (Number.isFinite(food.fatPerBaseAmount)) f = food.fatPerBaseAmount * qty;
    }

    consumed += cals;
    if (Number.isFinite(p)) {
      proteinGrams += p;
      hasAnyMacro = true;
    }
    if (Number.isFinite(c)) {
      carbsGrams += c;
      hasAnyMacro = true;
    }
    if (Number.isFinite(f)) {
      fatGrams += f;
      hasAnyMacro = true;
    }

    items.push({
      food,
      qty,
      servingAmount: food.caloriesBaseUnit === "g" ? entry.servingAmount ?? food.caloriesBaseAmount : undefined,
      calories: cals,
      proteinGrams: Number.isFinite(p) ? p : undefined,
      carbsGrams: Number.isFinite(c) ? c : undefined,
      fatGrams: Number.isFinite(f) ? f : undefined,
    });
  }
  items.sort((a, b) => b.calories - a.calories);
  const macroCalories = hasAnyMacro ? proteinGrams * 4 + carbsGrams * 4 + fatGrams * 9 : undefined;
  return {
    consumed,
    items,
    macros: {
      hasAnyMacro,
      proteinGrams,
      carbsGrams,
      fatGrams,
      macroCalories,
    },
  };
}

function normalizeSearch(s) {
  return String(s || "").toLowerCase().trim();
}


function suggestionFoodPool() {
  const custom = state.customFoods.map(normalizeFoodForStorage);
  return [...BUILTIN_NORMALIZED, ...custom].filter(
    (f) =>
      f &&
      Number.isFinite(f.caloriesPerServing) &&
      f.caloriesPerServing > 0 &&
      ["Snack", "Drink"].includes(f.category),
  );
}

function suggestionsShuffleRng() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return (u[0] >>> 0) / 0x100000000;
  }
  return Math.random();
}

function shuffleArrayCopy(arr, rng = suggestionsShuffleRng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeSuggestions(dateYMD) {
  const goal = dailyGoal();
  const { consumed } = calcTotalsForDate(dateYMD);
  const remaining = goal - consumed;
  const log = getLogForDate(dateYMD);

  if (remaining <= 0) {
    return { remaining, suggestions: [] };
  }

  const allFoods = suggestionFoodPool().filter((f) => {
    const entry = log[f.id];
    const qty = entry && typeof entry === "object" ? entry.qty : 0;
    return !(qty > 0);
  });

  const target = remaining;
  const rng = suggestionsShuffleRng;

  const underSorted = allFoods
    .filter((f) => f.caloriesPerServing <= target)
    .sort((a, b) => Math.abs(a.caloriesPerServing - target) - Math.abs(b.caloriesPerServing - target));

  const underPool = underSorted.slice(0, Math.min(28, underSorted.length));
  const shuffledUnder = shuffleArrayCopy(underPool, rng);

  const picks = [];
  const seen = new Set();
  for (const f of shuffledUnder) {
    if (picks.length >= 5) break;
    if (!seen.has(f.id)) {
      seen.add(f.id);
      picks.push(f);
    }
  }

  if (picks.length < 5) {
    const overSorted = allFoods
      .filter((f) => f.caloriesPerServing > target)
      .sort((a, b) => Math.abs(a.caloriesPerServing - target) - Math.abs(b.caloriesPerServing - target));
    const overPool = overSorted.slice(0, Math.min(20, overSorted.length));
    const shuffledOver = shuffleArrayCopy(overPool, rng);
    for (const f of shuffledOver) {
      if (picks.length >= 5) break;
      if (!seen.has(f.id)) {
        seen.add(f.id);
        picks.push(f);
      }
    }
  }

  if (picks.length === 0) {
    const fallback = shuffleArrayCopy(allFoods, rng);
    return { remaining, suggestions: fallback.slice(0, 5) };
  }

  return { remaining, suggestions: picks };
}

function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderMealPlanTargetLine() {
  const el = $("#meal-plan-target");
  if (el) {
    const kcal = effectivePlanKcalPerDay();
    el.textContent = ui.schemaPlan.targetLine(kcal, planBasisUiLabel());
  }
  const durNote = $("#schema-goal-duration-note");
  if (durNote) {
    durNote.textContent = ui.schemaPage.goalPlanDaysNote(clampInt(state.goalPlanDays, 1, 7));
  }
}

function renderMealPlanInto(wrapSel, snap, emptyText) {
  const wrap = $(wrapSel);
  if (!wrap) return;
  if (!snap || !Array.isArray(snap.days) || snap.days.length === 0) {
    wrap.innerHTML = `<p class="muted meal-plan-empty">${escapeHtml(emptyText)}</p>`;
    return;
  }

  const sp = ui.schemaPlan;
  const validDays = snap.days.filter((day) => day && Array.isArray(day.slots));
  if (validDays.length === 0) {
    wrap.innerHTML = `<p class="muted meal-plan-empty">${escapeHtml(emptyText)}</p>`;
    return;
  }

  const daysHtml = validDays
    .map((day) => {
      const slotsHtml = day.slots
        .map((slot) => {
          const steps =
            Array.isArray(slot.steps) && slot.steps.length
              ? `<ol class="meal-slot-steps">${slot.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`
              : "";
          const webPart = slot.fromWeb ? ` · ${escapeHtml(ui.freePlan.fromWebTag)}` : "";
          return `
            <div class="meal-slot meal-slot--compact">
              <div class="meal-slot-head">
                <strong>${escapeHtml(slot.label)}</strong>
                <span class="meal-slot-meta">${Math.round(slot.kcal)} kcal · ~${Math.round(slot.protein)} g ${escapeHtml(ui.stats.protein)}${webPart}</span>
              </div>
              <div class="meal-slot-title">${escapeHtml(slot.title)}</div>
              ${steps ? `<div class="muted small meal-slot-steps-title">${escapeHtml(sp.stepsTitle)}</div>${steps}` : ""}
            </div>`;
        })
        .join("");

      return `
        <article class="meal-plan-day card meal-plan-day-card">
          <header class="meal-plan-day-head">
            <h3 class="meal-plan-day-title">${escapeHtml(sp.dayTitle(day.day))}</h3>
            <span class="muted small meal-plan-day-totals">${escapeHtml(sp.dayTotals(Math.round(day.totalKcal), Math.round(day.totalProtein)))}</span>
          </header>
          <div class="meal-plan-slots">${slotsHtml}</div>
          <div class="meal-plan-drink muted small"><strong>${escapeHtml(sp.drinkLine)}:</strong> ${escapeHtml(day.drinkTip || "—")}</div>
        </article>`;
    })
    .join("");

  wrap.innerHTML = `<div class="meal-plan-days-grid">${daysHtml}</div>`;
}

function renderMealPlanOutput() {
  renderMealPlanInto("#meal-plan-output", state.mealPlan, ui.schemaPlan.empty);
}

function renderFreeMealPlanOutput() {
  renderMealPlanInto("#free-meal-plan-output", state.freeMealPlan, ui.freePlan.empty);
}

function renderFreePlanTargetLine() {
  const el = $("#free-plan-target-line");
  if (!el) return;
  const snap = state.freeMealPlan;
  if (snap && Number.isFinite(Number(snap.kcalPerDay)) && Number.isFinite(Number(snap.duration))) {
    el.textContent = ui.freePlan.targetLine(
      Math.round(snap.kcalPerDay),
      clampInt(snap.duration, 1, 7),
    );
    return;
  }
  const k = clampInt($("#free-plan-kcal")?.value ?? state.freePlanKcalPerDay, 100, 5000);
  const d = clampInt($("#free-plan-duration")?.value ?? state.freePlanDurationDays, 1, 7);
  el.textContent = ui.freePlan.targetLine(k, d);
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const FREE_PICK_OPTS = { jitter: 90, topNMin: 5, topNMax: 22 };

async function buildFreeMealPlanDays(durationDays, kcalPerDay) {
  const rng = makePlanRng();
  const meta = [
    { key: "breakfast", label: "Ontbijt", frac: SLOT_FRACS.breakfast },
    { key: "lunch", label: "Lunch", frac: SLOT_FRACS.lunch },
    { key: "dinner", label: "Diner", frac: SLOT_FRACS.dinner },
    { key: "snack", label: "Tussendoortje", frac: SLOT_FRACS.snack },
  ];
  const days = [];
  const dur = clampInt(durationDays, 1, 7);
  const targetBase = Math.max(100, Math.round(Number(kcalPerDay) || 0));

  for (let d = 1; d <= dur; d++) {
    const shuffledIdx = [0, 1, 2, 3];
    for (let si = shuffledIdx.length - 1; si > 0; si--) {
      const j = Math.floor(rng() * (si + 1));
      [shuffledIdx[si], shuffledIdx[j]] = [shuffledIdx[j], shuffledIdx[si]];
    }
    const webCount = 1 + Math.floor(rng() * 3);
    const webSlots = new Set(shuffledIdx.slice(0, webCount));

    const picked = [];
    for (let i = 0; i < 4; i++) {
      const m = meta[i];
      if (webSlots.has(i)) {
        const ext = await fetchTheMealDbMeal();
        await sleepMs(60);
        if (ext) {
          picked.push({
            label: m.label,
            title: ext.title,
            kcal: ext.kcal,
            protein: ext.protein,
            steps: ext.steps,
            fromWeb: true,
          });
        } else {
          const loc = pickNearSlot(m.key, targetBase * m.frac, rng, FREE_PICK_OPTS);
          picked.push({
            label: m.label,
            title: loc.title,
            kcal: loc.kcal,
            protein: loc.protein,
            steps: loc.steps,
          });
        }
      } else {
        const loc = pickNearSlot(m.key, targetBase * m.frac, rng, FREE_PICK_OPTS);
        picked.push({
          label: m.label,
          title: loc.title,
          kcal: loc.kcal,
          protein: loc.protein,
          steps: loc.steps,
        });
      }
    }

    const { slots, totalKcal, totalProtein } = finalizeDaySlotsFromPicks(picked, targetBase);
    days.push({
      day: d,
      slots,
      drinkTip: pickDrinkTip(rng),
      totalKcal,
      totalProtein,
    });
  }
  return days;
}

function syncSchemaPageCopy() {
  const h = $("#schema-heading");
  if (h) h.textContent = ui.schemaPlan.title;
  const intro = $("#schema-intro");
  if (intro) intro.textContent = ui.schemaPlan.intro;
  const note = $("#schema-logday-note");
  if (note) note.textContent = ui.schemaPage.logDayNote;

  const genBtn = $("#btn-generate-meal-plan");
  if (genBtn) genBtn.textContent = ui.schemaPlan.generateBtn;

  const resetPlanBtn = $("#btn-schema-reset-plan");
  if (resetPlanBtn) resetPlanBtn.textContent = ui.schemaPage.resetPlanBtn;
  const otherGoalBtn = $("#btn-schema-other-goal");
  if (otherGoalBtn) otherGoalBtn.textContent = ui.schemaPage.otherGoalBtn;

  const hint = $("#meal-plan-generate-hint");
  if (hint) hint.textContent = ui.schemaPlan.generateHint;

  const resetHint = $("#schema-reset-hint");
  if (resetHint) resetHint.textContent = ui.schemaPage.resetPlanHint;

  const subGoal = $("#schema-subtab-goal-plan");
  if (subGoal) subGoal.textContent = ui.schemaPage.subTabGoalPlan;
  const subFree = $("#schema-subtab-free-plan");
  if (subFree) subFree.textContent = ui.schemaPage.subTabFreePlan;
  const subStatus = $("#schema-subtab-status");
  if (subStatus) subStatus.textContent = ui.schemaPage.subTabStatus;

  const fh = $("#free-plan-heading");
  if (fh) fh.textContent = ui.freePlan.title;
  const fi = $("#free-plan-intro");
  if (fi) fi.textContent = ui.freePlan.intro;
  const fwn = $("#free-plan-web-note");
  if (fwn) fwn.textContent = ui.freePlan.webNote;
  const fk = $("#free-plan-kcal-label");
  if (fk) fk.textContent = ui.freePlan.kcalLabel;
  const fd = $("#free-plan-duration-label");
  if (fd) fd.textContent = ui.freePlan.durationLabel;
  const fgen = $("#btn-generate-free-plan");
  if (fgen) fgen.textContent = ui.freePlan.generateBtn;
  const frst = $("#btn-reset-free-plan");
  if (frst) frst.textContent = ui.freePlan.resetBtn;
  const fhint = $("#free-plan-generate-hint");
  if (fhint) fhint.textContent = ui.freePlan.generateHint;

  const statusHead = $("#schema-status-heading");
  if (statusHead) statusHead.textContent = ui.schemaPage.statusTitle;
  const statusIntro = $("#schema-status-intro");
  if (statusIntro) statusIntro.textContent = ui.schemaPage.statusIntro;

  $("#schema-link-home")?.replaceChildren(document.createTextNode(ui.schemaPage.linkHome));
  $("#schema-link-library")?.replaceChildren(document.createTextNode(ui.schemaPage.linkLibrary));
  $("#schema-link-log")?.replaceChildren(document.createTextNode(ui.schemaPage.linkLog));

  const rh = $("#recipe-click-hint");
  if (rh) {
    rh.textContent = `${ui.recipeModal.clickHint} ${ui.suggestionsPage.recipesShuffleHint}`;
  }

  const rm = $("#recipe-modal");
  if (rm) rm.setAttribute("aria-label", ui.recipeModal.aria);

  const rclose = $("#recipe-modal-close");
  if (rclose) rclose.setAttribute("aria-label", ui.recipeModal.close);

  $("#recipe-modal-serving-label")?.replaceChildren(document.createTextNode(ui.recipeModal.serving));
  $("#recipe-modal-kcal-label")?.replaceChildren(document.createTextNode(ui.recipeModal.kcal));
  $("#recipe-modal-protein-label")?.replaceChildren(document.createTextNode(ui.recipeModal.protein));
  const ingTitle = $("#recipe-modal-ingredients-title");
  if (ingTitle) ingTitle.textContent = ui.recipeModal.ingredientsTitle;
  $("#recipe-modal-footnote")?.replaceChildren(document.createTextNode(ui.recipeModal.hint));

  const tabCf = $("#tab-custom-food");
  if (tabCf) tabCf.textContent = ui.tabs.customFood;

  const tabLog = $("#tab-log");
  if (tabLog) tabLog.textContent = ui.tabs.log;

  const cft = $("#custom-food-page-title");
  if (cft) cft.textContent = ui.customFoodPage.title;
  const cfi = $("#custom-food-page-intro");
  if (cfi) cfi.textContent = ui.customFoodPage.intro;
  const cfn = $("#custom-food-form-note");
  if (cfn) cfn.textContent = ui.customFoodPage.formNote;
  const cfb = $("#custom-food-back-link");
  if (cfb) cfb.textContent = ui.customFoodPage.backToLibrary;

  const libHint = $("#library-custom-hint");
  if (libHint) {
    libHint.replaceChildren();
    libHint.append(document.createTextNode(`${ui.customFoodPage.addHintLead} `));
    const a = document.createElement("a");
    a.className = "inline-link";
    a.href = "#/custom-food";
    a.textContent = ui.customFoodPage.addHint;
    libHint.appendChild(a);
  }
}

function setProgressBar(barEl, consumed, goal) {
  if (!barEl) return;
  const pct = goal > 0 ? Math.min(100, Math.max(0, (consumed / goal) * 100)) : 0;
  barEl.style.width = `${pct}%`;
  barEl.setAttribute("aria-valuenow", String(Math.round(pct)));
}

function buildSummarySnapshot(ymd) {
  const { consumed } = calcTotalsForDate(ymd);
  const dg = dailyGoal();
  const wg = weeklyGoal();
  const remaining = dg - consumed;
  const wk = calendarWeekRangeContaining(ymd);
  const weekConsumed = sumConsumedBetweenInclusive(wk.start, wk.end);
  const pct = dg > 0 ? Math.min(100, Math.max(0, (consumed / dg) * 100)) : 0;
  const g = Math.round(dg);
  const c = Math.round(consumed);
  const r = Math.round(remaining);
  let oneLinerText = "";
  if (g <= 0) oneLinerText = ui.summaryLines.emptyGoal;
  else if (r < 0) oneLinerText = ui.summaryLines.overGoal(Math.abs(r));
  else if (c >= g) oneLinerText = ui.summaryLines.hitGoal;
  else if (c === 0) oneLinerText = ui.summaryLines.nothingLogged(r, formatShortDay(ymd));
  else oneLinerText = ui.summaryLines.normal(c, r, g);
  return { ymd, consumed, dg, wg, remaining, weekConsumed, pct, oneLinerText };
}

function paintSummaryInto(ids, snap) {
  const { ymd, consumed, dg, wg, remaining, weekConsumed, pct, oneLinerText } = snap;
  if (ids.dayCaption) {
    const el = $(ids.dayCaption);
    if (el) el.textContent = ui.home.selectedDaySchema;
  }
  if (ids.dayLabel) {
    const el = $(ids.dayLabel);
    if (el) el.textContent = formatNiceDate(ymd);
  }
  if (ids.consumed) {
    const el = $(ids.consumed);
    if (el) el.textContent = String(Math.round(consumed));
  }
  if (ids.remainingStrong) {
    const el = $(ids.remainingStrong);
    if (el) el.textContent = String(Math.round(remaining));
  }
  if (ids.remainingSuffix) {
    const el = $(ids.remainingSuffix);
    if (el) el.textContent = ` ${ui.home.remainingToday}`;
  }
  if (ids.goalDaily) {
    const el = $(ids.goalDaily);
    if (el) el.textContent = String(Math.round(dg));
  }
  if (ids.goalWeekly) {
    const el = $(ids.goalWeekly);
    if (el) el.textContent = String(Math.round(wg));
  }
  if (ids.consumedWeek) {
    const el = $(ids.consumedWeek);
    if (el) el.textContent = String(Math.round(weekConsumed));
  }
  setProgressBar(ids.barDay ? $(ids.barDay) : null, consumed, dg);
  setProgressBar(ids.barWeek ? $(ids.barWeek) : null, weekConsumed, wg);
  const ringEl = ids.ring ? $(ids.ring) : null;
  if (ringEl) {
    ringEl.style.background = `conic-gradient(var(--accent-2) ${pct}%, rgba(17, 24, 39, 0.08) ${pct}% )`;
  }
  if (ids.ringPct) {
    const el = $(ids.ringPct);
    if (el) el.textContent = `${Math.round(pct)}%`;
  }
  if (ids.ringCaption) {
    const el = $(ids.ringCaption);
    if (el) el.textContent = ui.home.ringDayPct;
  }
  if (ids.tierDay) {
    const el = $(ids.tierDay);
    if (el) el.textContent = ui.home.tierDay;
  }
  if (ids.tierWeek) {
    const el = $(ids.tierWeek);
    if (el) el.textContent = ui.home.tierWeek;
  }
  if (ids.oneLiner) {
    const el = $(ids.oneLiner);
    if (el) el.textContent = oneLinerText;
  }
}

function renderSummary() {
  const snap = buildSummarySnapshot(state.selectedDate);
  paintSummaryInto(
    {
      dayCaption: "#selected-day-caption",
      dayLabel: "#selected-day-label",
      consumed: "#consumed-label",
      remainingStrong: "#remaining-label",
      goalDaily: "#goal-daily-display",
      goalWeekly: "#goal-weekly-display",
      consumedWeek: "#consumed-week-label",
      barDay: "#progress-bar-day",
      barWeek: "#progress-bar-week",
      ring: "#calorie-ring",
      ringPct: "#ring-percent",
      oneLiner: "#summary-one-liner",
    },
    snap,
  );

  paintSummaryInto(
    {
      dayCaption: "#schema-status-day-caption",
      dayLabel: "#schema-status-day-label",
      consumed: "#schema-consumed-label",
      remainingStrong: "#schema-remaining-label",
      remainingSuffix: "#schema-remaining-suffix",
      goalDaily: "#schema-goal-daily-display",
      goalWeekly: "#schema-goal-weekly-display",
      consumedWeek: "#schema-consumed-week-label",
      barDay: "#schema-progress-bar-day",
      barWeek: "#schema-progress-bar-week",
      ring: "#schema-calorie-ring",
      ringPct: "#schema-ring-percent",
      ringCaption: "#schema-ring-caption",
      tierDay: "#schema-tier-day-title",
      tierWeek: "#schema-tier-week-title",
      oneLiner: "#schema-summary-one-liner",
    },
    snap,
  );
}

function renderSchemaSubTabsUi() {
  const tab =
    state.schemaSubTab === "freePlan"
      ? "freePlan"
      : state.schemaSubTab === "status"
        ? "status"
        : "goalPlan";

  const goalBtn = $("#schema-subtab-goal-plan");
  const freeBtn = $("#schema-subtab-free-plan");
  const statusBtn = $("#schema-subtab-status");
  const goalPanel = $("#schema-panel-goal-plan");
  const freePanel = $("#schema-panel-free-plan");
  const statusPanel = $("#schema-panel-status");

  if (goalBtn) {
    goalBtn.classList.toggle("is-active", tab === "goalPlan");
    goalBtn.setAttribute("aria-selected", tab === "goalPlan" ? "true" : "false");
  }
  if (freeBtn) {
    freeBtn.classList.toggle("is-active", tab === "freePlan");
    freeBtn.setAttribute("aria-selected", tab === "freePlan" ? "true" : "false");
  }
  if (statusBtn) {
    statusBtn.classList.toggle("is-active", tab === "status");
    statusBtn.setAttribute("aria-selected", tab === "status" ? "true" : "false");
  }
  if (goalPanel) {
    goalPanel.classList.toggle("is-active", tab === "goalPlan");
    goalPanel.hidden = tab !== "goalPlan";
  }
  if (freePanel) {
    freePanel.classList.toggle("is-active", tab === "freePlan");
    freePanel.hidden = tab !== "freePlan";
  }
  if (statusPanel) {
    statusPanel.classList.toggle("is-active", tab === "status");
    statusPanel.hidden = tab !== "status";
  }
}

function renderMacrosPanel() {
  const ymd = state.selectedDate;
  const { consumed, macros } = calcTotalsForDate(ymd);
  const goal = dailyGoal();
  const remaining = goal - consumed;
  renderMacroBreakdown(macros, remaining);
}

function renderMacroBreakdown(macros, remaining) {
  const wrap = $("#macro-breakdown");
  if (!wrap) return;

  if (!macros || !macros.hasAnyMacro) {
    wrap.innerHTML = `<div class="muted">${escapeHtml(ui.stats.macrosEmpty)}</div>`;
    return;
  }

  const macroCalories = Number.isFinite(macros.macroCalories) ? macros.macroCalories : undefined;
  const proteinPct = macroCalories ? Math.round((macros.proteinGrams * 4 * 100) / macroCalories) : 0;
  const carbsPct = macroCalories ? Math.round((macros.carbsGrams * 4 * 100) / macroCalories) : 0;
  const fatPct = macroCalories ? Math.round((macros.fatGrams * 9 * 100) / macroCalories) : 0;

  wrap.innerHTML = `
    <div class="macro-row">
      <div class="macro-row-top">
        <span>${escapeHtml(ui.stats.protein)}</span>
        <span>${macros.proteinGrams.toFixed(0)}g</span>
      </div>
      <div class="macro-bar-wrap"><div class="macro-bar" style="--w:${proteinPct}%"></div></div>
      <div class="macro-row-top"><span class="muted">~${Math.round(macros.proteinGrams * 4)} kcal</span><span class="muted">${proteinPct}%</span></div>
    </div>
    <div class="macro-row">
      <div class="macro-row-top">
        <span>${escapeHtml(ui.stats.carbs)}</span>
        <span>${macros.carbsGrams.toFixed(0)}g</span>
      </div>
      <div class="macro-bar-wrap"><div class="macro-bar" style="--w:${carbsPct}%"></div></div>
      <div class="macro-row-top"><span class="muted">~${Math.round(macros.carbsGrams * 4)} kcal</span><span class="muted">${carbsPct}%</span></div>
    </div>
    <div class="macro-row">
      <div class="macro-row-top">
        <span>${escapeHtml(ui.stats.fat)}</span>
        <span>${macros.fatGrams.toFixed(0)}g</span>
      </div>
      <div class="macro-bar-wrap"><div class="macro-bar" style="--w:${fatPct}%"></div></div>
      <div class="macro-row-top"><span class="muted">~${Math.round(macros.fatGrams * 9)} kcal</span><span class="muted">${fatPct}%</span></div>
    </div>
  `;
}

function renderSuggestions() {
  const wrap = $("#suggestions-list");
  if (!wrap) return;

  const hint = $("#suggestions-day-hint");
  if (hint) {
    hint.textContent = ui.suggestionsPage.dayHint(formatNiceDate(state.selectedDate));
  }
  const shuffleHint = $("#suggestions-shuffle-hint");
  if (shuffleHint) shuffleHint.textContent = ui.suggestionsPage.shuffleHint;

  const { remaining, suggestions } = computeSuggestions(state.selectedDate);

  if (remaining <= 0) {
    wrap.innerHTML = `<div class="muted">${escapeHtml(ui.suggestions.goalMet)}</div>`;
    return;
  }

  wrap.innerHTML = "";
  if (suggestions.length === 0) {
    wrap.innerHTML = `<div class="muted">${escapeHtml(ui.suggestions.none)}</div>`;
    return;
  }

  for (let idx = 0; idx < suggestions.length; idx++) {
    const food = suggestions[idx];
    const el = document.createElement("div");
    el.className = "suggestion";
    const eager = idx < 3 ? ' fetchpriority="high"' : "";
    el.innerHTML = `
      <img alt="" loading="lazy" decoding="async"${eager} src="${IMAGE_PLACEHOLDER_URL}" width="60" height="50" />
      <div>
        <div class="name">${escapeHtml(food.name)}</div>
        <div class="meta">${Math.round(food.caloriesPerServing)} kcal · ${escapeHtml(food.servingLabel || "1 portie")}</div>
      </div>
      <button class="btn btn-primary" type="button" data-add="${escapeHtml(food.id)}">${escapeHtml(ui.suggestions.add)}</button>
    `;
    const imgEl = el.querySelector("img");
    if (imgEl) {
      imgEl.alt = `${food.name || "Product"}`;
      void loadFoodThumbFromFood(imgEl, food);
    }
    el.querySelector("button")?.addEventListener("click", () => {
      const log = getLogForDate(state.selectedDate);
      const entry = log[food.id];
      const existing = entry && typeof entry === "object" ? entry.qty || 0 : 0;
      ensureFoodInCustom(food);
      setQtyForFood(state.selectedDate, food.id, existing + 1);
      renderAll();
    });
    wrap.appendChild(el);
  }
}

function renderRecipes() {
  const wrap = $("#recipe-cards");
  if (!wrap) return;
  wrap.innerHTML = "";
  const rng = makePlanRng();
  const list = shuffleArrayCopy([...(ui.recipes || [])], rng);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const art = document.createElement("article");
    art.className = "recipe-card recipe-card--clickable";
    art.tabIndex = 0;
    art.setAttribute("role", "button");
    art.dataset.recipeIndex = String(i);
    const kcalLine =
      Number.isFinite(r.caloriesPerServing) && r.caloriesPerServing > 0
        ? `Ca. ${Math.round(r.caloriesPerServing)} kcal / portie · `
        : "";
    art.innerHTML = `
      <div class="recipe-tag">${escapeHtml(r.tag)}</div>
      <h4>${escapeHtml(r.title)}</h4>
      <p>${escapeHtml(r.body)}</p>
      <div class="recipe-card-cta muted small">${escapeHtml(kcalLine)}${escapeHtml(ui.recipeModal.clickHint)}</div>
    `;
    const open = () => openRecipeModal(r);
    art.addEventListener("click", open);
    art.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    wrap.appendChild(art);
  }
}

function openRecipeModal(r) {
  const backdrop = $("#recipe-modal-backdrop");
  const modal = $("#recipe-modal");
  if (!backdrop || !modal || !r) return;

  $("#recipe-modal-tag").textContent = r.tag || "—";
  $("#recipe-modal-title").textContent = r.title || "—";
  $("#recipe-modal-description").textContent = r.body || "";

  const serving = r.servingLabel || "—";
  $("#recipe-modal-serving").textContent = serving;

  const kcalEl = $("#recipe-modal-kcal");
  if (Number.isFinite(r.caloriesPerServing) && r.caloriesPerServing > 0) {
    kcalEl.textContent = `${Math.round(r.caloriesPerServing)} kcal`;
  } else {
    kcalEl.textContent = "—";
  }

  const pEl = $("#recipe-modal-protein");
  if (Number.isFinite(r.proteinGrams) && r.proteinGrams > 0) {
    pEl.textContent = `~${Math.round(r.proteinGrams)} g`;
  } else {
    pEl.textContent = "—";
  }

  const ul = $("#recipe-modal-ingredients");
  if (ul) {
    ul.innerHTML = "";
    const ing = Array.isArray(r.ingredients) ? r.ingredients : [];
    if (ing.length) {
      for (const line of ing) {
        const li = document.createElement("li");
        li.textContent = line;
        ul.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "—";
      ul.appendChild(li);
    }
  }

  backdrop.hidden = false;
  modal.hidden = false;
}

function closeRecipeModal() {
  const backdrop = $("#recipe-modal-backdrop");
  const modal = $("#recipe-modal");
  if (backdrop) backdrop.hidden = true;
  if (modal) modal.hidden = true;
}

function renderWeekStats() {
  const wrap = $("#week-stats-bars");
  const goalEl = $("#week-stats-goal");
  if (!wrap || !goalEl) return;
  const goal = dailyGoal();
  goalEl.textContent = ui.stats.weekGoal(goal);
  const end = state.selectedDate;
  const rows = [];
  for (let i = 6; i >= 0; i--) {
    const ymd = addDaysYMD(end, -i);
    const { consumed } = calcTotalsForDate(ymd);
    const pct = goal > 0 ? Math.min(100, Math.round((consumed / goal) * 100)) : 0;
    rows.push({ ymd, consumed, pct });
  }
  wrap.innerHTML = rows
    .map(
      (r) => `
    <div class="week-stat-row">
      <span>${escapeHtml(formatShortDay(r.ymd))}</span>
      <div class="week-stat-bar-wrap" aria-hidden="true"><div class="week-stat-bar" style="width:${r.pct}%"></div></div>
      <span>${Math.round(r.consumed)}</span>
    </div>`,
    )
    .join("");
}

function renderStatsPanel() {
  if (!document.getElementById("page-stats")) return;
  const hint = $("#stats-day-hint");
  if (hint) {
    hint.textContent = ui.suggestionsPage.dayHint(formatNiceDate(state.selectedDate));
  }
  renderMacrosPanel();
  renderWeekStats();
}

function appendSelectedTotalRow(wrap, mode, consumed, goal, remaining) {
  if (!wrap) return;
  const totalRow = document.createElement("div");
  totalRow.className = "selected-items-total";
  totalRow.setAttribute("aria-live", "polite");
  const c = Math.round(consumed);
  if (mode === "log") {
    totalRow.textContent = ui.log.dayTotalLine(consumed, goal, remaining);
  } else {
    totalRow.textContent = ui.library.selectedTotal(c);
  }
  wrap.appendChild(totalRow);
}

function renderSelectedItems() {
  const wLib = $("#selected-items");
  const wLog = $("#selected-items-2");
  if (!wLib && !wLog) return;

  const logTitle = $("#log-page-title");
  if (logTitle) logTitle.textContent = ui.log.title;
  const logIntro = $("#log-page-intro");
  if (logIntro) logIntro.textContent = ui.log.intro(formatNiceDate(state.selectedDate));

  const { items, consumed } = calcTotalsForDate(state.selectedDate);
  const goal = dailyGoal();
  const remaining = goal - consumed;

  const emptyHtml = `<div class="muted">${escapeHtml(ui.log.empty)}</div>`;

  const fillWrap = (wrap, mode) => {
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!items.length) {
      wrap.innerHTML = emptyHtml;
    } else {
      for (const { food, qty, servingAmount, calories } of items) {
        const row = document.createElement("div");
        row.className = "selected-row";
        const gramsPart =
          food.caloriesBaseUnit === "g" && Number.isFinite(servingAmount)
            ? ` · ${escapeHtml(ui.common.eachGrams(Math.round(servingAmount)))}`
            : "";
        row.innerHTML = `
        <div>
          <strong>${escapeHtml(food.name)}</strong>
          <div class="muted small">
            ${escapeHtml(catLabel(food.category))} · ${escapeHtml(ui.common.qtyLabel)} ${qty}${gramsPart}
          </div>
        </div>
        <div class="muted" style="font-weight:900;">${Math.round(calories)} kcal</div>
      `;
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.type = "button";
        btn.textContent = ui.common.remove;
        btn.addEventListener("click", () => {
          setQtyForFood(state.selectedDate, food.id, 0);
          renderAll();
        });

        row.appendChild(btn);
        wrap.appendChild(row);
      }
    }
    appendSelectedTotalRow(wrap, mode, consumed, goal, remaining);
  };

  fillWrap(wLib, "library");
  fillWrap(wLog, "log");
}

function openModalForFood(food) {
  const backdrop = $("#modal-backdrop");
  const modal = $("#modal");

  $("#modal-category").textContent = catLabel(food.category);
  $("#modal-title").textContent = food.name || "—";
  $("#modal-kcal").textContent = String(Math.round(food.caloriesPerServing));
  $("#modal-serving").textContent = food.servingLabel || "—";

  const ingredients = $("#modal-ingredients");
  if (food.ingredients && food.ingredients.length) {
    ingredients.textContent = food.ingredients.join(", ");
  } else {
    ingredients.textContent = "—";
  }

  const modalImg = $("#modal-image");
  modalImg.alt = `${food.name || "Product"}`;
  void loadFoodThumbFromFood(modalImg, food);

  const log = getLogForDate(state.selectedDate);
  const entry = log[food.id];
  const qty = entry && typeof entry === "object" ? entry.qty || 0 : 0;
  $("#modal-toggle").dataset.foodId = food.id;
  $("#modal-toggle").textContent = qty > 0 ? ui.modal.toggleQty(qty) : ui.modal.toggle;

  backdrop.hidden = false;
  modal.hidden = false;

  $("#modal-toggle").onclick = () => {
    const dayLog = getLogForDate(state.selectedDate);
    const currentEntry = dayLog[food.id];
    const current = currentEntry && typeof currentEntry === "object" ? currentEntry.qty || 0 : 0;
    if (current > 0) {
      setQtyForFood(state.selectedDate, food.id, 0);
    } else {
      ensureFoodInCustom(food);
      setQtyForFood(state.selectedDate, food.id, 1);
    }
    closeModal();
    renderAll();
  };
}

function closeModal() {
  const backdrop = $("#modal-backdrop");
  const modal = $("#modal");
  backdrop.hidden = true;
  modal.hidden = true;
}

function renderFoodGrid() {
  const grid = $("#food-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const q = normalizeSearch($("#search")?.value);
  const category = $("#category")?.value || "all";

  const foods = foodLibrary()
    .filter((f) => !f || !Number.isNaN(f.caloriesPerServing))
    .filter((f) => (category === "all" ? true : f.category === category))
    .filter((f) => matchesFoodSearchQuery(f, q));

  const log = getLogForDate(state.selectedDate);

  if (!foods.length) {
    const msg = nlFoodsLoading ? ui.library.loadingCore : ui.library.noMatch;
    grid.innerHTML = `<div class="muted">${escapeHtml(msg)}</div>`;
    return;
  }

  for (const food of foods) {
    const entry = log[food.id];
    const qty = entry && typeof entry === "object" ? entry.qty || 0 : 0;
    const servingAmount =
      food?.caloriesBaseUnit === "g"
        ? Number.isFinite(entry?.servingAmount) && entry.servingAmount > 0
          ? entry.servingAmount
          : Number(food.caloriesBaseAmount ?? 100)
        : undefined;
    const card = document.createElement("div");
    card.className = `food-card ${qty > 0 ? "is-done" : ""}`;
    card.tabIndex = 0;

    card.innerHTML = `
      <div class="food-thumb">
        <img alt="" loading="lazy" src="${IMAGE_PLACEHOLDER_URL}" />
      </div>
      <div class="food-main">
        <div>
          <div class="food-name">${escapeHtml(food.name)}</div>
          <div class="food-kcal">${Math.round(food.caloriesPerServing)} kcal · ${escapeHtml(food.servingLabel || "1 portie")}</div>
        </div>
        <div class="food-actions">
          <div class="food-actions-top">
            <div class="food-check">
              <input type="checkbox" ${qty > 0 ? "checked" : ""} aria-label="${escapeHtml(ui.common.log)}: ${escapeHtml(food.name)}" data-food-id="${food.id}" />
              <span class="muted small">${escapeHtml(ui.common.log)}</span>
            </div>
            <div class="qty-pill" aria-label="${escapeHtml(ui.common.qtyLabel)}">
              <button type="button" class="qty-minus" ${qty <= 0 ? "disabled" : ""} data-food-id="${food.id}" aria-label="${escapeHtml(ui.common.qtyMinus)}">−</button>
              <input
                type="number"
                min="0"
                step="1"
                value="${qty > 0 ? qty : 0}"
                data-food-id="${food.id}"
                class="qty-input"
                ${qty <= 0 ? "disabled" : ""}
              />
              <button type="button" class="qty-plus" data-food-id="${food.id}" aria-label="${escapeHtml(ui.common.qtyPlus)}" ${qty <= 0 ? "disabled" : ""}>+</button>
            </div>
          </div>
          ${
            food?.caloriesBaseUnit === "g"
              ? `<div class="grams-row">
                  <span class="muted small">${escapeHtml(ui.common.gramsAbbr)}</span>
                  <div class="grams-pill">
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      step="1"
                      value="${Math.round(servingAmount)}"
                      data-serving-grams="${food.id}"
                      class="grams-input"
                      ${qty <= 0 ? "disabled" : ""}
                      aria-label="${escapeHtml(ui.common.gramsLabel)} (${escapeHtml(food.name)})"
                    />
                    <span class="muted small">g</span>
                  </div>
                </div>`
              : ""
          }
        </div>
      </div>
    `;

    const imgEl = card.querySelector(".food-thumb img");
    if (imgEl) {
      observeFoodThumb(imgEl, food);
    }

    card.addEventListener("click", (e) => {
      const target = e.target;
      const isInteractive =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.classList?.contains("qty-minus") ||
          target.classList?.contains("qty-plus") ||
          target.classList?.contains("qty-input") ||
          target.classList?.contains("grams-input"));
      if (!isInteractive) openModalForFood(food);
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openModalForFood(food);
    });

    const checkbox = card.querySelector(`input[type="checkbox"][data-food-id="${CSS.escape(food.id)}"]`);
    checkbox?.addEventListener("change", (e) => {
      const checked = e.target.checked;
      if (checked) {
        ensureFoodInCustom(food);
        const entry = log[food.id];
        const existingQty = entry && typeof entry === "object" ? entry.qty || 0 : 0;
        setQtyForFood(state.selectedDate, food.id, Math.max(1, existingQty || 1));
      } else {
        setQtyForFood(state.selectedDate, food.id, 0);
      }
      renderAll();
    });

    const minus = card.querySelector(`button.qty-minus[data-food-id="${CSS.escape(food.id)}"]`);
    minus?.addEventListener("click", () => {
      const dayLog = getLogForDate(state.selectedDate);
      const entry = dayLog[food.id];
      const current = entry && typeof entry === "object" ? entry.qty || 0 : 0;
      setQtyForFood(state.selectedDate, food.id, Math.max(0, current - 1));
      renderAll();
    });

    const plus = card.querySelector(`button.qty-plus[data-food-id="${CSS.escape(food.id)}"]`);
    plus?.addEventListener("click", () => {
      ensureFoodInCustom(food);
      const dayLog = getLogForDate(state.selectedDate);
      const entry = dayLog[food.id];
      const current = entry && typeof entry === "object" ? entry.qty || 0 : 0;
      setQtyForFood(state.selectedDate, food.id, current + 1);
      renderAll();
    });

    const qtyInput = card.querySelector(`input.qty-input[data-food-id="${CSS.escape(food.id)}"]`);
    qtyInput?.addEventListener("change", () => {
      const v = qtyInput.value;
      const nextQty = clampInt(v, 0, 999);
      if (nextQty > 0) ensureFoodInCustom(food);
      setQtyForFood(state.selectedDate, food.id, nextQty);
      renderAll();
    });

    const gramsInput = card.querySelector(`input.grams-input[data-serving-grams="${CSS.escape(food.id)}"]`);
    gramsInput?.addEventListener("change", () => {
      if (food?.caloriesBaseUnit !== "g") return;
      const dayLog = getLogForDate(state.selectedDate);
      const entry = dayLog[food.id];
      const currentQty = entry && typeof entry === "object" ? entry.qty || 0 : 0;
      if (currentQty <= 0) return;
      if (food?.caloriesBaseUnit === "g") ensureFoodInCustom(food);
      const grams = clampInt(gramsInput.value, 0, 5000);
      setServingAmountForFood(state.selectedDate, food.id, grams);
      renderAll();
    });

    grid.appendChild(card);
  }

  if (q && nlFoodsFullLoading) {
    const hint = document.createElement("div");
    hint.className = "muted small";
    hint.style.gridColumn = "1 / -1";
    hint.textContent = ui.library.loadingFull;
    grid.appendChild(hint);
  }
}

function ensureImagesInActivePage() {
  const imgs = document.querySelectorAll(".page.is-active img");
  for (const img of imgs) {
    if (img.getAttribute("loading") === "lazy") continue;
    img.loading = "eager";
    if (typeof img.decode === "function") {
      img.decode().catch(() => {});
    }
  }
}

function initRouting() {
  const routeToPage = {
    "#/home": "page-home",
    "#/schedule": "page-schema",
    "#/schema": "page-schema",
    "#/suggestions": "page-suggestions",
    "#/library": "page-library",
    "#/custom-food": "page-custom-food",
    "#/log": "page-log",
    "#/stats": "page-stats",
    "#/settings": "page-settings",
  };

  const tabToHash = [
    { tabId: "tab-home", hash: "#/home" },
    { tabId: "tab-schema", hash: "#/schema" },
    { tabId: "tab-suggestions", hash: "#/suggestions" },
    { tabId: "tab-library", hash: "#/library" },
    { tabId: "tab-custom-food", hash: "#/custom-food" },
    { tabId: "tab-log", hash: "#/log" },
    { tabId: "tab-stats", hash: "#/stats" },
    { tabId: "tab-settings", hash: "#/settings" },
  ];

  function applyRoute() {
    const raw = location.hash || "#/home";
    const hash = routeToPage[raw] ? raw : "#/home";
    const pageId = routeToPage[hash];

    document.querySelectorAll(".page").forEach((p) => {
      p.classList.toggle("is-active", p.id === pageId);
    });

    for (const { tabId, hash: tHash } of tabToHash) {
      const tab = document.getElementById(tabId);
      if (!tab) continue;
      const isActive = hash === tHash || (tHash === "#/schema" && hash === "#/schedule");
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-current", isActive ? "page" : "false");
    }

    ensureImagesInActivePage();
  }

  window.addEventListener("hashchange", applyRoute);
  if (!location.hash) location.hash = "#/home";
  applyRoute();
}

function closeAllModals() {
  closeModal();
  closeRecipeModal();
  const ib = $("#import-backdrop");
  const im = $("#import-modal");
  ib.hidden = true;
  im.hidden = true;
}

function renderAll() {
  // Guard: schedule might be missing if localStorage was cleared mid-session.
  state.schedule = state.schedule || stateDefault().schedule;
  state.goals = state.goals && typeof state.goals === "object" ? state.goals : { ...stateDefault().goals };
  if (!state.selectedDate) state.selectedDate = state.schedule.startDate;

  renderMealPlanTargetLine();
  renderMealPlanOutput();
  renderFreeMealPlanOutput();
  renderFreePlanTargetLine();
  const gpd = $("#goal-plan-days");
  if (gpd) gpd.value = String(clampInt(state.goalPlanDays, 1, 7));
  const fkEl = $("#free-plan-kcal");
  if (fkEl) fkEl.value = String(clampInt(state.freePlanKcalPerDay, 100, 5000));
  const fdEl = $("#free-plan-duration");
  if (fdEl) fdEl.value = String(clampInt(state.freePlanDurationDays, 1, 7));
  renderSummary();
  renderSchemaSubTabsUi();
  renderSuggestions();
  renderRecipes();
  renderStatsPanel();
  renderSelectedItems();
  renderFoodGrid();
}

let state = loadState();
// Custom foods (and later the Dutch dataset) affect which foods exist for calorie/macro calculations.
markFoodsDirty();

function syncHomePageCopy() {
  const intro = $("#home-goals-intro");
  if (intro) intro.textContent = ui.home.goalsIntro;
  const goalsTitle = document.querySelector("#page-home .grid.grid-2 > .card:first-child h2");
  if (goalsTitle) goalsTitle.textContent = ui.home.goalsTitle;
  const progressTitle = document.querySelector("#page-home .summary-compact-card h2");
  if (progressTitle) progressTitle.textContent = ui.home.progressTitle;

  const form = $("#goals-form");
  if (form) {
    const goalSpans = form.querySelectorAll(":scope > label.field > span:first-of-type");
    if (goalSpans[0]) goalSpans[0].textContent = ui.home.dayGoalField;
    if (goalSpans[1]) goalSpans[1].textContent = ui.home.weekGoalField;
    const hints = form.querySelectorAll(":scope > label.field .hint");
    if (hints[0]) hints[0].textContent = ui.home.dayGoalHint;
    if (hints[1]) hints[1].textContent = ui.home.weekGoalHint;
  }

  const saveBtn = $("#btn-goals-save");
  if (saveBtn) saveBtn.textContent = ui.home.goalsSave;

  const gpdLabel = $("#goal-plan-days-label");
  if (gpdLabel) gpdLabel.textContent = ui.home.planDaysLabel;
  const gpdHint = $("#goal-plan-days-hint");
  if (gpdHint) gpdHint.textContent = ui.home.planDaysHint;
}

function initGoalsForm() {
  const form = $("#goals-form");
  if (!form) return;
  const d = $("#goal-daily");
  const w = $("#goal-weekly");
  const planDays = $("#goal-plan-days");
  if (!d || !w || !planDays) return;
  d.value = String(dailyGoal());
  w.value = String(weeklyGoal());
  planDays.value = String(clampInt(state.goalPlanDays, 1, 7));
  planDays.addEventListener("change", () => {
    state.goalPlanDays = clampInt(planDays.value, 1, 7);
    saveState();
    renderMealPlanTargetLine();
  });

  const legend = form.querySelector(".plan-basis-legend");
  if (legend) legend.textContent = ui.home.planBasisLabel;
  const basisHint = form.querySelector(".plan-basis-hint");
  if (basisHint) basisHint.textContent = ui.home.planBasisHint;

  const radios = form.querySelectorAll('input[name="plan-basis"]');
  const basis = planBasisKey();
  for (const input of radios) {
    if (input.value === basis) input.checked = true;
    input.addEventListener("change", () => {
      const checked = form.querySelector('input[name="plan-basis"]:checked');
      state.planGoalBasis = checked?.value === "weekly" ? "weekly" : "daily";
      saveState();
      renderAll();
    });
  }

  const labels = form.querySelectorAll(".plan-basis-options .radio-label");
  const labelTexts = [ui.home.planBasisDaily, ui.home.planBasisWeekly];
  labels.forEach((lab, i) => {
    const text = labelTexts[i];
    if (!text) return;
    const input = lab.querySelector("input");
    lab.replaceChildren();
    if (input) {
      lab.appendChild(input);
      lab.append(` ${text}`);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.goals = {
      daily: clampInt(d.value, 100, 200000),
      weekly: clampInt(w.value, 200, 5000000),
    };
    const checked = form.querySelector('input[name="plan-basis"]:checked');
    state.planGoalBasis = checked?.value === "weekly" ? "weekly" : "daily";
    state.goalPlanDays = clampInt(planDays.value, 1, 7);
    state.schemaSubTab = "goalPlan";
    saveState();
    renderAll();
    location.hash = "#/schema";
  });
}

function initLogDay() {
  const input = $("#log-date-input");
  if (!input) return;
  input.value = state.selectedDate || toYMD(new Date());

  const logField = input.closest(".log-day-field");
  if (logField) {
    const lab = logField.querySelector(":scope > span");
    if (lab) lab.textContent = ui.home.logDayTitle;
    const hint = logField.querySelector(".hint");
    if (hint) hint.textContent = ui.home.logDayHint;
  }

  input.addEventListener("change", () => {
    const v = input.value;
    if (!v) return;
    state.selectedDate = v;
    saveState();
    renderAll();
  });

  const btnToday = $("#btn-log-today");
  if (btnToday) {
    btnToday.textContent = ui.home.logToday;
    btnToday.title = ui.home.logToday;
    btnToday.addEventListener("click", () => {
      const today = toYMD(new Date());
      state.selectedDate = today;
      input.value = today;
      saveState();
      renderAll();
    });
  }
}

function initSchemaSubTabs() {
  document.querySelectorAll("[data-schema-subtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-schema-subtab");
      if (v === "status") state.schemaSubTab = "status";
      else if (v === "freePlan") state.schemaSubTab = "freePlan";
      else state.schemaSubTab = "goalPlan";
      saveState();
      renderSchemaSubTabsUi();
    });
  });
}

function initSchemaPage() {
  initSchemaSubTabs();

  const freeK = $("#free-plan-kcal");
  const freeD = $("#free-plan-duration");
  if (freeK) {
    freeK.value = String(clampInt(state.freePlanKcalPerDay, 100, 5000));
    freeK.addEventListener("change", () => {
      state.freePlanKcalPerDay = clampInt(freeK.value, 100, 5000);
      saveState();
      renderFreePlanTargetLine();
    });
  }
  if (freeD) {
    freeD.value = String(clampInt(state.freePlanDurationDays, 1, 7));
    freeD.addEventListener("change", () => {
      state.freePlanDurationDays = clampInt(freeD.value, 1, 7);
      saveState();
      renderFreePlanTargetLine();
    });
  }

  $("#btn-generate-meal-plan")?.addEventListener("click", () => {
    const duration = clampInt(state.goalPlanDays, 1, 7);
    const kcal = effectivePlanKcalPerDay();
    const rng = makePlanRng();
    const days = buildMealPlan(duration, kcal, rng);
    state.mealPlan = {
      duration,
      kcalPerDay: kcal,
      basis: planBasisKey(),
      days,
    };
    saveState();
    renderMealPlanTargetLine();
    renderMealPlanOutput();
  });

  $("#btn-schema-reset-plan")?.addEventListener("click", () => {
    state.mealPlan = null;
    saveState();
    renderMealPlanTargetLine();
    renderMealPlanOutput();
  });

  $("#btn-generate-free-plan")?.addEventListener("click", async () => {
    const btn = $("#btn-generate-free-plan");
    const kcal = clampInt(freeK?.value ?? state.freePlanKcalPerDay, 100, 5000);
    const duration = clampInt(freeD?.value ?? state.freePlanDurationDays, 1, 7);
    state.freePlanKcalPerDay = kcal;
    state.freePlanDurationDays = duration;
    if (btn) {
      btn.disabled = true;
      btn.textContent = ui.freePlan.generating;
    }
    try {
      const days = await buildFreeMealPlanDays(duration, kcal);
      state.freeMealPlan = {
        duration,
        kcalPerDay: kcal,
        days,
        kind: "free",
      };
      saveState();
      renderFreeMealPlanOutput();
      renderFreePlanTargetLine();
    } catch (e) {
      console.error(e);
      alert(String(e?.message || e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = ui.freePlan.generateBtn;
      }
    }
  });

  $("#btn-reset-free-plan")?.addEventListener("click", () => {
    state.freeMealPlan = null;
    saveState();
    renderFreeMealPlanOutput();
    renderFreePlanTargetLine();
  });
}

function initFoodSearch() {
  $("#search")?.addEventListener("input", () => {
    const q = normalizeSearch($("#search")?.value);
    if (q.length >= 2) scheduleNlFoodsFullLoad();
    renderFoodGrid();
  });
  $("#category")?.addEventListener("change", () => renderFoodGrid());
}

function initCustomFoodForm() {
  const form = $("#custom-food-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#custom-name").value.trim();
    const category = $("#custom-category").value;
    const kcal = clampInt($("#custom-kcal").value, 0, 20000);
    const servingLabel = $("#custom-serving").value.trim();
    const imageQuery = $("#custom-image-query").value.trim();
    const ingredientsRaw = $("#custom-ingredients").value.trim();
    const proteinRaw = $("#custom-protein")?.value;
    const carbsRaw = $("#custom-carbs")?.value;
    const fatRaw = $("#custom-fat")?.value;

    const ingredients = ingredientsRaw
      ? ingredientsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const baseId = slugify(name);
    const existingIds = new Set(state.customFoods.map((f) => f.id));
    let id = baseId || `custom-${Date.now()}`;
    let i = 2;
    while (existingIds.has(id)) {
      id = `${baseId || "custom"}-${i++}`;
    }

    const food = normalizeFoodForStorage({
      id,
      name,
      category,
      caloriesPerServing: kcal,
      servingLabel: servingLabel || undefined,
      imageQuery: imageQuery || undefined,
      ingredients,
      tags: [],
      proteinPerBaseAmount: proteinRaw ? Number(proteinRaw) : undefined,
      carbsPerBaseAmount: carbsRaw ? Number(carbsRaw) : undefined,
      fatPerBaseAmount: fatRaw ? Number(fatRaw) : undefined,
    });

    state.customFoods = [...state.customFoods, food];
    markFoodsDirty();
    saveState();

    // Also add 1 serving to the currently selected day.
    const dayLog = getLogForDate(state.selectedDate);
    const entry = dayLog[food.id];
    const existingQty = entry && typeof entry === "object" ? entry.qty || 0 : 0;
    setQtyForFood(state.selectedDate, food.id, existingQty + 1);

    // Clear form
    form.reset();
    // Ensure category resets to default (first option); reset() keeps select value in some browsers.
    $("#custom-category").value = "Snack";

    renderAll();
    location.hash = "#/library";
  });
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initModals() {
  $("#modal-close")?.addEventListener("click", closeAllModals);
  $("#modal-backdrop")?.addEventListener("click", closeAllModals);

  $("#recipe-modal-close")?.addEventListener("click", closeAllModals);
  $("#recipe-modal-backdrop")?.addEventListener("click", closeAllModals);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });

  $("#btn-import").addEventListener("click", () => {
    $("#import-backdrop").hidden = false;
    $("#import-modal").hidden = false;
    $("#import-text").focus();
  });
  $("#import-close")?.addEventListener("click", closeAllModals);
  $("#import-backdrop")?.addEventListener("click", closeAllModals);

  $("#btn-do-import").addEventListener("click", () => {
    const raw = $("#import-text").value;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON");
      // Minimal validation: expected keys.
      state = { ...stateDefault(), ...parsed };
      state.schedule = state.schedule || stateDefault().schedule;
      state.selectedDate = state.selectedDate || state.schedule.startDate;
      state.customFoods = Array.isArray(state.customFoods) ? state.customFoods : [];
      state.logs = state.logs && typeof state.logs === "object" ? state.logs : {};
      state.goals = state.goals && typeof state.goals === "object" ? state.goals : {};
      const legacyDailyImp = Number(state.schedule?.dailyGoal);
      const baseDailyImp = Number.isFinite(legacyDailyImp) && legacyDailyImp > 0 ? legacyDailyImp : 2000;
      if (!Number.isFinite(Number(state.goals.daily)) || Number(state.goals.daily) <= 0) state.goals.daily = baseDailyImp;
      if (!Number.isFinite(Number(state.goals.weekly)) || Number(state.goals.weekly) <= 0) {
        state.goals.weekly = Number(state.goals.daily) * 7;
      }
      if ("monthly" in state.goals) delete state.goals.monthly;
      if (state.planGoalBasis === "monthly") state.planGoalBasis = "daily";
      const okBasisImp = ["daily", "weekly"];
      if (!okBasisImp.includes(state.planGoalBasis)) state.planGoalBasis = "daily";
      if (state.schemaSubTab === "plan") state.schemaSubTab = "goalPlan";
      const okTabImp = ["goalPlan", "freePlan", "status"];
      if (!okTabImp.includes(state.schemaSubTab)) state.schemaSubTab = "goalPlan";
      state.goalPlanDays = clampInt(Number(state.goalPlanDays) || Number(state.schedule?.days) || 7, 1, 7);
      state.freePlanKcalPerDay = clampInt(Number(state.freePlanKcalPerDay) || 2000, 100, 5000);
      state.freePlanDurationDays = clampInt(Number(state.freePlanDurationDays) || 3, 1, 7);
      if (state.mealPlan != null && typeof state.mealPlan !== "object") state.mealPlan = null;
      if (state.freeMealPlan != null && typeof state.freeMealPlan !== "object") state.freeMealPlan = null;

      // Migration: handle older imports where log values were stored as numbers.
      for (const [dateYMD, dayLog] of Object.entries(state.logs)) {
        if (!dayLog || typeof dayLog !== "object") continue;
        for (const [foodId, v] of Object.entries(dayLog)) {
          if (typeof v === "number") dayLog[foodId] = { qty: v };
          else if (v && typeof v === "object") {
            if (v.servingAmount === undefined && v.servingGrams !== undefined) v.servingAmount = v.servingGrams;
            if (typeof v.qty !== "number" && typeof v.quantity === "number") v.qty = v.quantity;
          }
        }
      }
      markFoodsDirty();
      saveState();
      closeAllModals();
      renderAll();
    } catch (err) {
      alert(ui.alerts.importFailed(err?.message || String(err)));
    }
  });

  $("#btn-export").addEventListener("click", async () => {
    const exportState = { ...state };
    const json = JSON.stringify(exportState, null, 2);

    // Download JSON for convenience.
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calorie-tracker-export-${state.selectedDate || "data"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });

  $("#btn-reset-log").addEventListener("click", () => {
    if (!state?.selectedDate) return;
    if (!confirm(ui.alerts.resetConfirm)) return;
    state.logs[state.selectedDate] = {};
    saveState();
    renderAll();
  });
}

// ---------- Boot ----------
initRouting();
initGoalsForm();
initLogDay();
initSchemaPage();
initFoodSearch();
initCustomFoodForm();
initModals();

syncHomePageCopy();
syncSchemaPageCopy();

loadNlFoodsCore();
renderAll();

