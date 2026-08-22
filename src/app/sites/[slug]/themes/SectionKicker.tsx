// src/app/sites/[slug]/themes/SectionKicker.tsx
//
// Le petit label "xs uppercase tracking-large" au-dessus de chaque titre
// de section — recopié à l'identique dans les 4 thèmes actuels. Seule
// primitive extraite avant la modernisation des thèmes : ni Button ni
// ProductCard ne le sont, faute de justification suffisante (voir rapport
// Étape 1 — les boutons diffèrent réellement entre thèmes, un ProductCard
// commun serait prématuré avant d'avoir vu la nouvelle maquette de Noir).
export default function SectionKicker({
  children,
  color,
  className = '',
}: {
  children: React.ReactNode
  color: string
  className?: string
}) {
  return (
    <div className={`text-xs font-medium tracking-[0.2em] uppercase mb-4 ${className}`} style={{ color }}>
      {children}
    </div>
  )
}
