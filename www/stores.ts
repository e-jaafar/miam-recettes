export function storesMap(area: string) {
  const url = new URL('https://www.google.com/maps/search/');
  const location = area.trim();
  url.search = new URLSearchParams({ api: '1', query: location ? `Supermarchés près de ${location}` : 'Supermarchés' }).toString();
  return url.href;
}

export function storeCatalogSearch(ingredient: string) {
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', `${ingredient} (site:collectandgo.be OR site:carrefour.be OR site:delhaize.be)`);
  return url.href;
}
