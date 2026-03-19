# Calorieteller (MVP)

Open `calorie-tracker/index.html` in de browser (liefst via een lokale server of GitHub Pages).

## Wat het doet

- **Start** (`#/home`): dag- en weekdoelen, **compact**: schema-bron (dag vs. week ÷ 7) en **planlengte 1–7 dagen** in één blok, plus logdag/voortgang. Na **Doelen opslaan** ga je naar Schema.
- **Schema** (`#/schema`): tab **Doelenplan** (schema op basis van je doelen), tab **Vrij schema** (eigen kcal/dag, mix lokaal + TheMealDB), tab **Huidige stand**. Oude link `#/schedule` opent ook Schema.
- **Tips & recepten** (`#/suggestions`): suggesties voor tussendoortjes/drank (standaard + eigen producten) + vaste gezonde receptideeën (wereldwijd + kip, vis, rund).
- **Voeding & dagtotaal** (`#/library`): producten zoeken en loggen **en** het overzicht van de gekozen logdag op één pagina. Bij opstart: **compacte NL-set** (`data/nl-foods-core.json`) plus **Nederlandse supermarkt-basis** (`data/nl-supermarkt-staples.json`, ~220 items met indicatieve kcal). De **volledige lijst** (`data/nl-foods.json`) laadt zodra je **2 of meer tekens** typt. Supermarkt-set opnieuw genereren: `node scripts/gen_nl_supermarkt_staples.mjs`.
- **Eigen product** (`#/custom-food`): handmatig een product toevoegen.
- Oude links `#/log` gaan naar **Voeding & dagtotaal**; `#/stats` en `#/settings` worden naar Start omgeleid.
- Interface is **Nederlands**; productnamen komen uit Open Food Facts (veelal NL/EU).

## Afbeeldingen

- Geen willekeurige stockfoto-URL’s meer: miniaturen worden **lazy** via de **Openverse**-API gezocht op productnaam/categorie (met beperkt parallelle requests).

## Dataset bouwen

Zie `scripts/build_nl_foods_dataset.py` — schrijft `nl-foods.json`, `nl-foods.json.gz` en **`nl-foods-core.json`** (eerste ~150 items voor snelle start).

## Legacy-URL’s

- `#/schedule` opent **Schema**.
- `#/log` opent **Voeding & dagtotaal** (`#/library`).
