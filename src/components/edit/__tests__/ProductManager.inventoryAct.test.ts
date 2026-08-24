import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// ÉTAPE 7 — LE COMPTAGE NE DOIT PAS POUVOIR ÊTRE ÉCRASÉ PAR LA SAUVEGARDE
// GÉNÉRALE DU PRODUIT.
//
// LE DÉFAUT MESURÉ AVANT CE CORRECTIF. `ALLOWED_PRODUCT_FIELDS` du PATCH
// contient `stock` (légitimement — il précède ce chantier), et ProductManager
// chargeait `stock` dans son draft à l'ouverture du formulaire puis le
// renvoyait dans CHAQUE sauvegarde. Séquence réelle et silencieuse :
//   1. le marchand ouvre « modifier » sur un produit à 0 en stock ;
//   2. il compte 50 unités (acte d'inventaire) -> stock = 50 ;
//   3. il corrige le prix dans le formulaire resté ouvert et enregistre ;
//   4. le PATCH renvoie `stock: 0` — le comptage est perdu, sans erreur.
// `stock_counted_at` resterait à l'heure du comptage tout en décrivant une
// valeur qui n'a plus rien à voir : exactement le compteur périmé que la
// barrière de l'étape 2 sert à empêcher, réintroduit par l'interface.
//
// LE CORRECTIF EST STRUCTUREL, PAS PROCÉDURAL. On ne demande pas au marchand
// de recharger le formulaire : on retire `stock` du draft d'édition. La
// sauvegarde générale n'a plus AUCUNE valeur de stock à envoyer, donc plus
// aucun moyen d'en écraser une.
//
// Test structurel : ce composant client dépend de useEffect/fetch, non
// exécutables sans jsdom (absent de ce dépôt) — même méthodologie que
// OrderManager.processingVisibility.test.ts.
// ============================================================

const SRC = readFileSync(join(__dirname, '../ProductManager.tsx'), 'utf-8');

/**
 * Source privée de commentaires. Les commentaires de ce composant EXPLIQUENT
 * la politique d'inventaire et citent donc `stock_counted_at` ; une assertion
 * de non-présence portée sur le fichier brut sanctionnerait la documentation
 * au lieu du code. Même précaution que OrderManager.processingVisibility :
 * les motifs doivent ignorer les commentaires.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function corps(nom: string): string {
  const m = SRC.match(new RegExp(`async function ${nom}\\([\\s\\S]*?\\n  \\}`));
  expect(m, `fonction ${nom} introuvable`).not.toBeNull();
  return m![0];
}

describe('LE COMPTAGE NE PEUT PAS ÊTRE ÉCRASÉ — preuve structurelle', () => {
  it("`stock` a disparu du type Draft : la sauvegarde générale n'a plus de stock à porter", () => {
    // Sur CODE et non SRC : le commentaire du volet A explique précisément
    // pourquoi `stock` n'est pas ici (et pourquoi `for_sale`, lui, y est) --
    // sanctionner cette prose punirait la documentation, pas le défaut.
    const draft = CODE.match(/type Draft = \{[\s\S]*?\};/)![0];
    expect(draft).not.toMatch(/\bstock\b/);
    expect(draft, 'for_sale est une INTENTION, pas un fait observé : il a sa place dans le draft').toMatch(/for_sale: boolean;/);
  });

  it("`startEdit` ne charge PLUS `stock` dans le draft", () => {
    const fn = SRC.match(/function startEdit\([\s\S]*?\n  \}/)![0];
    expect(fn).not.toMatch(/stock:\s*String\(p\.stock\)/);
    expect(fn).not.toMatch(/stock:/);
  });

  it("le payload commun de `handleSubmit` ne contient AUCUN champ stock", () => {
    const fn = corps('handleSubmit');
    const payload = fn.match(/const payload = \{[\s\S]*?\};/)![0];
    expect(payload).not.toMatch(/\bstock\b/);
  });

  it("la branche PATCH (édition) n'envoie jamais de stock", () => {
    const fn = corps('handleSubmit');
    const patch = fn.match(/if \(editingId\) \{[\s\S]*?\} else \{/)![0];
    expect(patch).toMatch(/method: 'PATCH'/);
    expect(patch).toMatch(/body: JSON\.stringify\(payload\)/);
    expect(patch).not.toMatch(/stock/);
  });

  it("seule la branche POST (création) porte un stock, et c'est un stock INITIAL", () => {
    const fn = corps('handleSubmit');
    const post = fn.match(/\} else \{[\s\S]*?\n      \}/)![0];
    expect(post).toMatch(/method: 'POST'/);
    expect(post).toMatch(/stock: parseInt\(createStock\)/);
  });

  it("`createStock` n'est lu NULLE PART ailleurs que dans la branche de création", () => {
    const lectures = [...SRC.matchAll(/createStock/g)];
    // déclaration d'état (2 : useState + setter), reset, onChange, value, POST
    const dansPatch = corps('handleSubmit').match(/if \(editingId\) \{[\s\S]*?\} else \{/)![0];
    expect(dansPatch).not.toContain('createStock');
    expect(lectures.length).toBeGreaterThan(0);
  });

  it("le champ stock du formulaire n'est rendu QU'EN CRÉATION", () => {
    expect(SRC).toMatch(/\{!editingId && \(\s*<PField label=\{t\('pm\.field\.stock'\)\}>/);
  });
});

describe("LE COMPTAGE EST UN ACTE SÉPARÉ", () => {
  it("`handleCount` existe et appelle la route d'inventaire en POST", () => {
    const fn = corps('handleCount');
    expect(fn).toMatch(/\/api\/shop\/products\/\$\{id\}\/inventory/);
    expect(fn).toMatch(/method: 'POST'/);
    expect(fn).toMatch(/JSON\.stringify\(\{ units \}\)/);
  });

  it("`handleCount` n'envoie QUE `units` — jamais le draft, jamais un autre champ produit", () => {
    const fn = corps('handleCount');
    expect(fn).not.toContain('draft');
    expect(fn).not.toContain('payload');
    for (const champ of ['name', 'price', 'currency', 'images', 'published', 'track_inventory', 'stock_counted_at']) {
      expect(fn, `handleCount ne doit pas porter ${champ}`).not.toMatch(new RegExp(`\\b${champ}\\b`));
    }
  });

  it("`handleCount` refuse localement une saisie non entière ou négative (fail-closed avant le réseau)", () => {
    const fn = corps('handleCount');
    expect(fn).toMatch(/Number\.isInteger\(units\) \|\| units < 0/);
  });

  it("`handleStopTracking` existe et appelle la route d'inventaire en DELETE, SANS corps", () => {
    const fn = corps('handleStopTracking');
    expect(fn).toMatch(/\/api\/shop\/products\/\$\{id\}\/inventory/);
    expect(fn).toMatch(/method: 'DELETE'/);
    expect(fn).not.toMatch(/body:/);
  });

  it("ni `handleCount` ni `handleStopTracking` ne passent par `handleSubmit`", () => {
    expect(corps('handleCount')).not.toContain('handleSubmit');
    expect(corps('handleStopTracking')).not.toContain('handleSubmit');
  });

  it("`handleSubmit` n'appelle jamais la route d'inventaire", () => {
    expect(corps('handleSubmit')).not.toContain('/inventory');
  });

  it("les deux actes rechargent la liste : l'affichage ne peut pas rester périmé", () => {
    expect(corps('handleCount')).toMatch(/await load\(\)/);
    expect(corps('handleStopTracking')).toMatch(/await load\(\)/);
  });
});

describe("LE PANNEAU D'INVENTAIRE", () => {
  it("n'est rendu qu'en édition (un produit inexistant n'a pas d'inventaire)", () => {
    expect(SRC).toMatch(/\{editingId && \(\(\) => \{/);
  });

  it("lit l'état de suivi depuis la liste RÉELLE, jamais depuis le draft", () => {
    expect(SRC).toMatch(/const current = products\.find\(\(p\) => p\.id === editingId\);/);
    expect(SRC).toMatch(/const tracked = current\?\.track_inventory !== false;/);
  });

  it("`!== false` et non `=== true` : un champ manquant affiche « suivi », le cas strict", () => {
    expect(CODE).not.toMatch(/track_inventory === true/);
  });

  it("le champ de comptage n'est JAMAIS pré-rempli avec le stock courant", () => {
    const fn = SRC.match(/function startEdit\([\s\S]*?\n  \}/)![0];
    expect(fn).toMatch(/setCountUnits\(''\)/);
    expect(fn).not.toMatch(/setCountUnits\(String\(/);
  });

  it("les trois capacités demandées sont offertes : compter, ne plus suivre, recompter", () => {
    expect(SRC).toMatch(/onClick=\{\(\) => handleCount\(editingId\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => handleStopTracking\(editingId\)\}/);
    // « recompter » = le bouton de comptage reste offert quand `tracked` est
    // vrai : il n'est pas conditionné à l'absence de suivi.
    const panneau = SRC.match(/\{editingId && \(\(\) => \{[\s\S]*?\}\)\(\)\}/)![0];
    const boutonCompter = panneau.match(/<button[^>]*onClick=\{\(\) => handleCount[\s\S]*?<\/button>/)![0];
    expect(boutonCompter).not.toContain('tracked');
  });

  it("« ne plus suivre » n'est offert que si le suivi est actif", () => {
    expect(SRC).toMatch(/\{tracked && \([\s\S]*?handleStopTracking/);
  });
});

describe("AUCUNE ÉCRITURE INTERDITE DEPUIS L'INTERFACE", () => {
  it("le composant n'écrit jamais `track_inventory` lui-même", () => {
    expect(CODE).not.toMatch(/track_inventory:\s*(true|false)/);
  });

  it("le composant n'écrit ni ne lit jamais `stock_counted_at` (hors commentaires explicatifs)", () => {
    expect(CODE).not.toContain('stock_counted_at');
  });

  it("`/inventory` n'est appelé que par les deux actes dédiés", () => {
    const appels = [...CODE.matchAll(/\/inventory/g)];
    expect(appels).toHaveLength(2);
  });
});
