// GÉNÉRATEUR SQL DÉTERMINISTE (5.1, D-032 — ARCHITECTURE §7).
// AIR validé → script SQL COMPLET du backend de l'app : tables (PK texte),
// contraintes FK (ALTER après création — cycles impossibles à bloquer),
// CHECK d'énums, tables de jonction many_to_many, index sur FK, RLS
// ACTIVÉ deny-by-default (lecture D-032 : policies applicatives =
// phases auth), seed = fixtures déterministes D-030 (idempotent).
// PATRON ÉPROUVÉ DU DÉPÔT : idempotent-rejouable (IF NOT EXISTS /
// ON CONFLICT DO NOTHING), BARRIÈRES `RAISE EXCEPTION` fail-closed après
// chaque section. FONCTION PURE : zéro fs/réseau/horodatage — même AIR ⇒
// même SQL, octet pour octet ; le lock lie le script à l'AIR (airHash).
// Fail-closed : la validation passe par resolveLock (4 validateurs).
import type { ProjectAir, ProjectLock } from "@deribfy/air-schema";
import { buildDemoFixtures, resolveLock } from "@deribfy/compiler";

export interface GeneratedSql {
  lock: ProjectLock;
  sql: string;
  summary: {
    tables: readonly string[];
    joinTables: readonly string[];
    foreignKeys: number;
    checkConstraints: number;
    indexes: number;
    seedRowsByTable: Readonly<Record<string, number>>;
  };
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const ID_RE = /^[a-z][a-z0-9_]*$/;

export class SqlGenError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SqlGenError";
    this.code = code;
  }
}

const ident = (raw: string): string => {
  if (!ID_RE.test(raw)) throw new SqlGenError("SQLGEN_IDENT", raw);
  return `"${raw}"`;
};

const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;

// Types AIR → SQL (lecture D-032 §3). Colonnes NULLABLE sauf PK (lecture :
// l'application de `required` en NOT NULL arrive avec les phases de
// validation — les fixtures peuvent légitimement porter l'absence).
const SQL_TYPE: Readonly<Record<string, string>> = {
  string: "text",
  text: "text",
  number: "bigint",
  decimal: "numeric(12,2)",
  boolean: "boolean",
  date: "date",
  datetime: "timestamptz",
  enum: "text",
  reference: "text",
  asset: "text",
  json: "jsonb",
};

function barrier(name: string, condition: string, detail: string): string {
  return [
    "DO $$ BEGIN",
    `  IF NOT (${condition}) THEN`,
    `    RAISE EXCEPTION 'BARRIER:${name}: ${detail}';`,
    "  END IF;",
    "END $$;",
  ].join("\n");
}

export function generateProvisioningSql(input: unknown): GeneratedSql {
  const lock = resolveLock(input); // fail-closed (4 validateurs) + airHash.
  const air = input as ProjectAir;

  const entities = [...air.entities].sort((a, b) => byCodeUnit(a.id, b.id));
  const lines: string[] = [
    "-- GÉNÉRÉ PAR @deribfy/provisioner (D-032) — NE PAS ÉDITER.",
    `-- projectId: ${air.projectId}`,
    `-- airHash: ${lock.airHash}`,
    `-- releaseTrain: ${lock.resolved.releaseTrain.id}@${lock.resolved.releaseTrain.version}`,
    "-- Idempotent-rejouable ; barrières fail-closed par section.",
    "",
    "-- ===== SECTION 1 : TABLES =====",
  ];

  let checkConstraints = 0;
  for (const entity of entities) {
    const cols = [`  "id" text PRIMARY KEY`];
    for (const field of entity.fields) {
      const sqlType = SQL_TYPE[field.type];
      if (sqlType === undefined) throw new SqlGenError("SQLGEN_TYPE", field.type);
      cols.push(`  ${ident(field.id)} ${sqlType}`);
    }
    lines.push(`CREATE TABLE IF NOT EXISTS ${ident(entity.id)} (`);
    lines.push(cols.join(",\n"));
    lines.push(");");
  }
  const tableList = entities.map((e) => `to_regclass('public.${e.id}') IS NOT NULL`);
  lines.push(barrier("tables", tableList.join(" AND "), "table manquante"));

  lines.push("", "-- ===== SECTION 2 : CONTRAINTES (CHECK énums, FK) =====");
  let foreignKeys = 0;
  const addConstraint = (table: string, name: string, def: string): void => {
    lines.push(
      "DO $$ BEGIN",
      `  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN`,
      `    ALTER TABLE ${ident(table)} ADD CONSTRAINT ${ident(name)} ${def};`,
      "  END IF;",
      "END $$;",
    );
  };
  for (const entity of entities) {
    for (const field of entity.fields) {
      if (field.type === "enum" && (field.enumValues ?? []).length > 0) {
        checkConstraints += 1;
        const values = (field.enumValues ?? []).map(literal).join(", ");
        addConstraint(
          entity.id,
          `chk_${entity.id}_${field.id}`,
          `CHECK (${ident(field.id)} IS NULL OR ${ident(field.id)} IN (${values}))`,
        );
      }
      if (field.type === "reference" && field.referencesEntityId !== undefined) {
        foreignKeys += 1;
        addConstraint(
          entity.id,
          `fk_${entity.id}_${field.id}`,
          `FOREIGN KEY (${ident(field.id)}) REFERENCES ${ident(field.referencesEntityId)}("id")`,
        );
      }
    }
  }

  // Tables de jonction many_to_many (lecture D-032 §3).
  const joinTables: string[] = [];
  const m2m = [...air.relations]
    .filter((r) => r.kind === "many_to_many")
    .sort((a, b) => byCodeUnit(a.id, b.id));
  for (const rel of m2m) {
    const name = `jt_${rel.id}`;
    joinTables.push(name);
    lines.push(
      `CREATE TABLE IF NOT EXISTS ${ident(name)} (`,
      `  "from_id" text NOT NULL REFERENCES ${ident(rel.fromEntityId)}("id"),`,
      `  "to_id" text NOT NULL REFERENCES ${ident(rel.toEntityId)}("id"),`,
      `  PRIMARY KEY ("from_id", "to_id")`,
      ");",
    );
    foreignKeys += 2;
  }
  lines.push(
    barrier(
      "constraints",
      `(SELECT count(*) FROM pg_constraint WHERE conname LIKE 'fk\\_%' OR conname LIKE 'chk\\_%') >= ${foreignKeys - 2 * m2m.length + checkConstraints}`,
      "contraintes manquantes",
    ),
  );

  lines.push("", "-- ===== SECTION 3 : INDEX (colonnes FK) =====");
  let indexes = 0;
  for (const entity of entities) {
    for (const field of entity.fields) {
      if (field.type === "reference" && field.referencesEntityId !== undefined) {
        indexes += 1;
        lines.push(
          `CREATE INDEX IF NOT EXISTS ${ident(`ix_${entity.id}_${field.id}`)} ON ${ident(entity.id)} (${ident(field.id)});`,
        );
      }
    }
  }

  lines.push("", "-- ===== SECTION 4 : RLS deny-by-default (D-032) =====");
  const allTables = [...entities.map((e) => e.id), ...joinTables];
  for (const table of allTables) {
    lines.push(`ALTER TABLE ${ident(table)} ENABLE ROW LEVEL SECURITY;`);
  }
  lines.push(
    barrier(
      "rls",
      `(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) >= ${allTables.length}`,
      "RLS inactif sur au moins une table",
    ),
  );

  lines.push("", "-- ===== SECTION 5 : SEED (fixtures déterministes D-030) =====");
  const fixtures = buildDemoFixtures(air);
  const seedRowsByTable: Record<string, number> = {};
  for (const entityId of Object.keys(fixtures).sort(byCodeUnit)) {
    const entity = entities.find((e) => e.id === entityId);
    if (entity === undefined) continue;
    const rows = fixtures[entityId] ?? [];
    seedRowsByTable[entityId] = rows.length;
    const cols = ["id", ...entity.fields.map((f) => f.id)];
    for (const row of rows) {
      const values = [
        literal(row.id),
        ...entity.fields.map((f) => {
          const v = row.values[f.id] ?? "";
          return v === "" ? "NULL" : literal(v); // absence ⇒ NULL (D-032)
        }),
      ];
      lines.push(
        `INSERT INTO ${ident(entityId)} (${cols.map(ident).join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT ("id") DO NOTHING;`,
      );
    }
    lines.push(
      barrier(
        `seed_${entityId}`,
        `(SELECT count(*) FROM ${ident(entityId)}) >= ${rows.length}`,
        `seed incomplet pour ${entityId}`,
      ),
    );
  }

  return {
    lock,
    sql: lines.join("\n") + "\n",
    summary: {
      tables: entities.map((e) => e.id),
      joinTables,
      foreignKeys,
      checkConstraints,
      indexes,
      seedRowsByTable,
    },
  };
}
