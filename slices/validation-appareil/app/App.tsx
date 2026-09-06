// GÉNÉRÉ — NE PAS ÉDITER (racine d'app : thème + données + navigation).
// S7 (D-026) : tokens scellés 1.0.0, design.theme transporté sans effet.
// Provider demo (D-030) : fixtures déterministes compilées (demo.data).
import { ThemeRoot } from "./lib/primitives";
import { DataRoot } from "./lib/runtime/data-provider";
import { FormStateRoot } from "./lib/runtime/form-state";
import { creerMagasin } from "./lib/runtime/magasin-donnees";
import {
  creerAdaptateurReseau,
  planificateurIntervalle,
  transportHttp,
} from "./lib/runtime/source-reseau";
import { SlotRoot } from "./lib/runtime/slot-provider";
import { slotRegistry } from "./slots";
import { CapabilityRoot } from "./lib/runtime/capability-provider";
import { SessionRoot } from "./lib/runtime/session-provider";
import { creerCapabilitesAuth } from "./lib/runtime/capabilites-auth";
import { creerSessionLocale } from "./lib/runtime/session-locale";
import { demoData } from "./demo.data";
import { Navigation } from "./navigation";

// Amorçage : fixtures de démo (D-013) — la source distante les
// remplace dès la première consommation réussie ; en attendant,
// l'état du magasin dit la vérité (loading/error).
const provider = creerMagasin(demoData);
const CIBLES_REMOTE = [{"datasetId":"data_departs","entityId":"ent_depart","integrationId":"intg_cache_billets","refreshSeconds":30,"url":"https://www.deribfy.com/air/v1/entities/ent_depart/rows"}] as const;
const DOMAINES_AUTORISES = ["api.bus-intercites.app","www.deribfy.com"] as const;
// Transport et polling APPAREIL fournis par le runtime embarqué —
// l'adaptateur revérifie chaque hôte contre DOMAINES_AUTORISES.
const adaptateur = creerAdaptateurReseau({
  magasin: provider,
  cibles: CIBLES_REMOTE,
  domainesAutorises: DOMAINES_AUTORISES,
  transport: transportHttp,
  planificateur: planificateurIntervalle,
});
void adaptateur.demarrer();
// Session LOCALE : identité DÉCLARÉE par la personne, non vérifiée
// par un serveur — équivalent de demo.data pour l'identité. Le
// document ne déclare aucune intégration d'authentification.
const session = creerSessionLocale();
const capabilities = creerCapabilitesAuth(session);

export default function App() {
  return (
    <ThemeRoot>
      <SessionRoot provider={session}>
      <CapabilityRoot provider={capabilities}>
      <DataRoot provider={provider}>
        <SlotRoot registry={slotRegistry}>
          <FormStateRoot>
            <Navigation />
          </FormStateRoot>
        </SlotRoot>
      </DataRoot>
      </CapabilityRoot>
      </SessionRoot>
    </ThemeRoot>
  );
}
