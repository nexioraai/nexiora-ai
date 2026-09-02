# Endpoint statique — fil réel E3.3 (NON DÉPLOYÉ)

Option ③ arbitrée (2026-09-02) : fichier statique sur domaine possédé.
**Domaine gravé : `www.deribfy.com`** (metadataBase canonique d'apps/web —
échappatoire : changer `DOMAINE` dans `../construire-fixture.mjs` puis
relancer construire → emettre → verifier).

## Déploiement (sur autorisation propriétaire UNIQUEMENT)
1. Copier `air/` à la racine de `apps/web/public/` :
   `apps/web/public/air/v1/entities/ent_depart/rows` (fichier SANS extension).
2. Déployer apps/web par le canal habituel (`vercel --prod` = autorisation
   explicite requise, règle CLAUDE.md).
3. Contrôle : `curl -s https://www.deribfy.com/air/v1/entities/ent_depart/rows`
   doit renvoyer le tableau JSON (le Content-Type importe peu : le transport
   parse le corps, pas l'en-tête).

## Preuve de polling (« modification serveur »)
Remplacer le CONTENU de `rows` par celui de `rows.apres-modification`,
redéployer, attendre ≤ 30 s (refreshSeconds) sur l'appareil :
- Bouaké : prix 6500 → **7500**, statut → **retarde** (badge change) ;
- **Odienné** apparaît (nouvelle ligne servie, absente de la démo).

## Contrat de réponse
`GET /air/v1/entities/{entityId}/rows` → `[{ "id": string, "values": { champ: texte } }]`
— aucun secret, GET pur, hôte revérifié fail-closed par l'adaptateur embarqué.
