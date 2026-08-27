# BANC COÛTS UNITAIRES

Alimente le **Budget Governor** (ARCHITECTURE, MASTER_PLAN §5 « mesurer
avant de décider »). Trois volets.

---

## VOLET 1 — COÛT LLM PAR APPEL, AVEC/SANS PROMPT CACHING — **EXÉCUTÉ**

### Protocole (défini avant mesure)

- **Modèle** : `claude-opus-5` — défaut moteur acté (ARCHITECTURE §28).
- **Scénario** : forme du poste dominant du moteur — un **préfixe stable**
  (simulacre de contrats de blocs + registre de capabilities, texte
  déterministe ≥ 2 000 tokens, identique à chaque appel) suivi d'une
  question variable (simulacre de tâche de génération/réparation).
- **Bras** : A. sans `cache_control` (baseline) · B. avec `cache_control`
  {type: ephemeral} sur le préfixe, 1er appel = écriture cache ·
  C/D/E. trois appels suivants, questions différentes = lectures cache.
- **Mesures par appel** : latence murale ; `usage` complet
  (`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`,
  `output_tokens`) ; coût calculé aux tarifs publics [démontré] :
  entrée 5 $/MTok · écriture cache ×1,25 · lecture cache ×0,10 ·
  sortie 25 $/MTok.
- **Reproductibilité** : script `benchmarks/llm-cost/run.mjs` (préfixe
  déterministe, aucune donnée sensible) ; résultats bruts JSON horodatés
  dans `benchmarks/llm-cost/results/`.
- **Limites assumées** : mesure ponctuelle (latences non moyennées sur N
  runs — le coût, lui, est déterministe à tokens égaux) ; `max_tokens=200`
  borne le volet sortie.

### Résultats [mesuré] — campagne du 2026-08-27 (2 bras × 5 appels, coût total ≈ 0,27 $)

Bruts : `benchmarks/llm-cost/results/2026-08-27-claude-opus-5-*.json`.
Préfixe facturé : 6 826 tokens (cache) / 6 866 (baseline).

**1. Économie du caching : CONFIRMÉE.**
- Baseline sans cache : **0,0359 $**/appel. Lecture cache (bras adaptive,
  hits prouvés 3/3) : **0,0055 $**/appel en moyenne — **facteur global
  ×6,5**, et ×10 sur la seule entrée (6826 × 0,5 $/MTok = 0,0034 $ vs
  6866 × 5 $/MTok = 0,0343 $), conformément aux tarifs [démontré].
- Écriture cache : 0,0427 $ (×1,25 confirmé au token près).
- Latence lecture-cache : ~1,5 s ; appel abouti avec thinking : 5,5 s.

**2. DÉCOUVERTE MAJEURE : refus classifieur `cyber` sur des prompts de
forme moteur — 7 appels sur 10** (4/5 en adaptive, 3/5 en disabled),
`stop_reason: "refusal"`, `stop_details.category: "cyber"`. Le contenu est
pourtant trivial (contrats de blocs UI ; questions du type « pourquoi un
bloc ne fait-il aucun accès réseau direct ? ») — c'est le VOCABULAIRE
sécurité/permissions/violation, omniprésent dans les prompts réels du
moteur (policy gate, contrats, repair), qui déclenche. Échantillon n=10 :
l'EXISTENCE du phénomène est [mesuré], son taux précis reste [à mesurer].
- Un appel refusé **facture** l'entrée (et l'éventuelle sortie partielle).
- **Implication moteur (proposition d'amendement soumise au propriétaire,
  non appliquée)** : tout chemin LLM du moteur doit traiter
  `stop_reason: "refusal"` + stratégie de secours (paramètre serveur
  `fallbacks` / re-formulation), et le taux de refus devient une métrique
  du Budget Governor. À consigner dans `DECISIONS.md` après validation.
- Bras disabled, observation secondaire [probable] : après un refus
  pré-sortie, l'appel immédiatement suivant a RE-PAYÉ l'écriture cache
  (entrée lisible seulement après début de réponse du premier appel) —
  appels séquentiels immédiats = risque de double facturation d'écriture.

**3. Choix de bras confirmé** : le bras `disabled` a en outre montré des
lectures cache non fiables dans ce scénario ; le moteur reste sur thinking
adaptatif (défaut acté, ARCHITECTURE §28).

---

## VOLET 2 — COÛT ET DURÉE D'UN BUILD EAS — ⏳ (prérequis : compte Expo/EAS)

- Fixture : app Expo témoin (celle de P-003).
- Mesures : durée de build iOS et Android (froid, puis avec cache activé),
  file d'attente, $ par build au tarif public, builds/mois inclus par
  palier. 5 builds par plateforme minimum.
- Livrables : `benchmarks/eas/` (journaux + synthèse).

## VOLET 3 — COÛT ET DURÉE DE PROVISIONING D'UN PROJET SUPABASE — ⏳
(prérequis : token Management API sur une **org de test**)

- Mesures : durée création projet → première requête PostgREST servie ;
  durée teardown ; $ par projet/mois par palier [démontré, grille publique]
  + vérification facturation réelle sur le projet de test ; quotas de
  création (rate limits).
- Livrables : `benchmarks/supabase-provisioning/`.
