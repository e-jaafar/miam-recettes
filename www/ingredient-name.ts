export function normalizeIngredientName(name: string) {
  return name.toLocaleLowerCase('fr').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('œ', 'oe')
    .replace(/[’‘]/g, "'")
    .replace(/^\s*[-•]\s*/, '')
    .replace(/\s*%/g, '%')
    .replace(/\s+/g, ' ')
    .trim();
}
