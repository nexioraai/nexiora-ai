// E3.1 (D-130) — PREUVES DU MAGASIN OBSERVABLE : états réels, observation,
// anti-tempête, déterminisme, seed historique. Cas-tueurs et contrôles
// négatifs — aucune horloge, aucune date, aucun réseau.
import { describe, expect, it } from "vitest";
import { creerMagasin } from "../runtime/magasin-donnees";

const L = (id: string, v: Record<string, string>) => ({ id, values: v });
const V1 = [L("d1", { dest: "Bouaké", statut: "08:00" })];
const V2 = [L("d1", { dest: "Bouaké", statut: "08:15" }), L("d2", { dest: "Korhogo", statut: "09:00" })];

const instrumente = (seed: Parameters<typeof creerMagasin>[0]) => {
  const m = creerMagasin(seed);
  const notifications: number[] = [];
  m.abonner(() => notifications.push(m.versionGlobale()));
  return { m, notifications };
};

describe("A/B — loading → v1 → v2 : chaque transition RÉELLE est observée", () => {
  it("🔴 loading VISIBLE seulement au premier remplissage ; silencieux ensuite (DET-033)", () => {
    // Sans lignes : le chargement est un état réel — servi et notifié.
    const vide = instrumente({ ent_depart: [] });
    vide.m.appliquerChargement("ent_depart");
    expect(vide.m.status("ent_depart")).toBe("loading");
    expect(vide.notifications).toHaveLength(1);
    // Avec des lignes : la revalidation est SILENCIEUSE — l'instantané affiché
    // reste la vérité, aucune notification, aucun démontage d'UI en frappe.
    const plein = instrumente({ ent_depart: V1 });
    plein.m.appliquerChargement("ent_depart");
    expect(plein.m.status("ent_depart")).toBe("ready");
    expect(plein.m.listInstances("ent_depart")).toHaveLength(1);
    expect(plein.notifications).toHaveLength(0);
  });

  it("🔴 v1 → v2 : les lignes CHANGENT sur place, la version avance", () => {
    const { m, notifications } = instrumente({ ent_depart: V1 });
    const avant = m.versionEntite("ent_depart");
    m.appliquerDonnees("ent_depart", V2);
    expect(m.listInstances("ent_depart")).toHaveLength(2);
    expect(m.listInstances("ent_depart")[0]?.values.statut).toBe("08:15");
    expect(m.versionEntite("ent_depart")).toBe(avant + 1);
    expect(notifications).toHaveLength(1);
  });
});

describe("C — mutation locale : l'écriture notifie réellement", () => {
  it("🔴 create/update/remove : vérité booléenne + observation", () => {
    const { m, notifications } = instrumente({ ent_resa: [] });
    expect(m.create("ent_resa", { nom: "Awa" })).toBe(true);
    expect(m.listInstances("ent_resa")).toHaveLength(1);
    const id = m.listInstances("ent_resa")[0]?.id ?? "";
    expect(m.update("ent_resa", id, { nom: "Awa K." })).toBe(true);
    expect(m.update("ent_resa", "id_fantome", {})).toBe(false); // vérité, pas d'optimisme
    expect(m.remove("ent_resa", id)).toBe(true);
    expect(m.remove("ent_resa", id)).toBe(false);
    expect(notifications).toHaveLength(3); // exactement les 3 écritures HONORÉES
  });
});

describe("D — erreur : le dernier instantané est conservé, l'ÉTAT dit la vérité", () => {
  it("🔴 error conserve les lignes et notifie ; jamais du périmé présenté frais", () => {
    const { m } = instrumente({ ent_depart: V1 });
    m.appliquerDonnees("ent_depart", V2);
    m.appliquerErreur("ent_depart");
    expect(m.status("ent_depart")).toBe("error");
    expect(m.listInstances("ent_depart")).toHaveLength(2); // conservé
    m.appliquerErreur("ent_depart"); // idempotent : pas de re-notification
    expect(m.versionEntite("ent_depart")).toBe(2);
  });
});

describe("E — anti-tempête : l'identique ne notifie pas", () => {
  it("🔴 mêmes données ⇒ version STABLE, zéro notification", () => {
    const { m, notifications } = instrumente({ ent_depart: V1 });
    m.appliquerDonnees("ent_depart", V1);
    m.appliquerDonnees("ent_depart", V1);
    expect(m.versionEntite("ent_depart")).toBe(0);
    expect(notifications).toHaveLength(0);
  });
});

describe("F — déterminisme : même séquence ⇒ mêmes états, sans horloge", () => {
  const derouler = () => {
    const trace: string[] = [];
    const m = creerMagasin({ ent_x: V1 });
    m.abonner(() => trace.push(`${String(m.versionGlobale())}:${m.status("ent_x")}:${String(m.listInstances("ent_x").length)}`));
    m.appliquerChargement("ent_x");
    m.appliquerDonnees("ent_x", V2);
    m.appliquerDonnees("ent_x", V2); // no-op
    m.appliquerErreur("ent_x");
    m.create("ent_x", { dest: "Abidjan" });
    return trace.join("|");
  };
  it("🔴 deux exécutions ⇒ traces STRICTEMENT identiques", () => {
    expect(derouler()).toBe(derouler());
    // DET-033 : le chargement sur des lignes existantes est un no-op — la
    // trace ne porte plus de transition loading, et reste déterministe.
    expect(derouler()).toBe("1:ready:2|2:error:2|3:error:3");
  });
});

describe("G — seed : le comportement historique, au caractère près", () => {
  it("getInstance sans id = PREMIÈRE ligne (D-030) · status ready · version 0", () => {
    const m = creerMagasin({ ent_x: V2 });
    expect(m.getInstance("ent_x")?.id).toBe("d1");
    expect(m.getInstance("ent_x", "d2")?.id).toBe("d2");
    expect(m.status("ent_x")).toBe("ready");
    expect(m.versionEntite("ent_x")).toBe(0);
  });

  it("🔴 AUCUNE surface de « vivacité » : le magasin ignore le mot même", () => {
    const m = creerMagasin({});
    expect(Object.keys(m).some((k) => /live|temps|reel|real/i.test(k))).toBe(false);
  });

  it("entité inconnue : liste vide, jamais d'exception (contrat historique)", () => {
    const m = creerMagasin({});
    expect(m.listInstances("ent_inconnue")).toEqual([]);
    expect(m.getInstance("ent_inconnue")).toBeUndefined();
  });
});
