import { convertStock, multipleUnits } from './ingredient-units.ts';
import { normalizeIngredientName } from './ingredient-name.ts';
import { localRecipes } from './local-recipes.ts';
import ingredientAliases from './ingredient-aliases.json' with { type: 'json' };
import ingredientSubstitutes from './ingredient-substitutes.json' with { type: 'json' };

// Le catalogue METRO (~900 Ko) est chargé dans un fichier à part : il est mis en
// cache indépendamment du code de l’app et n’alourdit plus le bundle principal.
const { default: imported } = await import('./metro-recipes.json', { with: { type: 'json' } });

export const categories = ['Sucré', 'Salé', 'Boissons'];

export interface Recipe {
  id: string;
  title: string;
  category: string;
  minutes: number | null;
  baseServings?: number | null;
  unmeasured?: { name: string; detail: string }[];
  source?: { url: string; chef?: string };
  description?: string;
  photographer?: string;
  photoId?: number;
  ingredients: [quantity: number, unit: string, name: string][];
  steps: string[];
}

export const recipes: Recipe[] = [...localRecipes, ...(imported as unknown as Recipe[])];

export const normalize = (text: string) => text.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll('œ', 'oe');

export type Pantry = Record<string, number>;

export const ingredientUnits = new Map(recipes.flatMap(recipe =>
  recipe.ingredients.map(([, unit, name]) => [name, unit] as const)
));
for (const [name, units] of multipleUnits) ingredientUnits.set(name, units[0]);

export function unitsForIngredient(name: string): readonly string[] {
  const primary = ingredientUnits.get(name);
  return multipleUnits.get(name) ?? (primary === undefined ? [] : [primary]);
}

export function pantryKey(name: string, unit: string) {
  return ingredientUnits.get(name) === unit ? name : JSON.stringify([name, unit]);
}

export const ingredientNames = [...ingredientUnits.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
const ingredientSearch = new Map(Object.entries(ingredientAliases).map(([name, variants]) =>
  [name, [name, ...Object.keys(variants)].map(normalizeIngredientName)]
));

export function findIngredients(query: string) {
  const term = normalizeIngredientName(query);
  return ingredientNames.filter(name => (ingredientSearch.get(name) ?? [normalizeIngredientName(name)]).some(variant => variant.includes(term)));
}

export const roundQuantity = (quantity: number) => Math.round(quantity * 1000) / 1000;
export const maxQuantity = 1_000_000;

type Need = { name: string; unit: string; quantity: number };

const substituteMap: Record<string, string[] | undefined> = ingredientSubstitutes;
export const substitutes = (name: string) => substituteMap[name] ?? [];

/** Autres stocks utilisables pour un besoin : même ingrédient dans une autre unité, puis substituts. */
function alternativeSources(name: string, unit: string) {
  return [name, ...substitutes(name)].flatMap(candidate => unitsForIngredient(candidate).flatMap(stockUnit => {
    if (candidate === name && stockUnit === unit) return [];
    const factor = convertStock(1, unit, stockUnit, candidate);
    return factor === undefined ? [] : [{ name: candidate, key: pantryKey(candidate, stockUnit), factor }];
  }));
}

function allocateStock(needs: Need[], pantry: Pantry) {
  const used: Pantry = {};
  const take = (key: string, needed: number) => {
    const available = roundQuantity((pantry[key] ?? 0) - (used[key] ?? 0));
    const quantity = Math.max(0, Math.min(available, needed));
    if (quantity > 0) used[key] = roundQuantity((used[key] ?? 0) + quantity);
    return roundQuantity(needed - quantity);
  };
  // Reserve exact ingredients before spending the same stock on substitutes.
  const remaining = needs.map(item => ({ ...item, quantity: take(pantryKey(item.name, item.unit), roundQuantity(item.quantity)) }));
  const replacements: Record<string, string[]> = {};
  const missing = remaining.flatMap(item => {
    let quantity = item.quantity;
    for (const source of alternativeSources(item.name, item.unit)) {
      if (quantity <= 0) break;
      const remainder = roundQuantity(take(source.key, roundQuantity(quantity * source.factor)) / source.factor);
      if (remainder < quantity && source.name !== item.name) {
        const list = replacements[pantryKey(item.name, item.unit)] ??= [];
        if (!list.includes(source.name)) list.push(source.name);
      }
      quantity = remainder;
    }
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
  return { used, missing, replacements };
}

export function recipeStock(recipe: Pick<Recipe, 'ingredients' | 'baseServings'>, pantry: Pantry, servings = 2) {
  const needs = recipe.ingredients.map(([amount, unit, name]) => ({
    name, unit, quantity: amount * servings / (recipe.baseServings ?? 2)
  }));
  return allocateStock(needs, pantry);
}

export function missingIngredients(recipe: Pick<Recipe, 'ingredients' | 'baseServings'>, pantry: Pantry, servings = 2) {
  return recipeStock(recipe, pantry, servings).missing;
}

export function pantryMatches(candidates: Recipe[], pantry: Pantry) {
  return candidates
    .map(recipe => ({ recipe, ...recipeStock(recipe, pantry) }))
    .filter(({ recipe, used }) => Object.keys(used).length ||
      recipe.unmeasured?.some(({ name }) => unitsForIngredient(name).some(unit => pantry[pantryKey(name, unit)] > 0)))
    .sort((a, b) => a.missing.length + (a.recipe.unmeasured?.length ?? 0) -
      b.missing.length - (b.recipe.unmeasured?.length ?? 0) ||
      (a.recipe.minutes ?? Infinity) - (b.recipe.minutes ?? Infinity));
}

// Index calculé une seule fois : la recherche ne re-normalise plus rien à chaque frappe.
const searchIndex = new Map(recipes.map(recipe => {
  const names = [...recipe.ingredients.map(ingredient => ingredient[2]), ...recipe.unmeasured?.map(item => item.name) ?? []];
  const ingredients = names.flatMap(name => ingredientSearch.get(name) ?? [normalizeIngredientName(name)]);
  const haystack = [normalize(recipe.title), normalize(recipe.category), ...ingredients].join(' ');
  return [recipe, { ingredients, haystack }] as const;
}));

export function findRecipes(query: string, category: string, include = '', exclude = '') {
  const words = normalizeIngredientName(query).split(/\s+/).filter(Boolean);
  const terms = (text: string) => text.split(',').map(normalizeIngredientName).filter(Boolean);
  const required = terms(include);
  const avoided = terms(exclude);
  return recipes.filter(recipe => {
    if (category && recipe.category !== category) return false;
    const { ingredients, haystack } = searchIndex.get(recipe)!;
    if (!required.every(term => ingredients.some(name => name.includes(term)))) return false;
    if (avoided.some(term => ingredients.some(name => name.includes(term)))) return false;
    return words.every(word => haystack.includes(word));
  });
}

export function shoppingItems(portions: Record<string, number>, pantry: Pantry = {}) {
  const items = new Map<string, { key: string; name: string; unit: string; quantity: number }>();
  for (const recipe of recipes) {
    const servings = portions[recipe.id];
    if (!servings) continue;
    for (const [quantity, unit, name] of recipe.ingredients) {
      const key = JSON.stringify([name, unit]);
      const item = items.get(key) ?? { key, name, unit, quantity: 0 };
      item.quantity += quantity * servings / (recipe.baseServings ?? 2);
      items.set(key, item);
    }
  }
  return allocateStock([...items.values()], pantry).missing
    .map(item => ({ ...item, key: JSON.stringify([item.name, item.unit]) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
