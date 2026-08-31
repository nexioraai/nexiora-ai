// FLUX DE PROVISIONING PROVIDER-AGNOSTIQUE (Phase 10 — ARCHITECTURE §7/§15).
//
// Pourquoi ce module existe : jusqu'ici l'orchestration vivait dans le
// script du slice 1. Une interface qu'aucun code partagé n'exerce n'est pas
// une abstraction — c'est une déclaration d'intention. La Phase 10 exige
// que l'abstraction provider soit « EXERCÉE » : le flux ci-dessous est donc
// écrit UNE fois, contre l'interface seule, et se déroule à l'identique
// avec l'implémentation réelle (Supabase, prouvée en Phase 5 sur un projet
// réel) comme avec un substitut.
//
// LEÇON DE LA PHASE 8 INTÉGRÉE (CHANGELOG 2026-08-28 : « projet Supabase
// orphelin après plantage du harnais ») : le démontage est dans un `finally`.
// Une panne au milieu du flux ne peut pas laisser de projet derrière elle.
import { ProvisioningError, type ProvisioningProvider } from "./provider.ts";

export interface ProvisioningRequest {
  readonly name: string;
  readonly sql: string;
  readonly healthTimeoutMs: number;
  /** Conserver le projet après le flux (false = démontage garanti). */
  readonly keep?: boolean;
  /**
   * Vérification métier exécutée APRÈS le SQL et AVANT le démontage. Elle
   * reçoit le provider — donc elle reste provider-agnostique — et rend un
   * verdict booléen plus un détail. Sans ce point d'ancrage, l'appelant
   * devrait ouvrir le flux pour vérifier, et perdrait la garantie de
   * démontage que ce module existe précisément pour offrir.
   */
  readonly verify?: (provider: ProvisioningProvider, ref: string) => Promise<{ ok: boolean; detail: string }>;
}

export interface ProvisioningStep {
  readonly step: "create" | "health" | "anon_key" | "sql" | "verify" | "teardown" | "absence";
  readonly ok: boolean;
  readonly detail: string;
}

export interface ProvisioningReport {
  readonly ok: boolean;
  readonly ref: string;
  readonly restUrl: string;
  readonly steps: readonly ProvisioningStep[];
  /** Le projet a-t-il été démonté ET son absence PROUVÉE ? */
  readonly tornDown: boolean;
}

const message = (e: unknown): string =>
  e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160);

/**
 * Déroule le cycle complet contre N'IMPORTE QUELLE implémentation de
 * `ProvisioningProvider`. Ne connaît aucun fournisseur concret : ce module
 * n'importe rien d'autre que le contrat (cliquet `provider-agnostic`).
 */
export async function runProvisioning(
  provider: ProvisioningProvider,
  request: ProvisioningRequest,
): Promise<ProvisioningReport> {
  const steps: ProvisioningStep[] = [];
  let ref = "";
  let restUrl = "";
  let tornDown = false;
  // DÉFAUT CORRIGÉ (incident du 2026-08-29) : l'étape en échec était DEVINÉE
  // depuis le nombre d'étapes déjà journalisées. Un échec pendant l'attente
  // de santé était donc consigné comme un échec « sql » — un journal FAUX,
  // qui aurait envoyé le diagnostic dans la mauvaise direction.
  let courante: ProvisioningStep["step"] = "create";
  try {
    const created = await provider.createProject(request.name);
    ref = created.ref;
    restUrl = created.restUrl;
    steps.push({ step: "create", ok: true, detail: `ref=${ref}` });

    courante = "health";
    await provider.waitHealthy(ref, request.healthTimeoutMs);
    steps.push({ step: "health", ok: true, detail: "projet sain" });

    courante = "anon_key";
    const anonKey = await provider.getAnonKey(ref);
    if (anonKey.length === 0) {
      throw new ProvisioningError("PROVISIONING_ANON_KEY_EMPTY", ref);
    }
    // La clé n'est JAMAIS journalisée (non-négociable #13) : on n'en publie
    // que la longueur, suffisante pour prouver qu'elle a été obtenue.
    steps.push({ step: "anon_key", ok: true, detail: `clé obtenue (${String(anonKey.length)} caractères)` });

    courante = "sql";
    await provider.executeSql(ref, request.sql);
    steps.push({ step: "sql", ok: true, detail: `${String(request.sql.length)} caractères appliqués` });

    courante = "verify";
    if (request.verify !== undefined) {
      const verdict = await request.verify(provider, ref);
      steps.push({ step: "verify", ok: verdict.ok, detail: verdict.detail });
      if (!verdict.ok) throw new ProvisioningError("PROVISIONING_VERIFY_FAILED", verdict.detail);
    }
  } catch (e) {
    steps.push({ step: courante, ok: false, detail: message(e) });
  } finally {
    // DÉMONTAGE GARANTI : même si le flux a échoué au milieu.
    if (ref !== "" && request.keep !== true) {
      // DÉFAUT CORRIGÉ (incident du 2026-08-29) : une seule tentative. Le
      // fournisseur avait refusé la suppression (400) parce que le projet
      // était encore en cours de création — et un projet est resté VIVANT.
      // « Démontage garanti » n'a de sens qu'avec une insistance bornée.
      const TENTATIVES = 3;
      let derniere = "";
      for (let essai = 1; essai <= TENTATIVES; essai += 1) {
        try {
          await provider.deleteProject(ref);
          steps.push({
            step: "teardown",
            ok: true,
            detail: `projet ${ref} supprimé${essai > 1 ? ` (tentative ${String(essai)})` : ""}`,
          });
          break;
        } catch (e) {
          derniere = message(e);
          if (essai === TENTATIVES) {
            steps.push({
              step: "teardown",
              ok: false,
              detail: `${TENTATIVES} tentatives échouées — DERNIER ÉTAT : ${derniere}`,
            });
          }
        }
      }
      // L'absence est vérifiée DANS TOUS LES CAS : même après un refus de
      // suppression, le projet peut avoir disparu — et inversement.
      try {
        const absent = await provider.isAbsent(ref);
        steps.push({
          step: "absence",
          ok: absent,
          detail: absent ? "absence prouvée côté fournisseur" : `le projet ${ref} est ENCORE listé`,
        });
        tornDown = absent;
      } catch (e) {
        steps.push({ step: "absence", ok: false, detail: message(e) });
      }
    }
  }
  return { ok: steps.every((s) => s.ok), ref, restUrl, steps, tornDown };
}
