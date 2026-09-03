# ORACLE REGISTER

> **Objectif** : éviter qu'une même hypothèse erronée contamine Generator +
> Validator + Adversaire + Moteur de conformité.

## Taxonomie des erreurs d'oracle, avec le test qui les révèle

| Erreur | Symptôme | Test révélateur | Utile ici ? |
|---|---|---|---|
| incomplet | rate des défauts réels | **mutation testing** | 🟢 essentiel |
| trop permissif | tout passe | **cas-tueur (P-E)** | 🟢 essentiel |
| trop strict | refuse du valide | corpus de vrais positifs | 🟢 |
| biaisé | ne passe que sur un type d'entrée | stratification par forme | 🟢 |
| **circulaire** | oracle et objet partagent leur source | **graphe d'indépendance** | 🟢 **critique** |
| contaminé | l'oracle a vu les réponses | séparation des données | 🟢 critique |
| mauvaise hypothèse | mesure autre chose que la propriété | metamorphic testing | 🟠 |
| obsolète | norme périmée | recherche externe datée | 🟢 |
| non représentatif | échantillon biaisé | matrice de nouveauté | 🟢 |
| **aveugle par nature** | la propriété n'est pas dans son champ | 🔴 **aucun test interne** | irréductible |

*Le plus rentable ici : **mutation testing** (prouve la discrimination) +
**graphe d'indépendance** (révèle la circularité). `differential testing`
est peu utile (pas de second générateur) ; `metamorphic` l'est modérément —
l'invariance au renommage en est un exemple déjà implémenté.*

---

## ORACLES PAR PROPRIÉTÉ

| Propriété | Observation | Oracle | Source de l'oracle | Risque de mode commun | Oracle indépendant ? | Limites | Statut |
|---|---|---|---|---|---|---|---|
| document valide | AIR | validateurs zod + sémantiques | schéma | 🟠 le schéma vient de l'équipe | non | ne juge pas la spéc | 🟢 |
| reproductibilité | recompilation | égalité de hachages | déterminisme | 🟢 faible | oui | ne dit rien de la qualité | 🟢 |
| ça compile | sandbox | code de sortie | toolchain | 🟢 | oui | **ne prouve pas que ça démarre** | 🟢 |
| **un contrôle agit** | tap + delta pixel | **causalité + contrôle négatif** | instrument | 🟢 **faible** | oui | ne dit pas si l'effet est le bon | 🟠 |
| **le bon effet** | entité nommée modifiée | assertion ciblée | plan | 🔴 dépend de l'AIR | non | — | 🟠 |
| **persistance** | mort du processus + relecture base | présence de la ligne | base | 🟢 faible | oui | — | 🟢 |
| géométrie | arbre a11y | bornes ≥ seuil | norme externe | 🟢 **faible** | oui | l'arbre décrit la vue, pas le rendu GPU | 🟢 |
| fluidité | `gfxinfo` | frames sous seuil | norme | 🟠 émulateur | oui | matériel ≠ émulateur | 🟠 |
| accessibilité | arbre a11y + lecteur d'écran | mesure **+ jugement** | WCAG + humain | 🟠 | partiel | la part sémantique reste un jugement | 🟠 |
| **complétude du besoin** | — | **expert / références** | 🔴 **externe obligatoire** | 🔴 **maximal si interne** | **doit l'être** | coûteux | 🔴 **inexistant** |
| **utilisabilité** | tâches réelles | **taux de réussite, utilisateurs réels** | 🔴 externe | 🔴 | doit l'être | 🔴 **un agent LLM produit un faux PASS** (R-21) | 🔴 inexistant |
| **excellence** | comparaison | **rang face à une population de référence** | 🔴 externe | 🔴 | doit l'être | jamais absolu, toujours relatif | 🔴 inexistant |

---

## CHAÎNE À PROTÉGER

```
Property → Observation → Oracle → Assertion → Verdict
```

**Question à poser à chaque maillon** : *quelle erreur commune pourrait
contaminer toute la chaîne ?*

🔬 **Réponse mesurée pour ce chantier** : **une erreur de l'AIR contamine la
chaîne entière**, pour toutes les propriétés sauf celles dont l'oracle est
un instrument physique (géométrie, frames, persistance en base).

## Architecture d'oracle robuste — quatre exigences cumulatives

1. **totalité** sur la grammaire du schéma (G24)
2. **discrimination** prouvée par cas-tueur issu du corpus réel (P-E)
3. **chemin d'implémentation distinct** d'au moins un producteur
4. **vérification de la TRANSITION**, pas de l'état final

*Aucune n'est suffisante seule. Aucune n'est aujourd'hui satisfaite.*
