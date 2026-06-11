export interface BusinessUnderstanding {
activity: string | null
goal: string | null
scope: string | null
missing: string[]
}

export function analyzeBusiness(
message: string
): BusinessUnderstanding {

const text = message.toLowerCase()

let activity: string | null = null
let goal: string | null = null
let scope: string | null = null

/*
* ACTIVITÉ
*/

if (
text.includes('transport') ||
text.includes('logistique')
) {
activity = 'transport'
}

else if (
text.includes('restaurant') ||
text.includes('café') ||
text.includes('hotel')
) {
activity = 'hospitality'
}

else if (
text.includes('commerce') ||
text.includes('boutique') ||
text.includes('magasin')
) {
activity = 'retail'
}

else {
activity = 'general_business'
}

/*
* OBJECTIF
*/

if (
text.includes('site web') ||
text.includes('site')
) {
goal = 'website'
}

if (
text.includes('application') ||
text.includes('application mobile') ||
text.includes('mobile app')
) {
goal = 'mobile_app'
}

if (
text.includes('gestion') ||
text.includes('erp') ||
text.includes('système') ||
text.includes('gérer') ||
text.includes('administrer') ||
text.includes('suivre')
) {
goal = 'erp'
}

if (
text.includes('les trois')
) {
goal = 'all'
}

/*
* SCOPE
*/

if (
text.includes('tout gérer') ||
text.includes('entreprise complète') ||
text.includes('gestion complète')
) {
scope = 'full_business'
}

if (
text.includes('stock')
) {
scope = 'inventory'
}

if (
text.includes('client')
) {
scope = 'customers'
}

if (
text.includes('facturation')
) {
scope = 'billing'
}

if (
text.includes('véhicule')
) {
scope = 'fleet'
}

/*
* DÉDUCTION INTELLIGENTE
*/

if (
scope === 'full_business' &&
!goal
) {
goal = 'erp'
}

const missing: string[] = []

if (!goal) {
missing.push('goal')
}

if (
goal === 'erp' &&
!scope
) {
missing.push('scope')
}

return {
activity,
goal,
scope,
missing
}
}
