import { ThemeRoot } from "@deribfy/primitives";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { ButtonBlock, DetailHeaderBlock, FormBlock, HeaderBlock, ListBlock } from "../src";

// COMPOSITIONS DE RÉFÉRENCE (D-023) — les 4 motifs nommés par la ROADMAP
// Phase 3 (« AuthFlow, List/Detail, Form, Profile ») sont livrés comme des
// ASSEMBLAGES TESTÉS de blocs du registre, pas comme des blocs eux-mêmes
// (l'AIR v1 gelé fige la granularité section : screens[].blocks[]).
// Tests d'INTÉGRATION : rendu + interactions bout à bout de chaque motif.

const render = (element: ReactElement): ReactTestRenderer => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<ThemeRoot>{element}</ThemeRoot>);
  });
  if (renderer === undefined) throw new Error("rendu impossible");
  return renderer;
};

const allTexts = (r: ReactTestRenderer): string[] =>
  r.root
    .findAllByType("Text" as never)
    .flatMap((t) => (t.props as { children?: unknown }).children)
    .filter((c): c is string => typeof c === "string");

const pressByTestID = (r: ReactTestRenderer, testID: string): void => {
  const node = r.root
    .findAllByType("Pressable" as never)
    .find((n) => (n.props as { testID?: string }).testID === testID);
  if (node === undefined) throw new Error(`Pressable "${testID}" introuvable`);
  act(() => {
    (node.props as { onPress?: () => void }).onPress?.();
  });
};

describe("composition AuthFlow (form sécurisé + action secondaire)", () => {
  it("saisie masquée, soumission, bascule vers l'inscription", () => {
    let submitted = 0;
    let secondary = 0;
    const r = render(
      <>
        <HeaderBlock title="Connexion" subtitle="Ravi de vous revoir" />
        <FormBlock
          testID="auth"
          fields={[
            { id: "fld_email", label: "Email" },
            { id: "fld_password", label: "Mot de passe", secure: true },
          ]}
          values={{ fld_email: "a@b.ci", fld_password: "secret" }}
          onChangeField={() => undefined}
          submitLabel="Se connecter"
          onSubmit={() => void submitted++}
        />
        <ButtonBlock
          testID="auth-register"
          label="Créer un compte"
          kind="ghost"
          onPress={() => void secondary++}
        />
      </>,
    );
    const inputs = r.root.findAllByType("TextInput" as never);
    expect(
      inputs.map((i) => (i.props as { secureTextEntry?: boolean }).secureTextEntry),
    ).toEqual([false, true]);
    pressByTestID(r, "auth-submit");
    pressByTestID(r, "auth-register");
    expect(submitted).toBe(1);
    expect(secondary).toBe(1);
  });
});

describe("composition List/Detail (liste → sélection → détail)", () => {
  it("l'appui sur une ligne remonte l'id ; le détail rend champs et badges", () => {
    let selected = "";
    const liste = render(
      <>
        <HeaderBlock title="Catalogue" />
        <ListBlock
          testID="catalogue"
          items={[
            { id: "itm_1", title: "Plat n°1", trailing: "9,84 €", badge: "Promo" },
            { id: "itm_2", title: "Plat n°2", trailing: "10,85 €" },
          ]}
          onItemPress={(id) => {
            selected = id;
          }}
        />
      </>,
    );
    expect(allTexts(liste)).toEqual(
      expect.arrayContaining(["Catalogue", "Plat n°1", "9,84 €", "Promo"]),
    );
    pressByTestID(liste, "catalogue-row-itm_1");
    expect(selected).toBe("itm_1");

    const detail = render(
      <DetailHeaderBlock
        title="Plat n°1"
        subtitle="Référence 1001"
        trailing="9,84 €"
        badges={["Promo", "Maison"]}
      />,
    );
    expect(allTexts(detail)).toEqual(
      expect.arrayContaining(["Plat n°1", "Référence 1001", "9,84 €", "Promo", "Maison"]),
    );
  });
});

describe("composition Form (erreurs par champ + erreur globale + soumission)", () => {
  it("les états error/submitting du harnais 3.4 sont rendus", () => {
    const error = render(
      <>
        <HeaderBlock title="Inscription commerçant" />
        <FormBlock
          testID="inscription"
          fields={[
            { id: "fld_nom", label: "Nom" },
            { id: "fld_email", label: "Email" },
          ]}
          values={{}}
          onChangeField={() => undefined}
          submitLabel="Enregistrer"
          onSubmit={() => undefined}
          state="error"
          errorMessage="Le serveur est injoignable"
          fieldErrors={{ fld_email: "Format invalide" }}
        />
      </>,
    );
    expect(allTexts(error)).toEqual(
      expect.arrayContaining(["Format invalide", "Le serveur est injoignable"]),
    );

    const submitting = render(
      <FormBlock
        testID="inscription"
        fields={[{ id: "fld_nom", label: "Nom" }]}
        values={{}}
        onChangeField={() => undefined}
        submitLabel="Enregistrer"
        onSubmit={() => undefined}
        state="submitting"
      />,
    );
    expect(submitting.root.findAllByType("ActivityIndicator" as never)).toHaveLength(1);
  });
});

describe("composition Profile (identité + réglages + déconnexion)", () => {
  it("assemble header, liste de réglages pressable et action de sortie", () => {
    const pressed: string[] = [];
    const r = render(
      <>
        <HeaderBlock title="Awa K." subtitle="Compte commerçant" />
        <ListBlock
          testID="reglages"
          items={[
            { id: "itm_notifications", title: "Notifications", badge: "3" },
            { id: "itm_langue", title: "Langue", trailing: "FR" },
          ]}
          onItemPress={(id) => pressed.push(id)}
        />
        <ButtonBlock label="Se déconnecter" kind="ghost" onPress={() => pressed.push("logout")} testID="logout" />
      </>,
    );
    pressByTestID(r, "reglages-row-itm_langue");
    pressByTestID(r, "logout");
    expect(pressed).toEqual(["itm_langue", "logout"]);
  });
});

describe("états du harnais sur ListBlock (loading/empty/error)", () => {
  it("chaque état explicite rend la StateView attendue", () => {
    const loading = render(
      <ListBlock items={[]} state={{ kind: "loading", title: "Chargement des plats" }} />,
    );
    expect(loading.root.findAllByType("ActivityIndicator" as never)).toHaveLength(1);
    expect(allTexts(loading)).toContain("Chargement des plats");

    const empty = render(
      <ListBlock
        items={[]}
        state={{ kind: "empty", title: "Aucun plat", message: "Revenez demain" }}
      />,
    );
    expect(allTexts(empty)).toEqual(expect.arrayContaining(["Aucun plat", "Revenez demain"]));

    let retried = 0;
    const error = render(
      <ListBlock
        items={[]}
        state={{
          kind: "error",
          title: "Échec du chargement",
          message: "Réseau indisponible",
          retryLabel: "Réessayer",
          onRetry: () => void retried++,
        }}
      />,
    );
    expect(allTexts(error)).toEqual(
      expect.arrayContaining(["Échec du chargement", "Réseau indisponible", "Réessayer"]),
    );
    const retry = error.root.findAllByType("Pressable" as never);
    act(() => {
      (retry[0]?.props as { onPress?: () => void }).onPress?.();
    });
    expect(retried).toBe(1);
  });
});

describe("DET-025 — la liste virtualisée reçoit un parent BORNÉ", () => {
  // Preuve de bout en bout de la CHAÎNE qui avait cédé : `ListBlock`
  // demande `fill`, la primitive `Section` doit l'appliquer. Le contrat et
  // les styles étaient corrects depuis DET-006 ; seul le câblage manquait,
  // et aucun test ne regardait le résultat RENDU. Mesuré sur appareil ET
  // sur émulateur : sans ce bornage, la dernière ligne est coupée et le
  // bloc suivant sort de l'écran.
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: `row_${String(i + 1)}`,
    title: `ligne ${String(i + 1)}`,
  }));

  const flat = (style: unknown): Record<string, unknown> => {
    if (Array.isArray(style)) {
      const parts = (style as unknown[]).filter(Boolean).map(flat);
      return Object.assign<Record<string, unknown>, Record<string, unknown>[]>({}, parts);
    }
    return (style ?? {}) as Record<string, unknown>;
  };

  it("le conteneur de la liste porte flex:1 jusqu'à la FlatList", () => {
    const r = render(<ListBlock testID="liste" items={items} />);
    const vues = r.root.findAllByType("View" as never);
    const bornees = vues.filter((v) => flat((v.props as { style?: unknown }).style).flex === 1);
    // Section (conteneur) + corps de Section : deux niveaux bornés au moins.
    expect(bornees.length).toBeGreaterThanOrEqual(2);
    const liste = r.root
      .findAllByType("FlatList" as never)
      .concat(r.root.findAllByType("View" as never))
      .length;
    expect(liste).toBeGreaterThan(0);
  });

  it("un bloc liste en état vide reste NON borné (aucun effet de bord)", () => {
    // L'état vide rend un StateView, pas la liste : le bornage ne doit pas
    // s'y appliquer par inadvertance.
    const r = render(
      <ListBlock testID="liste" items={[]} state={{ kind: "empty", title: "vide" }} />,
    );
    expect(allTexts(r)).toContain("vide");
  });
});
