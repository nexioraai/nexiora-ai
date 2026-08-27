import { z } from "zod";

// Identités stables (ARCHITECTURE §1) : chaque nœud porte un identifiant
// indépendant de son libellé — les modifications utilisateur ciblent un nœud,
// pas un texte. Le slug ne change JAMAIS après création.
const ID_BODY = "[a-z0-9][a-z0-9_]{0,61}";

export const idSchema = (prefix: string): z.ZodString =>
  z.string().regex(new RegExp(`^${prefix}_${ID_BODY}$`));

export const projectIdSchema = idSchema("prj");
export const screenIdSchema = idSchema("scr");
export const blockIdSchema = idSchema("blk");
export const routeIdSchema = idSchema("nav");
export const entityIdSchema = idSchema("ent");
export const fieldIdSchema = idSchema("fld");
export const relationIdSchema = idSchema("rel");
export const datasetIdSchema = idSchema("data");
export const actionIdSchema = idSchema("act");
export const ruleIdSchema = idSchema("rule");
export const slotIdSchema = idSchema("slot");
export const integrationIdSchema = idSchema("intg");
export const testIdSchema = idSchema("test");

// Référence de capability : clé du registre (ARCHITECTURE §2), pas un nœud
// AIR — le LLM demande la capacité, le registre décide de l'implémentation.
export const capabilityRefSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/);
