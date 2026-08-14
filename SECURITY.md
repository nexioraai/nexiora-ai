# Politique de sécurité — Nexiora

La sécurité de Nexiora et des données de nos utilisateurs est une priorité absolue. Ce document décrit comment signaler une vulnérabilité et les engagements de notre équipe.

## Versions supportées

| Version           | Supportée          |
| ----------------- | ------------------ |
| Production (main) | :white_check_mark: |
| Branches de dev   | :x:                |

## Signaler une vulnérabilité

**Ne créez jamais d'issue publique pour une faille de sécurité.** Une divulgation publique expose tous les utilisateurs avant qu'un correctif soit déployé.

Contactez-nous en privé :

- **Email** : issayamiyoussouf@gmail.com
- **Objet** : `[SECURITY] Description courte`

Merci d'inclure :
- Une description de la vulnérabilité et de son impact
- Les étapes de reproduction (proof of concept si possible)
- Les versions / URLs concernées
- Toute suggestion de correctif

### Notre engagement

| Étape                          | Délai           |
| ------------------------------ | --------------- |
| Accusé de réception            | 72 heures       |
| Évaluation initiale            | 10 jours        |
| Correctif (faille critique)    | 14 jours        |
| Correctif (faille moyenne)     | 60 jours        |

Nous vous tiendrons informé à chaque étape et créditerons votre contribution (sauf demande contraire).

## Divulgation responsable

Nous vous demandons de :
- Nous laisser un délai raisonnable pour corriger avant toute divulgation publique
- Ne pas accéder, modifier ou supprimer des données ne vous appartenant pas
- Ne pas dégrader le service (pas de DoS, pas de spam)
- Agir de bonne foi

En retour, nous nous engageons à ne pas poursuivre en justice toute recherche menée dans le respect de cette politique.

## Portée

**Dans le périmètre :**
- L'application web Nexiora (nexiora.ca et sous-domaines)
- L'API de génération de sites
- Les sites et applications générés par la plateforme

**Hors périmètre :**
- Services tiers (Vercel, Supabase, Anthropic, Stripe) — signalez-les directement à ces fournisseurs
- Ingénierie sociale, phishing, attaques physiques
- Vulnérabilités nécessitant un accès physique à l'appareil d'un utilisateur

## Bonnes pratiques de sécurité (interne)

Mesures appliquées sur Nexiora :

- **Row Level Security (RLS)** activée sur toutes les tables Supabase sensibles
- **Secrets** stockés exclusivement en variables d'environnement (jamais commités)
- `SUPABASE_SERVICE_ROLE_KEY` utilisée uniquement côté serveur, jamais exposée au client
- **Secret scanning et push protection** activés sur le dépôt GitHub
- **CodeQL** pour l'analyse statique du code
- **Dependabot** pour la veille sur les dépendances
- **HTTPS** forcé sur l'ensemble de la plateforme
- **Validation et sanitisation** des entrées utilisateur
- **Principe du moindre privilège** sur les accès base de données

## Contact

Pour toute question relative à la sécurité : **issayamiyoussouf@gmail.com**
