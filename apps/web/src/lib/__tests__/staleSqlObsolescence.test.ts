import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// DETTE 1 — UN FICHIER SQL À MOITIÉ PÉRIMÉ, ET LE PIÈGE QU'IL POSE.
//
// `shop_stock_functions.sql` définit DEUX fonctions, et une seule fait encore
// autorité :
//
//   `decrement_shop_stock_batch` — PÉRIMÉE. Remplacée à l'étape 4 du chantier
//   catalogue canonique. La version de ce fichier ignore `track_inventory`
//   (0 occurrence) : la rejouer ferait échouer EN BLOC toute commande mêlant
//   un produit suivi et un produit non suivi, déclenchant un remboursement
//   Stripe automatique.
//
//   `cancel_shop_order` — SEULE définition versionnée du dépôt, et c'est
//   celle qui est déployée. Le fichier ne peut donc pas être supprimé.
//
// POURQUOI CE CLIQUET EXISTE. La régression serait SILENCIEUSE : les cliquets
// de ce dépôt lisent des fichiers, jamais la base. Rien ne détecterait qu'une
// fonction a été remise dans son état d'avant. Ce test ne peut pas empêcher
// l'exécution du SQL — mais il empêche l'AVERTISSEMENT de disparaître, et
// c'est la seule chose qu'un test exécutable pouvait réellement tenir.
//
// CE QU'IL NE PROUVE PAS : que la base porte bien la version de l'étape 4.
// Cette preuve-là est comportementale, elle vit dans le banc SQL exécuté en
// production (12/12). Prétendre le contraire ici serait fabriquer du vert.
// C'est précisément le trou que la dette 5 (cliquet SQL ↔ base) doit combler.
// ============================================================

const SQL_DIR = join(__dirname, '../../../supabase/sql');
const HISTORIQUE = join(SQL_DIR, 'shop_stock_functions.sql');
const CANONIQUE = join(SQL_DIR, 'shop_products_inventory_policy_step4_decrement_respects_tracking.sql');

const src = (p: string) => readFileSync(p, 'utf-8');

describe('DETTE 1 — `shop_stock_functions.sql` porte son avertissement d\'obsolescence', () => {
  it("A. le fichier s'ouvre sur un avertissement d'obsolescence", () => {
    const debut = src(HISTORIQUE).slice(0, 1200);
    expect(debut).toMatch(/AVERTISSEMENT D'OBSOLESCENCE/);
    expect(debut).toMatch(/PÉRIMÉ/);
  });

  it('B. l\'avertissement nomme le fichier canonique — et ce fichier EXISTE', () => {
    const nom = 'supabase/sql/shop_products_inventory_policy_step4_decrement_respects_tracking.sql';
    expect(src(HISTORIQUE)).toContain(nom);
    // Un avertissement qui pointe vers un fichier introuvable serait pire que
    // pas d'avertissement du tout : il enverrait chercher au mauvais endroit.
    expect(() => src(CANONIQUE)).not.toThrow();
  });

  it('C. la section historique est marquée juste AVANT sa définition', () => {
    const s = src(HISTORIQUE);
    const marqueur = s.indexOf('SECTION PÉRIMÉE — NE PAS REJOUER');
    const definition = s.indexOf('create or replace function decrement_shop_stock_batch(');
    expect(marqueur, 'le marqueur de section doit exister').toBeGreaterThan(-1);
    // Le danger doit être visible même en arrivant directement à cette partie
    // du fichier, sans avoir lu l'en-tête.
    expect(marqueur).toBeLessThan(definition);
    expect(definition - marqueur).toBeLessThan(1500);
  });

  it('D. `cancel_shop_order` est toujours présente — ce fichier en est la SEULE source', () => {
    expect(src(HISTORIQUE)).toMatch(/create or replace function cancel_shop_order\(/);
    // Vérification de l'unicité : si une seconde définition apparaissait
    // ailleurs, ce fichier cesserait d'être la source unique et cette dette
    // changerait de nature.
    const ailleurs = ['shop_products_inventory_policy_step4_decrement_respects_tracking.sql',
                      'shop_products_inventory_policy_step3_enable_tracking.sql',
                      'shop_order_status_machine.sql']
      .filter((f) => /create or replace function cancel_shop_order\(/.test(src(join(SQL_DIR, f))));
    expect(ailleurs, 'cancel_shop_order ne doit être définie que dans shop_stock_functions.sql').toEqual([]);
  });

  it('E. le fichier de l\'étape 4 porte bien la définition canonique', () => {
    const s = src(CANONIQUE);
    expect(s).toMatch(/create or replace function decrement_shop_stock_batch\(/);
    // Ce qui distingue la canonique de l'historique, en une ligne :
    expect(s).toContain('and track_inventory is true');
  });

  it('la version historique, elle, ignore toujours `track_inventory` — c\'est CE qui la rend dangereuse', () => {
    const bloc = src(HISTORIQUE).slice(
      src(HISTORIQUE).indexOf('create or replace function decrement_shop_stock_batch('),
      src(HISTORIQUE).indexOf('create or replace function cancel_shop_order(')
    );
    expect(bloc).not.toContain('track_inventory');
  });

  it('AUCUNE instruction SQL fonctionnelle n\'a été ajoutée par cet avertissement', () => {
    // Inventaire EXACT des instructions exécutables, relevé sur le fichier
    // réel. Toute variation signifierait que l'avertissement a débordé en
    // action — ce qu'il ne doit jamais faire : il n'ajoute que des
    // commentaires.
    const code = src(HISTORIQUE).split('\n').filter((l) => !l.trimStart().startsWith('--'));
    expect(code.filter((l) => /^\s*create or replace function/.test(l))).toHaveLength(2);
    expect(code.filter((l) => /^\s*revoke\s/i.test(l))).toHaveLength(6);
    expect(code.filter((l) => /^\s*grant\s/i.test(l))).toHaveLength(2);

    // Les deux seules instructions de schéma du fichier, toutes deux
    // PRÉEXISTANTES et idempotentes : le nettoyage de l'ancienne signature
    // à un argument, et la colonne de marquage sur laquelle repose
    // `cancel_shop_order`.
    const schema = code.filter((l) => /^\s*(alter|drop)\s/i.test(l)).map((l) => l.trim());
    expect(schema).toEqual([
      'drop function if exists decrement_shop_stock_batch(jsonb);',
      'alter table shop_order_items add column if not exists stock_decremented boolean not null default false;',
    ]);
  });
});
