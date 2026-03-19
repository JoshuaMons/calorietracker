# Calorie Tracker (MVP)

Open `calorie-tracker/index.html` in your browser.

Features:
- **Home** (`#/home`): schedule, goals, day picker, and a compact daily summary.
- **Suggestions** (`#/suggestions`): snack/drink ideas (thumbnails via [Openverse](https://openverse.org/)), sample meal plan, and macro breakdown.
- Pick a day and log foods/drinks using checkboxes + quantity (Food Library / Log).
- Totals update instantly (eaten, remaining).
- Legacy URL `#/schedule` still opens Home.
- All inputs persist in `localStorage`.
- Export / Import app state (JSON) and reset logs for the selected day.

Food database note:
- This MVP ships with a starter set of common foods (with picture keywords).
- Searching pulls products (name, calories, ingredients, and a picture) from Open Food Facts.
- Calories from Open Food Facts are shown as “per 100g”, and quantity multiplies that value.
- You can add your own foods (name, category, calories per serving, serving label, optional ingredients + picture keywords).


