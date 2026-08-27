// P-003 — COQUILLE D'APPLICATION COMMUNE. Chaque candidat fournit UNIQUEMENT
// ses primitives (contrats partagés) et son pont de thème ; tout le reste —
// navigation minimale, scénario de banc auto, émission des résultats — est
// identique ici. Scénario auto (lancé 1,5 s après le montage) :
//   1. TTI liste (montage → premier layout de la FlatList) ;
//   2. scroll auto vers la fin des 500 cartes + échantillonnage de frames ;
//   3. 10 bascules light↔dark, latence médiane ;
//   4. BENCH_RESULT en console native + affichage à l'écran.
import React, { useEffect, useRef, useState } from "react";
import { I18nManager, Platform, Text, View } from "react-native";
import type { BenchResult } from "./bench";
import { emitResult, median, nextFrame, sampleFrames } from "./bench";
import type { Primitives, Scheme, ThemeBridge } from "./contracts";
import { makeFormScreen, makeListScreen, makeThemeScreen, RtlProbe } from "./screens";
import type { ListScreenHandle } from "./screens";

I18nManager.allowRTL(true);

export interface CandidateShell {
  name: string;
  primitives: Primitives;
  useThemeBridge: () => ThemeBridge;
  // Certains candidats exigent un Provider racine (thème) — fourni par eux,
  // mais JAMAIS utilisé dans les écrans (étanchéité).
  Root?: React.ComponentType<React.PropsWithChildren>;
}

export function createFixtureApp(shell: CandidateShell) {
  const ListScreen = makeListScreen(shell.primitives);
  const FormScreen = makeFormScreen(shell.primitives);
  const ThemeScreen = makeThemeScreen(shell.primitives);

  function Inner() {
    const bridge = shell.useThemeBridge();
    const [screen, setScreen] = useState<"list" | "form" | "theme">("list");
    const [result, setResult] = useState<BenchResult | null>(null);
    const listRef = useRef<ListScreenHandle>(null);
    const mountedAt = useRef(performance.now());
    const ttiRef = useRef<number>(-1);
    const bridgeRef = useRef(bridge);
    bridgeRef.current = bridge;

    useEffect(() => {
      const timer = setTimeout(async () => {
        // 2. scroll bench sur la liste
        listRef.current?.scrollToTop();
        await nextFrame();
        const scrollPromise = sampleFrames(6000);
        listRef.current?.scrollToEnd();
        const scroll = await scrollPromise;
        // 3. bascules de thème
        const runs: number[] = [];
        for (let i = 0; i < 10; i++) {
          const target: Scheme = i % 2 === 0 ? "dark" : "light";
          const t0 = performance.now();
          bridgeRef.current.setScheme(target);
          await nextFrame();
          runs.push(Math.round((performance.now() - t0) * 10) / 10);
        }
        bridgeRef.current.setScheme("light");
        const payload: BenchResult = {
          candidate: shell.name,
          platform: Platform.OS,
          ttiListMs: Math.round(ttiRef.current * 10) / 10,
          scroll,
          themeToggleMsMedian: median(runs),
          themeToggleRuns: runs,
        };
        emitResult(payload);
        setResult(payload);
      }, 1500);
      return () => clearTimeout(timer);
    }, []);

    return (
      <View style={{ flex: 1 }}>
        <RtlProbe />
        <View style={{ flex: 1 }}>
          {screen === "list" && (
            <ListScreen
              ref={listRef}
              onFirstLayout={() => {
                ttiRef.current = performance.now() - mountedAt.current;
              }}
            />
          )}
          {screen === "form" && <FormScreen />}
          {screen === "theme" && (
            <ThemeScreen
              scheme={bridge.scheme}
              onToggleScheme={() =>
                bridge.setScheme(bridge.scheme === "light" ? "dark" : "light")
              }
              onToggleRtl={() => {
                I18nManager.forceRTL(!I18nManager.isRTL);
              }}
            />
          )}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-around", padding: 8 }}>
          <Text testID="nav-list" onPress={() => setScreen("list")}>Liste</Text>
          <Text testID="nav-form" onPress={() => setScreen("form")}>Formulaire</Text>
          <Text testID="nav-theme" onPress={() => setScreen("theme")}>Thème</Text>
        </View>
        {result !== null && (
          <Text testID="bench-result" style={{ fontSize: 9, padding: 4 }} numberOfLines={3}>
            {JSON.stringify(result)}
          </Text>
        )}
      </View>
    );
  }

  return function App() {
    const Root = shell.Root ?? React.Fragment;
    return (
      <Root>
        <Inner />
      </Root>
    );
  };
}
