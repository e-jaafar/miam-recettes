import { readFile, rename, writeFile } from 'node:fs/promises';
import { Effect, Schema } from 'effect';
import { convertQuantity, multipleUnits } from '../www/ingredient-units.ts';
import { localRecipes } from '../www/local-recipes.ts';
import ingredientAliases from '../www/ingredient-aliases.json' with { type: 'json' };
import { normalizeIngredientName } from '../www/ingredient-name.ts';

const resource = 'https://www.data.gouv.fr/api/1/datasets/r/ab49172a-a234-43ac-accd-a4f89736dcc5';
const nullableText = Schema.NullOr(Schema.String);
const sourceSchema = Schema.Array(Schema.Struct({
  recipe_id: Schema.String,
  title: Schema.String,
  url: Schema.String,
  chef: nullableText,
  intro: nullableText,
  servings: Schema.NullOr(Schema.Number),
  category: Schema.Struct({ slug: Schema.String }),
  duration: Schema.Struct({ minutes: Schema.NullOr(Schema.Number) }),
  ingredients: Schema.Array(Schema.Struct({ ingredient: Schema.String, quantity: nullableText, raw: Schema.String, section: nullableText })),
  steps: Schema.Array(Schema.Struct({ text: Schema.String, section: nullableText }))
}));

const normalize = text => text.toLocaleLowerCase('fr').normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replaceAll('œ', 'oe').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const aliases = new Map(Object.entries({
  oeufs: 'Œuf', oignons: 'Oignon', carottes: 'Carotte', citrons: 'Citron',
  courgettes: 'Courgette', tomates: 'Tomate', 'pommes de terre': 'Pomme de terre',
  bananes: 'Banane', pommes: 'Pomme', 'farine de ble': 'Farine', 'sucre en poudre': 'Sucre',
  'lait entier': 'Lait', 'lait demi-ecreme': 'Lait', 'huile olive': 'Huile d’olive'
}));
for (const [name, variants] of Object.entries(ingredientAliases)) {
  for (const variant of [name, ...Object.keys(variants)]) {
    const key = normalizeIngredientName(variant);
    const previous = aliases.get(key);
    if (previous && previous !== name) throw new Error(`Alias ambigu : ${variant} (${previous} / ${name})`);
    aliases.set(key, name);
  }
}
const nameIndex = new Map(localRecipes.flatMap(recipe => recipe.ingredients.map(([, , name]) => [normalizeIngredientName(name), name])));
const unitsByName = new Map(localRecipes.flatMap(recipe => recipe.ingredients.map(([, unit, name]) => [name, unit])));
for (const [name, units] of multipleUnits) unitsByName.set(name, units[0]);
const output = new URL('../www/metro-recipes.json', import.meta.url);
const fractions = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' };
const unitFactors = new Map([
  ['', ['', 1]], ['piece', ['', 1]], ['pieces', ['', 1]], ['unite', ['', 1]], ['unites', ['', 1]],
  ['g', ['g', 1]], ['gr', ['g', 1]], ['grammes', ['g', 1]], ['kg', ['g', 1000]],
  ['mg', ['g', 0.001]], ['ml', ['ml', 1]], ['cl', ['ml', 10]], ['dl', ['ml', 100]], ['l', ['ml', 1000]],
  ['litre', ['ml', 1000]], ['litres', ['ml', 1000]],
  ['cas', ['c. à soupe', 1]], ['c a s', ['c. à soupe', 1]], ['c a soupe', ['c. à soupe', 1]],
  ['cuil a soupe', ['c. à soupe', 1]], ['cuillere a soupe', ['c. à soupe', 1]], ['cuilleres a soupe', ['c. à soupe', 1]],
  ['cac', ['c. à café', 1]], ['c a c', ['c. à café', 1]], ['c a cafe', ['c. à café', 1]],
  ['cuil a cafe', ['c. à café', 1]], ['cuillere a cafe', ['c. à café', 1]], ['cuilleres a cafe', ['c. à café', 1]],
  ...['gousse', 'botte', 'branche', 'feuille', 'sachet', 'pincee', 'tranche'].flatMap(unit => {
    const label = unit === 'pincee' ? 'pincée' : unit === 'tranche' ? 'tranches' : unit;
    return [[unit, [label, 1]], [unit + 's', [label, 1]]];
  })
]);

function parseQuantity(raw) {
  const text = normalize((raw ?? '').replace(/[¼½¾⅓⅔⅛]/g, match => ` ${fractions[match]}`));
  const match = /^(?:(\d+)\s+)?(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*([a-z. ]*)$/.exec(text);
  if (!match) return;
  const [, whole, number, suffix] = match;
  if (whole && !number.includes('/')) return;
  const [numerator, denominator = 1] = number.replace(',', '.').split('/').map(Number);
  const unit = unitFactors.get(suffix.replaceAll('.', '').trim());
  const amount = Number(whole ?? 0) + numerator / denominator;
  if (unit && Number.isFinite(amount) && amount > 0 && amount * unit[1] <= 1_000_000) {
    return { quantity: amount * unit[1], unit: unit[0] };
  }
}

function canonicalName(raw) {
  const name = raw.replace(/\s+/g, ' ').trim();
  const key = normalizeIngredientName(name);
  if (!nameIndex.has(key)) nameIndex.set(key, name.charAt(0).toLocaleUpperCase('fr') + name.slice(1));
  return aliases.get(key) ?? nameIndex.get(key);
}

function prepare(source) {
  const names = new Set();
  const prepared = source.map(row => {
    const id = row.recipe_id.toLowerCase();
    const url = new URL(row.url);
    if (!/^metro-rec-\d+$/.test(id) || names.has(id) || url.origin !== 'https://www.metro.fr' ||
      !row.title.trim() || !row.ingredients.length || !row.steps.some(step => step.text.trim())) {
      throw new Error(`Recette invalide : ${id}`);
    }
    names.add(id);
    return {
      row, id, baseServings: Number.isInteger(row.servings) && row.servings > 0 ? row.servings : null,
      ingredients: row.ingredients.map(ingredient => ({
        name: canonicalName(ingredient.ingredient),
        parsed: parseQuantity(ingredient.quantity),
        detail: [ingredient.section, ingredient.raw].filter(Boolean).join(' · ')
      }))
    };
  });

  // Existing pantry units stay stable. For new ingredients, use the most frequent measured unit.
  const unitVotes = new Map();
  for (const recipe of prepared) {
    if (!recipe.baseServings) continue;
    for (const { name, parsed } of recipe.ingredients) {
      if (!name || !parsed || unitsByName.has(name)) continue;
      const counts = unitVotes.get(name) ?? new Map();
      counts.set(parsed.unit, (counts.get(parsed.unit) ?? 0) + 1);
      unitVotes.set(name, counts);
    }
  }
  for (const [name, counts] of unitVotes) {
    unitsByName.set(name, [...counts].sort(([unitA, a], [unitB, b]) => b - a || unitA.localeCompare(unitB, 'fr'))[0][0]);
  }

  const titleCounts = new Map();
  for (const { row } of prepared) {
    const key = normalize(row.title);
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  return prepared.map(({ row, id, baseServings, ingredients: lines }) => {
    const measured = new Map();
    const unmeasured = [];
    for (const { name, parsed, detail } of lines) {
      const unit = parsed && multipleUnits.get(name)?.includes(parsed.unit) ? parsed.unit : unitsByName.get(name);
      const amount = baseServings && name && parsed && unit !== undefined ? convertQuantity(parsed.quantity, parsed.unit, unit) : undefined;
      if (amount === undefined) unmeasured.push({ name, detail });
      else {
        const key = JSON.stringify([name, unit]);
        measured.set(key, [(measured.get(key)?.[0] ?? 0) + amount, unit, name]);
      }
    }
    return {
      id,
      title: titleCounts.get(normalize(row.title)) > 1 && row.chef
        ? `${row.title.trim()} · ${row.chef}`
        : row.title.trim(),
      category: row.category.slug === 'dessert' ? 'Sucré' : row.category.slug === 'cocktail' ? 'Boissons' : 'Salé',
      minutes: row.duration.minutes > 0 ? row.duration.minutes : null,
      baseServings,
      description: row.intro || undefined,
      source: { url: row.url, chef: row.chef || undefined },
      ingredients: [...measured.values()],
      unmeasured: unmeasured.length ? unmeasured : undefined,
      steps: row.steps.filter(step => step.text.trim()).map(step => [step.section, step.text].filter(Boolean).join(' · '))
    };
  });
}

const inputFile = process.argv[2];
const load = Effect.tryPromise(async () => {
  if (inputFile) return JSON.parse(await readFile(inputFile, 'utf8'));
  const response = await fetch(resource, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`data.gouv.fr : HTTP ${response.status}`);
  return response.json();
});

const program = Effect.gen(function* () {
  const raw = yield* load;
  const source = yield* Schema.decodeUnknownEffect(sourceSchema)(raw);
  if (!source.length) throw new Error('Le catalogue source est vide.');
  const previous = yield* Effect.tryPromise(async () => JSON.parse(await readFile(output, 'utf8')));
  for (const recipe of previous) {
    for (const [, unit, name] of recipe.ingredients) {
      if (!unitsByName.has(name)) unitsByName.set(name, unit);
      const key = normalizeIngredientName(name);
      if (!nameIndex.has(key)) nameIndex.set(key, name);
    }
  }
  const recipes = prepare(source);
  const temporary = new URL('../www/metro-recipes.json.tmp', import.meta.url);
  yield* Effect.tryPromise(async () => {
    await writeFile(temporary, JSON.stringify(recipes) + '\n');
    await rename(temporary, output);
  });
  console.log(`${recipes.length} recettes importées, dont ${recipes.filter(recipe => recipe.ingredients.length).length} avec au moins une quantité exploitable.`);
});
await Effect.runPromise(program);
