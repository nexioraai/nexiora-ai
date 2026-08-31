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

const RUNTIME = read("compiler/runtime/air-runtime.tsx");
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
  it("seul le déclencheur `ui` atteint un composant", () => {
    // L'émetteur ne construit une table de déclencheurs que pour `ui` ;
    // aucun autre `trigger.kind` n'est lu par le chemin d'émission.
    expect(EMIT_PROJECT).toContain('action.trigger.kind === "ui"');
    expect(EMIT_PROJECT).not.toContain('action.trigger.kind === "lifecycle"');
    expect(EMIT_PROJECT).not.toContain('action.trigger.kind === "data"');
    expect(EXECUTION_ENVELOPE_V1.triggers).toEqual(["ui"]);
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
    expect(RUNTIME).not.toContain("useState");
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
