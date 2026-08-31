export function runSlot(entrees: { lignes: { fld_ligne_prix_ligne?: string }[]; devise: string }): { totalAffiche: string } {
  const total = entrees.lignes.reduce((s, l) => s + Number(l.fld_ligne_prix_ligne ?? 0), 0);
  return { totalAffiche: `Total : ${total.toLocaleString("fr-FR")} ${entrees.devise}` };
}
