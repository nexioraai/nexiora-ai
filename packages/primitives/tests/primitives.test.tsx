import { theme } from "@deribfy/design-tokens";
import { act, create } from "react-test-renderer";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import {
  AppButton,
  AppText,
  Badge,
  ListRow,
  ScreenShell,
  Section,
  Spinner,
  StateView,
  TextField,
  ThemeRoot,
  useThemeBridge,
} from "../src";

// TESTS STRUCTURELS (E1) : conformité aux contrats, propagation des props,
// valeurs de TOKENS dans les styles, bascule de schéma, états. Rendu via
// react-test-renderer sur stub react-native (composants hôtes purs).
// La vérité de rendu natif est le harnais 3.4 (device/émulateur).

const render = (element: ReactElement): ReactTestRenderer => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<ThemeRoot>{element}</ThemeRoot>);
  });
  if (renderer === undefined) throw new Error("rendu impossible");
  return renderer;
};

const first = (nodes: ReactTestInstance[]): ReactTestInstance => {
  const node = nodes[0];
  if (node === undefined) throw new Error("nœud absent");
  return node;
};

const flatStyle = (node: ReactTestInstance): Record<string, unknown> =>
  Object.assign(
    {},
    ...[(node.props as { style?: unknown }).style]
      .flat(Infinity)
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null),
  ) as Record<string, unknown>;

const texts = (renderer: ReactTestRenderer): string[] =>
  renderer.root
    .findAllByType("Text" as never)
    .flatMap((t) => (t.props as { children?: unknown }).children)
    .filter((c): c is string => typeof c === "string");

describe("ScreenShell", () => {
  it("rend le titre (rôle header) et le fond depuis les tokens light", () => {
    const r = render(<ScreenShell title="Accueil">{null}</ScreenShell>);
    expect(texts(r)).toContain("Accueil");
    const shell = first(r.root.findAllByType("View" as never));
    expect(flatStyle(shell).backgroundColor).toBe(theme.color.light.bg);
  });
});

describe("bascule de thème (patron 2 feuilles du banc)", () => {
  it("light → dark change le fond via le contexte, sans recalcul de styles", () => {
    let bridge: { setScheme: (s: "light" | "dark") => void } | undefined;
    function Probe() {
      bridge = useThemeBridge();
      return <ScreenShell title="T">{null}</ScreenShell>;
    }
    let mounted: ReactTestRenderer | undefined;
    act(() => {
      mounted = create(
        <ThemeRoot>
          <Probe />
        </ThemeRoot>,
      );
    });
    if (mounted === undefined) throw new Error("rendu impossible");
    const r = mounted;
    const shell = (): Record<string, unknown> =>
      flatStyle(first(r.root.findAllByType("View" as never)));
    expect(shell().backgroundColor).toBe(theme.color.light.bg);
    act(() => {
      bridge?.setScheme("dark");
    });
    expect(shell().backgroundColor).toBe(theme.color.dark.bg);
  });
});

describe("AppText", () => {
  it("variante = token de police ; ton = token de couleur", () => {
    const r = render(
      <AppText variant="heading" tone="error">
        Titre
      </AppText>,
    );
    const style = flatStyle(r.root.findByType("Text" as never));
    expect(style.fontSize).toBe(theme.font.heading);
    expect(style.color).toBe(theme.color.light.error);
  });
});

describe("AppButton", () => {
  it("appuie → onPress ; rôle et libellé a11y posés", () => {
    let pressed = 0;
    const r = render(<AppButton label="Valider" onPress={() => void pressed++} />);
    const btn = r.root.findByType("Pressable" as never);
    const props = btn.props as {
      onPress?: () => void;
      accessibilityRole?: string;
      accessibilityLabel?: string;
    };
    props.onPress?.();
    expect(pressed).toBe(1);
    expect(props.accessibilityRole).toBe("button");
    expect(props.accessibilityLabel).toBe("Valider");
  });

  it("loading → spinner, press neutralisé, état a11y busy", () => {
    let pressed = 0;
    const r = render(
      <AppButton label="Payer" loading onPress={() => void pressed++} />,
    );
    const btn = r.root.findByType("Pressable" as never);
    const props = btn.props as {
      onPress?: () => void;
      disabled?: boolean;
      accessibilityState?: { busy?: boolean };
    };
    expect(r.root.findAllByType("ActivityIndicator" as never)).toHaveLength(1);
    expect(props.onPress).toBeUndefined();
    expect(props.disabled).toBe(true);
    expect(props.accessibilityState?.busy).toBe(true);
    expect(pressed).toBe(0);
  });
});

describe("TextField", () => {
  it("erreur → bordure token error + message (rôle alert) ; secure passe au natif", () => {
    const r = render(
      <TextField
        label="Mot de passe"
        value=""
        onChangeText={() => undefined}
        error="Trop court"
        secure
      />,
    );
    const input = r.root.findByType("TextInput" as never);
    expect(flatStyle(input).borderColor).toBe(theme.color.light.error);
    expect((input.props as { secureTextEntry?: boolean }).secureTextEntry).toBe(true);
    expect(texts(r)).toContain("Trop court");
  });

  it("loading → indicateur avec retrait LOGIQUE (marginStart)", () => {
    const r = render(
      <TextField label="Ville" value="" onChangeText={() => undefined} loading />,
    );
    const spinner = r.root.findByType("ActivityIndicator" as never);
    expect(flatStyle(spinner).marginStart).toBe(theme.space.sm);
  });
});

describe("ListRow", () => {
  it("statique sans onPress ; pressable avec onPress (rôle button)", () => {
    const stat = render(<ListRow title="Plat" subtitle="Réf 1" trailing="9,84 €" />);
    expect(stat.root.findAllByType("Pressable" as never)).toHaveLength(0);
    expect(texts(stat)).toEqual(expect.arrayContaining(["Plat", "Réf 1", "9,84 €"]));

    const press = render(<ListRow title="Plat" onPress={() => undefined} />);
    expect(press.root.findAllByType("Pressable" as never)).toHaveLength(1);
  });

  it("badge intégré + contenu leading fourni par le bloc", () => {
    const r = render(
      <ListRow title="Client" badge="VIP" leading={<Spinner testID="avatar" />} />,
    );
    expect(texts(r)).toContain("VIP");
    expect(
      r.root
        .findAllByType("ActivityIndicator" as never)
        .some((n) => (n.props as { testID?: string }).testID === "avatar"),
    ).toBe(true);
  });
});

describe("Badge", () => {
  it("tons → tokens de couleur", () => {
    const r = render(<Badge label="OK" tone="success" />);
    expect(flatStyle(r.root.findByType("Text" as never)).color).toBe(
      theme.color.light.success,
    );
  });
});

describe("StateView (états du harnais 3.4)", () => {
  it("loading → spinner ; empty → titre/message ; error → rôle alert + action", () => {
    const loading = render(<StateView state="loading" title="Chargement" />);
    expect(loading.root.findAllByType("ActivityIndicator" as never)).toHaveLength(1);

    const empty = render(
      <StateView state="empty" title="Aucun résultat" message="Modifiez vos filtres" />,
    );
    expect(texts(empty)).toEqual(
      expect.arrayContaining(["Aucun résultat", "Modifiez vos filtres"]),
    );

    let retried = 0;
    const error = render(
      <StateView
        state="error"
        title="Échec"
        actionLabel="Réessayer"
        onAction={() => void retried++}
      />,
    );
    const wrap = first(error.root.findAllByType("View" as never));
    expect((wrap.props as { accessibilityRole?: string }).accessibilityRole).toBe("alert");
    expect(flatStyle(first(error.root.findAllByType("Text" as never))).color).toBe(
      theme.color.light.error,
    );
    (error.root.findByType("Pressable" as never).props as { onPress?: () => void }).onPress?.();
    expect(retried).toBe(1);
  });
});

describe("Section & Spinner", () => {
  it("Section sans titre ne rend pas de Text ; Spinner propage size et testID", () => {
    const r = render(
      <Section>
        <Spinner size="large" testID="sp" />
      </Section>,
    );
    const spinner = r.root.findByType("ActivityIndicator" as never);
    expect((spinner.props as { size?: string }).size).toBe("large");
    expect((spinner.props as { testID?: string }).testID).toBe("sp");
    expect(texts(r)).toEqual([]);
  });
});
