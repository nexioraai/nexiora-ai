// GÉNÉRÉ — NE PAS ÉDITER (racine d'app : thème + données + navigation).
// S7 (D-026) : tokens scellés 1.0.0, design.theme transporté sans effet.
// Provider demo (D-030) : fixtures déterministes compilées (demo.data).
import { ThemeRoot } from "./lib/primitives";
import { DataRoot } from "./lib/runtime/data-provider";
import { buildDemoProvider } from "./lib/runtime/demo-provider";
import { demoData } from "./demo.data";
import { Navigation } from "./navigation";

const provider = buildDemoProvider(demoData);

export default function App() {
  return (
    <ThemeRoot>
      <DataRoot provider={provider}>
        <Navigation />
      </DataRoot>
    </ThemeRoot>
  );
}
