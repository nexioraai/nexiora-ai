export function detectERPType(prompt: string) {
const p = prompt.toLowerCase();

if (
p.includes('hospital') ||
p.includes('hôpital') ||
p.includes('hopital') ||
p.includes('clinic')
) {
return 'hospital';
}

if (
p.includes('school') ||
p.includes('college') ||
p.includes('école') ||
p.includes('ecole')
) {
return 'school';
}

if (
p.includes('garage') ||
p.includes('mechanic') ||
p.includes('mécanique') ||
p.includes('mecanique')
) {
return 'garage';
}

if (
p.includes('shop') ||
p.includes('store') ||
p.includes('boutique') ||
p.includes('magasin')
) {
return 'retail';
}

if (
p.includes('travel') ||
p.includes('agency') ||
p.includes('voyage')
) {
return 'travel';
}

if (
p.includes('restaurant') ||
p.includes('resto')
) {
return 'restaurant';
}

if (
p.includes('pharmacy') ||
p.includes('pharmacie')
) {
return 'pharmacy';
}

return null;
}