// PONT DE THÈME (D1, dossier 3.2 validé) — patron GAGNANT du banc P-003
// (bascule light/dark en 2 frames : les deux feuilles de style sont
// pré-calculées une fois au chargement, la bascule ne fait que changer de
// feuille via le contexte). Liaison STATIQUE aux tokens : la variance par
// app est un acte de COMPILATION (le compilateur émettra un module de
// tokens propre à chaque app — modèle copie-régénérable §3), jamais un
// mécanisme runtime.
import { createContext, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Scheme, ThemeBridge } from "./contracts.ts";
import { SHEETS, type Sheet } from "./styles.ts";

const SchemeContext = createContext<ThemeBridge>({
  scheme: "light",
  setScheme: () => undefined,
});

export function ThemeRoot({
  children,
  initialScheme = "light",
}: PropsWithChildren<{ initialScheme?: Scheme }>) {
  const [scheme, setScheme] = useState<Scheme>(initialScheme);
  const value = useMemo(() => ({ scheme, setScheme }), [scheme]);
  return <SchemeContext.Provider value={value}>{children}</SchemeContext.Provider>;
}

export function useThemeBridge(): ThemeBridge {
  return useContext(SchemeContext);
}

export function useStyles(): Sheet {
  return SHEETS[useContext(SchemeContext).scheme];
}
