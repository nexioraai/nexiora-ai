// RUNTIME COPIÉ — CONTRAT DE SESSION (Phase 4).
//
// Fait mesuré avant ce module : l'enveloppe concédait « les règles
// `authorization` ne sont PAS appliquées — elles supposent une identité, que
// le moteur n'a pas », et `visibleWhen` ne connaissait que des prédicats de
// DONNÉES. Une app générée ne pouvait donc pas distinguer un visiteur d'un
// utilisateur connecté : l'authentification était inexprimable AVANT même la
// question du backend.
//
// Ce module pose la COUTURE, sur le patron exact des fournisseurs de données
// et de capabilities : le code généré ne dépend d'aucune implémentation
// concrète. Une session RÉELLE (Supabase email/OTP, registre `auth`) est une
// implémentation de ce contrat — elle exige d'étendre le lock EMBARQUÉ du
// moteur, décision propriétaire (D-059), et n'est pas fournie ici.
//
// 🔴 LE DÉFAUT NE MENT PAS : sans fournisseur, la session est ANONYME. Il ne
// prétend jamais qu'un utilisateur est connecté — c'est l'équivalent, pour
// l'identité, du fournisseur de capabilities qui refuse et trace.
import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";

export interface SessionProvider {
  /** `true` si une identité est ÉTABLIE. Jamais une supposition. */
  estAuthentifie(): boolean;
  /** Identifiant de l'utilisateur courant — absent tant qu'aucune identité. */
  identifiant(): string | undefined;
  /** Abonnement aux changements d'état — rend la fonction de désabonnement. */
  abonner(ecouteur: () => void): () => void;
}

/** Défaut : ANONYME. Aucune identité n'a été établie, et rien ne le prétend. */
export const SESSION_ANONYME: SessionProvider = {
  estAuthentifie: () => false,
  identifiant: () => undefined,
  abonner: () => () => undefined,
};

const SessionContext = createContext<SessionProvider>(SESSION_ANONYME);

export function SessionRoot({
  provider,
  children,
}: PropsWithChildren<{ provider: SessionProvider }>) {
  return <SessionContext.Provider value={provider}>{children}</SessionContext.Provider>;
}

export function useSessionProvider(): SessionProvider {
  return useContext(SessionContext);
}
