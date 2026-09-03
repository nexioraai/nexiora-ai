# Mesures fournisseur — CJ `freightCalculate`

Ce dossier contient les **pièces justificatives** des décisions du chantier shipping
restant : LOT 5 (quantité), frais CJ, devis panier.

Aucune de ces étapes ne doit être conçue sur une hypothèse. Chaque chiffre qui
justifiera une décision doit être traçable jusqu'à un JSON brut déposé ici.

## État

**Aucune mesure n'a encore été exécutée.** Ce dossier ne contient volontairement
aucune donnée réelle : les appels CJ n'ont pas été autorisés à ce stade.

## Protocole

Outil : [`scripts/measure-cj-freight.mjs`](../scripts/measure-cj-freight.mjs) — lecture seule.

| Propriété | Garantie |
|---|---|
| Endpoints appelés | `/authentication/getAccessToken` et `/logistic/freightCalculate`, **rien d'autre** |
| Écriture chez CJ | **aucune** — `createOrderV2` n'est jamais appelé |
| Supabase | **jamais touché** — le script n'importe pas le code de l'application |
| File de production | **non partagée** — cadence locale de 1100 ms (> 1 req/s CJ) |
| Démarrage | impossible sans `--confirm`, ni sans `--vid` et `--country` |

**Réserve à connaître** : ne partageant pas la file globale `acquireCjSlot()`, le
script pourrait faire dépasser le QPS du compte CJ s'il est lancé pendant un pic
de fulfillment. À lancer à un moment calme — la campagne dure moins d'une minute.

## Ce que la mesure doit établir

1. Présence ou absence de `taxesFee`, `clearanceOperationFee`, `totalPostageFee`
   dans les réponses réelles, et leur relation avec `logisticPrice`.
2. Comportement du tarif aux quantités 1, 2, 3, 5, 10, 20 — proportionnel,
   dégressif ou pénalisant.
3. Stabilité du classement des options entre les quantités.
4. Comportement de `products[]` multi-VID : quelles méthodes CJ retourne pour un
   panier réel, et comment son prix se compare à la somme des devis unitaires.

**Un champ absent est rapporté absent.** Aucune valeur n'est reconstituée,
aucune conclusion n'est tirée sans le JSON correspondant.

## Organisation

```
measures/
  README.md      ce protocole
  raw/           JSON bruts, un fichier par appel (cree a l'execution)
```

Nommage : `<vid>__<PAYS>__q<N>.json`, et `BASKET_<vidA>+<vidB>__<PAYS>__q<N>x<N>.json`.
Chaque fichier contient la requête émise, le statut HTTP et la réponse CJ intégrale.

## Versionner `raw/` ?

**Question ouverte.** Recommandation : le versionner — c'est la preuve d'origine
des décisions du LOT 5, et il ne contient aucun secret (tarifs et noms de
transporteurs uniquement). À trancher avant la première exécution.
