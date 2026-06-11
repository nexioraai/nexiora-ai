import { anthropic } from '@/lib/anthropic'

export type IntentType = 'website' | 'erp'

/**
 * Détecte l'intention réelle de l'utilisateur à partir de son langage courant.
 * - website : la personne veut montrer quelque chose au public (vitrine, site, présence en ligne)
 * - erp     : la personne veut gérer/suivre/organiser son activité (clients, stock, employés, commandes, rendez-vous)
 * En cas de doute, retourne 'website' (flux le plus sûr).
 */
export async function detectIntent(message: string): Promise<IntentType> {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      system: `Tu classes l'intention d'un utilisateur qui décrit un besoin en langage courant. L'utilisateur n'est PAS informaticien : comprends le besoin réel derrière ses mots, pas le vocabulaire technique.

Deux catégories :
- "website" : la personne veut MONTRER quelque chose au public — un site vitrine, une présence en ligne, une page pour ses clients. Ex : restaurant, coiffeur, portfolio, landing page, "je veux un site pour ma boutique".
- "erp" : la personne veut GÉRER, SUIVRE ou ORGANISER son activité en interne — clients, stock, employés, commandes, livraisons, rendez-vous, patients, factures. Ex : "je veux gérer mes livraisons", "suivre mes patients et rendez-vous", "un système pour mon entreprise", "gérer mon hôpital".

Réponds UNIQUEMENT par un seul mot : website OU erp. Rien d'autre.`,
      messages: [{ role: 'user', content: message }],
    })

    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
      .toLowerCase()

    return text.includes('erp') ? 'erp' : 'website'
  } catch (err) {
    console.error('[detectIntent] error:', err)
    return 'website' // défaut sûr
  }
}
