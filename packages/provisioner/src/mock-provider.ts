// SUBSTITUT DE PROVIDER DE PROVISIONING (Phase 10 — §15 : « 1 mock de
// substitution prouvant le remplacement »).
//
// Ce n'est PAS un second fournisseur commercial : §15 interdit d'en coder
// « pour le principe ». C'est un substitut explicite, en mémoire et
// déterministe, dont l'unique rôle est de PROUVER que le flux de
// provisioning ne dépend d'aucune implémentation concrète.
//
// Il reproduit les GARANTIES du vrai provider, pas seulement sa signature :
//  - ne supprime QUE les refs qu'il a lui-même créés (registre interne) ;
//  - `isAbsent` répond sur l'état réel de son registre ;
//  - échec explicite sur un ref inconnu, jamais un succès silencieux.
// Un substitut plus permissif que l'original prouverait moins que rien : il
// ferait passer des flux que le vrai fournisseur refuserait.
import { ProvisioningError, type CreatedProject, type ProvisioningProvider } from "./provider.ts";

export class MockProvisioningProvider implements ProvisioningProvider {
  private counter = 0;
  private readonly owned = new Map<string, { healthy: boolean; sql: string[] }>();

  /** SQL réellement appliqué, par ref — permet d'assertion en test. */
  appliedSql(ref: string): readonly string[] {
    return this.owned.get(ref)?.sql ?? [];
  }

  createProject(name: string): Promise<CreatedProject> {
    this.counter += 1;
    // Ref DÉTERMINISTE (aucune horloge, aucun aléa) : deux exécutions du
    // même scénario produisent exactement les mêmes identifiants.
    const ref = `mock${String(this.counter).padStart(4, "0")}${name.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`;
    this.owned.set(ref, { healthy: false, sql: [] });
    return Promise.resolve({ ref, restUrl: `https://${ref}.mock.invalid` });
  }

  waitHealthy(ref: string, timeoutMs: number): Promise<void> {
    const project = this.owned.get(ref);
    if (project === undefined) {
      return Promise.reject(new ProvisioningError("PROVISIONING_REF_UNKNOWN", ref));
    }
    // Le budget de temps est HONORÉ, pas ignoré : un délai non positif ne
    // peut pas aboutir, et le substitut doit refuser là où le vrai
    // fournisseur refuserait — sans quoi il ferait passer des flux
    // impossibles en production.
    if (timeoutMs <= 0) {
      return Promise.reject(new ProvisioningError("PROVISIONING_TIMEOUT", ref));
    }
    project.healthy = true;
    return Promise.resolve();
  }

  getAnonKey(ref: string): Promise<string> {
    if (!this.owned.has(ref)) {
      return Promise.reject(new ProvisioningError("PROVISIONING_REF_UNKNOWN", ref));
    }
    return Promise.resolve(`anon.${ref}.substitut`);
  }

  executeSql(ref: string, sql: string): Promise<unknown> {
    const project = this.owned.get(ref);
    if (project === undefined) {
      return Promise.reject(new ProvisioningError("PROVISIONING_REF_UNKNOWN", ref));
    }
    if (!project.healthy) {
      return Promise.reject(new ProvisioningError("PROVISIONING_NOT_HEALTHY", ref));
    }
    project.sql.push(sql);
    return Promise.resolve({ applied: true });
  }

  deleteProject(ref: string): Promise<void> {
    if (!this.owned.has(ref)) {
      // Même garde que l'implémentation réelle : on ne détruit jamais ce
      // qu'on n'a pas créé.
      return Promise.reject(new ProvisioningError("PROVISIONING_NOT_OWNED", ref));
    }
    this.owned.delete(ref);
    return Promise.resolve();
  }

  isAbsent(ref: string): Promise<boolean> {
    return Promise.resolve(!this.owned.has(ref));
  }
}
