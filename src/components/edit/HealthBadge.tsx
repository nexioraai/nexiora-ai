'use client';

/**
 * Badge de sante du site. Ne dependait plus que de la visibilite IA depuis
 * le retrait des alertes CJ (le marchand ne gere plus ni solde, ni paiement,
 * ni stock fournisseur : Nexiora s'en charge).
 */
export default function HealthBadge({ aiScore }: { aiScore: number }) {
  const level: 'green' | 'orange' = aiScore < 80 ? 'orange' : 'green';

  const config = {
    green: { color: '#34d399', label: 'Tout va bien', pulse: false },
    orange: { color: '#FA5D1E', label: 'Attention', pulse: true },
  }[level];

  const tooltip =
    level === 'orange' ? `Visibilite IA a ${aiScore}/100` : 'Aucune action requise';

  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold cursor-default transition"
      style={{
        background: `${config.color}1a`,
        borderColor: `${config.color}40`,
        color: config.color,
      }}
    >
      <span className="relative flex items-center justify-center">
        {config.pulse && (
          <span
            className="absolute w-2.5 h-2.5 rounded-full animate-ping"
            style={{ background: config.color, opacity: 0.6 }}
          />
        )}
        <span className="relative w-2.5 h-2.5 rounded-full" style={{ background: config.color }} />
      </span>
      {config.label}
    </span>
  );
}
