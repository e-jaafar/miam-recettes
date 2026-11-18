# Miam!

Miam! est une app de recettes en français, issue de la piste Miam! du prototype. La page d’accueil reprend les deux envies sucrée et salée sur fond lilas.

## Lancer l’app

Avec Node.js 22.18 ou plus récent, lancer `npm ci`, puis `npm run dev` et ouvrir [Miam!](http://127.0.0.1:4173/). L’application utilise TypeScript, Effect pour valider et gérer le stockage local, et Vite pour produire le site. `npm test` vérifie la recherche, les courses, le stockage et la présence des photos locales. `npm run build` vérifie les types et produit le site dans `dist/`. `npm run preview` sert cette version localement.

Rechercher un ingrédient et saisir la quantité disponible. L’app classe les recettes pour deux portions selon ce qu’il manque, puis recalcule les besoins quand les portions changent sur la fiche.

Les courses additionnent les besoins des recettes ajoutées et déduisent le stock du garde-manger. Cocher les achats, puis sélectionner **Ranger les achats cochés** pour ajouter les quantités indiquées au garde-manger. Modifier ces quantités si le format acheté diffère.

Depuis les courses, chercher les supermarchés par ville ou code postal sur Google Maps et ouvrir une recherche produit dans les catalogues d’enseignes belges. La disponibilité en rayon est à vérifier auprès du magasin.

Les ingrédients à la maison, les favoris et les courses sont enregistrés dans le navigateur. Ils restent sur l’appareil et dans le profil utilisés.

## Actualiser le catalogue

`npm run sync:recipes` récupère le fichier JSON de [METRO France via l’API data.gouv.fr](https://www.data.gouv.fr/datasets/recettes-de-chefs-pour-professionnels), valide les données avec Effect et met à jour `www/metro-recipes.json`. Lancer ensuite `npm test` et `npm run build`. La version web et le futur paquet iOS emportent le catalogue. La consultation et les calculs fonctionnent sans requête au fournisseur.

Les fiches importées citent METRO France, les chefs indiqués et la recette originale. La notice du producteur indique [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). L’import harmonise les noms et unités et additionne les quantités d’un même ingrédient. Les lignes ambiguës restent lisibles séparément sur la fiche et sont exclues du calcul des courses. Si le nombre de portions manque, la fiche conserve les mesures d’origine et désactive le recalcul.

## Adapter à iOS

Pour emballer la même app sur iPhone avec [Capacitor](https://capacitorjs.com/docs/getting-started), lancer `npm run build`, utiliser `dist` comme `webDir`, choisir un identifiant de bundle, puis ajouter et synchroniser la [plateforme iOS](https://capacitorjs.com/docs/ios) dans Xcode.
