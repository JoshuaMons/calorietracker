import { BUILTIN_FOODS, normalizeFoodForStorage } from "./foods.js";
import { ui } from "./i18n.js";

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
      dailyGoal: 2000,
    },
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

function makeImageQuery(food) {
  const base = (food?.imageQuery || food?.name || "").trim();
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

/** Openverse (https://openverse.org/) image search — CC-licensed catalog */
const OPENVERSE_IMAGES_API = "https://api.openverse.engineering/v1/images/";
const openverseImageCache = new Map();
let suggestionsOpenverseGen = 0;

const ovWaiters = [];
let ovInFlight = 0;
const OV_MAX_CONCURRENT = 3;

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

function observeFoodThumb(img) {
  if (!img) return;
  if (!foodThumbObserver) {
    foodThumbObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          foodThumbObserver.unobserve(el);
          const q = el.dataset.ovQ || "";
          void loadOpenverseIntoImg(el, q);
        }
      },
      { root: null, rootMargin: "140px", threshold: 0.01 },
    );
  }
  foodThumbObserver.observe(img);
}

async function loadOpenverseIntoImg(img, queryText) {
  if (!img) return;
  const url = await fetchOpenverseThumbnailForQueryQueued(queryText || "food");
  if (!img.isConnected) return;
  if (url) {
    attachImageErrorFallback(img);
    img.src = url;
  }
}

async function fetchOpenverseThumbnailForQuery(query) {
  const qBase = (query || "healthy food")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ");
  const searchQ = `${qBase || "healthy"} food`.slice(0, 120);
  if (openverseImageCache.has(searchQ)) {
    return openverseImageCache.get(searchQ);
  }
  try {
    const params = new URLSearchParams({
      q: searchQ,
      page_size: "1",
    });
    const res = await fetch(`${OPENVERSE_IMAGES_API}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.results?.[0];
    const url = hit?.thumbnail || hit?.url || null;
    if (url) openverseImageCache.set(searchQ, url);
    return url;
  } catch {
    return null;
  }
}

async function hydrateOpenverseSuggestionImages(container, gen) {
  if (!container) return;
  const imgs = container.querySelectorAll('img[data-openverse="1"]');
  for (const img of imgs) {
    if (gen !== suggestionsOpenverseGen) return;
    const foodQuery = img.dataset.imgQuery || "";
    const url = await fetchOpenverseThumbnailForQueryQueued(foodQuery);
    if (gen !== suggestionsOpenverseGen) return;
    if (!img.isConnected) continue;
    if (url) {
      attachImageErrorFallback(img);
      img.src = url;
    }
  }
}

function getScheduleDays(schedule) {
  const days = clampInt(schedule?.days ?? 7, 1, 365);
  const start = schedule?.startDate || toYMD(new Date());
  const out = [];
  for (let i = 0; i < days; i++) out.push(addDaysYMD(start, i));
  return out;
}

function currentGoal() {
  return Number(state.schedule?.dailyGoal ?? 2000);
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
    `&fields=product_name,brands,categories_tags,ingredients_text,nutriments,image_front_small_url,image_front_url` +
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

      return normalizeFoodForStorage({
        id,
        name,
        category: guessCategoryFromTags(p.categories_tags),
        caloriesPerServing: Number.isFinite(kcal) ? kcal : 0,
        servingLabel: "100g",
        // We only store keywords; image URL is generated client-side.
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

function matchesFoodQuery(food, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const hay = `${food.name} ${food.category} ${(food.tags || []).join(" ")} ${(food.ingredients || []).join(" ")}`.toLowerCase();
  return hay.includes(q);
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

function computeSuggestions(dateYMD) {
  const goal = currentGoal();
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
  const suitable = allFoods
    .filter((f) => f.caloriesPerServing <= target)
    .sort((a, b) => Math.abs(a.caloriesPerServing - target) - Math.abs(b.caloriesPerServing - target));

  const suggestions = [];
  for (const f of suitable) {
    suggestions.push(f);
    if (suggestions.length >= 5) break;
  }

  if (suggestions.length < 5) {
    const above = allFoods
      .filter((f) => f.caloriesPerServing > target)
      .sort((a, b) => Math.abs(a.caloriesPerServing - target) - Math.abs(b.caloriesPerServing - target));
    for (const f of above) {
      suggestions.push(f);
      if (suggestions.length >= 5) break;
    }
  }

  if (suggestions.length === 0) {
    const fallback = suggestionFoodPool().filter((f) => {
      const entry = log[f.id];
      const qty = entry && typeof entry === "object" ? entry.qty : 0;
      return !(qty > 0);
    });
    return { remaining, suggestions: fallback.slice(0, 5) };
  }

  return { remaining, suggestions };
}

function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderSchedule() {
  const days = getScheduleDays(state.schedule);
  const strip = $("#date-strip");
  strip.innerHTML = "";

  const meta = $("#schedule-meta");
  meta.textContent = ui.home.daysCount(state.schedule.days);

  for (const ymd of days) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-btn";
    btn.textContent = formatShortDay(ymd);
    btn.dataset.ymd = ymd;
    if (ymd === state.selectedDate) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      state.selectedDate = ymd;
      saveState();
      renderAll();
    });
    strip.appendChild(btn);
  }
}

function renderSummary() {
  const dayLabel = $("#selected-day-label");
  const goalPill = $("#goal-pill");
  const consumedEl = $("#consumed-label");
  const remainingEl = $("#remaining-label");
  const bar = $("#progress-bar");
  const ringEl = $("#calorie-ring");
  const ringPercentEl = $("#ring-percent");

  const ymd = state.selectedDate;
  const { consumed } = calcTotalsForDate(ymd);
  const goal = currentGoal();
  const remaining = goal - consumed;

  dayLabel.textContent = formatNiceDate(ymd);
  goalPill.textContent = ui.home.goalPill(goal);
  consumedEl.textContent = Math.round(consumed);
  remainingEl.textContent = Math.round(remaining);

  const pct = goal > 0 ? Math.min(100, Math.max(0, (consumed / goal) * 100)) : 0;
  bar.style.width = `${pct}%`;
  bar.setAttribute("aria-valuenow", String(pct));

  if (ringEl) {
    ringEl.style.background = `conic-gradient(var(--accent-2) ${pct}%, rgba(17, 24, 39, 0.08) ${pct}% )`;
  }
  if (ringPercentEl) {
    ringPercentEl.textContent = `${Math.round(pct)}%`;
  }

  const oneLiner = $("#summary-one-liner");
  if (oneLiner) {
    const g = Math.round(goal);
    const c = Math.round(consumed);
    const r = Math.round(remaining);
    if (g <= 0) {
      oneLiner.textContent = ui.summaryLines.emptyGoal;
    } else if (r < 0) {
      oneLiner.textContent = ui.summaryLines.overGoal(Math.abs(r));
    } else if (c >= g) {
      oneLiner.textContent = ui.summaryLines.hitGoal;
    } else if (c === 0) {
      oneLiner.textContent = ui.summaryLines.nothingLogged(r, formatShortDay(ymd));
    } else {
      oneLiner.textContent = ui.summaryLines.normal(c, r, g);
    }
  }
}

function renderMacrosPanel() {
  const ymd = state.selectedDate;
  const { consumed, macros } = calcTotalsForDate(ymd);
  const goal = currentGoal();
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

  const { remaining, suggestions } = computeSuggestions(state.selectedDate);

  suggestionsOpenverseGen += 1;
  const gen = suggestionsOpenverseGen;

  if (remaining <= 0) {
    wrap.innerHTML = `<div class="muted">${escapeHtml(ui.suggestions.goalMet)}</div>`;
    return;
  }

  wrap.innerHTML = "";
  if (suggestions.length === 0) {
    wrap.innerHTML = `<div class="muted">${escapeHtml(ui.suggestions.none)}</div>`;
    return;
  }

  for (const food of suggestions) {
    const el = document.createElement("div");
    el.className = "suggestion";
    el.innerHTML = `
      <img alt="" loading="lazy" src="${IMAGE_PLACEHOLDER_URL}" width="60" height="50" />
      <div>
        <div class="name">${escapeHtml(food.name)}</div>
        <div class="meta">${Math.round(food.caloriesPerServing)} kcal · ${escapeHtml(food.servingLabel || "1 portie")}</div>
      </div>
      <button class="btn btn-primary" type="button" data-add="${escapeHtml(food.id)}">${escapeHtml(ui.suggestions.add)}</button>
    `;
    const imgEl = el.querySelector("img");
    if (imgEl) {
      imgEl.dataset.openverse = "1";
      imgEl.dataset.imgQuery = makeImageQuery(food);
      imgEl.alt = `${food.name || "Product"}`;
      attachImageErrorFallback(imgEl);
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

  void hydrateOpenverseSuggestionImages(wrap, gen);
}

function renderRecipes() {
  const wrap = $("#recipe-cards");
  if (!wrap) return;
  wrap.innerHTML = (ui.recipes || [])
    .map(
      (r) => `
    <article class="recipe-card">
      <div class="recipe-tag">${escapeHtml(r.tag)}</div>
      <h4>${escapeHtml(r.title)}</h4>
      <p>${escapeHtml(r.body)}</p>
    </article>`,
    )
    .join("");
}

function renderWeekStats() {
  const wrap = $("#week-stats-bars");
  const goalEl = $("#week-stats-goal");
  if (!wrap || !goalEl) return;
  const goal = currentGoal();
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

function renderSelectedItems() {
  const wraps = [$("#selected-items"), $("#selected-items-2")].filter(Boolean);
  if (!wraps.length) return;

  const { items } = calcTotalsForDate(state.selectedDate);

  const emptyHtml = `<div class="muted">${escapeHtml(ui.log.empty)}</div>`;
  if (!items.length) {
    for (const wrap of wraps) wrap.innerHTML = emptyHtml;
    return;
  }

  for (const wrap of wraps) {
    wrap.innerHTML = "";
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
  modalImg.src = IMAGE_PLACEHOLDER_URL;
  modalImg.alt = `${food.name || "Product"}`;
  attachImageErrorFallback(modalImg);
  void loadOpenverseIntoImg(modalImg, makeImageQuery(food));

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
  grid.innerHTML = "";

  const q = normalizeSearch($("#search")?.value);
  const category = $("#category")?.value || "all";

  const foods = foodLibrary()
    .filter((f) => !f || !Number.isNaN(f.caloriesPerServing))
    .filter((f) => (category === "all" ? true : f.category === category))
    .filter((f) => matchesFoodQuery(f, q));

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
          <div class="food-check">
            <input type="checkbox" ${qty > 0 ? "checked" : ""} aria-label="${escapeHtml(ui.common.log)}: ${escapeHtml(food.name)}" data-food-id="${food.id}" />
            <span class="muted small">${escapeHtml(ui.common.log)}</span>
          </div>
          <div class="qty" aria-label="${escapeHtml(ui.common.qtyLabel)}">
            <button type="button" class="qty-minus" ${qty <= 0 ? "disabled" : ""} data-food-id="${food.id}" aria-label="${escapeHtml(ui.common.qtyMinus)}">-</button>
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
            ${
              food?.caloriesBaseUnit === "g"
                ? `<input
                    type="number"
                    min="0"
                    max="5000"
                    step="1"
                    value="${Math.round(servingAmount)}"
                    data-serving-grams="${food.id}"
                    class="grams-input"
                    ${qty <= 0 ? "disabled" : ""}
                    aria-label="${escapeHtml(ui.common.gramsLabel)} (${escapeHtml(food.name)})"
                  />`
                : ""
            }
          </div>
        </div>
      </div>
    `;

    const imgEl = card.querySelector(".food-thumb img");
    if (imgEl) {
      imgEl.dataset.ovQ = makeImageQuery(food);
      attachImageErrorFallback(imgEl);
      observeFoodThumb(imgEl);
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
          target.classList?.contains("qty-input"));
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
    "#/schedule": "page-home",
    "#/suggestions": "page-suggestions",
    "#/library": "page-library",
    "#/log": "page-log",
    "#/stats": "page-stats",
    "#/settings": "page-settings",
  };

  const tabToHash = [
    { tabId: "tab-home", hash: "#/home" },
    { tabId: "tab-suggestions", hash: "#/suggestions" },
    { tabId: "tab-library", hash: "#/library" },
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
      const isActive = hash === tHash || (tHash === "#/home" && hash === "#/schedule");
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
  const ib = $("#import-backdrop");
  const im = $("#import-modal");
  ib.hidden = true;
  im.hidden = true;
}

function renderAll() {
  // Guard: schedule might be missing if localStorage was cleared mid-session.
  state.schedule = state.schedule || stateDefault().schedule;
  if (!state.selectedDate) state.selectedDate = state.schedule.startDate;

  // If selectedDate falls outside the schedule, keep it (so user can still log),
  // but date strip will highlight schedule days only.
  renderSchedule();
  renderSummary();
  renderSuggestions();
  renderRecipes();
  renderStatsPanel();
  renderSelectedItems();
  renderFoodGrid();
}

let state = loadState();
// Custom foods (and later the Dutch dataset) affect which foods exist for calorie/macro calculations.
markFoodsDirty();

function initScheduleForm() {
  const startInput = $("#schedule-start");
  const daysInput = $("#schedule-days");
  const goalInput = $("#schedule-goal");

  const today = toYMD(new Date());
  startInput.value = state.schedule?.startDate || today;
  daysInput.value = state.schedule?.days ?? 7;
  goalInput.value = state.schedule?.dailyGoal ?? 2000;

  $("#schedule-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const start = startInput.value || today;
    const days = clampInt(daysInput.value, 1, 365);
    const goal = clampInt(goalInput.value, 100, 20000);

    state.schedule = { startDate: start, days, dailyGoal: goal };
    state.selectedDate = start;
    saveState();
    renderAll();
  });

  $("#btn-use-today").addEventListener("click", () => {
    state.selectedDate = toYMD(new Date());
    saveState();
    renderAll();
  });
}

function initFoodSearch() {
  $("#search")?.addEventListener("input", () => {
    const q = normalizeSearch($("#search")?.value);
    if (q.length >= 2) scheduleNlFoodsFullLoad();
    renderFoodGrid();
  });
  $("#search")?.addEventListener("focus", () => {
    scheduleNlFoodsFullLoad();
  });
  $("#category")?.addEventListener("change", () => renderFoodGrid());
}

function initCustomFoodForm() {
  const form = $("#custom-food-form");
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
initScheduleForm();
initFoodSearch();
initCustomFoodForm();
initModals();

loadNlFoodsCore();
renderAll();

