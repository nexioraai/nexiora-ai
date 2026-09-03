// P-003 — INSTRUMENTATION DE MESURE EMBARQUÉE, identique pour les 4
// candidats. Méthode (consignée) : échantillonnage requestAnimationFrame —
// mesure la fluidité côté thread JS (les chutes de frames UI-thread pures ne
// sont pas capturées ; limite identique pour tous les candidats, la
// comparaison reste valide). Sortie : ligne "BENCH_RESULT {json}" sur la
// console native + affichage à l'écran.
export interface FrameStats {
  frames: number;
  droppedOver17ms: number;
  droppedOver34ms: number;
  maxFrameMs: number;
  durationMs: number;
}

export function sampleFrames(untilMs: number): Promise<FrameStats> {
  return new Promise((resolve) => {
    const start = performance.now();
    let last = start;
    let frames = 0;
    let d17 = 0;
    let d34 = 0;
    let maxFrame = 0;
    const tick = () => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      frames++;
      if (delta > 17) d17++;
      if (delta > 34) d34++;
      if (delta > maxFrame) maxFrame = delta;
      if (now - start < untilMs) {
        requestAnimationFrame(tick);
      } else {
        resolve({
          frames,
          droppedOver17ms: d17,
          droppedOver34ms: d34,
          maxFrameMs: Math.round(maxFrame * 10) / 10,
          durationMs: Math.round(now - start),
        });
      }
    };
    requestAnimationFrame(tick);
  });
}

export function nextFrame(): Promise<number> {
  const start = performance.now();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve(performance.now() - start));
    });
  });
}

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export interface BenchResult {
  candidate: string;
  platform: string;
  ttiListMs: number;
  scroll: FrameStats;
  themeToggleMsMedian: number;
  themeToggleRuns: number[];
}

export function emitResult(result: BenchResult): void {
  const line = `BENCH_RESULT ${JSON.stringify(result)}`;
  console.log(line);
  // Canal FIABLE d'extraction [mesuré : console.log release n'atteint pas
  // os_log iOS] : écriture fichier via expo-file-system (dépendance ajoutée
  // À L'IDENTIQUE aux 4 candidats — les deltas de poids restent équitables).
  // Lecture harnais : simctl get_app_container … data → Documents/.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FS = require("expo-file-system/legacy") as {
      documentDirectory: string | null;
      writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
    };
    if (FS.documentDirectory !== null) {
      void FS.writeAsStringAsync(`${FS.documentDirectory}bench-result.json`, JSON.stringify(result));
    }
  } catch {
    // canal fichier indisponible — la console et l'écran restent.
  }
}
