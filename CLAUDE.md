# CLAUDE.md — Règles d'exécution Deribfy

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

## Design system — Redesign Deribfy

### Palette

Palette officielle :

- Accent Deribfy : `#FA5D1E`
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

Deribfy suit une direction :

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

---

## Protocole de référence ELITE 2027 A+ — RÈGLE PERMANENTE

Le PROTOCOLE DE PREUVE qui certifie le chantier possède sa propre source de
vérité, versionnée et SÉPARÉE :

`docs/elite-protocol/`
(README.md · REFERENCE_PROTOCOL_ELITE_2027.md · CHANGELOG.md · registers/)

1. Toute session travaillant sur le PROTOCOLE commence par
   `docs/elite-protocol/README.md`, qui porte la SESSION CONTINUITY RULE.
2. Ce dossier est PARALLÈLE à `docs/mobile-generation/`, jamais subordonné :
   le protocole doit rester indépendant de ce qu'il certifie. Les périmètres
   ne se recouvrent pas — `docs/mobile-generation/` porte le CHANTIER (plan,
   architecture, roadmap, statut, décisions) ; `docs/elite-protocol/` porte
   le PROTOCOLE qui l'évalue.
3. Le protocole n'a AUCUNE autorité pour modifier la ROADMAP ni une décision
   du chantier : il les évalue. Toute évolution du chantier reste régie par
   la règle 3 ci-dessous et par D-017.
4. DEUX COLLISIONS DE VOCABULAIRE, à ne jamais confondre :
   - « PREMIUM / ELITE 2027 A++ » (deux plus) = exigence de QUALITE PRODUIT,
     grille des 8 dimensions, D-039 — définie dans docs/mobile-generation/ ;
   - « ELITE 2027 A+ » (un plus) = standard du PROTOCOLE DE PREUVE ;
   - « Guardian » désigne le LIVE APP GUARDIAN (ARCHITECTURE §26, Phase 13).
     Le rôle de conformité du protocole s'appelle MOTEUR DE CONFORMITE.
5. Statut au 2026-08-30 : PROTOCOLE NON CERTIFIE, ACCORD TECHNIQUE : NON.
   Ne jamais convertir ce statut en PASS sans les preuves exigees.

## Chantier Mobile Generation — RÈGLE PERMANENTE

Le chantier de génération d'applications mobiles natives possède une
SOURCE DE VÉRITÉ PERMANENTE, versionnée dans le repository :

`docs/mobile-generation/`
(MASTER_PLAN.md · ARCHITECTURE.md · ROADMAP.md · STATUS.md · DECISIONS.md · CHANGELOG.md)

Règles obligatoires :

1. Toute session consacrée à ce chantier COMMENCE par lire, dans l'ordre :
   MASTER_PLAN.md, ARCHITECTURE.md, ROADMAP.md, STATUS.md — puis
   DECISIONS.md si nécessaire. Ensuite seulement, travailler.
2. STATUS.md doit refléter l'état RÉEL du chantier : le mettre à jour après
   chaque étape significative et avant la fin de toute session de travail.
3. Le plan est FIGÉ. Aucune décision architecturale figée ne se modifie
   silencieusement. Toute proposition d'évolution est soumise explicitement
   (problème · solution actuelle · alternative · démonstration technique ·
   conséquences), attend une validation explicite, puis est consignée dans
   DECISIONS.md avant toute modification du plan.
4. Aucune étape de ROADMAP.md n'est marquée TERMINÉE sans vérification
   objective de ses critères de sortie. Aucun saut de phase silencieux :
   une étape jugée inutile est signalée, argumentée, et attend validation.
5. La mémoire d'une conversation ne constitue JAMAIS la source de vérité du
   projet — seul le repository fait foi. Une nouvelle session doit pouvoir
   reprendre le chantier en lisant uniquement `docs/mobile-generation/`.
6. **Progression (D-017)** : ROADMAP.md est la référence d'ordre STRICTE —
   n'anticiper, n'inventer, ne sauter ni commencer aucune étape non
   autorisée, quelle qu'en soit la provenance (propriétaire, Claude Code,
   assistant tiers — contester explicitement toute proposition
   hors-ROADMAP). Tout rapport important et toute fin d'étape affichent le
   bloc PROGRESSION GLOBALE (phases · terminé · en cours · prérequis des
   étapes bloquées · prochaine étape EXACTEMENT autorisée · interdits du
   moment), vérifié contre l'état réel du dépôt ; chaque fin d'étape
   énonce : terminé / où / prochaine étape exacte / prérequis /
   exécutable ou bloquée. Détail : MASTER_PLAN.md §5.
7bis. **Protocole de preuve (D-018)** : niveaux de preuve jamais confondus
   (hypothèse → observation → corrélation → cause probable → cause
   confirmée → correction proposée/testée/validée → non-régression →
   validation finale) ; diagnostic avant correction ; simulation ≠
   validation réelle (elle valide moteur/gardes, jamais le vrai modèle) ;
   « résolu » exige vérification indépendante + critères ROADMAP ; preuve
   contraire ⇒ abandon immédiat de l'hypothèse ; incertitude énoncée
   explicitement ; dépense API : option la moins chère d'abord +
   autorisation ; jamais fermer une étape pour finir. **Standard 100 %** :
   trois états seuls (🟢 PROUVÉ / 🔴 RÉFUTÉ / 🟠 NON DÉTERMINÉ) ;
   vocabulaire de conjecture interdit hors section « HYPOTHÈSES NON
   PROUVÉES » ; une simulation ne prouve que ce qu'elle simule ; chercher
   à DÉTRUIRE ses hypothèses, pas à les confirmer. Détail :
   DECISIONS.md D-018.
7. **Pilotage opérationnel (complément D-017)** : Claude Code pilote
   l'exécution du plan — croiser ROADMAP/MASTER_PLAN/STATUS/DECISIONS et
   l'état réel, déterminer soi-même la prochaine étape autorisée et
   l'EXÉCUTER si elle est exécutable ; jamais d'attente passive ni de
   demande de choix que la ROADMAP détermine déjà. Solliciter le
   propriétaire UNIQUEMENT pour un vrai prérequis externe (étape bloquée
   précisée, après vérification qu'aucune autre action autorisée n'est
   disponible) ou une vraie décision propriétaire. Plusieurs chemins
   autorisés → brève présentation + recommandation technique. Détail :
   MASTER_PLAN.md §5.
