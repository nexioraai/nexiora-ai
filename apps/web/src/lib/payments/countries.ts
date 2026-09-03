import 'server-only';

/**
 * Pays où Stripe permet la collecte d'adresse de livraison.
 * Liste des codes ISO 3166-1 alpha-2 supportés par Stripe Checkout.
 * Utilisée par défaut pour ne fermer aucun marché.
 */
export const STRIPE_SHIPPING_COUNTRIES = [
  'AC','AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CV','CW','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ',
  'EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IS','IT',
  'JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MK','ML','MM','MN','MO','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PY',
  'QA',
  'RE','RO','RS','RU','RW',
  'SA','SB','SC','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SZ',
  'TA','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','US','UY','UZ',
  'VA','VC','VE','VG','VN','VU',
  'WF','WS',
  'XK',
  'YE','YT',
  'ZA','ZM','ZW',
] as const;

/**
 * P0-3.9.7 — Pays où l'onboarding Stripe Connect (le marchand qui reçoit
 * des paiements) est effectivement confirmé pour Woorri — DISTINCT de
 * STRIPE_SHIPPING_COUNTRIES ci-dessus (qui ne couvre que la collecte
 * d'adresse de LIVRAISON côté acheteur, une liste Stripe globale très
 * permissive qui inclut des pays où Stripe Connect n'est pas disponible
 * pour un marchand — ex. le Tchad y figure).
 *
 * Volontairement minimale : seul le Canada est confirmé aujourd'hui.
 * Étendre cette liste est une décision produit/données (quels marchés
 * sont réellement couverts), pas une décision architecturale — à faire
 * quand ces marchés seront confirmés, sans changer resolvePaymentProvider().
 */
export const STRIPE_CONNECT_SUPPORTED_COUNTRIES = ['CA'] as const;
