/** Nederlandse UI-teksten (statische copy + recepten) */
export const ui = {
  brandKicker: "Train · Brandstof · Herhaal",
  brandTitle: "Calorieteller",
  brandTagline: "Bereik je dagelijkse energiedoel met een duidelijk schema en praktische tips.",
  brandBadge: "Blijf op koers",

  tabs: {
    home: "Start",
    schema: "Schema",
    suggestions: "Tips & recepten",
    library: "Voedingsdatabase",
    log: "Dagboek",
    stats: "Macro's & statistiek",
    data: "Gegevens",
  },

  tabsAria: "Hoofdonderdelen",

  home: {
    goalsTitle: "Doelen",
    goalsSave: "Doelen opslaan",
    dayGoalField: "Dagdoel (kcal)",
    weekGoalField: "Weekdoel (kcal)",
    monthGoalField: "Maanddoel (kcal)",
    dayGoalHint: "Per gekozen dag (o.a. suggesties en dagboek).",
    weekGoalHint: "Kalenderweek (ma–zo) rond de gekozen dag.",
    monthGoalHint: "Hele kalendermaand van de gekozen dag.",
    progressTitle: "Voortgang",
    selectedDaySchema: "Geselecteerde logdag",
    tierDay: "Dagdoel",
    tierWeek: "Weekdoel",
    tierMonth: "Maanddoel",
    remainingToday: "kcal resterend vandaag",
    ringDayPct: "Dag (%)",
    schemaLink: "Schema →",
    pickDay: "Kies een dag",
    daysCount: (n) => `${n} dagen`,
    goalPill: (g) => `Doel: ${g} kcal`,
    progress: "Voortgang",
    eaten: "kcal gegeten",
    remaining: "kcal resterend",
    openSuggestions: "Open tips & recepten →",
    openSuggestionsHint: "voor tussendoortjes, gezonde receptideeën en macro’s op de juiste pagina.",
    planBasisLabel: "Schema op basis van",
    planBasisDaily: "Dagdoel (kcal/dag)",
    planBasisWeekly: "Weekdoel ÷ 7",
    planBasisMonthly: "Maanddoel ÷ 30",
    planBasisHint: "Het maaltijdschema op de pagina Schema gebruikt deze kcal per dag.",
    logDayTitle: "Logdag",
    logDayHint: "Welke dag je invult in dagboek en database.",
    logToday: "Vandaag",
  },

  schemaPage: {
    title: "Maaltijdschema",
    intro:
      "Genereer een willekeurig stappenplan (hoog eiwit, beperkte kcal) dat aansluit op je gekozen doelbron op Start.",
    logDayNote: "Je logdag stel je in op Start — die dag wordt gebruikt voor dagboek, suggesties en macro’s.",
  },

  summaryLines: {
    emptyGoal: "",
    overGoal: (n) => `Je zit ongeveer ${n} kcal boven je doel voor vandaag — morgen bijsturen of meer bewegen.`,
    hitGoal: "Je hebt je calorie-doel voor deze dag gehaal. Goed bezig.",
    nothingLogged: (r, day) => `Nog niets gelogd — ${r} kcal over om in te vullen voor ${day}.`,
    normal: (c, r, g) => `${c} kcal gelogd · ${r} kcal beschikbaar richting je ${g} kcal-doel.`,
  },

  suggestionsPage: {
    title: "Tips & recepten",
    intro:
      "Tussendoortjes en drankjes op basis van je resterende kcal (alleen standaard- en eigen items). Daarnaast: wereldwijd gezonde receptideeën met vlees, vis en rund.",
    dayHint: (d) => `Gebruikt de dag die je op Start hebt gekozen: ${d}.`,
    snacksTitle: "Suggesties (tussendoortjes / drankjes)",
    snacksNote:
      "Miniatuurafbeeldingen komen uit Openverse (CC-media) en sluiten zo goed mogelijk aan op je zoekterm.",
    recipesTitle: "Gezonde recepten (wereldwijd + vlees / vis / rund)",
    recipesIntro:
      "Twee bekende gezonde stijlen wereldwijd, plus eenvoudige receptideeën voor gevogelte, vis en mager rund. Gebruik ze als inspiratie; kcal log je zelf in de database.",
  },

  recipes: [
    {
      tag: "Wereldwijd gezond #1",
      title: "Mediterraanse schotel (vezel & olijfolie)",
      body:
        "Veel groente, peulvruchten of volkoren, magere eiwitbron (vis of kip), extra vierge olijfolie en kruiden. Richtlijn WHO/Mediterraan: weinig ultra-bewerkt, veel plantaardig.",
      servingLabel: "1 bord (ca. 450 g)",
      caloriesPerServing: 520,
      proteinGrams: 36,
      ingredients: [
        "150 g gegrilde kipfilet of witte vis",
        "150 g gekookte kikkererwten",
        "200 g gegrilde groente (paprika, courgette, aubergine)",
        "80 g volkorencouscous of quinoa",
        "1,5 el extra vierge olijfolie",
        "Citroensap, knoflook, oregano, basilicum, peper en zout",
      ],
    },
    {
      tag: "Wereldwijd gezond #2",
      title: "Japanse ‘ichiju sansai’-stijl (soep + drie bijgerechten)",
      body:
        "Een kom misosoep, rijst, vis of tofu en twee groentegangen — beperk zout en suiker; veel umami uit dashi en groente (traditioneel patroon met lange levensverwachting).",
      servingLabel: "1 menu (1 persoon)",
      caloriesPerServing: 580,
      proteinGrams: 38,
      ingredients: [
        "250 ml misosoep (miso + dashi, matig zout)",
        "150 g gekookte sushirijst of bruine rijst",
        "100 g gebakken zalm of tofu in blokjes",
        "100 g gestoomde broccoli",
        "80 g wortel-kinpira of komkommer-salade",
        "Sojasaus (licht), gember, sesamzaad (optioneel)",
      ],
    },
    {
      tag: "Vlees (gevogelte)",
      title: "Gegrilde kipfilet met geroosterde groente",
      body:
        "Marineer kip in citroen/knoflook, grill tot gaar; serveer met paprika, courgette en quinoa of aardappel. Mager eiwit + veel vezels.",
      servingLabel: "1 portie",
      caloriesPerServing: 485,
      proteinGrams: 48,
      ingredients: [
        "180 g kipfilet",
        "1 el olijfolie (marinade + bakken)",
        "Citroen, 2 teentjes knoflook, paprikapoeder",
        "200 g geroosterde paprika en courgette",
        "120 g gekookte quinoa of 150 g gekookte aardappel",
        "Peper, zout, verse peterselie",
      ],
    },
    {
      tag: "Vis",
      title: "Gebakken zalm met citroen en groene groente",
      body:
        "Zalm in de oven met citroen, dille en broccoli/sperziebonen. Rijk aan omega-3; let op portie en bereiding (weinig boter).",
      servingLabel: "1 portie",
      caloriesPerServing: 495,
      proteinGrams: 40,
      ingredients: [
        "150 g zalmfilet",
        "½ citroen (schijfjes + sap)",
        "250 g broccoli en sperziebonen (gestoomd of uit de oven)",
        "1 tl olijfolie of olijfoliespray",
        "Dille, peper, zout",
        "Optioneel: 1 el kappertjes",
      ],
    },
    {
      tag: "Rundvlees",
      title: "Mager rundvlees-roerbak met broccoli en peulen",
      body:
        "Reepjes mager rund, wok met broccoli, peultjes en gember-sojasaus (licht). Serveer met bruine rijst voor langzame koolhydraten.",
      servingLabel: "1 portie",
      caloriesPerServing: 510,
      proteinGrams: 42,
      ingredients: [
        "140 g mager rundvlees in reepjes",
        "200 g broccoli-rozen",
        "100 g peultjes",
        "2 el lichte sojasaus",
        "1 tl sesamolie, gember, knoflook",
        "120 g gekookte bruine rijst",
        "Lente-ui ter garnering",
      ],
    },
  ],

  recipeModal: {
    aria: "Receptdetails",
    close: "Sluiten",
    kcal: "kcal per portie",
    protein: "eiwit",
    serving: "Portie",
    ingredientsTitle: "Ingrediënten",
    hint: "Waarden zijn schattingen; log concrete producten in de voedingsdatabase.",
    clickHint: "Klik op een recept voor ingrediënten en calorieën.",
  },

  schemaPlan: {
    title: "Maaltijdschema (hoog eiwit, beperkt kcal)",
    intro:
      "Dit schema sluit aan op je doelen van Start. Kies hoeveel dagen je wilt plannen en genereer een geshud stappenplan. Drink vooral water/thee; beperk suiker en alcohol.",
    targetLine: (kcal, basis) =>
      `Rekening gehouden met ca. ${kcal} kcal per dag (bron: ${basis}).`,
    basisDaily: "dagdoel",
    basisWeekly: "weekdoel ÷ 7",
    basisMonthly: "maanddoel ÷ 30",
    durationLabel: "Duur van het plan",
    duration1: "1 dag",
    duration3: "3 dagen",
    duration7: "7 dagen",
    duration14: "14 dagen",
    generateBtn: "Nieuw plan genereren",
    generateHint:
      "Elke klik kiest opnieuw willekeurig uit de beste passende maaltijden — je plan wordt dus elke keer anders.",
    dayTitle: (n) => `Dag ${n}`,
    dayTotals: (kcal, p) => `Totaal schatting: ~${kcal} kcal · ~${p} g eiwit`,
    drinkLine: "Drank",
    stepsTitle: "Stappen",
    empty: "Klik op de knop om een plan te maken.",
  },

  library: {
    title: "Voedingsdatabase",
    intro:
      "Vink af wat je at. Bij start laden we een compacte NL-set; tijdens zoeken wordt de volledige lijst opgehaald. Kcal vaak per 100 g.",
    searchPlaceholder: "Zoek (bijv. kip, yoghurt, frisdrank)",
    catAll: "Alle categorieën",
    catMeal: "Maaltijden",
    catSnack: "Tussendoortjes",
    catDrink: "Dranken",
    catIngredient: "Ingrediënten",
    loadingCore: "Basisdatabase laden…",
    loadingFull: "Volledige database wordt geladen…",
    noMatch: "Geen producten gevonden.",
    selectedTitle: "Geselecteerd vandaag",
    addCustomTitle: "Eigen product toevoegen",
    name: "Naam",
    category: "Categorie",
    kcalPerServing: "Kcal per portie",
    servingLabel: "Portie-omschrijving",
    servingPh: "bijv. 1 reep (40 g)",
    imageKeywords: "Afbeelding-zoekwoorden (optioneel)",
    imageKeywordsPh: "bijv. mueslireep, chocolade",
    ingredients: "Ingrediënten (optioneel)",
    ingredientsPh: "Komma-gescheiden (bijv. haver, honing, cacao)",
    protein: "Eiwit (g) per portie (optioneel)",
    carbs: "Koolhydraten (g) per portie (optioneel)",
    fat: "Vet (g) per portie (optioneel)",
    addBtn: "Toevoegen aan database",
    addNote:
      "Je kunt alles handmatig toevoegen wat je eet. Er is geen live-scrape van het hele internet.",
  },

  log: {
    title: "Dagboek",
    intro: "Alles wat je voor de gekozen dag hebt aangevinkt.",
    empty: "Nog niets gelogd voor deze dag.",
  },

  stats: {
    title: "Macro's & statistiek",
    intro: "Macro’s voor de geselecteerde dag en je calorieën van de laatste 7 dagen (t.o.v. je doel).",
    macrosTitle: "Macroverdeling",
    macrosNote: "Macro’s komen uit Open Food Facts / je eigen invoer waar beschikbaar.",
    macrosEmpty: "Nog geen macrogegevens voor gelogde producten. Voeg waarden toe of kies producten met nutriënten.",
    weekTitle: "Laatste 7 dagen (kcal)",
    weekGoal: (g) => `Doel per dag: ${g} kcal`,
    protein: "Eiwit",
    carbs: "Koolhydraten",
    fat: "Vet",
  },

  data: {
    title: "Gegevens",
    intro: "Exporteren, importeren of het logboek van de gekozen dag wissen.",
    export: "Exporteren",
    import: "Importeren",
    resetDay: "Dag wissen",
    resetTitle: "Wist alleen logs (schema en doelen blijven).",
    tip: "Tip: export is je back-up. Import overschrijft de huidige app-gegevens.",
  },

  modal: {
    ariaFood: "Productdetails",
    close: "Sluiten",
    calories: "Calorieën",
    kcalPerServing: "kcal per portie",
    serving: "Portie",
    ingredients: "Ingrediënten",
    toggle: "Toevoegen / verwijderen",
    toggleQty: (n) => `Verwijderen (nu ${n})`,
    tipQty: "Tip: gebruik de hoeveelheid op de kaart voor meerdere porties.",
  },

  importModal: {
    aria: "Gegevens importeren",
    title: "Exporteren / importeren",
    paste: "Plak JSON",
    importBtn: "Importeren",
    note: "Import overschrijft je huidige app-status.",
    close: "Sluiten",
  },

  common: {
    remove: "Verwijderen",
    log: "Logboek",
    add: "Toevoegen",
    qtyMinus: "Minder",
    qtyPlus: "Meer",
    gramsLabel: "Gram per portie",
    gramsAbbr: "Gram portie",
    qtyLabel: "Aantal",
    eachGrams: (g) => `${g} g per stuk`,
  },

  suggestions: {
    goalMet: "Goed zo — je doel voor deze dag is gehaald.",
    none: "Geen suggesties. Voeg een eigen tussendoortje of drank toe.",
    add: "Loggen",
  },

  alerts: {
    importFailed: (m) => `Importeren mislukt: ${m}`,
    resetConfirm: "Alle gelogde producten voor deze dag wissen?",
  },

  categories: {
    Meal: "Maaltijd",
    Snack: "Tussendoortje",
    Drink: "Drank",
    Ingredient: "Ingrediënt",
  },
};
