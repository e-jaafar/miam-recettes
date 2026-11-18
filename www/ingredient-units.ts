export const multipleUnits = new Map([
  ["Vanille", ["gousse", "g"]],
  ["Sel", ["pincée", "g"]],
  ["Oignon", ["", "g"]],
  ["Oignons jaunes", ["g", ""]],
  ["Oignons rouges", ["g", ""]],
  ["Oignons blancs", ["g", ""]],
  ["Ail", ["gousse", ""]],
  ["Ail haché", ["g", "gousse"]],
  ["Céleri Branche", ["", "branche", "g"]],
  ["Crème liquide UHT", ["g", "ml"]],
  ["Crème liquide UHT 35%", ["g", "ml"]],
  ["Framboises fraîches", ["", "g"]],
  ["Menthe fraîche", ["feuille", "branche"]],
  ["Pain de mie", ["tranches", "g"]],
  ["Vinaigre d'alcool blanc", ["ml", "g"]],
  ["Gélatine feuille", ["g", "feuille"]],
  ["Huile de pépin de raisin", ["g", "ml"]],
  ["Huile de sésame", ["ml", "g"]],
  ["Huile de tournesol", ["g", "ml"]],
  ["Jus de citron", ["g", "ml"]],
  ["Jus de Citron Vert", ["g", "ml"]],
  ["Poivron", ["", "g"]],
  ["Purée de fruits de la passion", ["ml", "g"]],
  ["Radis en botte", ["g", ""]],
  ["Tomate en brunoise", ["", "g"]],
  ["Pomme de terre", ["", "g"]],
  ["Beurre demi sel", ["g", "c. à café"]],
  ["Oignons ciselés", ["g", ""]],
  ["Feuilles de brick", ["", "feuille"]],
  ["Graines de coriandre", ["g", "c. à soupe"]],
  ["Huile d’olive", ["c. à soupe", "g"]],
  ["Huile d'olive extra vierge", ["c. à soupe", "g"]]
]);

const volume = new Map([['ml', 1], ['c. à café', 5], ['c. à soupe', 15]]);

/** Conversion entre unités de volume uniquement (utilisée pour migrer l’ancien stock). */
export function convertQuantity(quantity: number, from: string, to: string) {
  if (from === to) return quantity;
  const fromVolume = volume.get(from);
  const toVolume = volume.get(to);
  if (fromVolume && toVolume) return quantity * fromVolume / toVolume;
}

/** Densité approximative (g/ml) : 0,92 pour les huiles, 1 pour les autres liquides. */
const density = (name: string) => /^huile/i.test(name) ? 0.92 : 1;

/**
 * Conversion pour le calcul du stock : volumes entre eux, et grammes ↔ volume
 * avec une densité approchée. Les pièces, gousses, etc. ne se convertissent pas.
 */
export function convertStock(quantity: number, from: string, to: string, name: string) {
  const sameKind = convertQuantity(quantity, from, to);
  if (sameKind !== undefined) return sameKind;
  const fromVolume = volume.get(from);
  const toVolume = volume.get(to);
  if (from === 'g' && toVolume) return quantity / density(name) / toVolume;
  if (fromVolume && to === 'g') return quantity * fromVolume * density(name);
}
