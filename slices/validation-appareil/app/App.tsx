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
import { creerCapabilitesAuthVerifiee } from "./lib/runtime/capabilites-auth";
import { createClient } from "@supabase/supabase-js";
import { creerSessionSupabase } from "./lib/runtime/session-supabase";
import { demoData } from "./demo.data";
import { Navigation } from "./navigation";

// Amorçage : fixtures de démo (D-013) — la source distante les
// remplace dès la première consommation réussie ; en attendant,
// l'état du magasin dit la vérité (loading/error).
const provider = creerMagasin(demoData);
const CIBLES_REMOTE = [{"datasetId":"data_departs","entityId":"ent_depart","integrationId":"intg_cache_billets","refreshSeconds":30,"url":"https://www.deribfy.com/air/v1/entities/ent_depart/rows"}] as const;
const DOMAINES_AUTORISES = ["api.bus-intercites.app","psxbilpmnojtlzosokzz.supabase.co","www.deribfy.com"] as const;
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
// Session VÉRIFIÉE : le document déclare OÙ vérifier l'identité.
// La clé anonyme est publiable par conception (protégée par RLS) —
// c'est ce qui ship dans tout client Supabase ; aucun secret ici.
const clientAuth = createClient("https://psxbilpmnojtlzosokzz.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzeGJpbHBtbm9qdGx6b3Nva3p6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NjM2OTcsImV4cCI6MjEwNDIzOTY5N30.Ea24JkCSgTHKaD613nWj0KE7nF728QP-4tocP9mn38w");
const session = creerSessionSupabase(clientAuth);
const capabilities = creerCapabilitesAuthVerifiee(session);

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
