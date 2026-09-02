// RUNTIME COPIÉ — CONTRAT D'INVOCATION DES CAPABILITIES (D-059).
//
// État mesuré au 2026-08-31 : `capabilitiesEmitCode: false`. Les 15 capabilities
// du registre gelé ne produisent AUCUNE ligne dans l'app émise, et le
// dispatcher IGNORE silencieusement un effet `capability`. Sur 152 promesses
// mortes du corpus, **61 visaient une capability** — le premier tueur.
//
// Ce module pose la COUTURE, sur le patron exact du fournisseur de données :
// le code généré ne dépend jamais d'une implémentation concrète.
//
// 🔴 CE QU'IL NE FAIT PAS, ET POURQUOI : il n'implémente aucune capability.
// Chacune exige son paquet npm (`expo-sharing`, `expo-location`…), or l'app
// émise embarque un `package-lock.json` de 504 paquets et s'installe avec
// `npm ci` — qui ÉCHOUE si le lock et le manifeste divergent. Livrer une
// implémentation exige donc d'étendre le lock EMBARQUÉ du moteur : décision
// propriétaire, elle fait grandir le train de release (D-059).
//
// Le défaut n'est donc PAS une implémentation : c'est un JOURNAL. Une
// capability non implémentée devient VISIBLE au lieu d'être avalée.
import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";

export interface CapabilityCall {
  capability: string;
  method: string;
  params: Readonly<Record<string, unknown>>;
}

export interface CapabilityProvider {
  /** `true` si l'appel a été HONORÉ. `false` = non implémentée, jamais un mensonge. */
  invoke(call: CapabilityCall): boolean;
}

/**
 * Défaut : refuse et TRACE. Ne prétend jamais avoir agi.
 *
 * Le contraire — retourner `true` en silence — est exactement le défaut
 * `APP-D002` : une promesse que rien ne fonde.
 */
export const REPORTING_CAPABILITY_PROVIDER: CapabilityProvider = {
  invoke: (call) => {
    // Code, jamais texte naturel (F3) : ce module est du runtime moteur.
    console.warn(`AIR_CAPABILITY_NOT_IMPLEMENTED:${call.capability}.${call.method}`);
    return false;
  },
};

const CapabilityContext = createContext<CapabilityProvider>(REPORTING_CAPABILITY_PROVIDER);

export function CapabilityRoot({
  provider,
  children,
}: PropsWithChildren<{ provider: CapabilityProvider }>) {
  return (
    <CapabilityContext.Provider value={provider}>{children}</CapabilityContext.Provider>
  );
}

export function useCapabilityProvider(): CapabilityProvider {
  return useContext(CapabilityContext);
}
