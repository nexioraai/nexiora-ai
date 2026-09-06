// FALSIFICATIONS de la session VÉRIFIÉE — client injecté, aucun réseau.
// La règle : ce fournisseur ne doit JAMAIS déclarer une identité que le
// serveur n'a pas établie. Chaque test cherche à le prendre en défaut.
import { describe, expect, it } from "vitest";
import { creerSessionSupabase } from "../runtime/session-supabase.ts";
import type { ClientAuth } from "../runtime/session-supabase.ts";

const SESSION = { user: { id: "u_1" } };

function client(scenario: {
  initiale?: { user: { id: string } } | null;
  signIn?: { data: { session: { user: { id: string } } | null }; error: { message: string } | null };
  signUp?: { data: { session: { user: { id: string } } | null }; error: { message: string } | null };
}): { c: ClientAuth; appels: string[] } {
  const appels: string[] = [];
  const c: ClientAuth = {
    auth: {
      getSession: () => {
        appels.push("getSession");
        return Promise.resolve({ data: { session: scenario.initiale ?? null } });
      },
      signInWithPassword: (creds) => {
        appels.push(`signIn:${creds.email}`);
        return Promise.resolve(scenario.signIn ?? { data: { session: null }, error: null });
      },
      signUp: (creds) => {
        appels.push(`signUp:${creds.email}`);
        return Promise.resolve(scenario.signUp ?? { data: { session: null }, error: null });
      },
      signOut: () => {
        appels.push("signOut");
        return Promise.resolve({ error: null });
      },
      onAuthStateChange: () => {
        appels.push("onAuthStateChange");
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  };
  return { c, appels };
}

describe("session vérifiée — l'identité vient du SERVEUR, jamais de l'appareil", () => {
  it("🟢 sans session serveur : ANONYME, et le client a bien été interrogé", async () => {
    const { c, appels } = client({});
    const s = creerSessionSupabase(c);
    await Promise.resolve();
    expect(s.estAuthentifie()).toBe(false);
    expect(s.identifiant()).toBeUndefined();
    expect(appels).toContain("getSession");
    expect(appels).toContain("onAuthStateChange");
  });

  it("🟢 session DÉJÀ établie : elle est LUE, pas supposée", async () => {
    const { c } = client({ initiale: SESSION });
    const s = creerSessionSupabase(c);
    await Promise.resolve();
    await Promise.resolve();
    expect(s.estAuthentifie()).toBe(true);
    expect(s.identifiant()).toBe("u_1");
  });

  it("🔴 connexion REFUSÉE par le serveur : rien n'est établi", async () => {
    const { c } = client({ signIn: { data: { session: null }, error: { message: "invalid" } } });
    const s = creerSessionSupabase(c);
    expect(await s.ouvrir("a@b.fr", "x")).toBe(false);
    expect(s.estAuthentifie()).toBe(false);
  });

  it("🔴 réponse SANS erreur mais SANS session : ce n'est PAS une connexion", async () => {
    // Cas RÉEL : confirmation par e-mail exigée. Le piège serait de conclure
    // « pas d'erreur donc connecté » — exactement le faux vert à éviter.
    const { c } = client({ signIn: { data: { session: null }, error: null } });
    const s = creerSessionSupabase(c);
    expect(await s.ouvrir("a@b.fr", "x")).toBe(false);
    expect(s.estAuthentifie()).toBe(false);
  });

  it("🟢 connexion ACCEPTÉE : l'identité est celle que le serveur renvoie", async () => {
    const { c, appels } = client({ signIn: { data: { session: SESSION }, error: null } });
    const s = creerSessionSupabase(c);
    expect(await s.ouvrir("a@b.fr", "motdepasse")).toBe(true);
    expect(s.identifiant()).toBe("u_1");
    expect(appels).toContain("signIn:a@b.fr");
  });

  it("🔴 signUp SANS session : l'état est « en attente », jamais « anonyme »", async () => {
    // Le défaut mesuré sur appareil : une inscription RÉUSSIE retombait sur
    // « anonyme », donc rien ne bougeait à l'écran et le parcours ressemblait
    // à une panne. Ce test interdit ce retour en arrière.
    const { c } = client({ signUp: { data: { session: null }, error: null } });
    const s = creerSessionSupabase(c);
    expect(s.enAttenteConfirmation()).toBe(false);
    expect(await s.creer("neuf@b.fr", "motdepasse")).toBe(true);
    expect(s.estAuthentifie()).toBe(false);
    expect(s.enAttenteConfirmation(), "créé sans session ⇒ EN ATTENTE").toBe(true);
  });

  it("🔴 signUp REFUSÉ : aucune attente déclarée non plus", async () => {
    const { c } = client({ signUp: { data: { session: null }, error: { message: "exists" } } });
    const s = creerSessionSupabase(c);
    expect(await s.creer("a@b.fr", "x")).toBe(false);
    expect(s.enAttenteConfirmation(), "un échec n'est pas une attente").toBe(false);
  });

  it("🟢 la connexion LÈVE l'attente — la confirmation a eu lieu", async () => {
    const { c } = client({
      signUp: { data: { session: null }, error: null },
      signIn: { data: { session: SESSION }, error: null },
    });
    const s = creerSessionSupabase(c);
    await s.creer("neuf@b.fr", "motdepasse");
    expect(s.enAttenteConfirmation()).toBe(true);
    await s.ouvrir("neuf@b.fr", "motdepasse");
    expect(s.estAuthentifie()).toBe(true);
    expect(s.enAttenteConfirmation()).toBe(false);
  });

  it("🟢 signUp et signIn sont des opérations DISTINCTES", async () => {
    const { c, appels } = client({ signUp: { data: { session: SESSION }, error: null } });
    const s = creerSessionSupabase(c);
    expect(await s.creer("neuf@b.fr", "motdepasse")).toBe(true);
    expect(appels).toContain("signUp:neuf@b.fr");
    expect(appels).not.toContain("signIn:neuf@b.fr");
  });

  it("🟢 déconnexion : le serveur est appelé ET l'état local retombe", async () => {
    const { c, appels } = client({ signIn: { data: { session: SESSION }, error: null } });
    const s = creerSessionSupabase(c);
    await s.ouvrir("a@b.fr", "x");
    expect(s.estAuthentifie()).toBe(true);
    await s.fermer();
    expect(appels).toContain("signOut");
    expect(s.estAuthentifie()).toBe(false);
  });

  it("🟢 les abonnés sont notifiés des transitions RÉELLES seulement", async () => {
    const { c } = client({ signIn: { data: { session: SESSION }, error: null } });
    const s = creerSessionSupabase(c);
    let n = 0;
    s.abonner(() => { n += 1; });
    await s.ouvrir("a@b.fr", "x");
    expect(n).toBe(1);
    await s.ouvrir("a@b.fr", "x"); // même identité : aucune transition
    expect(n).toBe(1);
  });
});
