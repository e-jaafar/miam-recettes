import { Effect } from 'effect';
import { categories, recipes, findRecipes, findIngredients, ingredientNames, pantryKey, unitsForIngredient, maxQuantity, roundQuantity, missingIngredients, recipeStock, pantryMatches, shoppingItems, type Recipe } from './recipes.ts';
import { storesMap, storeCatalogSearch } from './stores.ts';
import { loadState, saveState, type ManualItem } from './storage.ts';

const paths = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  book: '<path d="M3 4h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H3zM21 4h-6a3 3 0 0 0-3 3v14a3 3 0 0 1 3-3h6z"/>',
  heart: '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
  bag: '<path d="M4 8h16l1 13H3zM8 9V7a4 4 0 0 1 8 0v2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  diagonal: '<path d="M6 18 18 6M6 6h12v12"/>',
  down: '<path d="M12 4v15m-6-6 6 6 6-6"/>',
  back: '<path d="M20 12H4m7-7-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};
const icon = (name: keyof typeof paths) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Élément introuvable : ${selector}`);
  return match;
}
const main = element('main');
const nav = element('nav');
const notice = element('#announcement');
const format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const saved = Effect.runSync(loadState());
let activeRecipe: Recipe | undefined;
let servings = 2;
let query = '';
let includeIngredients = '';
let excludeIngredients = '';
let readyOnly = false;
let everydayOnly = false;
let lastCook: { id: string; servings: number; used: Record<string, number>; planned: number | undefined } | undefined;
let manualDraft: Pick<ManualItem, 'id' | 'source' | 'name' | 'amount'> | undefined;
let category = '';
let previousRoute = '#/';
let currentRoute = '';
let noticeTimeout: ReturnType<typeof setTimeout>;
let showAll = false;
let shopArea = '';
let visibleResults = 30;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
);
const recipeHref = (recipe: Recipe) => `#/recette/${encodeURIComponent(recipe.id)}`;
const hasPantry = () => Object.keys(saved.pantry).length > 0;
const quantityText = (quantity: number, unit: string) => [format.format(quantity), unit].filter(Boolean).join(' ');

function announce(message: string) {
  clearTimeout(noticeTimeout);
  notice.textContent = message;
  noticeTimeout = setTimeout(() => { notice.textContent = ''; }, 3000);
}

function persist(message?: string) {
  Effect.runSync(saveState(saved).pipe(Effect.match({
    onSuccess: () => { if (message) announce(message); },
    onFailure: () => announce('Les modifications sont disponibles pendant cette visite.')
  })));
}

type Page = 'home' | 'recipe' | 'favorites' | 'shopping' | 'credits';
const pages: Partial<Record<string, Page>> = {
  '#/': 'home', '#/favoris': 'favorites', '#/courses': 'shopping', '#/credits': 'credits'
};

function renderNav(page: Page | undefined) {
  const tabs = [
    ['#/', 'book', 'Recettes', page === 'home' || page === 'recipe'],
    ['#/favoris', 'heart', 'Favoris', page === 'favorites'],
    ['#/courses', 'bag', 'Courses', page === 'shopping']
  ] as const;
  nav.innerHTML = tabs.map(([href, symbol, label, active]) =>
    `<a href="${href}" ${active ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></a>`
  ).join('');
}

function favorite(recipe: Recipe) {
  const selected = saved.favorites.includes(recipe.id);
  return `<button type="button" class="favorite" data-favorite="${escapeHtml(recipe.id)}" aria-label="Favori · ${escapeHtml(recipe.title)}" aria-pressed="${selected}">${icon('heart')}</button>`;
}

function picture(recipe: Recipe, eager = false) {
  return `<img src="${import.meta.env.BASE_URL}assets/${encodeURIComponent(recipe.id)}.webp" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

function meta(recipe: Recipe) {
  const time = recipe.minutes === null ? '' : `<span>${icon('clock')}${recipe.minutes} min</span>`;
  return `<span>${escapeHtml(recipe.category)}</span>${time}${recipe.source ? '<span>METRO France</span>' : ''}`;
}

function card(recipe: Recipe, featured = false, missing?: ReturnType<typeof missingIngredients>) {
  const uncertain = recipe.unmeasured?.length ?? 0;
  const matchText = missing?.length
    ? `<strong>Il te manque ${missing.length}</strong><br>${missing.map(item => `${quantityText(item.quantity, item.unit)} · ${escapeHtml(item.name)}`).join(', ')}`
    : uncertain ? '' : 'Tu as tous les ingrédients';
  const label = featured ? (recipe.category === 'Sucré' ? 'Envie de sucré' : 'Envie de salé') : '';
  return `<article class="recipe-card ${featured ? 'featured-card' : ''}" data-category="${escapeHtml(recipe.category)}">
    ${featured ? `<div class="card-label">${label}</div>` : ''}
    ${recipe.photoId ? `<div class="card-photo"><a href="${recipeHref(recipe)}" tabindex="-1" aria-hidden="true">${picture(recipe, featured)}</a>${favorite(recipe)}</div>` : ''}
    <div class="card-info"><div class="card-heading"><h3><a href="${recipeHref(recipe)}">${escapeHtml(recipe.title)}${recipe.photoId ? icon('diagonal') : ''}</a></h3>${recipe.photoId ? '' : favorite(recipe)}</div><p class="meta">${meta(recipe)}</p>
    ${missing ? `<p class="match-info ${!missing.length && !uncertain ? 'ready' : ''}">${matchText}${uncertain ? `<span class="uncertain">${uncertain} ligne(s) à vérifier</span>` : ''}</p>` : ''}</div>
  </article>`;
}

function home() {
  return `<div class="shell">
    <section class="hero" aria-labelledby="home-title">
      <div class="hero-copy">
        <h1 id="home-title">On mange<br> <em>quoi ?</em></h1>
        <p>Pars des ingrédients que tu as chez toi et découvre ce que tu peux préparer.</p>
        <form class="pantry-form" id="pantry-form">
          <label for="pantry-query">Mes ingrédients</label>
          <div class="pantry-picker">
            <div class="pantry-search">${icon('search')}<input id="pantry-query" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="pantry-options" autocomplete="off" placeholder="Rechercher un ingrédient"></div>
            <ul class="pantry-options" id="pantry-options" role="listbox" aria-label="Ingrédients proposés" hidden></ul>
          </div>
          <p class="pantry-feedback" id="pantry-feedback" role="status"></p>
          <input type="hidden" name="ingredient" id="pantry-choice">
          <div class="pantry-entry pantry-quantity" id="pantry-quantity" hidden>
            <div><label for="pantry-amount">Quantité</label><input id="pantry-amount" name="amount" type="number" inputmode="decimal" min="0.001" max="${maxQuantity}" step="0.001" required disabled></div>
            <div><label for="pantry-unit" id="pantry-unit-label">Unité</label><span class="pantry-unit-fixed" id="pantry-unit-fixed"></span><div class="pantry-select" id="pantry-select"><select id="pantry-unit" name="unit" disabled></select>${icon('chevron')}</div></div>
            <button class="button primary" type="submit" id="pantry-submit">Ajouter</button>
          </div>
        </form>
        <ul class="pantry-list" id="pantry-list" aria-label="Ingrédients à la maison"></ul>
        <button class="button" type="button" data-explore>Voir les recettes ${icon('down')}</button>
      </div>
      ${recipes.slice(0, 2).map(recipe => card(recipe, true)).join('')}
    </section>
    <section class="catalog" id="catalogue" aria-labelledby="catalog-title">
      <div class="catalog-header"><h2 id="catalog-title" tabindex="-1">Vide-frigo</h2>
        <label class="search">${icon('search')}<span class="sr-only">Rechercher une recette ou un ingrédient</span>
          <input type="search" placeholder="Recette, ingrédient…" autocomplete="off">
        </label>
      </div>
      <div class="filters" aria-label="Filtrer par catégorie">
        ${['', ...categories].map(value => `<button type="button" data-category-filter="${value}" aria-pressed="${category === value}">${value || 'Tout'}</button>`).join('')}
      </div>
      <label class="catalog-toggle" id="catalog-mode" hidden><input id="show-all" type="checkbox" ${showAll ? 'checked' : ''}> Afficher aussi les autres recettes</label>
      <details class="recipe-filters" ${includeIngredients || excludeIngredients || readyOnly || everydayOnly ? 'open' : ''}>
        <summary>Affiner les recettes</summary>
        <div class="filter-fields">
          <label>À inclure <input id="include-ingredients" type="search" placeholder="Ex. riz, carotte" value="${escapeHtml(includeIngredients)}"></label>
          <label>À exclure <input id="exclude-ingredients" type="search" placeholder="Ex. œuf, lait" value="${escapeHtml(excludeIngredients)}"></label>
        </div>
        <p>Sépare les ingrédients par des virgules. L’exclusion porte sur les ingrédients indiqués dans la recette.</p>
        <label class="catalog-toggle"><input id="ready-only" type="checkbox" ${readyOnly ? 'checked' : ''}> Réalisables avec mon stock</label>
        <label class="catalog-toggle"><input id="everyday-only" type="checkbox" ${everydayOnly ? 'checked' : ''}> Recettes du quotidien</label>
      </details>
      <p class="result-count" id="result-count" role="status"></p>
      <div class="recipe-grid" id="results"></div>
      <button class="button more-results" type="button" data-more hidden>Afficher plus de recettes</button>
    </section>
  </div>`;
}

function renderResults(expand = false) {
  if (!expand) visibleResults = 30;
  const matches = findRecipes(query, category, includeIngredients, excludeIngredients).filter(recipe => !everydayOnly || !recipe.source);
  const hasStock = hasPantry();
  const withPantry = hasStock ? pantryMatches(matches, saved.pantry) : [];
  const results: { recipe: Recipe; missing?: ReturnType<typeof missingIngredients> }[] = hasStock ? withPantry : matches.map(recipe => ({ recipe }));
  if (hasStock && showAll) {
    const matched = new Set(withPantry.map(({ recipe }) => recipe.id));
    results.push(...matches.filter(recipe => !matched.has(recipe.id)).map(recipe => ({
      recipe, missing: missingIngredients(recipe, saved.pantry)
    })));
  }
  const ready = results.filter(result => result.missing?.length === 0 && !result.recipe.unmeasured?.length);
  const visible = readyOnly ? ready : results;
  element('#catalog-title').textContent = hasStock && !showAll ? 'Avec mes ingrédients' : 'Vide-frigo';
  element('#catalog-mode').hidden = !hasStock;
  const count = `${visible.length} recette${visible.length === 1 ? '' : 's'}`;
  element('#result-count').textContent = hasStock ? `${count} · ${ready.length} avec tous les ingrédients` : count;
  const emptyMessage = hasStock && !showAll
    ? 'Aucune recette ne correspond. Essaie d’ajouter un autre ingrédient.'
    : 'Aucune recette pour cette recherche.';
  const reset = query || category || includeIngredients || excludeIngredients || readyOnly || everydayOnly ? '<button class="button" type="button" data-reset>Effacer les filtres</button>' : '';
  element('#results').innerHTML = visible.length
    ? visible.slice(0, visibleResults).map(({ recipe, missing }) => card(recipe, false, missing)).join('')
    : `<div class="empty"><p>${emptyMessage}</p>${reset}</div>`;
  element('[data-more]').hidden = visible.length <= visibleResults;
}

let resultsTimeout: ReturnType<typeof setTimeout> | undefined;
/** Regroupe les frappes rapides : la liste n’est recalculée qu’après une courte pause. */
function scheduleResults() {
  clearTimeout(resultsTimeout);
  resultsTimeout = setTimeout(() => {
    if (document.querySelector('#results')) renderResults();
  }, 120);
}

function renderPantry() {
  element('.hero').classList.toggle('has-pantry', hasPantry());
  selectIngredient('');
  element('#pantry-list').innerHTML = ingredientNames.flatMap(name => unitsForIngredient(name).map(unit => {
    const key = pantryKey(name, unit);
    const quantity = saved.pantry[key];
    if (!quantity) return '';
    const label = unitsForIngredient(name).length > 1 ? `${name} (${unit})` : name;
    return `<li><button type="button" data-edit-ingredient="${escapeHtml(name)}" data-unit="${escapeHtml(unit)}" aria-label="Modifier ${escapeHtml(label)}">${escapeHtml(name)} · ${quantityText(quantity, unit)}</button><button type="button" data-remove-ingredient="${escapeHtml(key)}" aria-label="Retirer ${escapeHtml(label)}">${icon('close')}</button></li>`;
  })).join('');
}

function closePantryOptions() {
  const input = element<HTMLInputElement>('#pantry-query');
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  element('#pantry-options').hidden = true;
  element('#pantry-feedback').textContent = '';
}

function renderPantryOptions() {
  const input = element<HTMLInputElement>('#pantry-query');
  const names = findIngredients(input.value).slice(0, 8);
  const list = element('#pantry-options');
  list.innerHTML = names.map((name, index) =>
    `<li role="option" id="pantry-option-${index}" aria-selected="false" data-ingredient="${escapeHtml(name)}">${escapeHtml(name)}</li>`
  ).join('');
  list.hidden = !names.length;
  input.setAttribute('aria-expanded', String(!!names.length));
  input.removeAttribute('aria-activedescendant');
  element('#pantry-feedback').textContent = names.length ? '' : 'Aucun ingrédient trouvé.';
}

function selectIngredient(name: string, unit?: string) {
  element<HTMLInputElement>('#pantry-query').value = name;
  element<HTMLInputElement>('#pantry-choice').value = name;
  closePantryOptions();
  renderPantryFields(unit);
}

function renderPantryFields(selectedUnit?: string) {
  const name = element<HTMLInputElement>('#pantry-choice').value;
  const available = unitsForIngredient(name);
  const unit = available[0];
  const amount = element<HTMLInputElement>('#pantry-amount');
  const units = element<HTMLSelectElement>('#pantry-unit');
  const submit = element<HTMLButtonElement>('#pantry-submit');
  const options = available.flatMap(value => value === 'g' ? ['g', 'kg'] : value === 'ml' ? ['ml', 'l'] : [value]);
  const showUnits = options.length > 1;
  element('#pantry-quantity').hidden = unit === undefined;
  amount.disabled = units.disabled = submit.disabled = unit === undefined;
  units.replaceChildren(...options.map(value => new Option(value || 'pièce', value)));
  if (selectedUnit !== undefined) units.value = selectedUnit;
  element('#pantry-select').hidden = !showUnits;
  element('#pantry-unit-label').hidden = !showUnits;
  const fixed = element('#pantry-unit-fixed');
  fixed.hidden = showUnits;
  fixed.textContent = unit || 'Pièce(s)';
  renderPantryAmount();
}

function renderPantryAmount() {
  const name = element<HTMLInputElement>('#pantry-choice').value;
  const inputUnit = element<HTMLSelectElement>('#pantry-unit').value;
  const unit = inputUnit === 'kg' ? 'g' : inputUnit === 'l' ? 'ml' : inputUnit;
  const existing = saved.pantry[pantryKey(name, unit)];
  const factor = inputUnit === unit ? 1 : 1000;
  const amount = element<HTMLInputElement>('#pantry-amount');
  amount.step = factor === 1 ? '0.001' : '0.000001';
  amount.min = amount.step;
  amount.max = String(maxQuantity / factor);
  amount.value = existing ? String(existing / factor) : '';
  element<HTMLButtonElement>('#pantry-submit').textContent = existing ? 'Enregistrer' : 'Ajouter';
}

function recipePage(recipe: Recipe) {
  const backLabel = {
    '#/favoris': 'Mes favoris',
    '#/courses': 'Mes courses'
  }[previousRoute as '#/favoris' | '#/courses'] ?? 'Toutes les recettes';
  return `<div class="shell inner-page">
    <a class="back-link" href="${previousRoute}">${icon('back')} ${backLabel}</a>
    <section class="recipe-intro ${recipe.photoId ? '' : 'text-recipe'}" aria-labelledby="recipe-title">
      ${recipe.photoId ? `<div class="detail-photo">${picture(recipe, true)}</div>` : ''}
      <div class="recipe-summary">
        <p class="meta">${meta(recipe)}</p>
        <h1 id="recipe-title">${escapeHtml(recipe.title)}</h1>
        ${recipe.source ? `<p class="source-credit">Source <a href="${escapeHtml(recipe.source.url)}" target="_blank" rel="noopener noreferrer">METRO France</a>${recipe.source.chef ? ` · ${escapeHtml(recipe.source.chef)}` : ''}</p>` : ''}
        ${recipe.description ? `<p>${escapeHtml(recipe.description)}</p>` : ''}
        <div class="recipe-actions">
          <button type="button" class="button primary" id="add-shopping" data-add>${icon('bag')} <span></span></button>
          ${favorite(recipe)}
        </div>
        <p id="shopping-note" class="shopping-note"></p>
      </div>
    </section>
    <div class="instructions">
      <section aria-labelledby="ingredient-title">
        <div class="ingredients-heading"><h2 id="ingredient-title">Ingrédients</h2>
          <div class="stepper" role="group" aria-label="Nombre de portions">
            <button type="button" data-serving="-1" aria-label="Retirer une portion">${icon('minus')}</button>
            <output id="portions" aria-live="polite"></output>
            <button type="button" data-serving="1" aria-label="Ajouter une portion">${icon('plus')}</button>
          </div>
        </div>
        <ul class="ingredients" id="ingredients"></ul>
        ${recipe.unmeasured?.length ? `<div class="source-ingredients"><h3>À vérifier dans la recette source</h3>
          <p>${recipe.baseServings === null ? 'La source ne précise pas le nombre de portions.' : `Les lignes ci-dessous correspondent aux indications d’origine pour ${recipe.baseServings} portion(s).`} Ces lignes ne sont pas incluses dans le calcul des courses.</p>
          <ul>${recipe.unmeasured.map(item => `<li>${escapeHtml(item.detail)}</li>`).join('')}</ul></div>` : ''}
      </section>
      <section aria-labelledby="steps-title"><h2 id="steps-title">Préparation</h2>
        <ol class="steps">${recipe.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
        <div class="cook-actions">
          <button class="button primary" type="button" data-cook>J’ai cuisiné</button>
          <button class="button" type="button" data-undo-cook hidden>Annuler la déduction</button>
          <p id="cook-note"></p>
        </div>
      </section>
    </div>
  </div>`;
}

function renderServings(activeRecipe: Recipe) {
  const added = saved.portions[activeRecipe.id];
  const label = (count: number) => `${count} portion${count === 1 ? '' : 's'}`;
  element('#portions').textContent = activeRecipe.baseServings === null ? 'Non indiqué' : label(servings);
  element<HTMLButtonElement>('[data-serving="-1"]').disabled = activeRecipe.baseServings === null || servings === 1;
  element<HTMLButtonElement>('[data-serving="1"]').disabled = activeRecipe.baseServings === null || servings === 12;
  const { missing, replacements, used } = recipeStock(activeRecipe, saved.pantry, servings);
  element('#ingredients').innerHTML = activeRecipe.ingredients.map(([amount, unit, name]) => {
    const deficit = missing.find(item => item.name === name && item.unit === unit);
    const alternatives = replacements[pantryKey(name, unit)];
    const stockLabel = deficit ? `Il manque ${quantityText(deficit.quantity, unit || 'pièce(s)')}` : 'Quantité disponible';
    const replacementLabel = alternatives?.length ? ` · avec ${escapeHtml(alternatives.join(', '))}` : '';
    return `<li><span>${escapeHtml(name)}${hasPantry() ? `<small>${stockLabel}${replacementLabel}</small>` : ''}</span><strong>${quantityText(amount * servings / (activeRecipe.baseServings ?? 2), unit)}</strong></li>`;
  }).join('');
  const add = element<HTMLButtonElement>('#add-shopping');
  add.disabled = added === servings || (!added && !missing.length && !activeRecipe.unmeasured?.length);
  element('#add-shopping span').textContent = !missing.length && !added
    ? activeRecipe.unmeasured?.length ? 'Ajouter les ingrédients à vérifier' : 'Tu as tous les ingrédients'
    : added === servings ? 'Ajouté aux courses'
    : added ? 'Mettre à jour les courses'
    : activeRecipe.unmeasured?.length ? 'Ajouter aux courses et vérifier les quantités'
    : hasPantry() ? 'Ajouter les ingrédients manquants' : 'Ajouter aux courses';
  element('#shopping-note').innerHTML = added ? `${label(added)} dans <a href="#/courses">ma liste de courses</a>.` : '';
  const cooked = lastCook?.id === activeRecipe.id;
  const cook = element<HTMLButtonElement>('[data-cook]');
  cook.disabled = !Object.keys(used).length || (cooked && lastCook?.servings === servings);
  element('[data-undo-cook]').hidden = !cooked;
  element('#cook-note').textContent = cooked
    ? 'Dernière préparation enregistrée.'
    : 'Déduit du garde-manger les quantités disponibles utilisées pour ces portions.';
}

function favoritesPage() {
  const favorites = recipes.filter(recipe => saved.favorites.includes(recipe.id));
  return `<section class="shell inner-page" aria-labelledby="page-title">
    <div class="page-heading"><h1 id="page-title">Mes favoris</h1><p>Les recettes que tu veux retrouver facilement.</p></div>
    <div id="favorites-list" class="recipe-grid">${favorites.length ? favorites.map(recipe => card(recipe)).join('') :
      '<div class="empty"><h2>Encore aucun favori</h2><p>Appuie sur le cœur d’une recette pour la retrouver ici.</p><a class="button primary" href="#/">Voir les recettes</a></div>'}</div>
  </section>`;
}

function manualShopping() {
  return `<section class="manual-shopping" aria-labelledby="manual-title">
    <h2 id="manual-title">Ajouts manuels</h2>
    <form id="manual-form" class="filter-fields">
      <label>Article <input name="name" required maxlength="120" value="${escapeHtml(manualDraft?.name ?? '')}"></label>
      <label>Quantité <input name="amount" required maxlength="60" placeholder="Ex. 1 botte" value="${escapeHtml(manualDraft?.amount ?? '')}"></label>
      <button class="button primary" type="submit">${manualDraft?.id ? 'Enregistrer' : 'Ajouter à la liste'}</button>
      ${manualDraft ? '<button type="button" class="button" data-manual-cancel>Annuler</button>' : ''}
    </form>
    ${saved.manual.length ? `<ul class="shopping-items manual-items">${saved.manual.map(item => `<li>
      <label><input type="checkbox" data-manual-check="${escapeHtml(item.id)}" ${item.checked ? 'checked' : ''}><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.amount)}</strong></label>
      <button class="button" type="button" data-manual-edit="${escapeHtml(item.id)}" aria-label="Modifier ${escapeHtml(item.name)}">Modifier</button>
      <button class="button" type="button" data-manual-remove="${escapeHtml(item.id)}" aria-label="Retirer ${escapeHtml(item.name)}">Retirer</button>
    </li>`).join('')}</ul>` : ''}
  </section>`;
}

function shoppingPage() {
  const items = shoppingItems(saved.portions, saved.pantry);
  const selected = recipes.filter(recipe => saved.portions[recipe.id]);
  const resolved = new Set(saved.manual.map(item => item.source));
  const uncertain = selected.flatMap(recipe => (recipe.unmeasured ?? []).flatMap((item, index) => {
    const source = `${recipe.id}:${index}:${item.detail}`;
    return resolved.has(source) ? [] : [{ ...item, source, recipe }];
  }));
  return `<section class="shell inner-page" aria-labelledby="page-title">
    <div class="page-heading"><h1 id="page-title">Mes courses</h1><p>Les ingrédients qu’il te manque pour les recettes ajoutées.</p></div>
    
    ${selected.length ? `<div class="shopping-layout">
      <section aria-labelledby="list-title"><h2 id="list-title">À mettre dans le panier</h2>
      ${items.length ? `<p class="result-count" id="progress" role="status"></p>
      <ul class="shopping-items">${items.map(item => `<li><label>
        <input type="checkbox" data-check="${escapeHtml(item.key)}" ${saved.checked.includes(item.key) ? 'checked' : ''}>
        <span>${escapeHtml(item.name)}</span><strong>${[format.format(item.quantity), item.unit].filter(Boolean).join(' ')}</strong>
      </label><a class="product-search" href="${storeCatalogSearch(item.name)}" target="_blank" rel="noopener noreferrer" aria-label="Chercher ${escapeHtml(item.name)} dans les catalogues des enseignes">Chercher en ligne ${icon('diagonal')}</a></li>`).join('')}</ul>
      <button class="button primary stock-purchases" type="button" data-stock>Ranger les achats cochés</button>`
      : '<p>Les quantités calculables sont couvertes.</p>'}
      ${uncertain.length ? `<div class="source-ingredients"><h3>Ingrédients à vérifier</h3>
        <p>Précise une quantité pour ajouter l’ingrédient à ta liste.</p>
        <ul>${uncertain.map(item => `<li>${escapeHtml(item.detail)} · <a href="${recipeHref(item.recipe)}">${escapeHtml(item.recipe.title)}</a>
          <button class="button" type="button" data-clarify="${escapeHtml(item.source)}" data-name="${escapeHtml(item.name)}" aria-label="Préciser ${escapeHtml(item.name || item.detail)}">Préciser</button></li>`).join('')}</ul>
      </div>` : ''}</section>
      <aside class="shopping-recipes" aria-labelledby="included-title"><h2 id="included-title">Recettes dans la liste</h2>
        <ul>${selected.map(recipe => `<li><div><a href="${recipeHref(recipe)}">${escapeHtml(recipe.title)}</a><span>${recipe.baseServings === null ? 'Portions non indiquées' : `${saved.portions[recipe.id]} pers.`}</span></div>
          <button type="button" class="icon-button" data-remove="${escapeHtml(recipe.id)}" aria-label="Retirer ${escapeHtml(recipe.title)} des courses">${icon('close')}</button></li>`).join('')}</ul>
      </aside>
    </div>` : '<div class="empty"><h2>Ta liste est vide</h2><p>Ouvre une recette et ajoute ses ingrédients aux courses.</p><a class="button primary" href="#/">Choisir une recette</a></div>'}
    ${manualShopping()}
    <section class="store-finder" aria-labelledby="store-title">
      <h2 id="store-title">Magasins à proximité</h2>
      <p>Trouve les supermarchés autour d’une ville ou d’un code postal. Pour un produit, consulte le catalogue de l’enseigne et vérifie le stock auprès du magasin.</p>
      <label for="shop-area">Ville ou code postal</label>
      <div class="store-actions">
        <input id="shop-area" type="search" maxlength="100" placeholder="Ex. 1000 Bruxelles">
        <a class="button primary" id="store-map" href="${storesMap(shopArea)}" target="_blank" rel="noopener noreferrer">Voir sur Google Maps ${icon('diagonal')}</a>
      </div>
    </section>
  </section>`;
}

function renderProgress() {
  const items = shoppingItems(saved.portions, saved.pantry);
  const progress = document.querySelector('#progress');
  if (progress) {
    progress.textContent = `${saved.checked.length} / ${items.length} ingrédients cochés`;
    element<HTMLButtonElement>('[data-stock]').disabled = !saved.checked.length;
  }
}

function creditsPage() {
  return `<section class="shell inner-page">
    <div class="page-heading"><h1>Sources et crédits</h1><p>Photographies culinaires utilisées sous <a href="https://www.pexels.com/license/">licence Pexels</a>.</p></div>
    <p>Recettes importées de <a href="https://www.data.gouv.fr/datasets/recettes-de-chefs-pour-professionnels">METRO France via data.gouv.fr</a> (édition du 6 octobre 2026, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> selon la notice du producteur). Miam! a harmonisé les noms et les unités et regroupé les ingrédients identiques pour calculer les courses.</p>
    <ul class="credits">${recipes.filter(recipe => recipe.photoId).map(recipe => `<li><a href="https://www.pexels.com/photo/${recipe.photoId}/">${escapeHtml(recipe.title)} · ${escapeHtml(recipe.photographer ?? '')}</a></li>`).join('')}</ul>
  </section>`;
}

function renderRoute(focus = true) {
  const route = location.hash || '#/';
  const recipe = recipes.find(item => route === recipeHref(item));
  const page = recipe ? 'recipe' : pages[route];
  if (recipe && currentRoute !== route) {
    if (currentRoute === '#/favoris' || currentRoute === '#/courses' || currentRoute === '#/') previousRoute = currentRoute;
    servings = saved.portions[recipe.id] ?? 2;
  }
  currentRoute = route;
  activeRecipe = recipe;
  renderNav(page);
  const views = { home, favorites: favoritesPage, shopping: shoppingPage, credits: creditsPage };
  const view = page && page !== 'recipe' ? views[page] : undefined;
  main.innerHTML = (recipe ? recipePage(recipe) : view?.()) ?? '<section class="shell inner-page"><div class="empty"><h1>Page introuvable</h1><a class="button primary" href="#/">Voir les recettes</a></div></section>';
  document.title = page === 'home' ? 'Miam! · On mange quoi ?' : `Miam! · ${element('main h1').textContent}`;
  if (page === 'home') {
    element<HTMLInputElement>('.search input').value = query;
    renderPantry();
    renderResults();
  }
  if (recipe) renderServings(recipe);
  if (page === 'shopping') {
    element<HTMLInputElement>('#shop-area').value = shopArea;
    renderProgress();
  }
  if (focus) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function setFilter(value: string) {
  category = value;
  main.querySelectorAll<HTMLButtonElement>('[data-category-filter]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === category));
  });
  renderResults();
}

function updateShopping(id: string, amount: number) {
  const before = shoppingItems(saved.portions, saved.pantry);
  if (amount) saved.portions[id] = amount;
  else delete saved.portions[id];
  refreshChecked(before);
}

function refreshChecked(before: ReturnType<typeof shoppingItems>) {
  const next = shoppingItems(saved.portions, saved.pantry);
  saved.checked = saved.checked.filter(key => next.some(item =>
    item.key === key && item.quantity === before.find(previous => previous.key === key)?.quantity
  ));
}

main.addEventListener('submit', event => {
  if (!(event.target instanceof HTMLFormElement)) return;
  if (event.target.id === 'manual-form') {
    event.preventDefault();
    const fields = new FormData(event.target);
    const name = String(fields.get('name') ?? '').trim();
    const amount = String(fields.get('amount') ?? '').trim();
    if (!name || !amount || name.length > 120 || amount.length > 60) {
      announce('Renseigne un article et sa quantité.');
      return;
    }
    const item = { id: manualDraft?.id || crypto.randomUUID(), name, amount, checked: false,
      ...(manualDraft?.source ? { source: manualDraft.source } : {}) };
    const index = saved.manual.findIndex(previous => previous.id === item.id);
    if (index < 0) saved.manual.push(item);
    else saved.manual[index] = item;
    manualDraft = undefined;
    persist('Article enregistré.');
    renderRoute(false);
    element('#manual-form [name="name"]').focus();
    return;
  }
  if (event.target.id !== 'pantry-form') return;
  event.preventDefault();
  const fields = new FormData(event.target);
  const name = fields.get('ingredient');
  const inputUnit = fields.get('unit');
  if (typeof name !== 'string' || typeof inputUnit !== 'string') return;
  const unit = inputUnit === 'kg' ? 'g' : inputUnit === 'l' ? 'ml' : inputUnit;
  if (!unitsForIngredient(name).includes(unit)) return;
  const quantity = roundQuantity(Number(fields.get('amount')) * (inputUnit === unit ? 1 : 1000));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > maxQuantity) {
    announce('Saisis une quantité positive dans la limite indiquée.');
    return;
  }
  const before = shoppingItems(saved.portions, saved.pantry);
  lastCook = undefined;
  saved.pantry[pantryKey(name, unit)] = quantity;
  refreshChecked(before);
  persist('Quantité enregistrée.');
  renderPantry();
  renderResults();
  element('#pantry-query').focus();
});

main.addEventListener('input', event => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.id === 'pantry-query') {
    element<HTMLInputElement>('#pantry-choice').value = '';
    renderPantryFields();
    if (event.target.value.trim()) renderPantryOptions();
    else closePantryOptions();
    return;
  }
  if (event.target.type !== 'search') return;
  if (event.target.id === 'include-ingredients' || event.target.id === 'exclude-ingredients') {
    if (event.target.id === 'include-ingredients') includeIngredients = event.target.value;
    else excludeIngredients = event.target.value;
    scheduleResults();
    return;
  }
  if (event.target.id === 'shop-area') {
    shopArea = event.target.value;
    element<HTMLAnchorElement>('#store-map').href = storesMap(shopArea);
    return;
  }
  query = event.target.value;
  scheduleResults();
});

main.addEventListener('pointerdown', event => {
  if (event.target instanceof Element && event.target.closest('[data-ingredient]')) event.preventDefault();
});

main.addEventListener('focusout', event => {
  if (event.target instanceof HTMLInputElement && event.target.id === 'pantry-query') closePantryOptions();
});

main.addEventListener('keydown', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== 'pantry-query' || event.isComposing) return;
  const list = element('#pantry-options');
  if (event.key === 'Escape' && !list.hidden) {
    event.preventDefault();
    closePantryOptions();
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (list.hidden) renderPantryOptions();
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
    if (!options.length) return;
    const current = options.findIndex(option => option.id === input.getAttribute('aria-activedescendant'));
    const next = event.key === 'ArrowDown' ? Math.min(current + 1, options.length - 1)
      : current < 0 ? options.length - 1 : Math.max(current - 1, 0);
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === next)));
    input.setAttribute('aria-activedescendant', options[next].id);
    options[next].scrollIntoView({ block: 'nearest' });
  }
  if (event.key === 'Enter' && !list.hidden) {
    event.preventDefault();
    const selected = list.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.querySelector<HTMLElement>('[role="option"]');
    if (selected?.dataset.ingredient) {
      selectIngredient(selected.dataset.ingredient);
      element('#pantry-amount').focus();
    }
  }
});

main.addEventListener('change', event => {
  if (event.target instanceof HTMLSelectElement && event.target.id === 'pantry-unit') {
    renderPantryAmount();
    return;
  }
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.dataset.manualCheck) {
    const { checked, dataset } = event.target;
    const item = saved.manual.find(entry => entry.id === dataset.manualCheck);
    if (item) {
      saved.manual = saved.manual.map(entry => entry.id === item.id ? { ...entry, checked } : entry);
      persist();
    }
    return;
  }
  if (event.target.id === 'ready-only' || event.target.id === 'everyday-only') {
    if (event.target.id === 'ready-only') readyOnly = event.target.checked;
    else everydayOnly = event.target.checked;
    renderResults();
    return;
  }
  if (event.target.id === 'show-all') {
    showAll = event.target.checked;
    renderResults();
    return;
  }
  if (!event.target.matches('[data-check]')) return;
  const key = event.target.dataset.check;
  const item = shoppingItems(saved.portions, saved.pantry).find(entry => entry.key === key);
  if (!item) return;
  saved.checked = event.target.checked
    ? [...new Set([...saved.checked, item.key])]
    : saved.checked.filter(key => key !== item.key);
  persist();
  renderProgress();
});

main.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const option = target.closest<HTMLElement>('[data-ingredient]');
  if (option?.dataset.ingredient) {
    selectIngredient(option.dataset.ingredient);
    element('#pantry-amount').focus();
    return;
  }
  const button = target.closest('button');
  if (!button) return;
  const data = button.dataset;
  if ('explore' in data) {
    element('#catalog-title').focus({ preventScroll: true });
    element('#catalogue').scrollIntoView();
  }
  if (data.categoryFilter !== undefined) setFilter(data.categoryFilter);
  if ('more' in data) {
    const firstNew = visibleResults;
    visibleResults += 30;
    renderResults(true);
    main.querySelectorAll<HTMLElement>('#results h3 a')[firstNew]?.focus();
  }
  if (data.editIngredient) {
    selectIngredient(data.editIngredient, data.unit);
    element<HTMLInputElement>('#pantry-amount').select();
  }
  if (data.removeIngredient) {
    const before = shoppingItems(saved.portions, saved.pantry);
    lastCook = undefined;
    delete saved.pantry[data.removeIngredient];
    refreshChecked(before);
    persist();
    renderPantry();
    renderResults();
    element('#pantry-query').focus();
  }
  if ('reset' in data) {
    query = includeIngredients = excludeIngredients = '';
    readyOnly = everydayOnly = false;
    category = '';
    renderRoute(false);
    element('.search input').focus();
  }
  if (data.favorite) {
    const selected = !saved.favorites.includes(data.favorite);
    saved.favorites = selected ? [...saved.favorites, data.favorite] : saved.favorites.filter(id => id !== data.favorite);
    if (currentRoute === '#/favoris') {
      renderRoute(false);
      (main.querySelector<HTMLElement>('.favorite, .empty a') ?? main).focus();
    } else {
      main.querySelectorAll(`[data-favorite="${CSS.escape(data.favorite)}"]`).forEach(control => control.setAttribute('aria-pressed', String(selected)));
    }
    persist(selected ? 'Recette ajoutée aux favoris.' : 'Recette retirée des favoris.');
  }
  if (data.serving && activeRecipe) {
    servings += Number(data.serving);
    renderServings(activeRecipe);
    if (button.disabled) element('[data-serving]:enabled').focus();
  }
  if ('add' in data && activeRecipe) {
    updateShopping(activeRecipe.id, servings);
    persist('Liste de courses mise à jour.');
    renderServings(activeRecipe);
    element('#shopping-note a').focus();
  }
  if ('cook' in data && activeRecipe) {
    const { used } = recipeStock(activeRecipe, saved.pantry, servings);
    if (!Object.keys(used).length) return;
    const before = shoppingItems(saved.portions, saved.pantry);
    lastCook = { id: activeRecipe.id, servings, used, planned: saved.portions[activeRecipe.id] };
    for (const [key, amount] of Object.entries(used)) {
      const remaining = roundQuantity(saved.pantry[key] - amount);
      if (remaining > 0) saved.pantry[key] = remaining;
      else delete saved.pantry[key];
    }
    delete saved.portions[activeRecipe.id];
    refreshChecked(before);
    persist('Quantités utilisées déduites.');
    renderServings(activeRecipe);
    element('[data-undo-cook]').focus();
  }
  if ('undoCook' in data && activeRecipe && lastCook?.id === activeRecipe.id) {
    const before = shoppingItems(saved.portions, saved.pantry);
    for (const [key, amount] of Object.entries(lastCook.used)) saved.pantry[key] = roundQuantity((saved.pantry[key] ?? 0) + amount);
    if (lastCook.planned && !saved.portions[activeRecipe.id]) saved.portions[activeRecipe.id] = lastCook.planned;
    lastCook = undefined;
    refreshChecked(before);
    persist('Déduction annulée.');
    renderServings(activeRecipe);
    element('[data-cook]').focus();
  }
  if (data.clarify || data.manualEdit || data.manualRemove || 'manualCancel' in data) {
    if (data.clarify) manualDraft = { id: '', source: data.clarify, name: data.name || '', amount: '' };
    else if (data.manualEdit) manualDraft = saved.manual.find(item => item.id === data.manualEdit);
    else {
      if (data.manualRemove) {
        saved.manual = saved.manual.filter(item => item.id !== data.manualRemove);
        persist('Article retiré.');
      }
      manualDraft = undefined;
    }
    renderRoute(false);
    element(manualDraft?.name ? '#manual-form [name="amount"]' : '#manual-form [name="name"]').focus();
  }
  if ('stock' in data) {
    lastCook = undefined;
    const bought = shoppingItems(saved.portions, saved.pantry).filter(item => saved.checked.includes(item.key));
    for (const item of bought) {
      const key = pantryKey(item.name, item.unit);
      saved.pantry[key] = roundQuantity((saved.pantry[key] ?? 0) + item.quantity);
    }
    saved.checked = [];
    persist('Les achats cochés ont été ajoutés à tes ingrédients.');
    renderRoute(false);
    main.focus();
  }
  if (data.remove) {
    updateShopping(data.remove, 0);
    persist('Recette retirée des courses.');
    renderRoute(false);
    (main.querySelector<HTMLElement>('[data-remove], .empty a') ?? main).focus();
  }
});

element('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
});
window.addEventListener('hashchange', () => renderRoute());
renderRoute(false);
