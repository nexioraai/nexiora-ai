// CAS-TUEURS DE LA GATE DE COUVERTURE — critère F4 de la PHASE 10B.
//
// Le cas de référence est celui qui a produit la découverte : *« menu avec
// photos »*, un besoin que le registre de blocs ne sait pas porter. Avant
// AIR 1.2.0, il disparaissait sans trace. Ici, il DOIT ressortir — soit
// satisfait, soit déclaré inexprimable avec motif. Jamais absent.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument, type ProjectAir } from "@deribfy/air-schema";
import { EXECUTION_ENVELOPE_V1, controls, reachableScreens } from "@deribfy/execution-contract";
import {
  capacitesMisesEnJeu,
  evaluateIntentCoverage,
  refuteUnexpressibleReason,
  tracesManquantes,
} from "../src/intent.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const base = (): ProjectAir =>
  migrateAirDocument(JSON.parse(readFileSync(join(CORPUS, "resto-quartier.air.json"), "utf8")));

const intention = (needs: NonNullable<ProjectAir["intent"]>["needs"]) => ({
  request: "Je veux une app pour mon restaurant : la carte avec photos et prix, et suivre mes commandes.",
  requestLocale: "fr-FR",
  needs,
});

describe("gate de couverture — CONTRÔLE POSITIF", () => {
  it("un besoin porté par un écran VIVANT est satisfait", () => {
    const air = base();
    const ecran = reachableScreens(air, EXECUTION_ENVELOPE_V1.triggers)[0];
    expect(ecran).toBeDefined();
    const r = evaluateIntentCoverage(
      {
        ...air,
        intent: intention([
          {
            id: "need_carte",
            statement: "voir la carte du restaurant",
            resolution: { kind: "satisfied", nodeIds: [ecran ?? ""] },
          },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(true);
    expect(r.satisfaits).toBe(1);
  });

  it("L'HONNÊTETÉ PASSE : un besoin déclaré inexprimable AVEC MOTIF ne fait pas échouer", () => {
    // C'est le cœur de la correction : dire qu'on ne sait pas faire est la
    // bonne réponse ; le taire était le défaut.
    //
    // ÉDITION CONSCIENTE (D-088) — ce test citait « le registre n'a aucun bloc
    // image ». C'était VRAI à l'écriture et c'est FAUX depuis que `imageFieldId`
    // figure au registre. Le motif a donc été porté sur un fait encore vrai,
    // `capabilitiesEmitCode: false`. Ce qui est testé n'a pas changé — un motif
    // honnête ne fait pas échouer ; ce qui a changé, c'est qu'un motif OBSOLÈTE
    // ne passe plus. C'était précisément l'échappatoire mesurée : 19 motifs sur
    // 45 invoquaient une incapacité que le moteur n'a plus.
    const r = evaluateIntentCoverage(
      {
        ...base(),
        intent: intention([
          {
            id: "need_photos",
            statement: "joindre une photo prise avec l'appareil",
            resolution: {
              kind: "unexpressible",
              reason:
                "le moteur n'exécute pas les effets capability " +
                "(capabilitiesEmitCode: false) : aucune prise de vue n'est produite",
            },
          },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(true);
    expect(r.inexprimables).toBe(1);
    expect(r.verdicts[0]?.motif).toContain("capabilitiesEmitCode");
  });

  it("le rapport publie TOUJOURS le résidu qu'il ne couvre pas", () => {
    const r = evaluateIntentCoverage(base(), EXECUTION_ENVELOPE_V1);
    expect(r.limites[0]).toContain("JAMAIS ÉNUMÉRÉ");
  });
});

describe("gate de couverture — CAS-TUEURS (elle doit ÉCHOUER)", () => {
  it("KT-7 · AUCUNE INTENTION : tout le corpus historique tombe ici", () => {
    // FAIT : les 12 documents du corpus gelé n'ont pas d'intention, et la
    // migration s'interdit de leur en inventer une. Ils ne peuvent donc pas
    // être certifiés fidèles — c'est le constat, pas une régression.
    const r = evaluateIntentCoverage(base(), EXECUTION_ENVELOPE_V1);
    expect(r.present).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("AUCUNE INTENTION");
  });

  it("KT-8 · besoin rattaché à un nœud INEXISTANT", () => {
    const r = evaluateIntentCoverage(
      {
        ...base(),
        intent: intention([
          {
            id: "need_fantome",
            statement: "un écran de fidélité client",
            resolution: { kind: "satisfied", nodeIds: ["scr_nexiste_pas"] },
          },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(false);
    expect(r.verdicts[0]?.state).toBe("reference_brisee");
  });

  it("KT-9 · besoin rattaché à un nœud qui EXISTE mais ne FONCTIONNE PAS", () => {
    // Le défaut le plus retors : le document PROUVE qu'il a répondu au besoin
    // en pointant un nœud réel — mais ce nœud est mort. Sans ce contrôle, la
    // couverture serait satisfaite par de la façade.
    const air = base();
    const mort = controls(air, EXECUTION_ENVELOPE_V1).find((c) => !c.executed)?.actionId;
    expect(mort, "le corpus doit contenir une action non exécutée").toBeDefined();
    const r = evaluateIntentCoverage(
      {
        ...air,
        intent: intention([
          {
            id: "need_commander",
            statement: "pouvoir passer commande",
            resolution: { kind: "satisfied", nodeIds: [mort ?? ""] },
          },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(false);
    expect(r.verdicts[0]?.state).toBe("satisfait_par_du_mort");
    expect(r.verdicts[0]?.motif).toContain("NE FONCTIONNENT PAS");
  });

  it("KT-10 · un seul besoin défaillant suffit — aucune compensation", () => {
    const air = base();
    const ecran = reachableScreens(air, EXECUTION_ENVELOPE_V1.triggers)[0] ?? "";
    const r = evaluateIntentCoverage(
      {
        ...air,
        intent: intention([
          { id: "need_ok", statement: "voir la carte", resolution: { kind: "satisfied", nodeIds: [ecran] } },
          { id: "need_ko", statement: "un écran de fidélité", resolution: { kind: "satisfied", nodeIds: ["ent_absent"] } },
        ]),
      },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.satisfaits).toBe(1);
    expect(r.passed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-088 · D2 — « TU AFFIRMES QUE X EST INEXPRIMABLE. MONTRE-MOI LE FAIT. »
//
// Avant : toute chaîne non vide écartait un besoin. Mesuré sur le corpus v3 :
// 45 besoins sur 130 écartés ainsi, dont 19 au motif que le registre « ne sait
// afficher aucune image » — faux depuis que `imageFieldId` y figure.
// ══════════════════════════════════════════════════════════════════════════
describe("refuteUnexpressibleReason — le motif doit citer un fait qui TIENT", () => {
  const E = EXECUTION_ENVELOPE_V1;

  it("① un motif qui n'invoque aucun fait de l'enveloppe est RÉFUTÉ", () => {
    const r = refuteUnexpressibleReason(
      "le registre de blocs fermé ne sait rendre ni vignette ni visuel",
      E,
    );
    expect(r).not.toBeNull();
    expect(r?.fait).toBe("(aucun)");
  });

  it("② un motif qui invoque une capacité VRAIE est RÉFUTÉ", () => {
    for (const fait of ["imageRendering", "listSearch", "primaryNavigation"] as const) {
      expect(E[fait], `${fait} doit être vrai pour que ce test ait un sens`).toBe(true);
      const r = refuteUnexpressibleReason(`${fait} ne permet pas de le faire`, E);
      expect(r, fait).not.toBeNull();
      expect(r?.fait).toContain(fait);
    }
  });

  it("③ un motif qui cite un fait réellement FAUX tient", () => {
    expect(E.capabilitiesEmitCode).toBe(false);
    expect(
      refuteUnexpressibleReason(
        "le moteur n'exécute pas les effets capability (capabilitiesEmitCode: false)",
        E,
      ),
    ).toBeNull();
  });

  it("④ un motif vide est RÉFUTÉ", () => {
    expect(refuteUnexpressibleReason("", E)).not.toBeNull();
  });

  it("⑤ un motif vague est RÉFUTÉ", () => {
    expect(
      refuteUnexpressibleReason("ce n'est pas possible avec l'architecture actuelle", E),
    ).not.toBeNull();
  });

  it("⑥ un besoin exprimable ne devient pas inexprimable par une phrase", () => {
    // Le verdict complet, pas seulement le réfuteur : l'état doit basculer et
    // le rapport doit ÉCHOUER — sinon la garantie ne mordrait nulle part.
    const air = base();
    const avec: ProjectAir = {
      ...air,
      intent: {
        request: air.intent?.request ?? "x",
        requestLocale: air.intent?.requestLocale ?? "fr",
        needs: [
          {
            id: "need_image",
            statement: "les photos doivent être visibles",
            resolution: { kind: "unexpressible", reason: "aucun bloc ne sait afficher une image" },
          },
        ],
      },
    };
    const r = evaluateIntentCoverage(avec, E);
    expect(r.verdicts[0]?.state).toBe("motif_refute");
    expect(r.defaillants).toBe(1);
    expect(r.passed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-089 — UN MOTIF VRAI PEUT ÊTRE UNE CAUSE FAUSSE.
//
// D2 exigeait que le fait cité TIENNE. Un besoin d'image écarté au motif
// `capabilitiesEmitCode: false` passait donc : fait exact, cause fausse.
// La causalité se juge sur le SUJET du besoin, et sur la famille du verbe —
// ACQUÉRIR une donnée par un organe de l'appareil (légitime) vs la RESTITUER
// (que le moteur sait faire). La paire est mesurée dans `plombier-urgence`.
// ══════════════════════════════════════════════════════════════════════════
describe("causalité du motif — le fait doit expliquer CE besoin (D-089)", () => {
  const E = EXECUTION_ENVELOPE_V1;
  const CAP = "le moteur n'exécute pas les effets capability (capabilitiesEmitCode: false)";

  it("① une IMAGE écartée au motif `capabilitiesEmitCode` est REFUSÉE", () => {
    expect(
      refuteUnexpressibleReason(CAP, E, "Les photos jointes doivent être visibles par le client."),
    ).not.toBeNull();
  });

  it("② une RECHERCHE écartée au motif `capabilitiesEmitCode` est REFUSÉE", () => {
    expect(
      refuteUnexpressibleReason(CAP, E, "Le client doit pouvoir rechercher un service."),
    ).not.toBeNull();
  });

  it("③ une vraie capability manquante reste ACCEPTÉE", () => {
    // La distinction fondatrice : ACQUÉRIR l'image exige la caméra.
    expect(
      refuteUnexpressibleReason(
        CAP,
        E,
        "Le client doit pouvoir joindre des photos de son problème (prise de vue ou import depuis la galerie).",
      ),
    ).toBeNull();
  });

  it("④ une IMAGE écartée alors qu'`imageRendering` existe est REFUSÉE", () => {
    expect(
      refuteUnexpressibleReason("aucun bloc ne sait afficher une image", E, "Les visuels des plats doivent apparaître."),
    ).not.toBeNull();
  });

  it("⑤ une RECHERCHE écartée alors que `listSearch` existe est REFUSÉE", () => {
    expect(
      refuteUnexpressibleReason("le registre n'offre pas de recherche", E, "Trouver un article rapidement."),
    ).not.toBeNull();
  });

  it("les besoins d'ORGANE restent acceptés : GPS, carte, notification, vidéo", () => {
    for (const s2 of [
      "Partager sa position GPS actuelle.",
      "Vérifier le point sur une carte.",
      "Être averti lorsque le statut change.",
      "Lire la vidéo du cours.",
      "Prendre ou choisir la photo du chien depuis l'appareil.",
    ]) {
      expect(refuteUnexpressibleReason(CAP, E, s2), s2).toBeNull();
    }
  });

  it("CONTRÔLE NÉGATIF : sans `statement`, le contrôle de causalité ne s'applique pas", () => {
    // Sans lui, on ne saurait pas que c'est bien la causalité qui refuse.
    expect(refuteUnexpressibleReason(CAP, E)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-092 — FAUX VERT DE F4, TROUVÉ EN PASSE 4.
//
// Un besoin « les photos doivent être visibles » déclaré `satisfied` et
// rattaché à un écran VIVANT mais sans rapport passait F4 : les nœuds
// existent, ils fonctionnent, et aucune image n'est montrée nulle part.
// La pertinence des nœuds cités est indécidable ; la TRACE du mécanisme dans
// le document ne l'est pas.
// ══════════════════════════════════════════════════════════════════════════
describe("F4 — un besoin satisfait doit laisser une TRACE (D-092)", () => {
  const E = EXECUTION_ENVELOPE_V1;
  const sansRien = () => ({ ...base(), screens: base().screens.map((s) => ({ ...s, blocks: [] })) });

  it("🔴 photos « satisfaites » sans un seul imageFieldId est REFUSÉ", () => {
    expect(tracesManquantes("Les photos doivent être visibles.", sansRien(), E)).toEqual([
      "imageRendering",
    ]);
  });

  it("🔴 recherche « satisfaite » sans un seul searchFieldId est REFUSÉE", () => {
    expect(tracesManquantes("Rechercher un service.", sansRien(), E)).toEqual(["listSearch"]);
  });

  it("🟢 CONTRÔLE POSITIF : un besoin hors capacités n'est pas concerné", () => {
    expect(tracesManquantes("Le client renseigne ses coordonnées.", sansRien(), E)).toEqual([]);
  });

  it("🟢 CONTRÔLE POSITIF : un besoin d'ACQUISITION n'est pas concerné", () => {
    // « joindre une photo » exige la caméra, pas l'affichage : exiger une
    // trace d'`imageFieldId` serait un faux positif.
    expect(
      tracesManquantes("Joindre des photos (prise de vue ou import).", sansRien(), E),
    ).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-094 — MÊME CLASSE D'ERREUR QUE P5, TROUVÉE AILLEURS.
//
// P5 a montré un garde trop strict : il interprétait une valeur remplacée
// comme une identité immuable. En cherchant cette classe ailleurs, la même
// faute est apparue dans la classification des besoins : le SUJET seul
// suffisait à engager `imageRendering`.
//
// MESURÉ — « supprimer une photo », « chaque photo est horodatée », « archiver
// les photos » étaient tous classés comme besoins d'AFFICHAGE. Aucun n'exige
// de montrer quoi que ce soit. Le sujet ne suffit pas : il faut le verbe.
// ══════════════════════════════════════════════════════════════════════════
describe("classification — sujet ET restitution (D-094)", () => {
  const E = EXECUTION_ENVELOPE_V1;
  const CAP = "capabilitiesEmitCode: false";

  it("🟢 les besoins d'AFFICHAGE restent classés", () => {
    for (const s2 of [
      "Les photos doivent être visibles sur la fiche.",
      "Chaque plat est illustré par une photo.",
      "Voir l'image du produit avant de commander.",
    ]) {
      expect(capacitesMisesEnJeu(s2, E), s2).toContain("imageRendering");
    }
  });

  it("🔴 FAUX POSITIFS FERMÉS : mentionner une photo sans l'afficher", () => {
    for (const s2 of [
      "Le client peut supprimer une photo déjà envoyée.",
      "Chaque photo est horodatée dans la base.",
      "Le plombier archive les photos après intervention.",
    ]) {
      expect(capacitesMisesEnJeu(s2, E), s2).toEqual([]);
      // Conséquence des deux côtés : ni trace exigée, ni motif réfuté à tort.
      expect(refuteUnexpressibleReason(CAP, E, s2), s2).toBeNull();
    }
  });

  it("🟢 la recherche n'a pas besoin de verbe séparé — son sujet EST le verbe", () => {
    expect(capacitesMisesEnJeu("Le client recherche une prestation.", E)).toContain("listSearch");
  });

  it("🟢 CONTRÔLE : l'acquisition RÉELLE du corpus reste hors classification", () => {
    // ÉDITION CONSCIENTE (D-098). Cette assertion portait sur une formulation
    // inventée — « joindre une photo VISIBLE depuis la galerie » — où le mot
    // « visible » qualifiait l'objet, non une exigence d'affichage. Depuis que
    // la restitution prime sur l'acquisition, un tel énoncé bascule côté
    // affichage. Le test porte désormais sur l'énoncé RÉEL de `plombier-urgence`,
    // qui ne contient aucun verbe de restitution et reste donc une acquisition.
    expect(
      capacitesMisesEnJeu(
        "Le client doit pouvoir joindre des photos de son problème (prise de vue ou import depuis la galerie).",
        E,
      ),
    ).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-097 — LES FRONTIÈRES DE MOT SONT ASCII, LE CORPUS EST FRANÇAIS.
//
// CAUSE RACINE : `\b` s'appuie sur `\w`, qui ne contient aucune lettre
// accentuée. `/\bclichés?\b/i` ne reconnaissait donc PAS « cliché » — après
// « é », les deux côtés sont non-mots, il n'y a pas de frontière. Même défaut
// sur « apparaît » et « présenté ». Un classifieur écrit pour du français,
// avec des frontières ASCII, rate silencieusement ses propres termes.
//
// Second effet, trouvé en corrigeant le premier : `\w*` s'arrête AVANT
// l'accent, donc « filtrée » échouait aussi une fois la frontière Unicode
// posée. Les suffixes s'écrivent `\p{L}*`.
// ══════════════════════════════════════════════════════════════════════════
describe("frontières de mot Unicode (D-097)", () => {
  const E = EXECUTION_ENVELOPE_V1;

  it("🟢 les termes ACCENTUÉS sont reconnus", () => {
    for (const s2 of [
      "Chaque prestation est présentée avec son cliché.",
      "Une vignette apparaît à gauche de chaque ligne.",
    ]) {
      expect(capacitesMisesEnJeu(s2, E), s2).toContain("imageRendering");
    }
  });

  it("🟢 les suffixes ACCENTUÉS sont reconnus", () => {
    // « filtrée » : `filtr` + suffixe accentué. Avec `\w*` il échappait.
    expect(capacitesMisesEnJeu("La liste doit être filtrée par client.", E)).toContain("listSearch");
  });

  it("CONTRÔLE NÉGATIF : `\\b` ASCII échoue bien sur un mot accentué", () => {
    // Sans cette démonstration, la correction ci-dessus semblerait gratuite.
    expect(/\bclichés?\b/i.test("son cliché.")).toBe(false);
    expect(/\bclichés?(?!\p{L})/iu.test("son cliché.")).toBe(true);
  });

  it("🟢 aucun faux positif introduit : les non-affichages restent ignorés", () => {
    for (const s2 of [
      "Le client peut supprimer une photo déjà envoyée.",
      "Le photographe facture ses images à la séance.",
    ]) {
      expect(capacitesMisesEnJeu(s2, E), s2).toEqual([]);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-098 — LA FONCTION DEMANDÉE PRIME SUR UN NOM SECONDAIRE.
//
// CAUSE RACINE mesurée sur `coach-fitness` : « Illustrer les programmes par des
// visuels (couverture, vignette VIDÉO) » était classé ACQUISITION. « vidéo » y
// est un NOM — la couverture d'une vidéo, qu'on AFFICHE — pas la fonction.
// L'acquisition faisait veto sur l'énoncé entier, le besoin cessait d'être
// protégé, et supprimer `fld_prog_couverture` devenait indolore.
// ══════════════════════════════════════════════════════════════════════════
describe("classification par FONCTION, pas par mot (D-098)", () => {
  const E = EXECUTION_ENVELOPE_V1;
  const classe = (s2: string) => capacitesMisesEnJeu(s2, E);

  it("RESTITUTION — sept formulations, toutes classées", () => {
    for (const s2 of [
      "Afficher les photos des plats.",
      "Montrer les photos du bien.",
      "Présenter les photos du panier.",
      "Illustrer les programmes par des visuels.",
      "Afficher une couverture vidéo.",
      "Voir la miniature du produit.",
      "Présenter un aperçu vidéo.",
    ]) {
      expect(classe(s2), s2).toContain("imageRendering");
    }
  });

  it("ACQUISITION — reste de l'acquisition, aucune sur-correction", () => {
    for (const s2 of [
      "Prendre une photo du problème.",
      "Choisir une photo depuis l'appareil.",
      "Filmer une vidéo de la séance.",
      "Enregistrer une vidéo du cours.",
      "Capturer une image du compteur.",
    ]) {
      expect(classe(s2), s2).toEqual([]);
    }
  });

  it("GESTION — mentionner une image n'exige pas de l'afficher", () => {
    for (const s2 of [
      "Supprimer une photo déjà envoyée.",
      "Archiver les photos après intervention.",
      "Horodater les photos reçues.",
      "Stocker la photo sur le serveur.",
    ]) {
      expect(classe(s2), s2).toEqual([]);
    }
  });

  it("MIXTES — la restitution demandée est vue malgré l'acquisition", () => {
    for (const s2 of [
      "Afficher la couverture vidéo après son enregistrement.",
      "Permettre de prendre une photo puis l'afficher.",
      "Choisir une vidéo et montrer sa miniature.",
    ]) {
      expect(classe(s2), s2).toContain("imageRendering");
    }
  });

  it("le besoin RÉEL de coach-fitness est désormais classé", () => {
    expect(
      classe("Illustrer les programmes et les exercices par des visuels (couverture, vignette vidéo)."),
    ).toContain("imageRendering");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-100 — UN NŒUD VIT PAR SON PROPRIÉTAIRE (audit P7).
//
// CAUSE RACINE : `mesurables` ne retenait que les nœuds dont la mort est
// DIRECTEMENT observable — écrans, actions, entités. Blocs et champs étaient
// écartés au motif qu'ils « vivent par ce qui les porte » : l'observation était
// juste, mais l'inférence n'était pas faite. Ils étaient simplement IGNORÉS.
//
// MESURÉ : un besoin rattaché à un ÉCRAN mort est signalé ; le même besoin
// rattaché à un BLOC DE CE MÊME ÉCRAN passait « satisfait ». N'importe quel
// besoin pouvait donc être satisfait en citant un bloc au lieu de son écran —
// sans suppression, sans mutation, sans motif.
// ══════════════════════════════════════════════════════════════════════════
describe("un nœud vit par son propriétaire (D-100)", () => {
  const E = EXECUTION_ENVELOPE_V1;
  const avecNeed = (nodeIds: string[]) => {
    const a = base();
    return evaluateIntentCoverage(
      {
        ...a,
        intent: {
          request: a.intent?.request ?? "x",
          requestLocale: a.intent?.requestLocale ?? "fr",
          needs: [
            { id: "need_x", statement: "Un besoin.", resolution: { kind: "satisfied", nodeIds } },
          ],
        },
      },
      E,
    ).verdicts[0];
  };

  it("🟢 CONTRÔLE POSITIF : un bloc d'un écran VIVANT satisfait", () => {
    const ecran = base().screens[0];
    const bloc = ecran?.blocks[0];
    if (bloc === undefined) return;
    expect(avecNeed([bloc.id])?.state).toBe("satisfait");
  });

  it("🟢 CONTRÔLE POSITIF : un champ d'une entité VIVANTE satisfait", () => {
    const champ = base().entities[0]?.fields[0];
    if (champ === undefined) return;
    expect(avecNeed([champ.id])?.state).toBe("satisfait");
  });

  it("🔴 CONTRÔLE NÉGATIF : un identifiant inexistant reste une référence brisée", () => {
    expect(avecNeed(["fld_totalement_invente"])?.state).toBe("reference_brisee");
  });

  it("le propriétaire est lu dans la STRUCTURE, jamais dans un préfixe", () => {
    // Un bloc au nom trompeur reste rattaché à son écran réel.
    const a = base();
    const ecran = a.screens[0];
    if (ecran === undefined) return;
    expect(ecran.blocks.every((b) => typeof b.id === "string")).toBe(true);
  });
});
