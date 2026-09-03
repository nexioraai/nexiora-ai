# PROTOCOL RISK REGISTER

**Classification** : 🟢 résolu/démontré · 🟠 partiellement résolu / à
surveiller · 🔴 ouvert / bloquant · ⚪ dette faible

---

| ID | Description | Impact | Mode d'exploitation | Détection | Contre-mesure | Contre-attaque de la contre-mesure | Statut |
|---|---|---|---|---|---|---|---|
| **R-01** | Propriété jamais formulée (limite L1) | manque total | un champ absent du schéma n'engendre rien | découverte externe + taux §B | enrichir le schéma ; G24 borne le reste | ne couvre pas ce qui manque **au schéma** | 🔴 **irréductible, borné** |
| **R-02** | Gate satisfaite sans la propriété | faux PASS | capturer 100 % des écrans sans rien exploiter | gate portant sur une **mesure dérivée**, jamais sur l'existence d'un fichier | la mesure dérivée peut elle-même être triviale | 🟢 |
| **R-03** | Gate sans pouvoir discriminant | faux PASS massif | seuil complaisant (ex. `visualVariants > 1`) | P-E : cas-tueur obligatoire | premiers cas-tueurs forcément inventés, faute d'historique | 🔴 **0 cas-tueur existe** |
| **R-04** | Preuves à mode commun | fausse confiance | toutes les preuves partagent l'AIR | graphe d'indépendance, 8 axes | un axe oublié reste invisible | 🟠 |
| **R-05** | Oracle circulaire | confirmation d'un défaut | l'Oracle recompile avec le même compilateur ⇒ **le déterminisme reproduit le défaut et le confirme** | exiger ≥1 chemin d'implémentation distinct | l'exécution partage encore l'AIR | 🟠 |
| **R-06** | Auto-certification | protocole juge de lui-même | protocole conçu par l'auteur de l'analyse | séparation du **spécificateur** (P-D) | non appliquée à ce document | 🟠 **reconnu, non corrigé** |
| **R-07** | Empoisonnement de référence | défaut figé en norme | 1ʳᵉ capture fautive devient la vérité | certifier une référence avant qu'elle ne devienne référence | la certification initiale peut être fautive | 🟠 |
| **R-08** | `n/a` = sortie du champ de mesure | G22 | ne rien déclarer ⇒ n'être pas mesuré | `n/a` ⇒ **UNKNOWN**, jamais neutre | — | 🟢 |
| **R-09** | Métriques en ratio, aveugles à l'échelle | G22 généralisé | réduire le périmètre améliore tous les scores | pool de tâches scellé ; publier numérateur **et** dénominateur | pool connu ⇒ cible | 🟠 (PROTOCOL-D001) |
| **R-10** | Écarts sans sévérité | gaming interne | retirer un écart trivial vaut autant que corriger un écart critique | sévérité dérivée de la nature | — | 🔴 (PROTOCOL-D002) |
| **R-11** | Dérivation partielle | faux négatifs | 45 % des champs n'engendrent rien | G24 : totalité + G16 : discrimination | visite triviale d'un champ | 🔴 (PROTOCOL-D003) |
| **R-12** | `testID` sur nœud décoratif | faux PASS d'instrumentation | contrôle « adressable » mais faux | croisement arbre a11y ↔ plan | — | 🟠 |
| **R-13** | Falsification à l'écriture | registre fictif vérifié rigoureusement | l'acteur écrit lui-même ses preuves | preuve = **sortie brute d'instrument**, hachage recalculé | instrument compromis | 🟠 |
| **R-14** | Adversaire corrélé | réfutation surestimée | même modèle que le générateur | mode 3 + double passe ; autre modèle ou humain | données d'entraînement partagées | 🔴 **non résolu** |
| **R-15** | Fatigue humaine | le seul organe non corrélé signe sous pression | trop de gates humaines | critères pré-enregistrés, évaluation en aveugle, **très peu de gates humaines** | irréductible | 🟠 |
| **R-16** | Optimisation contre un protocole public | CERTIFIED sans mérite | gates connues, déterministes, finies | aléa (pool tiré au sort) **ou** humain imprévisible | coûte reproductibilité ou échelle | 🟠 **borné** |
| **R-17** | Croyance fausse mais cohérente (L4) | PASS complet sur un produit faux | AIR faux, tous les organes cohérents | **utilisateur réel · expert · norme externe** | rien d'interne | 🔴 **irréductible** |
| **R-18** | Conforme mais inutilisable (L2) | PASS sur produit pénible | 11 champs texte à libellés techniques | humain + référence externe | non mécanisable | 🔴 **irréductible** |
| **R-19** | Mauvais produit (L3) | résout le mauvais problème | — | expert de domaine | non mécanisable | 🔴 **irréductible** |
| **R-20** | Contamination du corpus scellé | fausse preuve OOD | corpus produit par le même modèle | source humaine, provenance signée | familiarité indirecte | 🟠 |
| **R-21** | Agent LLM exécutant les tâches | faux PASS d'utilisabilité | **l'agent réussit là où un humain échouerait** (lit l'arbre a11y, ne se décourage pas) | séparer strictement : agent ⇒ faisabilité · humain ⇒ utilisabilité | — | 🟠 |
| **R-22** | Protocole comme refuge | paralysie par la rigueur | raffiner plutôt que construire | G23 : ratio de construction | — | 🟠 **alarme active : 9 sessions d'analyse, 1 de construction** |
| **R-23** | Déclencheur hors enveloppe comptant comme chemin | G4 défaite | 4 actions `data` inertes effacent tous les écrans morts | KT-G04-B01 | l'origine d'un chemin doit être **atteignable ET son déclencheur dans l'enveloppe** | non testée | 🔴 **OUVERT** (PROTOCOL-D004) |
| **R-24** | Condition de visibilité insatisfiable | interface morte invisible à la mesure | conditionner un contrôle pour le soustraire à l'observation | KT-G05-B02 | obligation de satisfiabilité de `visibleWhen` | non testée | 🔴 **OUVERT** (PROTOCOL-D005) |
| **R-25** | **Composition de faiblesses bornées** | attaque exploitable née de deux 🟠 | *(reformulé — voir la note R-25 ci-dessous)* | analyse de composition | **indéterminée — la sévérité seule ne suffit pas** | — | 🔴 **OUVERT — CONDITION D'EXPLOITABILITÉ ÉTABLIE, CAUSE NON IDENTIFIÉE** |

---

## NOTE R-25 — reformulation après EXP-1 (2026-08-30)

> **L'énoncé historique est conservé dans la ligne du tableau.** Cette note en
> corrige la portée, sans réécrire l'histoire.

**`FACT`** — `KT-C2-06` produit une composition **sans R-23 ni R-24** : retrait
de 5 `capabilities` (−5 écarts) et ajout d'un écran mort (+1 écart) ⇒ 5 → 1
écart, verdict `degraded` inchangé.
**Preuve** : `docs/elite-protocol/evidence/kt2.mjs`.

**`FACT`** — `exp1b.mjs` : le comptage est strictement additif (2+2=4) ; ce qui
bascule est l'**imputation** (`owner:document` 2 → 0).

**`CONCL.` établie** — R-25 **n'est PAS** une conséquence compositionnelle
nécessaire de D004/D005 : il survit à leur absence.

**🔴 NON ÉTABLI — à ne pas promouvoir** — deux conditions ont été *observées*
en accompagnement de chaque instance :
- `C1` agrégation sur une population d'écarts partiellement contrôlée par le
  producteur (**mesuré : 30,8 %** des 649 écarts du corpus sont retirables par
  soustraction déclarative) ;
- `C2` imputation déterminée par un calcul que le producteur contrôle.

**Ces deux conditions ne sont PAS établies comme causes nécessaires.** Aucune
expérience n'a testé R-25 en l'absence de C1, ni en l'absence de C2.

**Statut retenu** :

```
R-25 — CONDITION D'EXPLOITABILITÉ ÉTABLIE — CAUSE NON IDENTIFIÉE
```

**Conséquence normative** — une correction fondée sur C1 ou C2 seule serait
fondée sur une cause non démontrée. Aucune correction n'est autorisée par
cette note.

---

## R-26 — Cliquet de véracité écrit comme proxy syntaxique *(proposé, non versé)*

Un cliquet qui compare des **chaînes de caractères** dans le source atteste une
propriété **sémantique** qu'il ne mesure pas. Instance démontrée hors registre :
`PROTOCOL-D010`. **Statut : proposé — versement non autorisé par le plan figé.**

## R-27 — Volatilité des preuves *(résolu)*

Une preuve stockée hors dépôt cesse d'être une preuve (P-G). Instance :
`PROTOCOL-D014`. **Levée le 2026-08-30** par `docs/elite-protocol/evidence/`.
