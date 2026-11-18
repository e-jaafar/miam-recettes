import { Effect, Schema } from 'effect';
import { ingredientNames, pantryKey, unitsForIngredient, maxQuantity, recipes, roundQuantity, shoppingItems, type Pantry } from './recipes.ts';
import ingredientAliases from './ingredient-aliases.json' with { type: 'json' };
import { convertQuantity } from './ingredient-units.ts';

const storageKey = 'miam-recettes';
const manualSchema = Schema.Array(Schema.Struct({
  id: Schema.String, name: Schema.String, amount: Schema.String, checked: Schema.Boolean,
  source: Schema.optionalKey(Schema.String)
}));
export type ManualItem = typeof manualSchema.Type[number];

const stateSchema = Schema.Struct({
  favorites: Schema.Array(Schema.String),
  portions: Schema.Record(Schema.String, Schema.Number),
  checked: Schema.Array(Schema.String),
  manual: Schema.optionalKey(Schema.Unknown),
  pantry: Schema.optionalKey(Schema.Unknown)
});

export interface State {
  favorites: string[];
  portions: Record<string, number>;
  checked: string[];
  pantry: Pantry;
  manual: ManualItem[];
}

const decodeState = Schema.decodeUnknownEffect(Schema.fromJsonString(stateSchema));
const decodePantry = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Number));
const initialState = (): State => ({ favorites: [], portions: {}, checked: [], pantry: {}, manual: [] });

export const readState = (read: () => string | null) => Effect.try(read).pipe(
  Effect.flatMap(value => value === null ? Effect.succeed(initialState()) : decodeState(value).pipe(
    Effect.map(stored => {
      const favorites = recipes.filter(recipe => stored.favorites.includes(recipe.id)).map(recipe => recipe.id);
      const quantities = decodePantry(stored.pantry);
      const pantry: Pantry = {};
      if (quantities._tag === 'Some') {
        for (const name of ingredientNames) {
          for (const unit of unitsForIngredient(name)) {
            const key = pantryKey(name, unit);
            const quantity = quantities.value[key];
            if (quantity > 0 && quantity <= maxQuantity) pantry[key] = quantity;
          }
        }
        for (const [name, variants] of Object.entries(ingredientAliases)) {
          for (const [variant, oldUnit] of Object.entries(variants)) {
            const quantity = quantities.value[variant];
            if (oldUnit === null || !(quantity > 0 && quantity <= maxQuantity)) continue;
            const units = unitsForIngredient(name);
            const unit = units.includes(oldUnit) ? oldUnit : units.find(unit => convertQuantity(1, oldUnit, unit) !== undefined);
            if (unit === undefined) continue;
            const converted = convertQuantity(quantity, oldUnit, unit);
            if (converted === undefined) continue;
            const key = pantryKey(name, unit);
            pantry[key] = roundQuantity(Math.min(maxQuantity, (pantry[key] ?? 0) + converted));
          }
        }
      }
      const portions: Record<string, number> = {};
      for (const { id } of recipes) {
        const count = stored.portions[id];
        if (Number.isInteger(count) && count >= 1 && count <= 12) portions[id] = count;
      }
      const checked = quantities._tag === 'None' && stored.pantry !== undefined ? [] : shoppingItems(portions, pantry).map(item => item.key).filter(key => stored.checked.includes(key));
      const manual = Schema.decodeUnknownOption(manualSchema)(stored.manual);
      return { favorites, pantry, portions, checked, manual: manual._tag === 'Some' ? [...manual.value] : [] };
    })
  )),
  Effect.orElseSucceed(initialState)
);

export const loadState = () => readState(() => localStorage.getItem(storageKey));

export const saveState = (state: State) => Effect.try(() =>
  localStorage.setItem(storageKey, JSON.stringify(state))
);
