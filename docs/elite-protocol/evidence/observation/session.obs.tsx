// OBSERVATION — LA SESSION AU RENDU (Phase 4).
//
// Les cliquets d'enveloppe prouvent que les maillons EXISTENT. Celui-ci
// prouve qu'ils AGISSENT : l'écran Compte doit changer réellement quand une
// session s'ouvre, et l'effet `auth.signIn` doit l'ouvrir.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";

// L'app OBSERVÉE est COMPILÉE ICI, par le vrai compilateur, depuis le
// document qui porte la session. Ni le corpus gelé (il est en 1.6.0 et ne
// s'en sert pas — l'amender pour faire passer une observation serait déplacer
// la cible), ni `slices/` directement (son tsconfig Expo n'est pas résoluble
// depuis ce harnais). L'artefact observé est donc celui que le build embarque.
const APP = join(tmpdir(), "deribfy-obs-session") + "/";

async function compilerDocument(): Promise<void> {
  const R = join(HERE, "..", "..", "..", "..") + "/";
  const { migrateAirDocument } = (await import(
    R + "packages/air-schema/src/migrations.ts"
  )) as { migrateAirDocument: (d: unknown) => never };
  const { compileProject } = (await import(R + "packages/compiler/src/index.ts")) as {
    compileProject: (a: never) => { files: Map<string, string> };
  };
  const doc: unknown = JSON.parse(
    readFileSync(R + "slices/validation-appareil/validation-appareil.air.json", "utf8"),
  );
  const { files } = compileProject(migrateAirDocument(doc));
  // Dossier NEUF à chaque exécution : un artefact résiduel d'une exécution
  // antérieure ferait observer autre chose que ce qui vient d'être compilé.
  rmSync(APP, { recursive: true, force: true });
  for (const [f, contenu] of files) {
    // `tsconfig.json` étend `expo/tsconfig.base`, que CE harnais ne résout pas
    // (il n'installe pas les dépendances de l'app). Il ne sert à rien pour
    // rendre : on ne l'écrit pas. Le typage réel de l'app émise est vérifié
    // ailleurs, par un `tsc` VRAI (batterie pré-build).
    if (f === "tsconfig.json") continue;
    const cible = APP + f;
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu);
  }
}

const textes = (r: ReactTestRenderer | undefined): string[] => {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === "string") { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === "object" && "children" in n) walk((n as { children: unknown }).children);
  };
  walk(r?.toJSON());
  return out;
};

describe("Phase 4 — la session change RÉELLEMENT l'écran", () => {
  it("Compte : visiteur → invitation ; connecté → profil ; et signIn fait la bascule", async () => {
    await compilerDocument();
    const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
    const { FormStateRoot } = await import(APP + "lib/runtime/form-state.tsx");
    const { buildDemoProvider } = await import(APP + "lib/runtime/demo-provider.ts");
    const { SessionRoot } = await import(APP + "lib/runtime/session-provider.tsx");
    const { CapabilityRoot } = await import(APP + "lib/runtime/capability-provider.tsx");
    const { creerSessionLocale } = await import(APP + "lib/runtime/session-locale.ts");
    const { creerCapabilitesAuth } = await import(APP + "lib/runtime/capabilites-auth.ts");
    const { demoData } = await import(APP + "demo.data.ts");
    const Compte = (await import(APP + "screens/scr_compte.tsx")).default;

    const session = creerSessionLocale();
    const capabilities = creerCapabilitesAuth(session);
    let r: ReactTestRenderer | undefined;
    act(() => {
      r = create(
        createElement(
          SessionRoot as never, { provider: session } as never,
          createElement(
            CapabilityRoot as never, { provider: capabilities } as never,
            createElement(
              DataRoot as never, { provider: buildDemoProvider(demoData) } as never,
              createElement(FormStateRoot as never, null as never, createElement(Compte as never)),
            ),
          ),
        ) as never,
      );
    });

    // A. VISITEUR — l'invitation est là, le profil ne l'est PAS.
    const visiteur = textes(r);
    expect(visiteur).toContain("Vous n'êtes pas connecté");
    expect(visiteur).not.toContain("Mes informations");
    expect(visiteur).not.toContain("Se déconnecter");

    // B. L'EFFET signIn ÉTABLIT la session — refusé si l'identité est vide.
    expect(
      capabilities.invoke({
        capability: "auth", method: "signIn",
        params: { identifiantFieldId: "fld_voyageur_email", fld_voyageur_email: "   " },
      }),
      "une identité VIDE ne doit rien établir",
    ).toBe(false);
    expect(session.estAuthentifie()).toBe(false);

    act(() => {
      capabilities.invoke({
        capability: "auth", method: "signIn",
        params: { identifiantFieldId: "fld_voyageur_email", fld_voyageur_email: "a@b.fr" },
      });
    });
    expect(session.identifiant()).toBe("a@b.fr");

    // C. CONNECTÉ — l'écran a basculé, sans navigation ni remontage.
    const connecte = textes(r);
    expect(connecte).toContain("Mes informations");
    expect(connecte).toContain("Se déconnecter");
    expect(connecte).not.toContain("Vous n'êtes pas connecté");

    // D. RETOUR EN ARRIÈRE — signOut ramène l'invitation.
    act(() => {
      capabilities.invoke({ capability: "auth", method: "signOut", params: {} });
    });
    expect(textes(r)).toContain("Vous n'êtes pas connecté");

    // E. AUCUNE AUTRE CAPABILITY N'EST HONORÉE — pas de fourre-tout.
    expect(capabilities.invoke({ capability: "maps", method: "open", params: {} })).toBe(false);

    r?.unmount();
  });
});
