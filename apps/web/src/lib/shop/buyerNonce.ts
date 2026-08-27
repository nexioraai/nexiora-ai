/**
 * Identifiant d'ACHETEUR, cote navigateur. Aleatoire, persistant.
 *
 * CAUSE RACINE CORRIGEE (LOT 3) -- la version precedente
 * (`checkoutNonce.ts`) derivait le nonce du CONTENU DU PANIER. Consequence
 * non vue lors de sa livraison : deux acheteurs anonymes avec le meme
 * panier, le meme pays et le meme palier produisaient une chaine canonique
 * IDENTIQUE, donc la meme cle d'idempotence Stripe, donc -- Stripe
 * renvoyant la reponse mise en cache pour une cle deja vue -- LA MEME
 * SESSION DE PAIEMENT. Le second acheteur se voyait servir la session du
 * premier, et l'INSERT de sa commande entrait en conflit sur
 * `payment_ref` UNIQUE : les deux acheteurs partageaient une seule commande.
 *
 * Une cle d'idempotence doit identifier UNE TENTATIVE D'ACHAT, pas un
 * contenu de panier. Ce module fournit la moitie "qui achete" ; le serveur
 * fournit la moitie "quel etat commercial" (voir checkoutSignature.ts).
 * Aucune des deux ne suffit seule :
 *   - etat commercial seul  -> collision entre acheteurs (le defaut ci-dessus) ;
 *   - nonce acheteur seul   -> une modification du panier ne changerait pas
 *                              la cle, et Stripe rejetterait le rejeu avec
 *                              des parametres differents (idempotency_error).
 *
 * `localStorage` et non `sessionStorage` : la protection visee couvre
 * explicitement les deux onglets ouverts sur le meme panier. Deux onglets du
 * meme navigateur doivent partager la meme identite d'acheteur pour que
 * Stripe dedoublonne au lieu de creer deux sessions.
 *
 * Aucune donnee personnelle : valeur aleatoire opaque, jamais correlee a un
 * compte, une adresse ou un moyen de paiement.
 */
const STORAGE_KEY = 'deribfy_buyer_nonce';

function randomId(): string {
  // crypto.randomUUID exige un contexte securise ; en son absence on retombe
  // sur getRandomValues, puis sur Math.random en dernier recours (le nonce
  // n'a pas d'exigence cryptographique : il doit seulement etre unique par
  // navigateur, pas imprevisible).
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const a = new Uint32Array(4);
      crypto.getRandomValues(a);
      return Array.from(a, (n) => n.toString(16).padStart(8, '0')).join('');
    }
  } catch {
    // storage/crypto indisponibles : on retombe plus bas.
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Retourne l'identifiant d'acheteur de ce navigateur, en le creant au
 * premier appel. Stable entre onglets, entre rechargements et entre
 * modifications du panier -- c'est precisement ce qui permet a un
 * double-clic ou a une resoumission reseau de retomber sur la meme session
 * Stripe.
 *
 * En mode navigation privee stricte ou si localStorage est indisponible,
 * retourne une valeur aleatoire non persistee : l'idempotence est alors
 * perdue pour ce navigateur, mais le checkout continue de fonctionner --
 * jamais l'inverse.
 */
export function getBuyerNonce(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
    const fresh = randomId();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}
