// CAMPAGNE D'ÉMISSION AIR (ROADMAP Phase 2, étape 2.4).
// 12 intentions de domaines distincts (marge sur le critère ≥ 10), couvrant
// les trois classes commerce. Textes FIXES — la campagne est rejouable.
export const INTENTIONS = [
  {
    slug: "resto-quartier",
    commerce: "physical_or_offapp",
    text:
      "Je tiens un petit restaurant de quartier à Abidjan. Je veux une app où mes clients " +
      "voient le menu avec photos et prix, commandent à emporter, paient par carte dans " +
      "l'app, et reçoivent une notification quand la commande est prête. En français.",
  },
  {
    slug: "salon-coiffure",
    commerce: "none",
    text:
      "Mon salon de coiffure a besoin d'une app de prise de rendez-vous : liste des " +
      "prestations avec durée, choix d'un créneau, rappel la veille par notification. " +
      "Le paiement se fait sur place, pas dans l'app. Français et anglais.",
  },
  {
    slug: "coach-fitness",
    commerce: "digital",
    text:
      "Je suis coach sportif. Je veux vendre un abonnement mensuel dans l'app qui " +
      "débloque mes programmes d'entraînement en vidéo et un suivi des séances. " +
      "L'abonnement s'achète directement dans l'app. En français.",
  },
  {
    slug: "boutique-mode",
    commerce: "physical_or_offapp",
    text:
      "Ma boutique de vêtements veut une app catalogue : articles par catégorie avec " +
      "photos, panier, paiement par carte, suivi de l'état de la commande, et scan d'un " +
      "code-barres en magasin pour voir la fiche d'un article. En français.",
  },
  {
    slug: "cours-cuisine",
    commerce: "digital",
    text:
      "Je vends des cours de cuisine en vidéo. L'app doit proposer les cours à l'achat à " +
      "l'unité dans l'app, la lecture des vidéos achetées, et mes recettes en accès libre. " +
      "En français et en anglais.",
  },
  {
    slug: "plombier-urgence",
    commerce: "none",
    text:
      "Je suis plombier. Mes clients doivent pouvoir décrire leur problème avec des " +
      "photos, partager leur adresse et position pour l'intervention, et suivre le statut " +
      "de leur demande. Devis et paiement se font hors de l'app. En français.",
  },
  {
    slug: "agence-immo",
    commerce: "none",
    text:
      "Mon agence immobilière veut une app d'annonces : biens avec photos et carte, " +
      "filtres par prix et quartier, demande de visite sur un créneau, favoris. Aucune " +
      "transaction dans l'app. En français.",
  },
  {
    slug: "livraison-fruits",
    commerce: "physical_or_offapp",
    text:
      "Je livre des paniers de fruits et légumes. L'app doit proposer les paniers de la " +
      "semaine, la commande avec paiement par carte, l'adresse de livraison avec position, " +
      "et une notification à la livraison. En français.",
  },
  {
    slug: "tuteur-langues",
    commerce: "digital",
    text:
      "Je suis tuteur de langues. Je veux vendre dans l'app des packs de leçons " +
      "interactives (achat dans l'app), avec suivi de progression et rappels quotidiens " +
      "de révision. Interface en français et en anglais.",
  },
  {
    slug: "toiletteur-chiens",
    commerce: "none",
    text:
      "Mon salon de toilettage pour chiens veut une app : fiche de chaque animal avec " +
      "photo, prise de rendez-vous, rappel de vaccination, historique des visites. " +
      "Paiement sur place uniquement. En français.",
  },
  {
    slug: "billetterie-concerts",
    commerce: "physical_or_offapp",
    text:
      "J'organise des concerts locaux. L'app doit lister les événements à venir, vendre " +
      "les billets par carte, afficher le billet avec un code à scanner à l'entrée, et " +
      "ajouter l'événement au calendrier du téléphone. En français.",
  },
  {
    slug: "suivi-chantier",
    commerce: "none",
    text:
      "Mon entreprise de BTP veut une app interne : chaque chef de chantier photographie " +
      "l'avancement, consigne les incidents, et le client consulte l'avancement de son " +
      "chantier hors ligne quand le réseau manque. En français.",
  },
  // D-126 (2026-09-02) — EXTENSION DU CORPUS, première intention du pivot
  // sectoriel voyage/transport. Périmètre MINIMAL HONNÊTE par construction :
  // recherche par destination seule (searchFieldId — le seul mécanisme rendu),
  // AUCUNE promesse de temps réel, de siège, de notification, de calendrier ni
  // de confirmation transporteur. Le débit réel sera « dit »
  // (capabilitiesEmitCode: false). Critères d'acceptation : annexe de D-126.
  {
    slug: "bus-intercites",
    commerce: "physical_or_offapp",
    text:
      "Ma compagnie de bus intercités vend des billets : l'app liste les départs à " +
      "venir avec destination, date, heure et prix, permet de chercher un départ par " +
      "destination, de réserver un billet au nom du passager, de payer par carte " +
      "dans l'app, puis présente le billet avec un code à montrer au contrôleur. " +
      "En français.",
  },
];
