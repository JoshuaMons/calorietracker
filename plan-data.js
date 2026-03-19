/**
 * Pools voor hoog-eiwit / relatief laag-kcal maaltijdschema (Nederlands).
 * Wordt geschud per generatie; past bij dagbudget van de gebruiker.
 */

export const SLOT_FRACS = {
  breakfast: 0.26,
  lunch: 0.36,
  dinner: 0.3,
  snack: 0.08,
};

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Meer spreiding: grotere top-N + score-jitter zodat je niet steeds dezelfde winnaar krijgt. */
const DEFAULT_PICK_OPTS = { jitter: 72, topNMin: 4 };

/**
 * Kiest willekeurig uit de beste passende opties (niet altijd exact dezelfde "winnaar"),
 * zodat elke klik op "Nieuw plan" merkbaar andere combinaties geeft.
 */
function pickNear(pool, targetKcal, rng, options = {}) {
  const jitter = Number.isFinite(options.jitter) ? options.jitter : DEFAULT_PICK_OPTS.jitter;
  const topNMin = Number.isFinite(options.topNMin) ? options.topNMin : DEFAULT_PICK_OPTS.topNMin;
  const topNMax = Number.isFinite(options.topNMax) ? options.topNMax : pool.length;

  const shuffled = shuffle(pool, rng);
  const scored = shuffled.map((m) => {
    const diff = Math.abs(m.kcal - targetKcal);
    const proteinBias = -m.protein * 2;
    const score = diff + proteinBias + rng() * jitter;
    return { m, score };
  });
  scored.sort((a, b) => a.score - b.score);
  const poolSize = scored.length;
  const topN = Math.min(poolSize, topNMax, Math.max(topNMin, poolSize));
  const pickIdx = Math.floor(rng() * Math.max(1, topN));
  return scored[pickIdx].m;
}

/**
 * Verdeelt `total` als gehele kcal over slots, proportioneel aan `weights` (recept-schattingen),
 * zodat de som exact `total` is (geen afrondingsverschil met het dagbudget).
 */
function distributeKcalToSlots(total, weights) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const w = weights.map((x) => Math.max(0.001, Number(x) || 0.001));
  const sumW = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (t * x) / sumW);
  const out = raw.map((x) => Math.floor(x));
  let rem = t - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, f: x - Math.floor(x) }))
    .sort((a, b) => b.f - a.f);
  for (let k = 0; k < rem; k++) {
    out[order[k % order.length].i]++;
  }
  return out;
}

function buildDaySlots(kcalPerDay, rng, pickOpts = DEFAULT_PICK_OPTS) {
  const target = Math.max(100, Math.round(Number(kcalPerDay) || 0));
  const b = pickNear(BREAKFAST_POOL, target * SLOT_FRACS.breakfast, rng, pickOpts);
  const l = pickNear(LUNCH_POOL, target * SLOT_FRACS.lunch, rng, pickOpts);
  const di = pickNear(DINNER_POOL, target * SLOT_FRACS.dinner, rng, pickOpts);
  const s = pickNear(SNACK_POOL, target * SLOT_FRACS.snack, rng, pickOpts);
  const dr = pickNear(DRINK_POOL, 0, rng, { jitter: 24, topNMin: 2, topNMax: DRINK_POOL.length });

  const picked = [
    { label: "Ontbijt", title: b.title, kcal: b.kcal, protein: b.protein, steps: b.steps },
    { label: "Lunch", title: l.title, kcal: l.kcal, protein: l.protein, steps: l.steps },
    { label: "Diner", title: di.title, kcal: di.kcal, protein: di.protein, steps: di.steps },
    { label: "Tussendoortje", title: s.title, kcal: s.kcal, protein: s.protein, steps: s.steps },
  ];

  const weights = picked.map((x) => x.kcal);
  const kcals = distributeKcalToSlots(target, weights);

  const slots = picked.map((slot, i) => {
    const baseK = slot.kcal > 0 ? slot.kcal : 1;
    const ratio = kcals[i] / baseK;
    return {
      label: slot.label,
      title: slot.title,
      steps: slot.steps,
      kcal: kcals[i],
      protein: Math.max(0, Math.round(slot.protein * ratio)),
    };
  });

  const totalKcal = slots.reduce((sum, x) => sum + x.kcal, 0);
  const totalProtein = slots.reduce((sum, x) => sum + x.protein, 0);
  return { slots, drinkTip: dr.title, totalKcal, totalProtein };
}

/**
 * Zet ruwe slot-keuzes om naar exact dagbudget (zelfde logica als doelenplan).
 * @param {Array<{label:string,title:string,kcal:number,protein:number,steps:string[],fromWeb?:boolean}>} picked
 */
export function finalizeDaySlotsFromPicks(picked, kcalPerDay) {
  const target = Math.max(100, Math.round(Number(kcalPerDay) || 0));
  const weights = picked.map((x) => x.kcal);
  const kcals = distributeKcalToSlots(target, weights);
  const slots = picked.map((slot, i) => {
    const baseK = slot.kcal > 0 ? slot.kcal : 1;
    const ratio = kcals[i] / baseK;
    const out = {
      label: slot.label,
      title: slot.title,
      steps: slot.steps,
      kcal: kcals[i],
      protein: Math.max(0, Math.round(slot.protein * ratio)),
    };
    if (slot.fromWeb) out.fromWeb = true;
    return out;
  });
  const totalKcal = slots.reduce((sum, x) => sum + x.kcal, 0);
  const totalProtein = slots.reduce((sum, x) => sum + x.protein, 0);
  return { slots, totalKcal, totalProtein };
}

/**
 * @param {"breakfast"|"lunch"|"dinner"|"snack"} poolKey
 */
export function pickNearSlot(poolKey, targetKcal, rng, options) {
  const pool =
    poolKey === "breakfast"
      ? BREAKFAST_POOL
      : poolKey === "lunch"
        ? LUNCH_POOL
        : poolKey === "dinner"
          ? DINNER_POOL
          : SNACK_POOL;
  return pickNear(pool, targetKcal, rng, options || DEFAULT_PICK_OPTS);
}

export function pickDrinkTip(rng) {
  const dr = pickNear(DRINK_POOL, 0, rng, { jitter: 24, topNMin: 2, topNMax: DRINK_POOL.length });
  return dr.title;
}

/**
 * @param {number} durationDays
 * @param {number} kcalPerDay
 * @param {() => number} rng 0..1
 */
export function buildMealPlan(durationDays, kcalPerDay, rng) {
  const days = [];
  for (let d = 1; d <= durationDays; d++) {
    const { slots, drinkTip, totalKcal, totalProtein } = buildDaySlots(kcalPerDay, rng, DEFAULT_PICK_OPTS);
    days.push({
      day: d,
      slots,
      drinkTip,
      totalKcal,
      totalProtein,
    });
  }
  return days;
}

export function makePlanRng() {
  let s;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const u = new Uint32Array(2);
    crypto.getRandomValues(u);
    const hi = u[0];
    const lo = u[1];
    s = ((hi << 16) ^ lo) >>> 0;
    if (s === 0) s = 1;
    s = (s % 2147483646) + 1;
  } else {
    s = (Date.now() + Math.floor(Math.random() * 2147483645)) % 2147483646 + 1;
  }
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const BREAKFAST_POOL = [
  {
    title: "Hüttenkäse met bessen en kaneel",
    kcal: 280,
    protein: 32,
    steps: [
      "150–200 g magere kwark of hüttenkäse in een kom.",
      "Handje blauwe bessen (vers of diepvries) en snuf kaneel erdoor.",
      "Optioneel: 1 el lijnzaad voor vezels.",
    ],
  },
  {
    title: "Eiwitrijke omelet met spinazie",
    kcal: 310,
    protein: 34,
    steps: [
      "2 eieren + 1 eiwit loskloppen met peper en zout.",
      "Handvol spinazie kort meebakken, ei erover gieten en rustig stollen.",
      "Serveer met cherrytomaatjes.",
    ],
  },
  {
    title: "Overnight oats met eiwitpoeder",
    kcal: 340,
    protein: 30,
    steps: [
      "40 g havervlokken, 200 ml magere melk of plantdrank, ½ banaan fijnprakken.",
      "Schep eiwitpoeder (aanbevolen portie volgens verpakking) erdoor.",
      "Nacht in koelkast; ochtend roeren en eventueel kaneel.",
    ],
  },
  {
    title: "Skyr met noten en appel",
    kcal: 290,
    protein: 28,
    steps: [
      "200 g magere skyr of Griekse yoghurt 0%.",
      "½ appel in blokjes, 15 g ongezouten amandelen grof gehakt.",
      "Eventueel kaneel of vanille-extract.",
    ],
  },
  {
    title: "Cottage cheese met ananas en chia",
    kcal: 265,
    protein: 30,
    steps: [
      "200 g magere cottage cheese in een kom.",
      "50 g ananasstukjes (vers of uit blik op sap), 1 el chiazaad erdoor.",
      "Laat 10 min intrekken of meteen eten.",
    ],
  },
  {
    title: "Volkorenwrap met eiwitspread en rucola",
    kcal: 320,
    protein: 28,
    steps: [
      "1 kleine volkorentortilla licht verwarmen.",
      "Magere eiwitspread of hummus light, tomatenreepjes, rucola.",
      "Op rollen en halveren.",
    ],
  },
  {
    title: "Paprika gevuld met ei en feta light",
    kcal: 300,
    protein: 26,
    steps: [
      "Halve paprika uitgehold, 2 opgeklopte eieren + beetje feta light gieten.",
      "25 min op 180 °C tot gestold; peper en bieslook.",
    ],
  },
  {
    title: "Proteïnepannenkoek met banaan",
    kcal: 335,
    protein: 32,
    steps: [
      "1 banaan prakken, 1 ei + eiwit, schep eiwitpoeder, beetje kaneel.",
      "Als dik beslag in koekenpan bakken in kleine pannenkoekjes.",
    ],
  },
  {
    title: "Rookzalm met volkorencrackers en komkommer",
    kcal: 295,
    protein: 29,
    steps: [
      "60 g gerookte zalm op 3 volkorencrackers.",
      "Komkommerschijfjes, citroen, dille; geen roomkaas of spaarzaam light.",
    ],
  },
];

const LUNCH_POOL = [
  {
    title: "Kipfilet-salade met peulvruchten",
    kcal: 420,
    protein: 45,
    steps: [
      "120 g gegrilde kipfilet in reepjes.",
      "Sla, komkommer, tomaat; ½ blikje kikkererwten afgespoeld.",
      "Dressing: citroensap + mosterd + beetje olijfolie.",
    ],
  },
  {
    title: "Tonijnkom met volkorenrijst/quinoa",
    kcal: 450,
    protein: 42,
    steps: [
      "1 blikje tonijn in water uitlekken, mengen met 150–180 g gekookte volkorenrijst of quinoa.",
      "Doperwten uit diepvries ontdooien/koken, mais, rode ui.",
      "Peper, citroen, eventueel yoghurt-mosterddressing (magere yoghurt).",
    ],
  },
  {
    title: "Tofu-roerbak met groente",
    kcal: 380,
    protein: 28,
    steps: [
      "150 g stevige tofu in blokjes, kort anbakken.",
      "Broccoli, paprika, wortel in reepjes meewokken met sojasaus (licht) en gember.",
      "Serveer zonder rijst of met 80 g gekookte bruine rijst als je budget het toelaat.",
    ],
  },
  {
    title: "Kom met linzen, feta light en rucola",
    kcal: 400,
    protein: 26,
    steps: [
      "150–200 g bruine linzen (pot, afgespoeld) verwarmd.",
      "30 g feta light verkruimeld, handje rucola, cherrytomaatjes.",
      "Balsamico + beetje olie.",
    ],
  },
  {
    title: "Griekse yoghurtkom met kip en tabouleh-stijl",
    kcal: 410,
    protein: 40,
    steps: [
      "100 g gegrilde kip in blokjes.",
      "150 g magere Griekse yoghurt 0% met knoflook, munt, peterselie, tomaat, komkommer fijn.",
      "Meng of serveer naast elkaar.",
    ],
  },
  {
    title: "Bonen-chili met mager gehakt",
    kcal: 435,
    protein: 35,
    steps: [
      "120 g mager runder- of kipgehakt aanbakken, uitgebakken vet weg.",
      "1 blik bruine bonen, passata, paprikapoeder, komijn; 20 min pruttelen.",
      "Lichte topping: 1 el magere yoghurt.",
    ],
  },
  {
    title: "Zalmsalade met peulen en aardappel",
    kcal: 395,
    protein: 34,
    steps: [
      "120 g gerookte of gepocheerde zalm in vlokken.",
      "150 g gekookte krieltjes, sperziebonen, dille, citroen, beetje crème fraîche light.",
    ],
  },
  {
    title: "Eiwitrijke soep met kip en groente",
    kcal: 360,
    protein: 32,
    steps: [
      "500 ml heldere bouillon, wortel, bleekselderij, kipreepjes koken tot gaar.",
      "Optioneel: beetje volkorenpasta of linzen voor volume.",
    ],
  },
  {
    title: "Couscoussalade met falafel uit oven",
    kcal: 445,
    protein: 22,
    steps: [
      "3 kleine ovenfalafel (of zelfgemaakt met kikkererwten, gebakken met sprayolie).",
      "80 g couscous, tomaten, komkommer, peterselie, citroen.",
    ],
  },
];

const DINNER_POOL = [
  {
    title: "Gebakken zalm met broccoli en sperziebonen",
    kcal: 480,
    protein: 40,
    steps: [
      "150 g zalmfilet met citroen, peper, in oven of koekenpan (weinig olie).",
      "200 g broccoli + sperziebonen stomen of roosteren.",
      "Geen boter; kruiden naar smaak.",
    ],
  },
  {
    title: "Mager rundvlees met courgette-noedels",
    kcal: 440,
    protein: 44,
    steps: [
      "120 g mager rundreepjes met knoflook en sojasaus (licht) roerbakken.",
      "Courgette met spiraalsnijder als ‘noedels’ kort meebakken.",
      "Garneer met sesam (klein beetje).",
    ],
  },
  {
    title: "Kipgehakt met tomatensaus en courgette",
    kcal: 420,
    protein: 38,
    steps: [
      "150 g mager kipgehakt rulbakken, uitgebakken vet weg.",
      "Passata of geharde tomatenblokjes + Italiaanse kruiden.",
      "Courgette in halve plakjes meestoven; geen pasta of beperkt 60 g volkoren.",
    ],
  },
  {
    title: "Witte vis uit de oven met venkel-tomaat",
    kcal: 360,
    protein: 36,
    steps: [
      "180 g kabeljauw of tilapia met venkelplakken en cherrytomaat in ovenschaal.",
      "Citroen, tijm, beetje olijfolie spray.",
      "Groene salade erbij.",
    ],
  },
  {
    title: "Kalkoengebraad met spruitjes en zoete aardappel",
    kcal: 455,
    protein: 42,
    steps: [
      "130 g plakjes mager kalkoengebraad uit de oven.",
      "200 g spruitjes + 120 g zoete aardappelblokjes roosteren met rozemarijn.",
    ],
  },
  {
    title: "Vegetarische linzenbolognese met courgetteslierten",
    kcal: 385,
    protein: 24,
    steps: [
      "200 g linzen in saus (zelf: ui, knoflook, wortel, passata, Italiaanse kruiden).",
      "Courgette-spiralen kort meewarmen; geen room, spaarzaam kaas.",
    ],
  },
  {
    title: "Schelvis met kappertjes en sperziebonen",
    kcal: 370,
    protein: 38,
    steps: [
      "180 g schelvis of koolvis in de pan met citroen, kappertjes, beetje witte wijn laten reduceren.",
      "150 g sperziebonen gestoomd.",
    ],
  },
  {
    title: "Gevulde portobello met spinazie en feta light",
    kcal: 340,
    protein: 22,
    steps: [
      "2 grote portobello’s, vullen met spinazie, knoflook, 40 g feta light.",
      "Oven 15–18 min; salade erbij.",
    ],
  },
  {
    title: "Thaise groene curry light met garnalen",
    kcal: 425,
    protein: 36,
    steps: [
      "150 g garnalen kort meebakken met groene currypasta (spaarzaam) en kokosmelk light.",
      "Broccoli, sugar snaps; serveer zonder rijst of 60 g gekookte basmati.",
    ],
  },
];

const SNACK_POOL = [
  {
    title: "Kwark met cacao en aardbei",
    kcal: 160,
    protein: 18,
    steps: ["150 g magere kwark", "1 tl pure cacaopoeder", "50 g aardbeien in stukjes"],
  },
  {
    title: "Rijstwafels met kalkoenvlees",
    kcal: 140,
    protein: 16,
    steps: ["2 rijstwafels", "3–4 plakjes mager kalkoenvlees", "Mosterd of dille"],
  },
  {
    title: "Hardgekookt ei + komkommer",
    kcal: 120,
    protein: 12,
    steps: ["2 eieren hard koken", "½ komkommer in stukjes", "Peper en zout"],
  },
  {
    title: "Edamame (diepvries)",
    kcal: 150,
    protein: 14,
    steps: ["150 g edamame ontdooien/koken", "Snuf zeezout", "Eventueel chilivlokken"],
  },
  {
    title: "Appel met pindakaas light",
    kcal: 155,
    protein: 8,
    steps: ["½ appel in partjes", "1 el pindakaas light als dip", "Kaneel optioneel"],
  },
  {
    title: "Roerei met kruiden (1 ei + 2 eiwitten)",
    kcal: 135,
    protein: 16,
    steps: ["1 heel ei + 2 eiwitten loskloppen", "Kort roeren op laag vuur", "Bieslook, peper"],
  },
  {
    title: "Komkommer-tomatenkom met mozzarella light",
    kcal: 145,
    protein: 12,
    steps: ["Komkommer en tomaat in blokjes", "40 g mozzarella light", "Basilicum, balsamico"],
  },
  {
    title: "Proteïnereep (check label) + koffie",
    kcal: 175,
    protein: 20,
    steps: ["Kies een reep binnen je macro’s", "Lees suiker op verpakking", "Combineer met water of koffie"],
  },
  {
    title: "Blauwe bessen met kwark",
    kcal: 125,
    protein: 14,
    steps: ["125 g magere kwark", "Handje blauwe bessen", "Optioneel vanille"],
  },
];

const DRINK_POOL = [
  {
    title: "Water, thee of zwarte koffie zonder suiker; minstens 2 l vocht verspreid over de dag.",
    kcal: 0,
    protein: 0,
    steps: [],
  },
  {
    title: "Water met schijfje citroen of munt; beperk frisdrank en sap.",
    kcal: 0,
    protein: 0,
    steps: [],
  },
  {
    title: "Groene thee of kruidenthee tussen de maaltijden door.",
    kcal: 0,
    protein: 0,
    steps: [],
  },
];
