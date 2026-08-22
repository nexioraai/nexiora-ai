import { describe, it, expect } from 'vitest';
import { classifyCjOrderStatus } from '../statusMap';

// Audit Reseller/CJ : verrouille la traduction statut CJ brut -> classe
// metier, seul endroit du code ou ces chaines sont comparees. Couvre les 9
// statuts officiellement documentes (developers.cjdropshipping.cn) + TRASH
// (observe empiriquement, non documente) + valeurs inconnues/absentes.

describe('classifyCjOrderStatus', () => {
  it.each(['UNSHIPPED', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'])(
    '%s -> paid (documente comme paye, PENDING/PROCESSING sous-statuts de UNSHIPPED)',
    (status) => {
      expect(classifyCjOrderStatus(status)).toBe('paid');
    }
  );

  it.each(['CREATED', 'UNPAID'])('%s -> awaiting (ni payé ni terminal)', (status) => {
    expect(classifyCjOrderStatus(status)).toBe('awaiting');
  });

  it('CANCELLED -> terminal (documenté)', () => {
    expect(classifyCjOrderStatus('CANCELLED')).toBe('terminal');
  });

  it('TRASH -> terminal (observé réellement, non documenté -- traité par précaution comme CANCELLED)', () => {
    expect(classifyCjOrderStatus('TRASH')).toBe('terminal');
  });

  it('IN_CART -> unrecognized (documenté mais non pertinent pour notre flux, ne doit jamais être deviné)', () => {
    expect(classifyCjOrderStatus('IN_CART')).toBe('unrecognized');
  });

  it('OTHER -> unrecognized (filtre de liste CJ, jamais une vraie valeur de commande)', () => {
    expect(classifyCjOrderStatus('OTHER')).toBe('unrecognized');
  });

  it('valeur totalement inconnue -> unrecognized, jamais une classe supposée', () => {
    expect(classifyCjOrderStatus('SOME_FUTURE_CJ_STATUS')).toBe('unrecognized');
  });

  it('null/undefined/chaîne vide -> unrecognized, jamais paid/awaiting/terminal par défaut', () => {
    expect(classifyCjOrderStatus(null)).toBe('unrecognized');
    expect(classifyCjOrderStatus(undefined)).toBe('unrecognized');
    expect(classifyCjOrderStatus('')).toBe('unrecognized');
  });

  it('insensible à la casse (CJ documente en majuscules, on ne suppose pas la casse réelle)', () => {
    expect(classifyCjOrderStatus('shipped')).toBe('paid');
    expect(classifyCjOrderStatus('Unpaid')).toBe('awaiting');
  });
});
