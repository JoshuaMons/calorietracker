# Calorieteller (MVP)

Open `calorie-tracker/index.html` in de browser (liefst via een lokale server of GitHub Pages).

## Wat het doet

- **Start** (`#/home`): dag-, week- en maanddoelen + voortgang (kcal gegeten vs. doel).
- **Schema** (`#/schema`): startdatum, lengte, en **dagkiezer** (welke dag je logt). Oude link `#/schedule` opent ook Schema.
- **Tips & recepten** (`#/suggestions`): suggesties voor tussendoortjes/drank (standaard + eigen producten) + vaste gezonde receptideeën (wereldwijd + kip, vis, rund).
- **Voedingsdatabase** (`#/library`): producten zoeken en loggen. Bij opstart wordt alleen een **compacte NL-set** (`data/nl-foods-core.json`) geladen; de **volledige lijst** (`data/nl-foods.json`) wordt opgehaald zodra je **2 of meer tekens** in het zoekveld typt.
- **Dagboek** (`#/log`): overzicht van de gekozen dag.
- **Macro's & statistiek** (`#/stats`): macroverdeling + laatste 7 dagen kcal vs. doel.
- **Gegevens** (`#/settings`): export / import (JSON), dag wissen.
- Interface is **Nederlands**; productnamen komen uit Open Food Facts (veelal NL/EU).

## Afbeeldingen

- Geen willekeurige stockfoto-URL’s meer: miniaturen worden **lazy** via de **Openverse**-API gezocht op productnaam/categorie (met beperkt parallelle requests).

## Dataset bouwen

Zie `scripts/build_nl_foods_dataset.py` — schrijft `nl-foods.json`, `nl-foods.json.gz` en **`nl-foods-core.json`** (eerste ~150 items voor snelle start).

## Legacy-URL

`#/schedule` opent de pagina **Schema** (dagkiezer).
