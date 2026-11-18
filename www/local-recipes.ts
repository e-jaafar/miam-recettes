import { extraRecipes } from './catalog.ts';
import type { Recipe } from './recipes.ts';

export const localRecipes: Recipe[] = [
  {
    id: 'pancakes', title: 'Pancakes à la banane', category: 'Sucré', minutes: 20,
    description: 'Des pancakes moelleux, des myrtilles et un filet de sirop d’érable.',
    photographer: 'Valeria Boltneva', photoId: 17751916,
    ingredients: [[1, '', 'Banane'], [1, '', 'Œuf'], [120, 'g', 'Farine'], [120, 'ml', 'Lait'], [1, 'c. à café', 'Levure chimique'], [50, 'g', 'Myrtilles'], [2, 'c. à soupe', 'Sirop d’érable'], [1, 'c. à café', 'Huile neutre']],
    steps: [
      'Écrase la banane, puis fouette-la avec l’œuf et le lait.',
      'Ajoute la farine et la levure. Mélange juste assez pour faire disparaître la farine.',
      'Huile une poêle et chauffe-la à feu moyen. Verse de petites louches de pâte. Retourne les pancakes quand des bulles apparaissent et dore l’autre face.',
      'Sers les pancakes avec les myrtilles et le sirop d’érable.'
    ]
  },
  {
    id: 'toast', title: 'Tartines avocat & tomates', category: 'Salé', minutes: 10,
    description: 'Du pain grillé, de l’avocat citronné et des tomates cerises bien juteuses.',
    photographer: 'Karelia Blum', photoId: 6609084,
    ingredients: [[2, 'tranches', 'Pain au levain'], [1, '', 'Avocat'], [120, 'g', 'Tomates cerises'], [0.5, '', 'Citron'], [1, 'c. à soupe', 'Huile d’olive'], [1, 'pincée', 'Sel']],
    steps: [
      'Fais griller le pain. Coupe les tomates cerises en deux.',
      'Écrase l’avocat avec le jus du citron et le sel.',
      'Étale l’avocat sur les tartines, ajoute les tomates et termine par un filet d’huile d’olive.'
    ]
  },
  {
    id: 'pesto', title: 'Pâtes au pesto de basilic', category: 'Salé', minutes: 25,
    description: 'Un pesto frais au basilic et du parmesan râpé au dernier moment.',
    photographer: 'Valeria Boltneva', photoId: 30910495,
    ingredients: [[200, 'g', 'Pâtes'], [30, 'g', 'Basilic'], [40, 'g', 'Parmesan'], [20, 'g', 'Pignons de pin'], [1, 'gousse', 'Ail'], [3, 'c. à soupe', 'Huile d’olive'], [1, 'pincée', 'Sel']],
    steps: [
      'Fais cuire les pâtes dans de l’eau salée selon le paquet. Garde une tasse d’eau de cuisson.',
      'Mixe le basilic avec l’ail, les pignons, l’huile et les trois quarts du parmesan.',
      'Mélange les pâtes égouttées au pesto hors du feu. Ajoute un peu d’eau de cuisson pour lier la sauce, puis le reste du parmesan.'
    ]
  },
  {
    id: 'smoothie', title: 'Smoothie fraise & myrtille', category: 'Boissons', minutes: 5,
    description: 'Un smoothie rose aux fruits rouges, à boire bien frais.',
    photographer: 'Cup of Couple', photoId: 7656565,
    ingredients: [[180, 'g', 'Fraises'], [80, 'g', 'Myrtilles'], [150, 'ml', 'Lait'], [100, 'g', 'Yaourt nature']],
    steps: [
      'Rince les fruits et retire les queues des fraises.',
      'Mixe les fruits avec le lait et le yaourt jusqu’à ce que la texture soit lisse.',
      'Verse dans deux verres et bois bien frais.'
    ]
  },
  {
    id: 'granola', title: 'Bol de granola aux myrtilles', category: 'Sucré', minutes: 5,
    description: 'Le croquant du granola, du yaourt frais et une poignée de myrtilles.',
    photographer: 'Katerina', photoId: 14564828,
    ingredients: [[250, 'g', 'Yaourt nature'], [70, 'g', 'Granola'], [80, 'g', 'Myrtilles'], [1, 'c. à soupe', 'Sirop d’érable']],
    steps: [
      'Répartis le yaourt dans deux bols et rince les myrtilles.',
      'Ajoute le granola, les myrtilles et le sirop d’érable au dernier moment pour garder le croquant.'
    ]
  },
  {
    id: 'houmous', title: 'Houmous au citron', category: 'Salé', minutes: 10,
    description: 'Des pois chiches, du tahini et du citron. À tartiner ou à partager.',
    photographer: 'Nataliya Vaitkevich', photoId: 6252678,
    ingredients: [[240, 'g', 'Pois chiches égouttés'], [2, 'c. à soupe', 'Tahini'], [0.5, '', 'Citron'], [1, 'gousse', 'Ail'], [1, 'c. à soupe', 'Huile d’olive'], [1, 'pincée', 'Sel']],
    steps: [
      'Rince les pois chiches. Garde-en quelques-uns pour la garniture.',
      'Mixe le reste avec le tahini, le jus du citron, l’ail et le sel. Ajoute de l’eau froide, cuillère par cuillère, jusqu’à obtenir une crème lisse.',
      'Sers avec l’huile d’olive et les pois chiches réservés.'
    ]
  },
  ...extraRecipes
];

