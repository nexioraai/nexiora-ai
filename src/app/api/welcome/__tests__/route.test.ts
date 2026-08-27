import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest, type TableStub } from '@/lib/testing/postgrest';

// ============================================================
// LOT 6 -- CE QUE CES TESTS PROUVENT : RESEND N'EST PAS APPELE.
//
// `emails.send` est un espion. Tout refus -- absence de jeton, jeton
// invalide, plafond atteint, compteur en panne -- doit le laisser a zero
// appel. Et le cas nominal doit prouver que le destinataire vient du JETON,
// jamais du corps de la requete : c'est la difference entre « on limite les
// envois » et « on ne peut plus viser personne ».
// ============================================================

const sendMock = vi.fn();
const getUserMock = vi.fn();
let tables: Record<string, TableStub>;
let journal: JournalPostgrest;

vi.mock('resend', () => ({
  Resend: class { emails = { send: (...a: unknown[]) => sendMock(...a) }; },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => creerFrom(tables, journal)(t) },
}));
const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

import { POST } from '../route';

const req = (headers: Record<string, string> = {}, body?: unknown) =>
  new Request('https://woorri.test/api/welcome', {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const AVEC_JETON = { authorization: 'Bearer jeton-valide' };

beforeEach(() => {
  journal = journalVierge();
  tables = { checkout_anomalies: { reponse: { count: 0, error: null } as never } };
  sendMock.mockReset().mockResolvedValue({ id: 'em-1' });
  getUserMock.mockReset().mockResolvedValue({
    data: { user: { id: 'user-1', email: 'titulaire@exemple.com' } },
    error: null,
  });
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/welcome — envoi légitime', () => {
  it('un compte authentifié reçoit SON e-mail de bienvenue', async () => {
    const res = await POST(req(AVEC_JETON));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe('titulaire@exemple.com');
  });

  it('le jeton est bien celui présenté dans l’en-tête', async () => {
    await POST(req(AVEC_JETON));
    expect(getUserMock).toHaveBeenCalledWith('jeton-valide');
  });
});

describe('POST /api/welcome — LE POINT CENTRAL : on ne peut plus viser personne', () => {
  it('une adresse fournie dans le CORPS est ignorée : le destinataire vient du jeton', async () => {
    // C'ETAIT LA VULNERABILITE. `POST {email:'victime@…'}` faisait partir un
    // courrier signe Deribfy vers la victime, sans aucune authentification.
    const res = await POST(req(AVEC_JETON, { email: 'victime@exemple.com' }));
    expect(res.status).toBe(200);
    expect(sendMock.mock.calls[0][0].to).toBe('titulaire@exemple.com');
    expect(JSON.stringify(sendMock.mock.calls[0][0])).not.toContain('victime@exemple.com');
  });

  it("l'expéditeur reste le domaine Deribfy — jamais une valeur d'appelant", async () => {
    await POST(req(AVEC_JETON, { from: 'attaquant@ailleurs.com' }));
    expect(sendMock.mock.calls[0][0].from).toContain('no-reply@deribfy.com');
  });
});

describe('POST /api/welcome — appel direct hors UI', () => {
  it('aucun en-tête Authorization -> 401, AUCUN e-mail', async () => {
    const res = await POST(req({}, { email: 'victime@exemple.com' }));
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each([
    ['en-tête malformé', { authorization: 'jeton-sans-schema' }],
    ['schéma inconnu', { authorization: 'Basic abc' }],
    ['Bearer vide', { authorization: 'Bearer ' }],
  ])('%s -> 401, AUCUN e-mail', async (_n, h) => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const res = await POST(req(h));
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('jeton refusé par Supabase -> 401, AUCUN e-mail', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const res = await POST(req(AVEC_JETON));
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('compte sans adresse -> 401, AUCUN e-mail (rien à qui envoyer)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: null } }, error: null });
    const res = await POST(req(AVEC_JETON));
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/welcome — limite de débit', () => {
  it('plafond atteint -> 429, AUCUN e-mail', async () => {
    tables.checkout_anomalies = { reponse: { count: 3, error: null } as never };
    const res = await POST(req(AVEC_JETON));
    expect(res.status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('plafond dépassé -> 429, AUCUN e-mail', async () => {
    tables.checkout_anomalies = { reponse: { count: 500, error: null } as never };
    expect((await POST(req(AVEC_JETON))).status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('compteur en PANNE -> 503, AUCUN e-mail (jamais fail-open)', async () => {
    tables.checkout_anomalies = { reponse: { count: null, error: { message: 'db down' } } as never };
    const res = await POST(req(AVEC_JETON));
    expect(res.status).toBe(503);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('le compteur porte sur CE COMPTE — pas sur le monde entier', async () => {
    // Un compteur global laisserait un seul abuseur priver tous les nouveaux
    // inscrits de leur e-mail de bienvenue.
    await POST(req(AVEC_JETON));
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'details->>user_id', 'user-1']);
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'type', 'welcome_email_sent']);
  });

  it('la fenêtre est bien une HEURE, pas l’epoch', async () => {
    const avant = Date.now();
    await POST(req(AVEC_JETON));
    const borne = journal.filtres.checkout_anomalies.find(([o, c]) => o === 'gte' && c === 'created_at')![2] as string;
    const t = Date.parse(borne);
    expect(t).toBeGreaterThan(avant - 3_600_000 - 5_000);
    expect(t).toBeLessThan(avant - 3_600_000 + 5_000);
  });

  it('un envoi admis CONSOMME un jeton, tracé sur le compte', async () => {
    await POST(req(AVEC_JETON));
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'welcome_email_sent', severity: 'info', details: { user_id: 'user-1' } })
    );
  });

  it('le jeton est consommé AVANT l’envoi — jamais après', async () => {
    const ordre: string[] = [];
    logAnomalyMock.mockImplementation(async () => { ordre.push('jeton'); });
    sendMock.mockImplementation(async () => { ordre.push('resend'); return { id: 'x' }; });
    await POST(req(AVEC_JETON));
    expect(ordre).toEqual(['jeton', 'resend']);
  });
});

describe('POST /api/welcome — panne de Resend', () => {
  it('une erreur d’envoi rend 500, jamais un faux succès', async () => {
    sendMock.mockRejectedValue(new Error('resend down'));
    const res = await POST(req(AVEC_JETON));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});
