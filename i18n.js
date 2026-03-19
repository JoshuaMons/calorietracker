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
    library: "Voeding & dagtotaal",
    customFood: "Eigen product",
  },

  tabsAria: "Hoofdonderdelen",

  home: {
    goalsTitle: "Doelen",
    goalsSave: "Doelen opslaan",
    goalsIntro:
      "Stel je dag- en weekdoelen in en kies welk doel het maaltijdschema volgt. Na opslag ga je automatisch naar Schema voor je stappenplan. Je logdag staat rechts bij Voortgang.",
    dayGoalField: "Dagdoel (kcal)",
    weekGoalField: "Weekdoel (kcal)",
    dayGoalHint: "Per gekozen dag (o.a. suggesties en dagtotaal).",
    weekGoalHint: "Kalenderweek (ma–zo) rond de gekozen dag.",
    progressTitle: "Voortgang",
    selectedDaySchema: "Geselecteerde logdag",
    tierDay: "Dagdoel",
    tierWeek: "Weekdoel",
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
    openSuggestionsHint: "voor tussendoortjes en gezonde receptideeën.",
    goalsSchemaLegend: "Schema & planlengte",
    planBasisLabel: "Schema op basis van",
    planBasisDaily: "Dagdoel (kcal/dag)",
    planBasisWeekly: "Weekdoel ÷ 7",
    planBasisHint: "Het maaltijdschema gebruikt deze kcal per dag (tab Doelenplan op Schema).",
    planSchemaCompactHint:
      "Kies dag- of weekdoel als bron voor het schema en hoeveel dagen je stappenplan duurt (1–7). Na opslaan zie je het op Schema onder Doelenplan.",
    planDaysLabel: "Lengte doelenplan (dagen)",
    planDaysLabelShort: "Dagen schema",
    planDaysHint: "Aantal dagen voor je stappenplan op Schema (1–7). Pas je doelen of lengte aan en sla opnieuw op om te wijzigen.",
    linkVoeding: "Voeding & dagtotaal →",
    logDayTitle: "Logdag",
    logDayHint: "Welke dag je invult in dagboek en database.",
    logToday: "Vandaag",
  },

  schemaPage: {
    title: "Maaltijdschema",
    intro:
      "Genereer een willekeurig stappenplan (hoog eiwit, beperkte kcal) dat aansluit op je gekozen doelbron op Start.",
    logDayNote: "Je logdag stel je in op Start — die dag wordt gebruikt voor dagtotaal en suggesties.",
    subTabGoalPlan: "Doelenplan",
    subTabFreePlan: "Vrij schema",
    subTabStatus: "Huidige stand",
    goalPlanDaysNote: (n) =>
      `Je doelenplan is ${n} ${n === 1 ? "dag" : "dagen"} — stel de lengte in op Start.`,
    resetPlanBtn: "Plan wissen",
    otherGoalBtn: "Ander doel kiezen",
    resetPlanHint:
      "Plan wissen verwijdert alleen het gegenereerde schema; je doelen blijven staan. Ga naar Start om je doelen aan te passen.",
    statusTitle: "Huidige stand",
    statusIntro: "Zelfde voortgang als op Start: dag- en weekdoel voor je gekozen logdag (zonder maanddoel).",
    linkHome: "Start →",
    linkLibrary: "Voeding & dagtotaal →",
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
    shuffleHint:
      "Suggesties komen uit een willekeurige mix van opties die binnen je ruimte passen — elke verversing of wijziging in je log kan een andere volgorde tonen.",
    recipesShuffleHint: "Recepten staan in willekeurige volgorde.",
    snacksTitle: "Suggesties (tussendoortjes / drankjes)",
    snacksNote:
      "Miniatuurafbeeldingen komen uit Openverse (CC) of anders Wikipedia; ze sluiten zo goed mogelijk aan op je zoekterm.",
    recipesTitle: "Gezonde recepten (wereldwijd + vlees / vis / rund)",
    recipesIntro:
      "Kcal en eiwit per portie zijn afgeronde schattingen op basis van de vermelde hoeveelheden (NEVO-achtige waarden). Log in je dagboek altijd je eigen product.",
  },

  recipes: [
    {
      tag: "Wereldwijd gezond #1",
      title: "Mediterraanse schotel (vezel & olijfolie)",
      body:
        "Veel groente, peulvruchten of volkoren, magere eiwitbron (vis of kip), extra vierge olijfolie en kruiden. Richtlijn WHO/Mediterraan: weinig ultra-bewerkt, veel plantaardig.",
      servingLabel: "1 bord (ca. 470 g)",
      caloriesPerServing: 505,
      proteinGrams: 39,
      ingredients: [
        "95 g kipfilet rauw (gegrild; of ~100 g kabeljauw / tilapia)",
        "85 g gekookte kikkererwten (uit blik, afgespoeld)",
        "200 g gegrilde groente (paprika, courgette, aubergine)",
        "52 g gekookte volkorencouscous of quinoa",
        "~11 g extra vierge olijfolie (2/3 el, dressing / bakken)",
        "Citroensap, knoflook, oregano, basilicum, peper en zout",
      ],
    },
    {
      tag: "Wereldwijd gezond #2",
      title: "Japanse ‘ichiju sansai’-stijl (soep + drie bijgerechten)",
      body:
        "Een kom misosoep, rijst, vis of tofu en twee groentegangen — beperk zout en suiker; veel umami uit dashi en groente (traditioneel patroon met lange levensverwachting).",
      servingLabel: "1 menu (1 persoon, ca. 600 g)",
      caloriesPerServing: 530,
      proteinGrams: 32,
      ingredients: [
        "250 ml misosoep (miso + dashi, matig zout; ~45 kcal)",
        "160 g gekookte sushirijst of bruine rijst",
        "100 g gebakken zalm of stevige tofu in blokjes",
        "120 g gestoomde broccoli",
        "70 g wortel-kinpira of komkommer-salade",
        "Sojasaus (licht), gember, sesamzaad (optioneel; spaarzaam)",
      ],
    },
    {
      tag: "Vlees (gevogelte)",
      title: "Gegrilde kipfilet met geroosterde groente",
      body:
        "Marineer kip in citroen/knoflook, grill tot gaar; serveer met paprika, courgette en quinoa. Mager eiwit + veel vezels.",
      servingLabel: "1 portie (ca. 490 g)",
      caloriesPerServing: 495,
      proteinGrams: 41,
      ingredients: [
        "125 g kipfilet rauw (gegrild)",
        "~13 g olijfolie (marinade + geroosterde groente; scheut minder dan 1 el)",
        "Citroen, 2 teentjes knoflook, paprikapoeder",
        "225 g geroosterde paprika en courgette",
        "92 g gekookte quinoa",
        "Peper, zout, verse peterselie",
      ],
    },
    {
      tag: "Vis",
      title: "Gebakken zalm met citroen en groene groente",
      body:
        "Zalm in de oven met citroen, dille en broccoli/sperziebonen. Rijk aan omega-3; weinig toegevoegd vet (geen boter).",
      servingLabel: "1 portie (ca. 430 g)",
      caloriesPerServing: 475,
      proteinGrams: 33,
      ingredients: [
        "135 g zalmfilet rauw (in de oven gebakken)",
        "½ citroen (schijfjes + sap)",
        "280 g broccoli en sperziebonen (gestoomd of uit de oven)",
        "~12 g olijfolie of spray (totaal; verdeeld over vis en groente)",
        "Dille, peper, zout",
        "Optioneel: 1 el kappertjes (+ca. 5 kcal; niet meegeteld in totaal hierboven)",
      ],
    },
    {
      tag: "Rundvlees",
      title: "Mager rundvlees-roerbak met broccoli en peulen",
      body:
        "Reepjes mager rund, wok met broccoli, peultjes en gember-sojasaus (licht). Serveer met bruine rijst voor langzame koolhydraten.",
      servingLabel: "1 portie (ca. 520 g)",
      caloriesPerServing: 505,
      proteinGrams: 35,
      ingredients: [
        "95 g mager rundvlees in reepjes (rauw; na wokken)",
        "200 g broccoli-rozen",
        "100 g peultjes",
        "2 el lichte sojasaus (~20 kcal)",
        "1 tl sesamolie, gember, knoflook",
        "100 g gekookte bruine rijst",
        "Lente-ui ter garnering",
      ],
    },
  ],

  recipeModal: {
    aria: "Receptdetails",
    close: "Sluiten",
    kcal: "kcal per portie (schatting)",
    protein: "eiwit (schatting)",
    serving: "Portie",
    ingredientsTitle: "Ingrediënten",
    hint: "Kcal en eiwit zijn afgerond op basis van de lijst hierboven; exacte waarden hangen van merk en bereiding af. Log je echte producten in de database.",
    clickHint: "Klik op een recept voor ingrediënten en calorieën.",
  },

  freePlan: {
    title: "Vrij schema (los van je doelen)",
    intro:
      "Genereer een apart stappenplan met eigen kcal per dag en lengte. Dit plan staat los van je doelen op Start en verandert je Doelenplan-tab niet. Er worden willekeurig recepten gemixt: uit de app én (als het lukt) van TheMealDB op internet.",
    webNote:
      "Internet-recepten: titels en stappen komen van TheMealDB (Engels mogelijk). Kcal/eiwit zijn grove schattingen per categorie; check altijd je porties.",
    kcalLabel: "Kcal per dag (vrij)",
    durationLabel: "Aantal dagen",
    generateBtn: "Vrij schema genereren",
    resetBtn: "Vrij plan wissen",
    generateHint:
      "Elke run haalt opnieuw willekeurige maaltijden binnen — ook van het web als de verbinding het toelaat. Klik op een maaltijd voor ingrediënten.",
    generating: "Bezig met genereren… even geduld.",
    targetLine: (kcal, days) => `Doel voor dit plan: ${kcal} kcal/dag · ${days} ${days === 1 ? "dag" : "dagen"}.`,
    empty: "Kies kcal en dagen en klik op genereren.",
    fromWebTag: "online",
  },

  schemaPlan: {
    title: "Maaltijdschema (hoog eiwit, beperkt kcal)",
    intro:
      "Dit schema sluit aan op je dag- of weekdoel van Start. De planlengte stel je op Start in (1–7 dagen). Bij genereren worden ook willekeurige recepten van het internet gemixt (TheMealDB), net als bij het vrije schema. Online maaltijden: tik erop voor ingrediënten — die worden naar het Nederlands vertaald (automatisch).",
    targetLine: (kcal, basis) =>
      `Rekening gehouden met ca. ${kcal} kcal per dag (bron: ${basis}).`,
    basisDaily: "dagdoel",
    basisWeekly: "weekdoel ÷ 7",
    durationLabel: "Duur van het plan",
    duration1: "1 dag",
    duration3: "3 dagen",
    duration7: "7 dagen",
    duration14: "14 dagen",
    generateBtn: "Nieuw plan genereren",
    generating: "Bezig met genereren… ook internet-recepten (TheMealDB) worden toegevoegd waar mogelijk.",
    generateHint:
      "Elke klik kiest opnieuw willekeurig uit de beste passende maaltijden — ook van het web — en verdeelt ze op je dagbudget. Tik of klik op een maaltijd: ingrediënten en bereiding, met vertaling naar het Nederlands voor online recepten.",
    mealSlotClickHint: "Klik voor ingrediënten",
    mealSlotModalAria: "Maaltijd uit schema",
    mealSlotIngredientsTitle: "Ingrediënten",
    mealSlotPrepTitle: "Bereiding",
    mealSlotNoIngredients: "Geen aparte ingrediëntenlijst — zie bereiding.",
    mealSlotFootnote:
      "Hoeveelheden zijn indicatief; je dagtotaal in het plan is wel exact op je kcal-doel afgestemd. Log echte producten in je dagboek.",
    translatingHint: "Bezig met vertalen naar het Nederlands…",
    translationNote:
      "Automatische vertaling (MyMemory). Controleer bij twijfel de bedoeling van het recept; de brontekst kan Engels zijn.",
    translationFailed: "Vertaling is niet gelukt; je ziet de originele tekst.",
    dayTitle: (n) => `Dag ${n}`,
    dayTotals: (kcal, p) => `Totaal: ${kcal} kcal (gelijk aan je dagbudget) · ~${p} g eiwit (schatting)`,
    drinkLine: "Drank",
    stepsTitle: "Stappen",
    empty: "Klik op de knop om een plan te maken.",
  },

  customFoodPage: {
    title: "Eigen product toevoegen",
    intro:
      "Voeg iets toe dat nog niet in de database staat. Na opslag ga je terug naar Voeding & dagtotaal om het te loggen.",
    formNote: "Handmatige invoer; er wordt niet automatisch het hele internet ingeladen.",
    backToLibrary: "← Terug naar Voeding & dagtotaal",
    addHint: "Eigen product toevoegen →",
    addHintLead: "Staat je product er niet tussen?",
  },

  library: {
    pageTitle: "Voeding & dagtotaal",
    mergedIntro:
      "Zoek producten en vink af wat je at; de dagtotaal-balk blijft zichtbaar tijdens scrollen. Er is een extra set veelvoorkomende Nederlandse supermarkt-producten (indicatieve kcal); bij zoeken laadt ook de grote Open Food Facts-lijst. Kcal vaak per 100 g.",
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
    selectedTotal: (c) => `Totaal: ${c} kcal`,
  },

  log: {
    title: "Dagtotaal",
    intro: (d) => `Alles wat je voor ${d} hebt gelogd (zelfde dag als op Start).`,
    empty: "Nog niets gelogd voor deze dag.",
    dayTotalLine: (c, goal, rem) => {
      const cR = Math.round(c);
      const gR = Math.round(goal);
      const rR = Math.round(rem);
      if (!(gR > 0)) return `Dagtotaal: ${cR} kcal`;
      if (rR >= 0) return `Dagtotaal: ${cR} kcal · Doel: ${gR} kcal · Nog: ${rR} kcal`;
      return `Dagtotaal: ${cR} kcal · Doel: ${gR} kcal · ${Math.abs(rR)} kcal boven doel`;
    },
  },

  stats: {
    protein: "Eiwit",
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

  categories: {
    Meal: "Maaltijd",
    Snack: "Tussendoortje",
    Drink: "Drank",
    Ingredient: "Ingrediënt",
  },
};
