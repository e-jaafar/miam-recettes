import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { test } from 'node:test';
import { Effect } from 'effect';
import { findIngredients, findRecipes, ingredientNames, missingIngredients, pantryKey, pantryMatches, recipes, recipeStock, shoppingItems, unitsForIngredient } from '../www/recipes.ts';
import { readState } from '../www/storage.ts';
import ingredientAliases from '../www/ingredient-aliases.json' with { type: 'json' };
import { normalizeIngredientName } from '../www/ingredient-name.ts';
import { storesMap, storeCatalogSearch } from '../www/stores.ts';

test('la recherche combine les ingrédients et la catégorie, même sans accents', () => {
  const matches = findRecipes('  oeuf  banane ', 'Sucré');
  assert(matches.some(recipe => recipe.id === 'pancakes'));
  assert(matches.some(recipe => recipe.source));
  assert(matches.every(recipe => recipe.category === 'Sucré'));
  assert(findRecipes('oeuf', 'Salé').every(recipe => recipe.category === 'Salé'));
  assert.equal(findRecipes('', '').length, recipes.length);
});

test('les courses regroupent les ingrédients communs selon les portions', () => {
  const items = shoppingItems({ pancakes: 4, granola: 2 });
  assert.equal(items.filter(item => item.name === 'Myrtilles').length, 1);
  assert.equal(items.find(item => item.name === 'Myrtilles').quantity, 180);
  assert.equal(items.find(item => item.name === 'Sirop d’érable').quantity, 5);
  assert.deepEqual(shoppingItems({}), []);
  assert.equal(shoppingItems({ pancakes: 4, granola: 2 }, { Myrtilles: 120 }).find(item => item.name === 'Myrtilles').quantity, 60);
  assert(!shoppingItems({ pancakes: 4, granola: 2 }, { Myrtilles: 180 }).some(item => item.name === 'Myrtilles'));
});

test('le stockage valide les données et écarte les ingrédients déjà rangés', () => {
  const berries = JSON.stringify(['Myrtilles', 'g']);
  const stored = {
    pantry: { Myrtilles: 80 }, portions: { granola: 2, smoothie: 50 },
    favorites: ['granola', 'inconnu'], checked: [berries]
  };
  assert.deepEqual(Effect.runSync(readState(() => JSON.stringify(stored))), {
    pantry: { Myrtilles: 80 }, portions: { granola: 2 }, favorites: ['granola'], checked: [], manual: []
  });
  assert.deepEqual(Effect.runSync(readState(() => '{')).pantry, {});
});

test('les recettes réalisables passent avant celles auxquelles il manque des ingrédients', () => {
  const granola = recipes.find(recipe => recipe.id === 'granola');
  const pantry = Object.fromEntries(granola.ingredients.map(([quantity, , name]) => [name, quantity]));
  const matches = pantryMatches(recipes, pantry);
  assert.equal(matches[0].recipe.id, 'granola');
  assert.deepEqual(matches[0].missing, []);
  assert(matches.find(match => match.recipe.id === 'smoothie').missing.some(item => item.name === 'Fraises'));
  assert(!matches.some(match => match.recipe.id === 'toast'));
});

test('chaque recette créditée a une photo locale', async () => {
  await Promise.all(recipes.filter(recipe => recipe.photoId).map(recipe => access(new URL(`../www/public/assets/${recipe.id}.webp`, import.meta.url))));
});

test('les portions augmentent les besoins et conservent le stock existant', () => {
  const granola = recipes.find(recipe => recipe.id === 'granola');
  assert.deepEqual(missingIngredients(granola, { Myrtilles: 90 }, 3).find(item => item.name === 'Myrtilles'), {
    name: 'Myrtilles', unit: 'g', quantity: 30
  });
});

test('le catalogue utilise des unités reconnues et des identifiants uniques', () => {
  assert.equal(new Set(recipes.map(recipe => recipe.id)).size, recipes.length);
  for (const recipe of recipes) {
    assert.equal(new Set(recipe.ingredients.map(([, unit, name]) => pantryKey(name, unit))).size, recipe.ingredients.length);
    for (const [quantity, unit, name] of recipe.ingredients) {
      assert(quantity > 0);
      assert(unitsForIngredient(name).includes(unit), name);
    }
  }
});

test('les recettes METRO utilisent les portions source et signalent les quantités non calculables', () => {
  const metro = recipes.find(recipe => recipe.id === 'metro-rec-0001');
  assert.equal(metro.baseServings, 10);
  const chocolate = missingIngredients(metro, { 'Chocolat noir': 80 }, 2).find(item => item.name === 'Chocolat noir');
  assert.equal(chocolate.quantity, 20);
  const unscaled = recipes.find(recipe => recipe.source && recipe.baseServings === null);
  assert.equal(unscaled.ingredients.length, 0);
  assert(unscaled.unmeasured.length > 0);
});

test('les recherches de magasins encodent la zone et le produit', () => {
  const map = new URL(storesMap('  Saint-Gilles & environs  '));
  assert.equal(map.searchParams.get('api'), '1');
  assert.equal(map.searchParams.get('query'), 'Supermarchés près de Saint-Gilles & environs');
  assert.match(new URL(storeCatalogSearch('Huile d’olive')).searchParams.get('q'), /^Huile d’olive .*site:collectandgo.be/);
});

test('les variantes de patate douce donnent une seule entrée et partagent le stock en grammes', () => {
  assert.deepEqual(ingredientNames.filter(name => /^patates? douces?$/i.test(name)), ['Patates douces']);
  const stored = { pantry: { 'Patates douce': 100, 'Patates douces': 200, 'Patate douce': 2 }, portions: {}, checked: [], favorites: [] };
  const { pantry } = Effect.runSync(readState(() => JSON.stringify(stored)));
  assert.deepEqual(pantry, { 'Patates douces': 300 });
  const recipe = recipes.find(recipe => recipe.id === 'metro-rec-0295');
  assert.deepEqual(missingIngredients(recipe, pantry, recipe.baseServings).find(item => item.name === 'Patates douces'), {
    name: 'Patates douces', quantity: 300, unit: 'g'
  });
});

test('les variantes de libellé retrouvent le même ingrédient sans doublon', () => {
  assert.deepEqual(findIngredients('oignons frit'), ['Oignons frits']);
  assert.deepEqual(findIngredients('fecule de pommes de terre'), ['Fécule de pomme de terre']);
  assert.deepEqual(findIngredients('maizena'), ['Amidon de maïs']);
});

test('la banque ne contient ni anciens alias ni doublons typographiques', () => {
  const keys = ingredientNames.map(normalizeIngredientName);
  assert.equal(new Set(keys).size, keys.length);
  for (const variants of Object.values(ingredientAliases)) {
    for (const name of Object.keys(variants)) assert(!ingredientNames.includes(name), name);
  }
  assert.deepEqual(findIngredients('de cumin en poudre'), ['Cumin en poudre']);
  assert.deepEqual(findIngredients('farine t 55'), ['Farine T55']);
});

test('le stock des libellés fusionnés garde ses mesures', () => {
  const stored = {
    pantry: { Poivron: 2, Poivrons: 250, 'Huile d’olive': 1, "- Huile d'olive bio": 30 },
    favorites: [], portions: {}, checked: []
  };
  const { pantry } = Effect.runSync(readState(() => JSON.stringify(stored)));
  assert.deepEqual(pantry, { Poivron: 2, [pantryKey('Poivron', 'g')]: 250, 'Huile d’olive': 3 });
});

test('la vanille en grammes et en gousses partage un nom et conserve deux stocks', () => {
  assert.deepEqual(findIngredients('gousses de vanille'), ['Vanille']);
  const stored = { pantry: { Vanille: 2, 'Gousses de vanille': 4, 'Beurre doux': 30, 'Oeuf bio': 3 }, portions: {}, checked: [], favorites: [] };
  const { pantry } = Effect.runSync(readState(() => JSON.stringify(stored)));
  assert.deepEqual(pantry, { Vanille: 2, [pantryKey('Vanille', 'g')]: 4, Beurre: 30, Œuf: 3 });
  const recipe = recipes.find(recipe => recipe.ingredients.some(([, unit, name]) => name === 'Vanille' && unit === 'g'));
  const withoutGrams = shoppingItems({ [recipe.id]: 2 }, { Vanille: 1000 });
  assert(withoutGrams.some(item => item.name === 'Vanille' && item.unit === 'g'));
  assert(!shoppingItems({ [recipe.id]: 2 }, { [pantryKey('Vanille', 'g')]: 1000 }).some(item => item.name === 'Vanille' && item.unit === 'g'));
});

test('les deux recettes de bœuf Wellington sont distinguées par leur chef', () => {
  const matches = recipes.filter(recipe => /^bœuf wellington/i.test(recipe.title));
  assert.equal(matches.length, 2);
  assert(matches.every(recipe => recipe.title.endsWith(recipe.source.chef)));
});

test('un oignon jaune remplace un oignon générique sans dépenser deux fois le même stock', () => {
  const yellow = pantryKey('Oignons jaunes', '');
  const recipe = { ingredients: [[1, '', 'Oignon'], [1, '', 'Oignons jaunes']] };
  const stock = { [yellow]: 1 };
  assert.deepEqual(recipeStock(recipe, stock).missing, [{ name: 'Oignon', unit: '', quantity: 1 }]);
  assert.deepEqual(recipeStock(recipe, { [yellow]: 2 }).used, { [yellow]: 2 });
  assert.equal(recipeStock(recipe, { 'Oignons jaunes': 100 }).missing.length, 2);
});

test('le vide-frigo applique conjointement les inclusions et les exclusions', () => {
  const results = findRecipes('', 'Salé', 'riz, pois chiches', 'lait');
  assert(results.some(recipe => recipe.id === 'riz-pois-chiches'));
  assert(results.every(recipe => !recipe.ingredients.some(([, , name]) => /lait/i.test(name))));
});
