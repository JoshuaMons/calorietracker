import { BUILTIN_FOODS, normalizeFoodForStorage } from "./foods.js";

const STORAGE_KEY = "calorieTracker.v1";

const $ = (sel) => document.querySelector(sel);

const BUILTIN_FOOD_IDS = new Set(BUILTIN_FOODS.map((f) => f.id));

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
  const parts = dt.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  return parts;
}

function formatShortDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.toLocaleDateString(undefined, { weekday: "short" });
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

function makeImageUrl(food) {
  if (food.imageUrl) return food.imageUrl;
  const query = (food.imageQuery || food.name || "food").trim();
  const q = encodeURIComponent(query);
  const sig = hashCode(food.id || food.name || query);
  // `source.unsplash.com` returns a random image for the query; `sig` makes it more stable per food.
  return `https://source.unsplash.com/400x300/?${q}&sig=${sig}`;
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
  if (state.customFoods.some((f) => f.id === food.id)) return;
  state.customFoods = [...state.customFoods, normalizeFoodForStorage(food)];
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
        servingLabel: "per 100g",
        imageUrl: p.image_front_small_url || p.image_front_url || "",
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

function foodLibrary() {
  const custom = state.customFoods.map(normalizeFoodForStorage);
  return [...BUILTIN_FOODS, ...custom, ...webFoods];
}

function foodById() {
  const map = new Map();
  for (const f of foodLibrary()) map.set(f.id, f);
  return map;
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
    log[foodId] = q;
  }
  state.logs[dateYMD] = log;
  saveState();
}

function calcTotalsForDate(dateYMD) {
  const byId = foodById();
  const log = getLogForDate(dateYMD);
  let consumed = 0;
  const items = [];
  for (const [foodId, qty] of Object.entries(log)) {
    const food = byId.get(foodId);
    if (!food || !Number.isFinite(food.caloriesPerServing)) continue;
    const cals = food.caloriesPerServing * qty;
    consumed += cals;
    items.push({ food, qty, calories: cals });
  }
  items.sort((a, b) => b.calories - a.calories);
  return { consumed, items };
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

function computeSuggestions(dateYMD) {
  const goal = currentGoal();
  const { consumed } = calcTotalsForDate(dateYMD);
  const remaining = goal - consumed;
  const foodMap = foodById();
  const log = getLogForDate(dateYMD);

  if (remaining <= 0) {
    return { remaining, suggestions: [] };
  }

  const allFoods = foodLibrary()
    .filter((f) => f && Number.isFinite(f.caloriesPerServing))
    .filter((f) => f.caloriesPerServing > 0)
    .filter((f) => ["Snack", "Drink"].includes(f.category))
    .filter((f) => !(log[f.id] && log[f.id] > 0));

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

  // If still empty, fall back to any snack/drink not in log (even if 0 calories items exist).
  if (suggestions.length === 0) {
    const fallback = foodLibrary().filter((f) => ["Snack", "Drink"].includes(f.category) && f.caloriesPerServing >= 0);
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
  meta.textContent = `${state.schedule.days} days`;

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

  const ymd = state.selectedDate;
  const { consumed } = calcTotalsForDate(ymd);
  const goal = currentGoal();
  const remaining = goal - consumed;

  dayLabel.textContent = formatNiceDate(ymd);
  goalPill.textContent = `Goal: ${goal} kcal`;
  consumedEl.textContent = Math.round(consumed);
  remainingEl.textContent = Math.round(remaining);

  const pct = goal > 0 ? Math.min(100, Math.max(0, (consumed / goal) * 100)) : 0;
  bar.style.width = `${pct}%`;
  bar.setAttribute("aria-valuenow", String(pct));
}

function renderSuggestions() {
  const wrap = $("#suggestions-list");
  const { remaining, suggestions } = computeSuggestions(state.selectedDate);

  if (remaining <= 0) {
    wrap.innerHTML = `<div class="muted">Nice work. You met your goal for this day.</div>`;
    return;
  }

  wrap.innerHTML = "";
  if (suggestions.length === 0) {
    wrap.innerHTML = `<div class="muted">No suggestions available. Add a custom snack/drink.</div>`;
    return;
  }

  for (const food of suggestions) {
    const el = document.createElement("div");
    el.className = "suggestion";
    el.innerHTML = `
      <img alt="" loading="lazy" src="${makeImageUrl(food)}" />
      <div>
        <div class="name">${escapeHtml(food.name)}</div>
        <div class="meta">${Math.round(food.caloriesPerServing)} kcal · ${escapeHtml(food.servingLabel || "1 serving")}</div>
      </div>
      <button class="btn btn-primary" type="button" data-add="${escapeHtml(food.id)}">Add</button>
    `;
    el.querySelector("button")?.addEventListener("click", () => {
      const log = getLogForDate(state.selectedDate);
      const existing = log[food.id] || 0;
      ensureFoodInCustom(food);
      setQtyForFood(state.selectedDate, food.id, existing + 1);
      renderAll();
    });
    wrap.appendChild(el);
  }
}

function renderSelectedItems() {
  const wrap = $("#selected-items");
  const { items } = calcTotalsForDate(state.selectedDate);
  if (!items.length) {
    wrap.innerHTML = `<div class="muted">No items logged for this day yet.</div>`;
    return;
  }

  wrap.innerHTML = "";
  for (const { food, qty, calories } of items) {
    const row = document.createElement("div");
    row.className = "selected-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(food.name)}</strong>
        <div class="muted small">${escapeHtml(food.category)} · Qty ${qty}</div>
      </div>
      <div class="muted" style="font-weight:900;">${Math.round(calories)} kcal</div>
    `;
    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.type = "button";
    btn.textContent = "Remove";
    btn.addEventListener("click", () => {
      setQtyForFood(state.selectedDate, food.id, 0);
      renderAll();
    });

    row.appendChild(btn);
    wrap.appendChild(row);
  }
}

function openModalForFood(food) {
  const backdrop = $("#modal-backdrop");
  const modal = $("#modal");

  $("#modal-category").textContent = food.category || "—";
  $("#modal-title").textContent = food.name || "—";
  $("#modal-kcal").textContent = String(Math.round(food.caloriesPerServing));
  $("#modal-serving").textContent = food.servingLabel || "—";

  const ingredients = $("#modal-ingredients");
  if (food.ingredients && food.ingredients.length) {
    ingredients.textContent = food.ingredients.join(", ");
  } else {
    ingredients.textContent = "—";
  }

  $("#modal-image").src = makeImageUrl(food);
  $("#modal-image").alt = `${food.name} photo`;

  const log = getLogForDate(state.selectedDate);
  const qty = log[food.id] || 0;
  $("#modal-toggle").dataset.foodId = food.id;
  $("#modal-toggle").textContent = qty > 0 ? `Remove (currently ${qty})` : "Add / Remove";

  backdrop.hidden = false;
  modal.hidden = false;

  $("#modal-toggle").onclick = () => {
    const current = getLogForDate(state.selectedDate)[food.id] || 0;
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
    grid.innerHTML = `<div class="muted">${webLoading ? "Loading web results..." : "No foods match your search."}</div>`;
    return;
  }

  if (webLoading && q) {
    const hint = document.createElement("div");
    hint.className = "muted small";
    hint.textContent = "Loading more products from Open Food Facts...";
    grid.appendChild(hint);
  }

  for (const food of foods) {
    const qty = log[food.id] || 0;
    const card = document.createElement("div");
    card.className = `food-card ${qty > 0 ? "is-done" : ""}`;
    card.tabIndex = 0;

    card.innerHTML = `
      <div class="food-thumb">
        <img alt="" loading="lazy" src="${makeImageUrl(food)}" />
      </div>
      <div class="food-main">
        <div>
          <div class="food-name">${escapeHtml(food.name)}</div>
          <div class="food-kcal">${Math.round(food.caloriesPerServing)} kcal · ${escapeHtml(food.servingLabel || "1 serving")}</div>
        </div>
        <div class="food-actions">
          <div class="food-check">
            <input type="checkbox" ${qty > 0 ? "checked" : ""} aria-label="Log ${escapeHtml(food.name)}" data-food-id="${escapeHtml(food.id)}" />
            <span class="muted small">Log</span>
          </div>
          <div class="qty" aria-label="Quantity selector">
            <button type="button" class="qty-minus" ${qty <= 0 ? "disabled" : ""} data-food-id="${escapeHtml(food.id)}" aria-label="Decrease quantity">-</button>
            <input
              type="number"
              min="0"
              step="1"
              value="${qty > 0 ? qty : 0}"
              data-food-id="${escapeHtml(food.id)}"
              class="qty-input"
              ${qty <= 0 ? "disabled" : ""}
            />
            <button type="button" class="qty-plus" data-food-id="${escapeHtml(food.id)}" aria-label="Increase quantity" ${qty <= 0 ? "disabled" : ""}>+</button>
          </div>
        </div>
      </div>
    `;

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
        setQtyForFood(state.selectedDate, food.id, Math.max(1, log[food.id] || 1));
      } else {
        setQtyForFood(state.selectedDate, food.id, 0);
      }
      renderAll();
    });

    const minus = card.querySelector(`button.qty-minus[data-food-id="${CSS.escape(food.id)}"]`);
    minus?.addEventListener("click", () => {
      const current = getLogForDate(state.selectedDate)[food.id] || 0;
      setQtyForFood(state.selectedDate, food.id, Math.max(0, current - 1));
      renderAll();
    });

    const plus = card.querySelector(`button.qty-plus[data-food-id="${CSS.escape(food.id)}"]`);
    plus?.addEventListener("click", () => {
      ensureFoodInCustom(food);
      const current = getLogForDate(state.selectedDate)[food.id] || 0;
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

    grid.appendChild(card);
  }
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
  renderSelectedItems();
  renderFoodGrid();
}

let state = loadState();

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
    renderFoodGrid();
    scheduleWebSearch($("#search")?.value);
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
    });

    state.customFoods = [...state.customFoods, food];
    saveState();

    // Also add 1 serving to the currently selected day.
    setQtyForFood(state.selectedDate, food.id, (getLogForDate(state.selectedDate)[food.id] || 0) + 1);

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
      saveState();
      closeAllModals();
      renderAll();
    } catch (err) {
      alert(`Import failed: ${err?.message || String(err)}`);
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
    if (!confirm("Clear logged foods for the selected day?")) return;
    state.logs[state.selectedDate] = {};
    saveState();
    renderAll();
  });
}

// ---------- Boot ----------
initScheduleForm();
initFoodSearch();
initCustomFoodForm();
initModals();

renderAll();

