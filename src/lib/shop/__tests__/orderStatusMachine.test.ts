import { describe, it, expect } from 'vitest';
import { isLegalOrderStatusTransition, ORDER_STATUS_TRANSITIONS, type OrderStatus } from '../orderStatusMachine';

// LOT H (Mode 3 global) -- verrouille la machine a etats applicative, source
// unique partagee par orders/route.ts (PATCH) et cj-tracking/route.ts (garde
// supplementaire), et qui DOIT rester identique au trigger DB
// (shop_order_status_machine.sql). Chaque paire ci-dessous reproduit
// exactement la liste exigee par l'audit LOT H.

const ALL_STATUSES: OrderStatus[] = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'canceled', 'refunded'];

describe('isLegalOrderStatusTransition — transitions legales', () => {
  it.each([
    ['pending', 'paid'],
    ['pending', 'canceled'],
    ['paid', 'processing'],
    ['paid', 'shipped'],
    ['paid', 'canceled'],
    ['paid', 'refunded'],
    ['processing', 'shipped'],
    ['processing', 'canceled'],
    ['processing', 'refunded'],
    ['shipped', 'delivered'],
  ] as [OrderStatus, OrderStatus][])('%s -> %s est autorisee', (from, to) => {
    expect(isLegalOrderStatusTransition(from, to)).toBe(true);
  });
});

describe('isLegalOrderStatusTransition — transitions illegales', () => {
  it.each([
    ['pending', 'shipped'],
    ['pending', 'delivered'],
    ['pending', 'processing'],
    ['pending', 'refunded'],
    ['canceled', 'shipped'],
    ['canceled', 'paid'],
    ['canceled', 'processing'],
    ['canceled', 'delivered'],
    ['canceled', 'refunded'],
    ['refunded', 'shipped'],
    ['refunded', 'paid'],
    ['refunded', 'processing'],
    ['refunded', 'delivered'],
    ['refunded', 'canceled'],
    ['delivered', 'shipped'],
    ['delivered', 'refunded'],
    ['delivered', 'paid'],
    ['delivered', 'processing'],
    ['delivered', 'canceled'],
    ['delivered', 'pending'],
    ['shipped', 'processing'],
    ['shipped', 'canceled'],
    ['shipped', 'refunded'],
    ['shipped', 'pending'],
    ['shipped', 'paid'],
    ['processing', 'pending'],
    ['processing', 'paid'],
    ['processing', 'delivered'],
    ['paid', 'pending'],
    ['paid', 'delivered'],
  ] as [OrderStatus, OrderStatus][])('%s -> %s est refusee', (from, to) => {
    expect(isLegalOrderStatusTransition(from, to)).toBe(false);
  });
});

describe('isLegalOrderStatusTransition — round-trip (statut identique)', () => {
  it.each(ALL_STATUSES)('%s -> %s (meme valeur) est toujours autorise, y compris depuis un etat terminal', (status) => {
    expect(isLegalOrderStatusTransition(status, status)).toBe(true);
  });
});

describe('ORDER_STATUS_TRANSITIONS — invariants de structure', () => {
  it('les 3 etats terminaux (delivered/canceled/refunded) ont un tableau de cibles vide', () => {
    expect(ORDER_STATUS_TRANSITIONS.delivered).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.canceled).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.refunded).toEqual([]);
  });

  it('toutes les cibles listees sont des OrderStatus valides (pas de typo silencieuse)', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ORDER_STATUS_TRANSITIONS[from]) {
        expect(ALL_STATUSES).toContain(to);
      }
    }
  });

  it('couverture exhaustive : chaque paire (from, to) des 7 statuts est classee legale ou illegale par ce test (49 combinaisons, 7 identite + 10 legales + 32 illegales)', () => {
    let legal = 0;
    let illegal = 0;
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (isLegalOrderStatusTransition(from, to)) legal++;
        else illegal++;
      }
    }
    // 7 identite (toujours legales) + 10 transitions reelles du graphe = 17.
    expect(legal).toBe(17);
    expect(illegal).toBe(49 - 17);
  });
});
