// CLIQUET DE VÉRACITÉ DE L'ENVELOPPE — le test le plus important du paquet.
//
// Une enveloppe est une DÉCLARATION : elle peut mentir, et un mensonge y
// serait pire que le silence qu'elle remplace, puisqu'il serait scellé dans
// un rapport hashé. Ce cliquet confronte chaque affirmation de l'enveloppe
// au CODE RÉEL du moteur. Même patron que les `sourcesHash` du release
// train : on ne fait jamais confiance à une déclaration.
//
// Quand le moteur gagnera une capacité, CE FICHIER échouera en premier —
// c'est voulu : élargir l'enveloppe devient une ÉDITION CONSCIENTE, jamais
// une dérive.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXECUTION_ENVELOPE_V1 } from "../src/envelope.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..", "..");
const read = (rel: string): string => readFileSync(join(PKG, rel), "utf8");

// ÉDITION CONSCIENTE (2026-09-02, E1/E2 D-129) : la vérité des lignes vit
// désormais dans le module PUR `list-pipeline.ts` — le runtime consommé est
// la CONCATÉNATION des deux, comme le projet généré les embarque tous deux.
const RUNTIME =
  read("compiler/runtime/air-runtime.tsx") + read("compiler/runtime/list-pipeline.ts");
const DATA_PROVIDER = read("compiler/runtime/data-provider.tsx");
const EMIT_PROJECT = read("compiler/src/emit-project.ts");
const EMIT_MANIFESTS = read("compiler/src/emit-manifests.ts");
const TEMPLATE_PKG = read("compiler/template/package.json");

describe("véracité de l'enveloppe — effets", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-059) : le dispatcher a gagné une branche
  // `capability` — l'effet n'est plus AVALÉ, il est PRÉSENTÉ à un fournisseur.
  //
  // Mais **présenter n'est pas exécuter**, et `capability` N'ENTRE PAS dans
  // `effects` : le fournisseur par défaut REFUSE et trace, aucune capability
  // n'étant implémentée (`capabilitiesEmitCode: false`). L'y ajouter ferait
  // basculer les 61 promesses de capability du corpus de mortes à vivantes sans
  // qu'une seule ligne ne s'exécute — le faux vert exact que ce paquet existe
  // pour empêcher.
  //
  // Le test cesse donc d'exiger l'ÉGALITÉ branches = effets. Il exige la
  // propriété qui compte vraiment : tout effet DÉCLARÉ exécutable a sa branche,
  // et toute branche EN PLUS est justifiée par un refus explicite.
  it("tout effet déclaré a sa branche, et toute branche en plus REFUSE explicitement", () => {
    const branches = new Set(
      [...RUNTIME.matchAll(/effect\??\.kind === "(\w+)"/g)].flatMap((m) =>
        m[1] === undefined ? [] : [m[1]],
      ),
    );
    for (const effet of EXECUTION_ENVELOPE_V1.effects) expect(branches).toContain(effet);
    const enPlus = [...branches].filter(
      (b) => !(EXECUTION_ENVELOPE_V1.effects as readonly string[]).includes(b),
    );
    expect(enPlus).toEqual(["capability"]);
    // La branche en plus route vers un fournisseur dont le DÉFAUT refuse.
    expect(RUNTIME).toContain("capabilities.invoke");
    expect(read("compiler/runtime/capability-provider.tsx")).toContain("return false;");
    expect(EXECUTION_ENVELOPE_V1.capabilitiesEmitCode).toBe(false);
  });

  // ÉDITION CONSCIENTE (2026-08-31, D-061) : la mention « non-opération v1 » a
  // DISPARU du runtime — et c'est précisément le résultat recherché. Elle
  // couvrait `capability`/`mutation`/`slot` ; les trois ont désormais une
  // branche. Le test devient : le SEUL effet encore sans exécution est
  // `capability`, et il est routé vers un fournisseur qui REFUSE explicitement.
  it("aucun effet n'est silencieusement avalé", () => {
    const branches = new Set(
      [...RUNTIME.matchAll(/effect\??\.kind === "(\w+)"/g)].flatMap((m) =>
        m[1] === undefined ? [] : [m[1]],
      ),
    );
    // `slot` est invoqué au rendu, pas au dispatch : les trois autres passent ici.
    expect([...branches].sort()).toEqual(["capability", "mutation", "navigate"]);
    expect(RUNTIME).toContain("invoqué au RENDU");
  });
});

describe("véracité de l'enveloppe — déclencheurs", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-068) : 62 actions du corpus étaient
  // déclarées avec un déclencheur de CYCLE DE VIE et purement IGNORÉES — un pan
  // entier du contrat d'action sans implémentation. Les trois événements sont
  // désormais honorés. `data` reste absent : réagir à une création d'entité
  // suppose une source qui NOTIFIE, et le contrat de données n'en a pas.
  it("`ui` et `lifecycle` atteignent un composant ; `data` non (D-068)", () => {
    expect(EMIT_PROJECT).toContain('action.trigger.kind === "ui"');
    expect(EMIT_PROJECT).toContain('a.trigger.kind === "lifecycle"');
    expect(EMIT_PROJECT).not.toContain('trigger.kind === "data"');
    expect([...EXECUTION_ENVELOPE_V1.triggers].sort()).toEqual(["lifecycle", "ui"]);
    // Les trois événements du schéma sont couverts, sans exception muette.
    for (const e of ["screen_open", "screen_close", "app_start"]) {
      expect(EMIT_PROJECT).toContain(e);
    }
    expect(RUNTIME).toContain("AirScreenLifecycle");
  });
});

describe("véracité de l'enveloppe — opérations de données", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-061) : le contrat de données gagne
  // l'ÉCRITURE. Ces deux cliquets constataient que le moteur ne savait que LIRE
  // — 17 promesses de `mutation` du corpus en mouraient, et l'état `submitting`
  // d'un formulaire était inatteignable faute d'écriture à attendre.
  it("l'interface DataProvider expose EXACTEMENT les opérations déclarées", () => {
    const methods = [...DATA_PROVIDER.matchAll(/^ {2}(\w+)\??\(/gm)].map((m) => m[1]).sort();
    expect(methods).toEqual([
      "create",
      "getInstance",
      "listInstances",
      "remove",
      "status",
      "update",
    ]);
    expect([...EXECUTION_ENVELOPE_V1.dataOperations].sort()).toEqual([
      "create",
      "delete",
      "get",
      "list",
      "update",
    ]);
  });

  it("l'écriture est OPTIONNELLE : un fournisseur en lecture seule reste valide", () => {
    // La propriété qui compte : une source en lecture seule n'expose pas les
    // méthodes, donc l'appel est ABSENT — jamais un faux succès. C'est ce `?`
    // qui empêche `mutation` de devenir une promesse que rien ne fonde.
    for (const w of ["create?(", "update?(", "remove?("]) {
      expect(DATA_PROVIDER).toContain(w);
    }
    expect(DATA_PROVIDER).toContain("Retourne `true` si l'écriture a été HONORÉE");
  });
});

describe("véracité de l'enveloppe — états de blocs", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-060). Ces deux cliquets constataient
  // `APP-D003` : `AirForm` codait `state="ready"` EN DUR, `AirList` ne calculait
  // que `empty`/`ready`. Le fournisseur de données était purement synchrone —
  // `loading` était l'état d'une attente qui n'existait pas, `error` celui d'un
  // appel qui ne pouvait pas échouer.
  //
  // Le fait a changé : `DataProvider.status?()` rend les deux ATTEIGNABLES, et
  // le registre 1.1.0 les rend EXPRIMABLES sur `form` et `detail_header`.
  // Chaque état a été OBSERVÉ AU RENDU avec contrôle négatif
  // (`etats-atteints.obs.tsx`) AVANT d'entrer dans l'enveloppe — jamais l'inverse.
  it("les trois blocs à données atteignent loading/empty/error (D-060)", () => {
    // La condition MÉCANIQUE de l'atteignabilité : une source qui rapporte.
    expect(RUNTIME).toContain("useDataStatus");
    expect(DATA_PROVIDER).toContain("status?(entityId: string): DataStatus");
    for (const type of ["list", "detail_header", "form"] as const) {
      expect([...(EXECUTION_ENVELOPE_V1.reachableBlockStates[type] ?? [])].sort()).toEqual([
        "empty",
        "error",
        "loading",
        "ready",
      ]);
    }
    // Les blocs qui NE consomment PAS de données n'ont pas gagné d'état :
    // l'élargissement est ciblé, pas un assouplissement général.
    expect(EXECUTION_ENVELOPE_V1.reachableBlockStates.button).toEqual(["ready"]);
    expect(EXECUTION_ENVELOPE_V1.reachableBlockStates.header).toEqual(["ready"]);
  });
});

describe("véracité de l'enveloppe — capabilities", () => {
  it("l'émetteur de manifestes déclare lui-même n'implémenter aucune capability", () => {
    expect(EMIT_MANIFESTS).toContain("AUCUNE implémentation de capability");
    expect(EXECUTION_ENVELOPE_V1.capabilitiesEmitCode).toBe(false);
  });

  it("aucune dépendance d'implémentation de capability n'entre dans le projet émis", () => {
    // Les paquets déclarés par le registre v1 (expo-notifications, expo-sqlite,
    // @supabase/supabase-js, react-native-maps…) sont ABSENTS du gabarit.
    const deps = Object.keys(
      (JSON.parse(TEMPLATE_PKG) as { dependencies: Record<string, string> }).dependencies,
    );
    for (const pkg of [
      "expo-notifications",
      "expo-sqlite",
      "expo-sharing",
      "expo-camera",
      "react-native-maps",
      "@supabase/supabase-js",
    ]) {
      expect(deps).not.toContain(pkg);
    }
  });
});

describe("véracité de l'enveloppe — slots, règles, RTL, thème", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-058) : ce test constatait `DET-018` — le
  // compilateur ÉMETTAIT le code des slots, l'Oracle en refusait les
  // exfiltrations, et RIEN NE LES APPELAIT. 44 des 152 promesses mortes du
  // corpus visaient un slot. Le fait a changé : le runtime invoque désormais un
  // slot LIÉ. Le test ne vérifie plus une absence, il vérifie la CONDITION
  // EXACTE de l'invocation — sans quoi `slotsInvoked: true` deviendrait une
  // surdéclaration comme une autre.
  it("le runtime invoque un slot LIÉ, et lui seul (D-058)", () => {
    expect(RUNTIME).toContain("useSlotRegistry");
    expect(EXECUTION_ENVELOPE_V1.slotsInvoked).toBe(true);
    // La liaison est la condition : sans `binding`, aucune invocation n'est
    // possible puisque le compilateur n'émet alors AUCUNE `slotInvocations`.
    expect(EMIT_PROJECT).toContain("binding === undefined");
    // Et l'invocation reste hors du dispatcher : un slot n'est pas un effet de
    // pression, il est calculé au rendu. `effects` ne doit donc pas le porter.
    expect(EXECUTION_ENVELOPE_V1.effects).not.toContain("slot");
  });

  // ÉDITION CONSCIENTE (2026-08-31, D-062) : `air.rules` n'était lu NULLE PART.
  // Un document pouvait déclarer « le téléphone est obligatoire » et l'app
  // écrivait sans lui. Les règles de VALIDATION sont désormais évaluées avant
  // toute écriture, et une violation ANNULE la mutation.
  it("les règles de validation sont appliquées AVANT l'écriture (D-062)", () => {
    expect(EMIT_PROJECT).toContain("air.rules");
    expect(RUNTIME).toContain("reglesRespectees");
    expect(EXECUTION_ENVELOPE_V1.rulesEnforced).toBe(true);
    // Portée EXACTE : `authorization` n'est PAS appliquée — elle suppose une
    // identité que le moteur n'a pas. Ne pas le dire serait surdéclarer.
    expect(EMIT_PROJECT).toContain('r.kind === "validation"');
  });

  // ÉDITION CONSCIENTE (2026-08-31, D-063) : le non-négociable #16 est TENU.
  // `rtlSupported` était transporté par le schéma et lu par AUCUN étage : deux
  // documents, l'un RTL l'autre non, produisaient le MÊME artefact.
  it("`rtlSupported` produit un artefact DIFFÉRENT (non-négociable #16)", () => {
    expect(EMIT_PROJECT).toContain("rtlSupported");
    expect(EMIT_PROJECT).toContain("I18nManager.allowRTL(true)");
    expect(EXECUTION_ENVELOPE_V1.rtlFlagEffective).toBe(true);
  });

  it("`design.theme` n'est LU par aucun étage d'émission (seul `overrides` agit)", () => {
    // Assertion PRÉCISE : on vise l'ACCÈS À LA PROPRIÉTÉ, pas la chaîne —
    // `emit-project.ts` mentionne « design.theme transporté sans effet » dans
    // un commentaire ÉMIS, ce qui est vrai et ne doit pas faire échouer le
    // cliquet. Le contraste avec `air.design.overrides`, lui bien lu, prouve
    // que la mesure discrimine réellement.
    // ÉDITION CONSCIENTE (2026-08-31, D-067) : `design.theme` était transporté
    // et lu par AUCUN étage. Mesuré au banc anti-template : 12 thèmes déclarés,
    // UNE SEULE identité visuelle. Le nom fait désormais tourner la teinte.
    const theme = read("compiler/src/emit-theme.ts");
    expect(theme).toContain("air.design.theme");
    expect(theme).toContain("air.design.overrides");
    // Ce qui rend l'opération SÛRE, et que ce cliquet garde : seule la teinte
    // bouge, et l'encre est re-dérivée contre la surface la plus exigeante.
    expect(theme).toContain("rotateHue");
    expect(theme).toContain("contrasteMin");
    expect(EXECUTION_ENVELOPE_V1.themeNameEffective).toBe(true);
  });

  // ÉDITION CONSCIENTE (2026-08-31, D-066) : `useState` vivait DANS le
  // composant. Un utilisateur qui remplissait ses coordonnées, revenait vérifier
  // son panier puis repartait retrouvait un formulaire VIDE — abandon garanti
  // sur un parcours de commande.
  it("l'état d'un formulaire SURVIT au changement d'écran (D-066)", () => {
    // ÉDITION CONSCIENTE (D-087) : `useState` réapparaît dans le runtime pour
    // la SAISIE DE RECHERCHE, qui est délibérément LOCALE à une liste —
    // chercher dans un catalogue n'est pas un état d'application, et le
    // partager entre écrans surprendrait. L'état de FORMULAIRE, lui, reste
    // partagé : c'est ce que ce cliquet protège, et il le vérifie ci-dessous.
    expect(RUNTIME).toContain("useState(\"\")");
    expect(RUNTIME).toContain("useFormValues");
    expect(EXECUTION_ENVELOPE_V1.crossScreenFormState).toBe(true);
    // Portée déclarée, pas élargie : mémoire éphémère, aucune persistance.
    const store = read("compiler/runtime/form-state.tsx");
    expect(store).toContain("Aucune persistance");
    expect(store).not.toContain("AsyncStorage");
  });
});

describe("véracité de l'enveloppe — traversée de relation et filtrage", () => {
  // ÉDITION CONSCIENTE (2026-08-31, D-064) : la traversée existe, mais PAS là où
  // ce cliquet la cherchait. Il vérifiait que les BLOCS n'acceptent aucun chemin
  // de relation — et c'est toujours vrai : aucune prop `targetFieldId` ni
  // `relationPath`. La traversée vit sur le CHAMP (`referenceDisplayFieldId`),
  // pas sur le bloc : le document déclare quoi montrer, le runtime résout.
  // Un champ sans déclaration continue d'afficher son identifiant brut.
  it("la traversée vit sur le CHAMP, jamais sur le bloc (D-064)", () => {
    const defs = read("blocks/src/definitions.ts");
    expect(defs).toContain("const fieldRef = z.string()");
    // Les blocs restent sans notion de chemin : la propriété d'origine tient.
    expect(defs).not.toContain("targetFieldId");
    expect(defs).not.toContain("relationPath");
    // Et la résolution est CONDITIONNELLE à une déclaration du document.
    expect(RUNTIME).toContain("referenceDisplayFieldId");
    expect(RUNTIME).toContain("useResolveField");
    expect(EXECUTION_ENVELOPE_V1.relationTraversal).toBe(true);
  });

  // ÉDITION CONSCIENTE (2026-08-31, D-065) : une liste rendait TOUJOURS tout,
  // dans l'ordre du dataset. Elle peut désormais être triée, filtrée et bornée.
  it("le tri, le filtre et la borne sont des unions FERMÉES (D-065)", () => {
    const defs = read("blocks/src/definitions.ts");
    for (const prop of ["sortFieldId", "filterFieldId", "pageSize"]) {
      expect(defs).toContain(prop);
    }
    // Ce qui compte : AUCUNE expression arbitraire n'entre dans un document.
    // Trois opérateurs nommés, une direction nommée, une borne entière bornée.
    expect(defs).toContain('z.enum(["eq", "neq", "contains"])');
    expect(defs).toContain('z.enum(["asc", "desc"])');
    expect(defs).toContain("z.number().int().positive().max(200)");
    expect(EXECUTION_ENVELOPE_V1.listFiltering).toBe(true);
  });

  it("aucune expression libre n'est acceptée en guise de filtre", () => {
    const defs = read("blocks/src/definitions.ts");
    // Motifs de PROP, pas de simples mots : le commentaire de D-065 emploie
    // légitimement le mot « expression » pour dire qu'il n'en accepte aucune.
    for (const prop of ["where:", "query:", "expression:", "predicate:"]) {
      expect(defs).not.toContain(prop);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-088 — TROIS CLIQUETS SUR LES CAPACITÉS DE COMPOSITION.
//
// CAUSE : le moteur rendait les images ; l'enveloppe n'en disait rien ; un
// document généré a donc déclaré un besoin d'image INEXPRIMABLE au motif que
// « le registre ne sait rendre aucun visuel ». Le silence de l'enveloppe a
// produit un renoncement sincère mais faux.
//
// Les trois tests couvrent les trois sens de l'erreur, et pas seulement le
// premier : annoncer ce qui n'existe pas, TAIRE ce qui existe, et déclarer
// ce que le runtime n'exécute pas.
// ══════════════════════════════════════════════════════════════════════════

const BLOCK_DEFS = read("blocks/src/definitions.ts");
const BLOCK_COMPONENTS = read("blocks/src/components.tsx");
const PRIMITIVES = read("primitives/src/primitives.tsx");
const AIR_CONTRACT = read("air-schema/src/air.ts");

/**
 * Toute prop de capacité du registre GELÉ est rattachée à un fait d'enveloppe.
 * `null` = affichage textuel de base, couvert par l'existence même du bloc et
 * par `reachableBlockStates` : ces props ne sont pas une capacité SÉPARÉE.
 */
const PROP_TO_ENVELOPE: Readonly<Record<string, keyof typeof EXECUTION_ENVELOPE_V1 | null>> = {
  titleFieldId: null,
  subtitleFieldId: null,
  badgeFieldId: null,
  trailingFieldId: null,
  imageFieldId: "imageRendering",
  searchFieldId: "listSearch",
  searchPlaceholder: "listSearch",
  sortFieldId: "listFiltering",
  sortDirection: "listFiltering",
  filterFieldId: "listFiltering",
  filterOperator: "listFiltering",
  filterValue: "listFiltering",
  pageSize: "listFiltering",
  // E1/E2 (D-129) — décidés à l'ajout, comme le cliquet l'exige.
  userFilterFieldIds: "listUserFiltering",
  userFilterOperators: "listUserFiltering",
  userFilterInputTypes: "listUserFiltering",
  scopeFieldId: "relationScoping",
};

describe("véracité de l'enveloppe — capacités de composition (D-088)", () => {
  it("① capacité ANNONCÉE mais inexistante : chaque drapeau vrai a sa surface réelle", () => {
    // Un drapeau ne peut pas être vrai sans le moyen, pour le générateur, de
    // l'exprimer : une prop du registre gelé, ou un champ du contrat AIR.
    expect(EXECUTION_ENVELOPE_V1.imageRendering).toBe(true);
    expect(BLOCK_DEFS).toContain("imageFieldId");

    expect(EXECUTION_ENVELOPE_V1.listSearch).toBe(true);
    expect(BLOCK_DEFS).toContain("searchFieldId");
    expect(BLOCK_DEFS).toContain("searchPlaceholder");

    expect(EXECUTION_ENVELOPE_V1.primaryNavigation).toBe(true);
    expect(AIR_CONTRACT).toContain("primaryNavigationSchema");
  });

  it("② capacité DISPONIBLE mais tue : toute prop du registre est rattachée à l'enveloppe", () => {
    // LE cliquet anti-silence. Ajouter une prop de capacité au registre sans
    // décider de son statut d'enveloppe fait ÉCHOUER ce test — c'est
    // exactement la faute commise avec `imageFieldId` et `searchFieldId`.
    const props = [
      ...new Set(BLOCK_DEFS.match(/\b[a-zA-Z]+(?:FieldId|Placeholder|Direction|Operator|Value|Size)\b/g) ?? []),
    ].filter((p) => p !== "entityId");

    const orphelines = props.filter((p) => !(p in PROP_TO_ENVELOPE));
    expect(
      orphelines,
      `props du registre sans fait d'enveloppe : ${orphelines.join(", ")} — ` +
        "déclare-les dans PROP_TO_ENVELOPE, avec un drapeau ou `null` si c'est de l'affichage de base",
    ).toEqual([]);

    // Et le fait cité doit être VRAI : une prop offerte au générateur par un
    // registre gelé alors que l'enveloppe la dit fausse serait un piège.
    for (const [prop, champ] of Object.entries(PROP_TO_ENVELOPE)) {
      if (champ === null || !props.includes(prop)) continue;
      expect(EXECUTION_ENVELOPE_V1[champ], `${prop} → ${champ}`).toBe(true);
    }
  });

  it("③ capacité DÉCLARÉE mais non exécutable : le runtime consomme réellement les trois", () => {
    // Lire la prop ne suffit pas : il faut que la valeur atteigne le rendu.
    // IDENTIFIANTS ENTIERS, jamais `toContain` : un contrôle négatif a montré
    // que la sous-chaîne laissait passer `imageUriX` — donc un runtime cassé.
    // IMAGE — le bloc passe une source, la primitive la rend.
    expect(RUNTIME).toMatch(/\bimageUri\b/);
    expect(BLOCK_COMPONENTS).toMatch(/\bimageUri\b/);
    expect(PRIMITIVES).toMatch(/\bAppImage\b/);

    // RECHERCHE — la saisie filtre les lignes RÉELLES, pas un décor.
    expect(RUNTIME).toMatch(/\bsearchFieldId\b/);
    expect(RUNTIME).toMatch(/toLowerCase\(\)\s*\.includes\(/);

    // NAVIGATION PRIMAIRE — la barre est émise dans le projet compilé.
    expect(EMIT_PROJECT).toMatch(/\bPrimaryNav\b/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-088 — LE PROMPT DU GÉNÉRATEUR NE PEUT PLUS CONTREDIRE L'ENVELOPPE.
//
// CAUSE RACINE : le prompt REDISAIT en prose ce que le moteur sait faire.
// Le moteur a gagné les images et la recherche ; la prose est restée. Le
// générateur a donc appris que « le registre ne sait afficher NI IMAGE, NI
// RECHERCHE » et l'a répété dans 12 documents sur 12 — 42 promesses
// `test_besoin_non_rendable_*` et 19 motifs d'inexprimabilité en découlent.
//
// La correction n'est pas une reformulation : le prompt CALCULE désormais sa
// surface depuis `EXECUTION_ENVELOPE_V1`. Ces tests interdisent le retour de
// la paraphrase, et des trois formulations qui orientaient vers l'amputation.
// ══════════════════════════════════════════════════════════════════════════
const PROMPT_GENERATEUR = readFileSync(join(PKG, "..", "benchmarks/air-emission/emit-v3.mjs"), "utf8");

describe("le prompt du générateur est adossé à l'enveloppe (D-088)", () => {
  it("il IMPORTE l'enveloppe au lieu de la paraphraser", () => {
    expect(PROMPT_GENERATEUR).toContain("execution-contract/src/envelope.ts");
    expect(PROMPT_GENERATEUR).toContain("surfaceEnveloppe()");
  });

  it("il n'affirme AUCUNE incapacité que l'enveloppe dément", () => {
    // Formulations RÉELLEMENT trouvées dans le prompt, et mesurément nuisibles.
    const mensonges = [
      "ne sait\n   afficher NI IMAGE",
      "ne sait afficher NI IMAGE",
      "aucun bloc image",
      "ne comporte aucun bloc image",
      "ne sait rendre ni vignette",
    ];
    expect(EXECUTION_ENVELOPE_V1.imageRendering).toBe(true);
    expect(EXECUTION_ENVELOPE_V1.listSearch).toBe(true);
    for (const m of mensonges) {
      expect(PROMPT_GENERATEUR, `le prompt affirme encore : « ${m} »`).not.toContain(m);
    }
  });

  it("il ne recommande PLUS `unexpressible` par défaut", () => {
    // La phrase mesurée : 45 besoins sur 130 écartés, dont 19 à tort.
    // Aucune reproduction LITTÉRALE de l'ancienne consigne, fût-ce pour la nier :
    // le modèle lit la citation, pas la négation qui l'entoure.
    expect(PROMPT_GENERATEUR).not.toContain("Dans le doute, préfère");
    expect(PROMPT_GENERATEUR.toLowerCase()).not.toContain("dans le doute, préfère");
    expect(PROMPT_GENERATEUR).toContain("C'EST L'ISSUE PAR DÉFAUT");
  });

  it("il n'invite PLUS à supprimer un champ image plutôt qu'à l'afficher", () => {
    expect(PROMPT_GENERATEUR).not.toContain("NE LA DÉCLARE PAS comme champ");
  });

  it("il porte l'interdiction TRANSVERSE de réparer en supprimant", () => {
    expect(PROMPT_GENERATEUR).toContain("INTERDICTION DE RÉSOUDRE UN DÉFAUT EN SUPPRIMANT");
  });

  it("il exige qu'un motif d'inexprimabilité NOMME un drapeau de l'enveloppe", () => {
    // Miroir exact de `refuteUnexpressibleReason` : ce que le prompt demande
    // est ce que le validateur vérifie, sinon la boucle ne converge jamais.
    expect(PROMPT_GENERATEUR).toContain("NOMMER EXACTEMENT un drapeau");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-101 — CLIQUET ANTI-DÉRIVE DES ORACLES (audit P7).
//
// CLASSE DE DÉFAUT visée : « le moteur sait faire X, mais l'oracle ne sait pas
// observer X ». Elle a frappé deux fois sur données réelles — P5 (garde de
// réparation), P6 (`reachableScreens` ignorait `navigation.primary`) — et les
// deux fois APRÈS que le moteur eut gagné la capacité.
//
// `controls()` est immunisé : il LIT `envelope.effects` et `envelope.triggers`.
// `reachableScreens()` ne l'est pas : il énumère ses effets en dur. Un effet
// ajouté à l'enveloppe ne serait donc pas suivi, en silence.
//
// Ce cliquet ne corrige pas `reachableScreens` — il rend l'oubli IMPOSSIBLE :
// toucher aux effets ou aux déclencheurs de l'enveloppe fait échouer ce test,
// qui exige de statuer sur l'atteignabilité avant de continuer.
// ══════════════════════════════════════════════════════════════════════════
const GRAPHE = read("execution-contract/src/graph.ts");

describe("anti-dérive des oracles (D-101)", () => {
  it("tout EFFET de l'enveloppe est statué dans `reachableScreens`", () => {
    // `navigate` et `mutation` mènent à un écran ; les autres non. Ajouter un
    // effet oblige à trancher ici, explicitement.
    expect([...EXECUTION_ENVELOPE_V1.effects].sort()).toEqual(["mutation", "navigate"]);
    for (const effet of EXECUTION_ENVELOPE_V1.effects) {
      expect(GRAPHE, `l'effet \`${effet}\` n'est pas mentionné par le graphe`).toContain(
        `"${effet}"`,
      );
    }
  });

  it("tout DÉCLENCHEUR de l'enveloppe est statué dans `reachableScreens`", () => {
    expect([...EXECUTION_ENVELOPE_V1.triggers].sort()).toEqual(["lifecycle", "ui"]);
    for (const t of EXECUTION_ENVELOPE_V1.triggers) {
      expect(GRAPHE, `le déclencheur \`${t}\` n'est pas mentionné`).toContain(`"${t}"`);
    }
  });

  it("la navigation PRIMAIRE est une racine d'atteignabilité (D-099)", () => {
    expect(EXECUTION_ENVELOPE_V1.primaryNavigation).toBe(true);
    expect(GRAPHE, "reachableScreens doit lire navigation.primary").toContain(
      "navigation.primary",
    );
  });

  it("CONTRÔLE NÉGATIF : le cliquet sait détecter un effet non statué", () => {
    // Sans lui, un `toContain` qui ne trouve jamais rien passerait pour preuve.
    expect(GRAPHE.includes('"capability"')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-102 — LES DEUX DÉRIVATIONS RESTANTES (harnais d'invariants).
//
// Deux connaissances du runtime sont RECOPIÉES dans les oracles, sans lien
// avec leur source. C'est l'architecture qui a produit D-095 (états de bloc)
// et D-101 (effets d'atteignabilité) — elle ne doit plus passer inaperçue.
// ══════════════════════════════════════════════════════════════════════════
const FAISABILITE = read("execution-contract/src/feasibility.ts");

describe("dérivations recopiées (D-102)", () => {
  it("la liste d'AFFORDANCES de `controls()` est figée et statuée", () => {
    // `controls()` ne regarde que ces blocs. Un bloc qui gagnerait une
    // affordance sans entrer ici deviendrait un CONTRÔLE FANTÔME invisible.
    // L'invariant C2 du harnais le détecte sur le corpus ; ce cliquet force à
    // statuer dès la modification du registre.
    // ÉDITION CONSCIENTE (D-104). Ce test exigeait que la liste soit ÉCRITE
    // dans `graph.ts`. Elle ne l'est plus : `controls()` la DÉRIVE du registre,
    // qui est désormais la source unique partagée avec le validateur. La
    // dérivation est une garantie plus forte que le cliquet qui la surveillait.
    expect(GRAPHE, "controls() doit dériver du registre").toContain("BLOCS_AFFORDANTS");
    expect(GRAPHE, "plus aucune liste recopiée").not.toContain(
      '["button", "empty_state", "form", "list"]',
    );
    expect(BLOCK_DEFS, "le registre déclare l'affordance").toContain("porteAffordance");
  });

  it("`ALL_TRIGGERS` de la faisabilité couvre les déclencheurs du contrat", () => {
    // Cette liste énumère TOUS les déclencheurs possibles de l'AIR, pas ceux
    // que l'enveloppe exécute. Un déclencheur ajouté au contrat sans entrer
    // ici serait ignoré par l'analyse de faisabilité.
    expect(FAISABILITE).toContain('["ui", "lifecycle", "data"]');
    for (const t of EXECUTION_ENVELOPE_V1.triggers) {
      expect(FAISABILITE, `le déclencheur \`${t}\` doit y figurer`).toContain(`"${t}"`);
    }
  });

  it("CONTRÔLE NÉGATIF : les cliquets savent voir une absence", () => {
    // Deux jetons qui n'existent nulle part : si ces assertions passaient sur
    // n'importe quoi, les deux cliquets ci-dessus ne prouveraient rien.
    expect(GRAPHE.includes('"bloc_inexistant_temoin"')).toBe(false);
    expect(FAISABILITE.includes('"capability_trigger"')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-105 — LE PROMPT DIT AU MODÈLE CE QUE L'ORACLE VÉRIFIE.
//
// `controls()` refuse désormais de déclarer exécutée une action dont le
// déclencheur vise un bloc qui en dispatche une autre. Si le prompt ne le dit
// pas, le générateur reproduira les 17 cas mesurés — et la génération
// mesurerait notre silence, non son comportement.
// ══════════════════════════════════════════════════════════════════════════
describe("le prompt énonce la cohérence du dispatch (D-105)", () => {
  it("la règle existe et nomme les deux blocs concernés", () => {
    expect(PROMPT_GENERATEUR).toContain("COHÉRENCE DU DISPATCH");
    for (const bloc of ["button", "empty_state"]) {
      expect(PROMPT_GENERATEUR, `${bloc} doit être nommé`).toContain(bloc);
    }
  });

  it("elle exige que la prop et le déclencheur désignent la MÊME action", () => {
    expect(PROMPT_GENERATEUR).toContain("la MÊME action");
  });

  it("elle PRÉSERVE la convention légitime de `form` et `list`", () => {
    // Sans cette exemption, le modèle croirait devoir poser une prop `actionId`
    // sur des blocs qui n'en ont pas — et le registre la refuserait.
    // Le prompt est un littéral de gabarit : ses backticks sont échappés.
    expect(PROMPT_GENERATEUR).toContain("ne sont PAS concernés");
    expect(PROMPT_GENERATEUR).toMatch(/form\\`? et \\\\?`?list/);
  });

  it("elle autorise EXPLICITEMENT la réutilisation d'une action par plusieurs blocs", () => {
    // 112 cas légitimes du corpus. Une règle trop stricte les casserait.
    expect(PROMPT_GENERATEUR).toContain("réutilisé par PLUSIEURS blocs");
  });

  it("CONTRÔLE NÉGATIF : les assertions savent voir une absence", () => {
    expect(PROMPT_GENERATEUR.includes("COHÉRENCE DU DISPATCH INEXISTANTE")).toBe(false);
  });

  it("la règle du bloc sans affordance (D-104) est toujours là", () => {
    expect(PROMPT_GENERATEUR).toContain("EXIGE UN BLOC ACTIONNABLE");
  });
});


describe("véracité de l'enveloppe — groupement de liste", () => {
  // AJOUT DU 2026-09-04. Un fait qui vaut `false` doit se prouver par une
  // ABSENCE mesurée, jamais par une affirmation. Le groupement est cherché aux
  // trois endroits où il pourrait vivre — s'il apparaît un jour, ce test tombe
  // AVANT que l'enveloppe ne mente.
  it("le pipeline de liste ne groupe pas : portée, recherche, filtres, tri, borne — et rien d'autre", () => {
    const pipeline = read("compiler/runtime/list-pipeline.ts");
    for (const interdit of ["groupBy", "grouper", "sections", "SectionList", "renderSectionHeader"]) {
      expect(pipeline, interdit).not.toContain(interdit);
    }
    expect(EXECUTION_ENVELOPE_V1.listGrouping).toBe(false);
  });

  it("le runtime rend une liste PLATE — aucune section", () => {
    for (const interdit of ["SectionList", "renderSectionHeader", "sections={"]) {
      expect(RUNTIME, interdit).not.toContain(interdit);
    }
  });

  it("le registre de blocs GELÉ ne déclare aucune prop de groupement", () => {
    const registre = read("blocks/src/definitions.ts");
    for (const interdit of ["groupBy", "groupFieldId", "sectionFieldId"]) {
      expect(registre, interdit).not.toContain(interdit);
    }
  });

  it("CONTRÔLE NÉGATIF — le cliquet VOIT un groupement s'il apparaît", () => {
    // Sans ceci, une assertion d'absence pourrait passer pour toujours vraie.
    const mutant = read("compiler/runtime/list-pipeline.ts") + "\nconst groupBy = () => [];\n";
    expect(mutant).toContain("groupBy");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SESSION ÉTABLISSABLE (Phase 4) — le fait le plus facile à sur-déclarer :
// « l'app a l'authentification ». Ce cliquet exige les TROIS maillons, chacun
// à sa place, plus la limite honnête de l'implémentation fournie.
// ══════════════════════════════════════════════════════════════════════════
describe("sessionEtablissable — les trois maillons, et la limite dite", () => {
  it("1. le SCHÉMA porte les deux prédicats de session", () => {
    const schema = read("air-schema/src/air.ts");
    expect(schema).toContain("session_authenticated");
    expect(schema).toContain("session_anonymous");
    expect(EXECUTION_ENVELOPE_V1.sessionEtablissable).toBe(true);
  });

  it("2. le RUNTIME dérive la visibilité de la session, pas des données", () => {
    // Les prédicats de session ne doivent PAS passer par le provider de
    // données : c'est ce raccourci qui rendrait le fait faux en silence.
    expect(RUNTIME).toContain("useSessionProvider");
    expect(RUNTIME).toContain('condition.kind === "session_authenticated"');
    const contrat = read("compiler/runtime/session-provider.tsx");
    expect(contrat).toContain("estAuthentifie");
    // Le DÉFAUT ne ment pas : sans fournisseur, la session est anonyme.
    expect(contrat).toContain("estAuthentifie: () => false");
  });

  it("3. l'effet `capability` visant `auth` est HONORÉ, et lui seul", () => {
    const auth = read("compiler/runtime/capabilites-auth.ts");
    expect(auth).toContain("session.ouvrir");
    expect(auth).toContain("session.fermer");
    // Toute autre capability est refusée — le fournisseur ne devient pas un
    // fourre-tout qui prétendrait implémenter ce qu'il n'implémente pas.
    expect(auth).toContain('call.capability !== "auth"');
    expect(auth).toContain("AIR_CAPABILITY_NOT_IMPLEMENTED");
    // Et la saisie atteint réellement l'appel : sans elle, `signIn` partirait
    // sans identité — l'effet s'exécuterait sans rien pouvoir établir.
    expect(RUNTIME).toContain("...(values ?? saisies)");
  });

  it("4. LA LIMITE EST DITE — identité déclarée, jamais vérifiée", () => {
    const locale = read("compiler/runtime/session-locale.ts");
    // COMMENTAIRES RETIRÉS : ce fichier EXPLIQUE ce qu'il n'est pas (« pas
    // Supabase, pas de vérification »). Chercher ces mots dans le texte brut
    // ferait échouer la sonde sur sa propre honnêteté — leçon déjà consignée
    // dans les verrous clavier.
    const code = locale
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .toLowerCase();
    // Aucun réseau : cette implémentation ne prétend pas vérifier une identité.
    for (const interdit of ["fetch(", "supabase", "http"]) {
      expect(code, interdit).not.toContain(interdit);
    }
    // Une identité VIDE est refusée — on n'invente pas un utilisateur.
    expect(locale).toContain('if (propre === "") return false;');
    // Les autorisations restent hors de portée : une identité non vérifiée
    // ne peut pas fonder une autorisation.
    expect(read("execution-contract/src/envelope.ts")).toContain(
      "Les règles `authorization` restent NON appliquées",
    );
  });

  it("CONTRÔLE NÉGATIF — le cliquet VOIT une session muette", () => {
    // Un fournisseur qui répondrait « connecté » sans rien établir est le
    // faux vert exact que ce paquet existe pour empêcher.
    const mutant = read("compiler/runtime/session-provider.tsx").replace(
      "estAuthentifie: () => false",
      "estAuthentifie: () => true",
    );
    expect(mutant).not.toContain("estAuthentifie: () => false");
  });
});
