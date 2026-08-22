import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Audit Mode 3/POD BRAND -- cause racine démontrée : pod-fulfill.ts pose
// shop_orders.status='processing' pour toute commande POD (Printful/Gelato)
// dès qu'au moins un item est réellement créé chez le fournisseur, mais
// AVANT ce correctif, ce statut n'apparaissait dans AUCUN onglet
// (TABS: 'pending,paid' / 'shipped' / 'delivered' / 'canceled') --
// la commande devenait invisible dans le tableau de bord marchand dès le
// paiement, et le contrôle "saisir le suivi" n'était rendu que pour
// `o.status === 'paid'`, donc jamais disponible non plus. Aucune voie,
// automatique ou manuelle, ne permettait alors de faire progresser une
// commande POD vers 'shipped'.
//
// Test structurel (pas de rendu React : ce composant client dépend de
// useEffect/fetch, non exécutables sans jsdom, absent de ce dépôt --
// vérifie donc le code source réel, avec des motifs précis qui ignorent
// les commentaires, pas une simple sous-chaîne naïve -- même méthodologie
// que productModalDescription.test.tsx (SEC-09).

const SOURCE = readFileSync(
  join(__dirname, '../OrderManager.tsx'),
  'utf-8'
);

describe("OrderManager -- visibilité et actionnabilité des commandes 'processing' (POD)", () => {
  it("le bucket 'en cours' (premier onglet) inclut désormais 'processing', pas seulement pending/paid", () => {
    const tabsMatch = SOURCE.match(/key:\s*'([a-z,]+)',\s*tkey:\s*'om\.tab\.inProgress'/);
    expect(tabsMatch).not.toBeNull();
    const statuses = tabsMatch![1].split(',');
    expect(statuses).toContain('pending');
    expect(statuses).toContain('paid');
    expect(statuses).toContain('processing');
  });

  it("STATUS_LABELS définit une entrée réelle pour 'processing' (jamais un statut affiché sans étiquette)", () => {
    expect(SOURCE).toMatch(/processing:\s*\{\s*tkey:\s*'om\.status\.processing'/);
  });

  it("le contrôle de saisie du suivi (markShipped) se rend aussi pour 'processing', pas seulement 'paid' -- sinon aucune commande POD ne peut jamais être marquée expédiée", () => {
    // Motif JSX réel (accolade + expression), ignore toute mention en commentaire.
    expect(SOURCE).toMatch(/\{\(o\.status === 'paid' \|\| o\.status === 'processing'\) && \(/);
  });

  it("aucun autre onglet (shipped/delivered/canceled) n'a été altéré par erreur", () => {
    expect(SOURCE).toMatch(/key:\s*'shipped',\s*tkey:\s*'om\.tab\.shipped'/);
    expect(SOURCE).toMatch(/key:\s*'delivered',\s*tkey:\s*'om\.tab\.delivered'/);
    expect(SOURCE).toMatch(/key:\s*'canceled',\s*tkey:\s*'om\.tab\.canceled'/);
  });
});

describe("OrderManager -- transition 'shipped' -> 'delivered' (perfectionnement Mode 3/POD BRAND)", () => {
  it("le contrôle 'marquer livrée' se rend uniquement pour les commandes 'shipped'", () => {
    expect(SOURCE).toMatch(/\{o\.status === 'shipped' && \(/);
    expect(SOURCE).toMatch(/onClick=\{\(\) => markDelivered\(o\.id\)\}/);
  });

  it("markDelivered envoie targetStatus:'delivered' au PATCH, jamais de tracking_number (déjà posé à l'expédition)", () => {
    const fnMatch = SOURCE.match(/const markDelivered = async[\s\S]*?\n  \};/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/targetStatus:\s*'delivered'/);
    expect(fnMatch![0]).not.toMatch(/trackingNumber/);
  });
});
