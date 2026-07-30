# CLAUDE.md — Règles d'exécution Woorri

## Principe fondamental

Une nouvelle fonctionnalité, correction ou modification visuelle ne doit jamais casser, remplacer, supprimer ou modifier involontairement une fonctionnalité existante qui fonctionne.

La stabilité fonctionnelle ET visuelle de l'existant est prioritaire.

Après chaque modification, prouver autant que possible :
1. que le nouveau comportement fonctionne ;
2. que l'ancien comportement concerné continue de fonctionner ;
3. qu'aucune régression n'a été introduite dans le périmètre impacté.

Si une régression, incohérence ou dette existante est découverte hors périmètre, la signaler sans la modifier automatiquement.

---

## Portée d'une session (RÈGLE CENTRALE)

- Ne traiter qu'UNE zone ou UNE tâche par instruction.
- Ne JAMAIS enchaîner spontanément sur la tâche suivante sans une nouvelle instruction explicite de l'utilisateur.
- Terminer, montrer le résultat, STOP. Attendre la validation avant de continuer.

---

## Interdictions absolues

- NE JAMAIS toucher `src/erp/` ni les pages `/erp/`.
- NE JAMAIS toucher `prisma/schema.prisma`.
- NE JAMAIS faire `git push` sans validation explicite de l'utilisateur.
- NE JAMAIS faire `vercel --prod` ou tout autre déploiement production sans validation explicite de l'utilisateur.
- NE JAMAIS casser une fonctionnalité existante qui fonctionne.
- NE JAMAIS supprimer ou remplacer un comportement existant sans nécessité explicitement demandée.
- NE PAS refactorer hors du périmètre demandé.
- NE PAS corriger spontanément du code adjacent simplement parce qu'il pourrait être amélioré.
- NE PAS introduire de nouvelle dépendance sans nécessité démontrée.
- Une tâche = une cible précise.

---

## Piège terminal connu

L'application terminal transforme `www.` en lien markdown `[www.x](https://www.x)` à L'AFFICHAGE uniquement — le fichier sur disque reste correct.

Ne jamais juger un contenu de fichier à l'œil sur ce point.
Toujours vérifier en Python avec `.count('](http')` avant de conclure à une corruption.

---

## Méthode obligatoire avant toute modification

### 1. Inspecter

Lire le vrai code concerné avant toute modification avec les outils appropriés (`cat`, `grep`, `sed -n`, etc.).

Ne jamais supposer la structure ou le contenu d'un fichier.

Identifier :
- les fichiers concernés ;
- les dépendances directes ;
- les comportements existants à préserver ;
- les risques de régression.

### 2. Définir le périmètre

Avant modification, déterminer précisément :
- ce qui doit changer ;
- ce qui ne doit PAS changer ;
- les fichiers nécessaires.

Choisir la modification minimale permettant d'obtenir le résultat demandé.

### 3. Sauvegarder

Créer un backup `.backup` de chaque fichier avant modification.

Ne pas écraser un backup utile sans vérifier son contenu.

### 4. Modifier

Pour les remplacements ciblés, utiliser des scripts Python avec validation explicite, par exemple :

`assert s.count(old) == 1`

Ne jamais utiliser un remplacement global aveugle.

Ne jamais utiliser `sed` ou `perl` pour modifier les fichiers.

Si l'hypothèse attendue par le script est fausse, arrêter la modification et inspecter.

### 5. Vérifier

Après chaque changement significatif :

`npx tsc --noEmit`

Silence = TypeScript clean.

Lorsque disponibles et pertinents, exécuter également :
- tests automatisés concernés ;
- lint ;
- build ;
- vérifications spécifiques au composant ou à la fonctionnalité modifiée.

TypeScript clean seul ne constitue PAS une preuve suffisante d'absence de régression.

### 6. Vérifier la non-régression

Comparer le comportement avant/après dans le périmètre concerné.

Pour une modification visuelle, vérifier autant que possible :
- structure ;
- contenu ;
- interactions ;
- responsive ;
- états hover/focus/active ;
- absence de changement involontaire ailleurs.

Pour une modification fonctionnelle, tester le nouveau comportement ET le comportement existant impacté.

### 7. Commit

Commit atomique uniquement lorsque les vérifications pertinentes sont clean.

Un commit = une modification logique identifiable.

Ne pas mélanger redesign, refactorisation, correction et nouvelle fonctionnalité dans un même commit sauf nécessité technique.

### 8. Push / Production

STOP après le commit local.

`git push` uniquement après accord explicite de l'utilisateur.

Déploiement production uniquement après accord explicite distinct si nécessaire.

---

## Design system — Redesign Woorri

### Palette

Palette officielle :

- Accent Woorri : `#FA5D1E`
- Background deep : `#0A050E`
- Brand blue : `#4F6EF5`
- Brand gold : `#C9A84C`
- Brand prune : `#8B2252`

`#FA5D1E` est l'accent unique et remplace les anciens `#FF5500` et `#E07040`.

### Tokens

Les couleurs du produit doivent provenir des tokens centralisés dans :

`src/app/globals.css`

via `@theme`.

Ne jamais ajouter une couleur de marque en dur dans un composant si un token correspondant existe.

Créer un nouveau token uniquement si son rôle est justifié et réutilisable.

### Direction visuelle

Woorri suit une direction :

**AI Commerce Command Center**

Le caractère futuriste vient de :
- profondeur ;
- glassmorphism ;
- halos contrôlés ;
- gradients ;
- surfaces superposées ;
- micro-interactions ;
- hiérarchie visuelle ;
- mouvement subtil.

Éviter :
- cyberpunk excessif ;
- glow partout ;
- animations décoratives permanentes ;
- transparence réduisant la lisibilité ;
- multiplication inutile des couleurs.

### Glass

Effet glass :
- fond translucide ;
- bordure fine ;
- blur modéré ;
- lumière interne subtile ;
- ombre profonde.

Le glassmorphism doit préserver contraste et lisibilité.

### Glow

Le glow sert à attirer l'attention.

Ne pas appliquer du glow systématiquement à toutes les cartes ou surfaces.

Priorité :
- actions importantes ;
- éléments IA ;
- focus ;
- états sélectionnés ;
- informations nécessitant l'attention.

### Composants

Les primitives UI réutilisables appartiennent à :

`src/components/ui/`

Réutiliser les composants existants avant d'en créer de nouveaux.

Ne pas transformer automatiquement un élément local en composant partagé s'il n'a pas vocation à être réutilisé.

### Motion

Respecter `prefers-reduced-motion`.

Les animations doivent être courtes, fluides et fonctionnelles.

Éviter le mouvement permanent sans raison UX.

---

## Redesign progressif

Le redesign est effectué zone par zone.

Ne jamais lancer un redesign global en une seule modification.

Pour chaque zone :

1. inspecter l'existant ;
2. identifier les comportements à préserver ;
3. proposer le changement ;
4. modifier uniquement la zone validée ;
5. vérifier TypeScript/tests/build pertinents ;
6. vérifier le rendu et les interactions ;
7. comparer avant/après ;
8. commit atomique ;
9. STOP avant push.

Les zones non demandées doivent rester inchangées.

---

## Communication

- Réponses courtes et factuelles.
- Zéro préambule inutile.
- Une chose à la fois.
- Vérifier avant de modifier.
- Ne pas présenter une hypothèse comme un fait.
- Signaler les risques avant les changements risqués.
- En cas d'ambiguïté ayant un impact produit ou architectural, demander avant de décider.
- Après modification, indiquer précisément :
  - fichiers modifiés ;
  - vérifications exécutées ;
  - résultat ;
  - éventuels risques ou éléments non vérifiés.
