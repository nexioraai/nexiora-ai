# packages/

Paquets du moteur de génération d'applications mobiles natives
(chantier `docs/mobile-generation/`).

**Vide par conception à ce stade.** Les paquets (schéma AIR, registre de
capabilities, primitives, smart blocks, compilateur, oracle, provisioner,
runtime…) n'apparaissent qu'à partir des Phases 2+ de
`docs/mobile-generation/ROADMAP.md`, après les bancs de mesure de la
Phase 1. Aucun code du générateur n'est autorisé ici avant.

Règles pour tout futur paquet :
- lint **bloquant** dès le premier commit (la dette lint de `apps/web`
  ne s'hérite pas) ;
- couvert par les cliquets d'architecture ;
- versionné et publié uniquement via le release train du chantier.
