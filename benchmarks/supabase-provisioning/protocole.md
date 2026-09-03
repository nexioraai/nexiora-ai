# BANC — COÛT ET DURÉE DE PROVISIONING D'UN PROJET SUPABASE (Volet 3)

Protocole ÉCRIT AVANT MESURE (règle des bancs du chantier). Source du
mandat : `docs/mobile-generation/benchmarks/couts-unitaires.md` (Volet 3)
et méthode consignée de P-004 (« mesure du coût réel de provisioning par
app »). Préparé le 2026-08-28 (ÉTAPE 0 autorisée par le propriétaire) ;
**exécution réelle uniquement après GO explicite du propriétaire sur le
rapport de simulation** (ÉTAPE 2).

## Objet mesuré

Le banc CRÉE lui-même un projet Supabase éphémère via la Management API —
l'acte de création EST la mesure — puis le détruit et prouve la
destruction. Aucun projet préexistant n'est l'objet du banc.

## Paramètres (validés propriétaire, 2026-08-28)

| Paramètre | Valeur | Justification |
|---|---|---|
| Organisation | slug fourni HORS DÉPÔT (allowlist dure du script) | org de test = celle validée par le propriétaire |
| Plan attendu | **Free** | banc à 0 $ ; plan vérifié par API AVANT création — tout autre plan ⇒ STOP |
| Nom du projet éphémère | `supabase-provisioning-bench` | choisi par le propriétaire |
| Région | **`us-east-1`** | = région de `nexiora-ai` (lecture seule d'une capture propriétaire) — mesure représentative des choix de production |
| Capacité | 1 place Free libre | `deribfy-mobile-test`, `sgd-dougouma`, `woorri-marketing-lab` en pause (ne comptent pas) ; seul `nexiora-ai` actif |

## Mesures (protocole consigné, Volet 3)

1. **Durée de création** : POST création → statut `ACTIVE_HEALTHY` →
   **première réponse servie par PostgREST** (première réponse HTTP < 500
   portant les en-têtes du projet, clé anon fournie) — horodatages
   intermédiaires journalisés (acceptation API, healthy, PostgREST).
2. **Durée de teardown** : DELETE → confirmation d'absence (GET 404 +
   relisting de l'org sans le ref).
3. **Quotas / rate limits** : en-têtes `X-RateLimit-*` relevés sur chaque
   appel Management API (aucune rafale : ≥ 1,1 s entre appels).
4. **Coût** : plan Free vérifié par API avant création (⇒ 0 $ par
   construction) ; grille payante = documentaire (tarifs publics) ;
   relevé de facturation de l'org après banc = vérification propriétaire
   au dashboard (aucune ligne attendue).

## Endpoints utilisés (et rien d'autre)

- `GET /v1/organizations` — vérification du slug + du plan (lecture) ;
- `POST /v1/projects` — création (LE seul appel créateur) ;
- `GET /v1/projects/{ref}` — sondage d'état (lecture) ;
- `GET /v1/projects/{ref}/api-keys` — clé anon pour la sonde (lecture) ;
- `GET https://{ref}.supabase.co/rest/v1/` — sonde PostgREST (lecture) ;
- `DELETE /v1/projects/{ref}` — teardown ;
- `GET /v1/projects` — relisting de confirmation (lecture).

## Garde-fous (codés en dur dans `run.mjs`)

1. **`--simulate` par défaut** : sans le drapeau `--execute`, AUCUN appel
   réseau n'est émis.
2. **Secrets hors dépôt** : `~/.deribfy-supabase-bench.env` (mode 600
   exigé, refus sinon) contenant `SUPABASE_ACCESS_TOKEN` et
   `SUPABASE_TEST_ORG_SLUG` ; jamais journalisés (le journal ne contient
   ni token, ni mot de passe DB, ni clé anon).
3. **Allowlist d'org** : tout écart entre le slug fourni et l'org résolue
   ⇒ STOP avant création.
4. **Plan Free exigé** : plan ≠ free détecté par API ⇒ STOP avant
   création (plafond de dépense : **0 $**).
5. **Périmètre destructif minimal** : le script ne DELETE que le ref
   retourné par SON PROPRE appel de création, dans le même run. Il ne
   liste jamais pour supprimer, ne touche jamais pause/restore, et ne
   connaît aucun autre ref. **`nexiora-ai` est donc hors d'atteinte par
   construction.**
6. **Teardown garanti** : `try/finally` — si la création a réussi, le
   teardown est TOUJOURS tenté ; échec de teardown ⇒ alerte rouge dans le
   journal + instructions de suppression manuelle + code de sortie ≠ 0.
7. **Timeout** : sondage `ACTIVE_HEALTHY` borné (15 min) ⇒ abandon +
   teardown.
8. **Rate limits respectés** : ≥ 1,1 s entre appels Management API.

## Critères de réussite (ÉTAPE 4)

Les 4 mesures journalisées (JSONL brut versionné) · teardown prouvé
(404 + relisting sans le ref) · 0 ressource résiduelle · dépense réelle
= 0 $ (plan Free vérifié) · script rejouable tel quel.

## Livrables

`results/*.jsonl` (bruts) + synthèse dans le rapport propriétaire
(ÉTAPE 5) : coût réel, durées, quotas, anomalies, preuves — conclusion
directement utilisable pour P-004.
