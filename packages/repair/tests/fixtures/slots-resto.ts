// FIXTURES — implémentations de Code Slots CONFORMES pour le slice 1.
//
// Elles servent deux preuves à la fois :
//  1. qu'un code de slot RÉALISTE (et non un squelette vide) traverse la
//     politique AST sans violation ;
//  2. que la contrainte de pureté est TENABLE : aucune de ces fonctions
//     n'appelle l'horloge ni l'aléa — le temps arrive par une entrée
//     déclarée (`horodatage`, `maintenant`), exactement comme le corpus
//     gelé l'avait prévu. La contrainte n'a donc pas été inventée après
//     coup pour arranger la politique : elle était déjà dans les signatures.
export const SLOT_CALCUL_TOTAL_PANIER = `interface Ligne {
  quantite: number;
  prixUnitaire: number;
}
interface Entrees {
  lignes: readonly Ligne[];
  devise: string;
}
interface Sorties {
  total: number;
  totalAffiche: string;
}
export function runSlot(entrees: Entrees): Sorties {
  let total = 0;
  for (const ligne of entrees.lignes) {
    total = total + ligne.quantite * ligne.prixUnitaire;
  }
  const brut = Math.round(total).toString();
  let groupe = "";
  for (let i = 0; i < brut.length; i = i + 1) {
    const reste = brut.length - i;
    groupe = groupe + brut.charAt(i) + (reste > 1 && reste % 3 === 1 ? " " : "");
  }
  return { total, totalAffiche: groupe + " " + entrees.devise };
}
`;

export const SLOT_FORMAT_PRIX_FCFA = `interface Entrees {
  montant: number;
}
interface Sorties {
  libelle: string;
}
export function runSlot(entrees: Entrees): Sorties {
  const entier = Math.round(entrees.montant);
  const brut = Math.abs(entier).toString();
  let groupe = "";
  for (let i = 0; i < brut.length; i = i + 1) {
    const reste = brut.length - i;
    groupe = groupe + brut.charAt(i) + (reste > 1 && reste % 3 === 1 ? " " : "");
  }
  return { libelle: (entier < 0 ? "-" : "") + groupe + " FCFA" };
}
`;

export const SLOT_GENERER_REFERENCE_COMMANDE = `interface Entrees {
  horodatage: string;
  compteurJour: number;
}
interface Sorties {
  reference: string;
}
const PREFIXE = "MQ";
export function runSlot(entrees: Entrees): Sorties {
  const mois = entrees.horodatage.slice(5, 7);
  const jour = entrees.horodatage.slice(8, 10);
  const brut = entrees.compteurJour.toString();
  const rang = brut.length < 2 ? "0" + brut : brut;
  return { reference: PREFIXE + "-" + mois + jour + "-" + rang };
}
`;

export const SLOT_ESTIMER_HEURE_RETRAIT = `interface Ligne {
  quantite: number;
  minutesPreparation: number;
}
interface Entrees {
  lignes: readonly Ligne[];
  commandesEnCours: number;
  maintenant: string;
}
interface Sorties {
  heureRetrait: string;
  delaiMinutes: number;
}
const MINUTES_PAR_COMMANDE_EN_ATTENTE = 4;
export function runSlot(entrees: Entrees): Sorties {
  let preparation = 0;
  for (const ligne of entrees.lignes) {
    preparation = preparation + ligne.quantite * ligne.minutesPreparation;
  }
  const delaiMinutes = preparation + entrees.commandesEnCours * MINUTES_PAR_COMMANDE_EN_ATTENTE;
  const heures = Number(entrees.maintenant.slice(11, 13));
  const minutes = Number(entrees.maintenant.slice(14, 16));
  const total = heures * 60 + minutes + delaiMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const hh = h < 10 ? "0" + h.toString() : h.toString();
  const mm = m < 10 ? "0" + m.toString() : m.toString();
  return { heureRetrait: entrees.maintenant.slice(0, 11) + hh + ":" + mm + ":00Z", delaiMinutes };
}
`;

export const SLOT_LIBELLE_STATUT_COMMANDE = `interface Entrees {
  statut: string;
}
interface Sorties {
  libelle: string;
  annulable: boolean;
}
const LIBELLES = {
  recue: "Reçue",
  en_preparation: "En préparation",
  prete: "Prête",
  retiree: "Retirée",
  annulee: "Annulée",
};
const ANNULABLES = ["recue", "en_preparation"];
export function runSlot(entrees: Entrees): Sorties {
  const connu = LIBELLES[entrees.statut as keyof typeof LIBELLES];
  return {
    libelle: connu === undefined ? entrees.statut : connu,
    annulable: ANNULABLES.indexOf(entrees.statut) >= 0,
  };
}
`;

export const SLOTS_RESTO: readonly { slotId: string; source: string; authorId: string }[] = [
  { slotId: "slot_calcul_total_panier", source: SLOT_CALCUL_TOTAL_PANIER, authorId: "auteur-slots" },
  { slotId: "slot_estimer_heure_retrait", source: SLOT_ESTIMER_HEURE_RETRAIT, authorId: "auteur-slots" },
  { slotId: "slot_format_prix_fcfa", source: SLOT_FORMAT_PRIX_FCFA, authorId: "auteur-slots" },
  { slotId: "slot_generer_reference_commande", source: SLOT_GENERER_REFERENCE_COMMANDE, authorId: "auteur-slots" },
  { slotId: "slot_libelle_statut_commande", source: SLOT_LIBELLE_STATUT_COMMANDE, authorId: "auteur-slots" },
];
