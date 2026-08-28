// HARNAIS DE RENDU 3.4 (H1+M1+V2, validés par le propriétaire) — l'app est
// un SUBSTITUT DU COMPILATEUR : elle assemble les Smart Blocks GELÉS (D-024)
// et leur fournit données, libellés et callbacks — exactement le rôle que
// tiendra le compilateur (Phase 4). Elle ne modifie aucun paquet gelé.
import { ThemeRoot } from "@deribfy/primitives";
import { HarnessShell } from "./src/shell";

export default function App() {
  return (
    <ThemeRoot>
      <HarnessShell />
    </ThemeRoot>
  );
}
