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

function pickNear(pool, targetKcal, rng) {
  const shuffled = shuffle(pool, rng);
  let best = shuffled[0];
  let bestScore = Infinity;
  for (const m of shuffled) {
    const diff = Math.abs(m.kcal - targetKcal);
    const proteinBias = -m.protein * 2;
    const score = diff + proteinBias;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/**
 * @param {number} durationDays
 * @param {number} kcalPerDay
 * @param {() => number} rng 0..1
 */
export function buildMealPlan(durationDays, kcalPerDay, rng) {
  const days = [];
  for (let d = 1; d <= durationDays; d++) {
    const slots = [];
    const b = pickNear(BREAKFAST_POOL, kcalPerDay * SLOT_FRACS.breakfast, rng);
    const l = pickNear(LUNCH_POOL, kcalPerDay * SLOT_FRACS.lunch, rng);
    const di = pickNear(DINNER_POOL, kcalPerDay * SLOT_FRACS.dinner, rng);
    const s = pickNear(SNACK_POOL, kcalPerDay * SLOT_FRACS.snack, rng);
    const dr = pickNear(DRINK_POOL, 0, rng);
    slots.push(
      { label: "Ontbijt", ...b },
      { label: "Lunch", ...l },
      { label: "Diner", ...di },
      { label: "Tussendoortje", ...s },
    );
    const totalKcal = slots.reduce((sum, x) => sum + x.kcal, 0);
    const totalP = slots.reduce((sum, x) => sum + x.protein, 0);
    days.push({
      day: d,
      slots,
      drinkTip: dr.title,
      totalKcal,
      totalProtein: totalP,
    });
  }
  return days;
}

export function makePlanRng() {
  let s = (Date.now() % 2147483646) + 1;
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
