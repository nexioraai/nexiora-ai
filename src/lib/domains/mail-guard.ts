import { promises as dns } from 'dns';
import { listDnsRecords } from '@/lib/domains/porkbun';

/**
 * Detecte une messagerie active sur un domaine avant que Nexiora ne prenne
 * la main sur sa zone DNS.
 *
 * Pourquoi c'est necessaire : quand les nameservers basculent vers Porkbun,
 * la nouvelle zone est VIDE. Tout ce qui existait avant (MX, SPF, DKIM)
 * disparait et la messagerie du marchand tombe, sans aucun signal.
 *
 * Nexiora ne recopie pas automatiquement : le DKIM vit sur un selecteur
 * arbitraire impossible a deviner, et les sous-domaines ne sont pas
 * enumerables. Recopier partiellement donnerait une fausse garantie.
 * On detecte, on signale, le marchand decide.
 */
export type MailCheck = {
  /** Une messagerie repond sur ce domaine. */
  hasMail: boolean;
  /** Les MX sont deja dans la zone Porkbun : rien ne sera perdu. */
  safe: boolean;
  hosts: string[];
};

export async function checkExistingMail(domain: string): Promise<MailCheck> {
  let hosts: string[] = [];
  try {
    const mx = await dns.resolveMx(domain);
    hosts = mx.map((m) => m.exchange).filter(Boolean);
  } catch {
    // NODATA / NXDOMAIN : pas de messagerie.
    return { hasMail: false, safe: true, hosts: [] };
  }

  if (!hosts.length) return { hasMail: false, safe: true, hosts: [] };

  // Les MX sont-ils deja portes par la zone Porkbun ? Si oui, la bascule ne
  // detruit rien.
  try {
    const records = await listDnsRecords(domain);
    const inZone = records.some((r) => String(r.type).toUpperCase() === 'MX');
    return { hasMail: true, safe: inZone, hosts };
  } catch {
    // Zone illisible : on ne peut pas garantir, donc on considere a risque.
    return { hasMail: true, safe: false, hosts };
  }
}
