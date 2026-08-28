// INTERFACE DE PROVISIONING (5.2, D-032 — ARCHITECTURE §7/§15) : le
// Provisioner parle à cette interface, jamais à Supabase en dur.
// Implémentation Supabase = SEUL module réseau du paquet (consigné) ;
// le token est INJECTÉ par l'appelant (jamais lu ni journalisé ici).
// Garde-fous : l'implémentation ne détruit que des refs qu'ELLE a créés
// (registre interne du run) ; org unique fixée à la construction ;
// ≥1,1 s entre appels Management API (rate limits).

export interface CreatedProject {
  ref: string;
  restUrl: string;
}

export interface ProvisioningProvider {
  createProject(name: string): Promise<CreatedProject>;
  waitHealthy(ref: string, timeoutMs: number): Promise<void>;
  getAnonKey(ref: string): Promise<string>;
  executeSql(ref: string, sql: string): Promise<unknown>;
  deleteProject(ref: string): Promise<void>;
  /** Preuve d'absence : le ref n'apparaît plus dans le listing de l'org. */
  isAbsent(ref: string): Promise<boolean>;
}

export class ProvisioningError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ProvisioningError";
    this.code = code;
  }
}

const API = "https://api.supabase.com";
const CALL_SPACING_MS = 1100;

export class SupabaseProvider implements ProvisioningProvider {
  private readonly token: string;
  private readonly orgSlug: string;
  private orgId: string | undefined;
  private lastCall = 0;
  /** Refs créés par CETTE instance — seuls refs supprimables. */
  private readonly ownedRefs = new Set<string>();

  constructor(options: { token: string; orgSlug: string }) {
    this.token = options.token;
    this.orgSlug = options.orgSlug;
  }

  private async mgmt(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const wait = this.lastCall + CALL_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall = Date.now();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  }

  private async resolveOrg(): Promise<string> {
    if (this.orgId !== undefined) return this.orgId;
    const detail = await this.mgmt("GET", `/v1/organizations/${this.orgSlug}`);
    const plan = (
      (detail.json as { plan?: string } | undefined)?.plan ?? ""
    ).toLowerCase();
    if (detail.status !== 200) {
      throw new ProvisioningError("PROV_ORG", `org introuvable (${detail.status})`);
    }
    // Plafond 0 $ (D-032) : plan free EXIGÉ, vérifié avant toute création.
    if (plan !== "free") {
      throw new ProvisioningError("PROV_PLAN", `plan '${plan}' ≠ free — STOP avant création`);
    }
    const id = (detail.json as { id?: string }).id;
    if (typeof id !== "string") throw new ProvisioningError("PROV_ORG", "id d'org absent");
    this.orgId = id;
    return id;
  }

  async createProject(name: string): Promise<CreatedProject> {
    const organizationId = await this.resolveOrg();
    const dbPass = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62])
      .join("");
    const created = await this.mgmt("POST", "/v1/projects", {
      name,
      organization_id: organizationId,
      region: "us-east-1",
      db_pass: dbPass,
    });
    const ref = (created.json as { id?: string } | undefined)?.id;
    if (created.status >= 300 || typeof ref !== "string") {
      throw new ProvisioningError(
        "PROV_CREATE",
        `création refusée (${created.status}): ${JSON.stringify(created.json).slice(0, 300)}`,
      );
    }
    this.ownedRefs.add(ref);
    return { ref, restUrl: `https://${ref}.supabase.co/rest/v1/` };
  }

  async waitHealthy(ref: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const p = await this.mgmt("GET", `/v1/projects/${ref}`);
      if ((p.json as { status?: string } | undefined)?.status === "ACTIVE_HEALTHY") return;
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new ProvisioningError("PROV_TIMEOUT", `jamais ACTIVE_HEALTHY (${ref})`);
  }

  async getAnonKey(ref: string): Promise<string> {
    const keys = await this.mgmt("GET", `/v1/projects/${ref}/api-keys`);
    const anon = Array.isArray(keys.json)
      ? (keys.json as { name: string; api_key: string }[]).find((k) => k.name === "anon")
      : undefined;
    if (anon === undefined) throw new ProvisioningError("PROV_KEYS", "clé anon absente");
    return anon.api_key;
  }

  async executeSql(ref: string, sql: string): Promise<unknown> {
    const res = await this.mgmt("POST", `/v1/projects/${ref}/database/query`, {
      query: sql,
    });
    if (res.status >= 300) {
      throw new ProvisioningError(
        "PROV_SQL",
        `exécution refusée (${res.status}): ${JSON.stringify(res.json).slice(0, 300)}`,
      );
    }
    return res.json;
  }

  async deleteProject(ref: string): Promise<void> {
    if (!this.ownedRefs.has(ref)) {
      // Garde-fou absolu : jamais de suppression d'un ref non créé par
      // cette instance (nexiora-ai hors d'atteinte par construction).
      throw new ProvisioningError("PROV_FORBIDDEN", `ref non possédé: ${ref}`);
    }
    const del = await this.mgmt("DELETE", `/v1/projects/${ref}`);
    if (del.status >= 300) {
      throw new ProvisioningError("PROV_DELETE", `suppression refusée (${del.status})`);
    }
  }

  async isAbsent(ref: string): Promise<boolean> {
    const listing = await this.mgmt("GET", "/v1/projects");
    return !(
      Array.isArray(listing.json) &&
      (listing.json as { id: string }[]).some((p) => p.id === ref)
    );
  }
}
