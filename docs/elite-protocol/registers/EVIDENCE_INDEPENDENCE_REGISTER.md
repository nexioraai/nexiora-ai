# EVIDENCE INDEPENDENCE REGISTER

> **Principe** : l'indépendance n'est pas une propriété d'une paire de
> preuves. Elle est **relative à une PROPOSITION**. Deux preuves peuvent être
> indépendantes vis-à-vis de « le compilateur est correct » et totalement
> dépendantes vis-à-vis de « la spécification est la bonne ».

## Huit axes de dépendance

`spécification · données · modèle · générateur · environnement · instrument ·
oracle logique · opérateur humain`

**Règle de comptage** : pour une proposition `P`, calculer l'**intersection
des dépendances** de ses preuves. Tout élément de l'intersection est une
**hypothèse de mode commun non vérifiée** — à éliminer ou à publier comme
risque résiduel.

| Niveau | Définition | Comptent pour deux preuves ? |
|---|---|---|
| **D0** totalement partagé | même modèle, même AIR, même instrument | 🔴 non |
| **D1** faible | ≤1 axe non critique partagé | 🟢 oui |
| **D2** significatif | 2-3 axes, aucun critique | 🟠 oui, avec mention |
| **D3** critique | ≥1 axe **critique** (spéc · modèle · oracle logique) | 🔴 **non** |

---

## ÉTAT MESURÉ DU CHANTIER — 2026-08-29

| Preuve | Spéc | Modèle | Générateur | Instrument | Oracle logique | Niveau |
|---|---|---|---|---|---|---|
| Validateurs | AIR | LLM | — | zod | déterministe | — |
| Oracle L1 | **AIR** | **LLM** | **compilateur** | recompilation | déterministe | **D3** |
| Sandbox | **AIR** | **LLM** | **compilateur** | npm/tsc | exit code | **D3** |
| Flows E2E | **AIR** | **LLM** | **compilateur** | Maestro | assertions | **D3** |
| Exécution émulateur | **AIR** | **LLM** | **compilateur** | adb + vision | **ce qui est observé** | **D2** |
| Moteur de conformité *(n'existe pas)* | — | **aucun** | — | registre | déterministe | **D1** |

### 🔴 Conséquences établies

**Intersection de TOUTES les preuves existantes = {AIR, modèle LLM, générateur}.**

1. **Aucune preuve actuelle ne peut détecter une erreur de l'AIR** — elles
   la présupposent toutes.
2. **L'Oracle recompile avec le même compilateur** : le déterminisme, plus
   grande force du moteur, garantit ici qu'il **reproduit un défaut de
   compilation à l'identique et le confirme**.
3. L'exécution sur émulateur casse le mode commun sur l'axe *oracle logique*
   — d'où sa productivité — **mais partage toujours l'AIR**.

> **Seule une source d'exigences extérieure à l'AIR casse le dernier mode
> commun.** C'est la justification formelle de l'obligation « référence de
> domaine externe » et du pool de tâches scellé.

---

## INDÉPENDANCE DE SOURCE (références externes, pool de tâches, corpus OOD)

| Niveau | Critère | Vérifiable mécaniquement ? |
|---|---|---|
| **INDEPENDENT** | producteur n'a vu ni l'AIR, ni le générateur, ni le protocole ; scellée **avant** | 🟢 provenance signée + horodatage antérieur |
| **PARTIALLY_INDEPENDENT** | producteur distinct mais a vu le domaine ou une version antérieure | 🟢 déclaration de provenance |
| **CORRELATED** | même modèle, ou dérivée de l'AIR | 🟢 empreinte du modèle et de la source |
| **INADMISSIBLE** | produite par le générateur ou son opérateur | 🟢 refus mécanique |

Le moteur de conformité peut vérifier ces quatre niveaux : **la provenance
est une métadonnée, pas un jugement.**

## Gabarit d'enregistrement

```
source · producteur · modèle · données · AIR connu ? · protocole connu ? ·
générateur connu ? · date de création · signature/provenance · niveau
```

**Aucune source externe n'est aujourd'hui enregistrée.**

---

## OÙ L'INDÉPENDANCE EST RÉELLEMENT NÉCESSAIRE

Résultat contre-intuitif, à ne pas oublier : **pour la majorité des
propriétés, l'indépendance de MODÈLE est inutile — l'instrument suffit.**

| Propriété | Indépendance requise | Pourquoi |
|---|---|---|
| conformité de processus | ❌ aucune | déterministe |
| comportement (bouton, persistance) | ❌ aucune | **l'instrument tranche** |
| géométrie, fluidité | ❌ aucune | mesure |
| **diagnostic causal** | 🟢 agent indépendant | jugement |
| **complétude du besoin** | 🔴 **humain / externe obligatoire** | aucun agent n'a la source |
| **usabilité, excellence** | 🔴 **humain obligatoire** | la propriété *est* la réaction humaine |

**Corollaire économique** : ne multipliez pas les agents, multipliez les
instruments. Un second agent identique coûte cher et prouve peu.
