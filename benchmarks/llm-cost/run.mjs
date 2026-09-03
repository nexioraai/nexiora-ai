// BANC COÛTS LLM — VOLET 1 : prompt caching sur claude-opus-5.
// Protocole : docs/mobile-generation/benchmarks/couts-unitaires.md (VOLET 1).
// Reproductible : préfixe déterministe, questions fixes, aucun secret écrit.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

// --- Clé : lue depuis apps/web/.env.local, jamais journalisée. ---
function apiKey() {
  const env = readFileSync(join(REPO, 'apps/web/.env.local'), 'utf8');
  const m = env.match(/^ANTHROPIC_API_KEY=("?)([^"\n]+)\1$/m);
  if (!m) throw new Error('ANTHROPIC_API_KEY introuvable dans apps/web/.env.local');
  return m[2].trim();
}

// --- Préfixe stable déterministe (simulacre contrats de blocs + registre). ---
function stablePrefix() {
  const bloc = (n) =>
    `## CONTRAT DU SMART BLOCK B${n}\n` +
    `Le bloc B${n} expose un contrat comportemental strict. Entrées : un objet de configuration ` +
    `typé, valide selon le schéma du registre, sans champ additionnel. Sorties : un arbre de ` +
    `composants conforme aux primitives du design system, avec les états loading, empty, error ` +
    `et success rendus explicitement. Le bloc ne réalise aucun accès réseau direct : toute donnée ` +
    `provient des capabilities résolues par le registre. Permissions induites : aucune. ` +
    `Compatibilité : profils de runtime core et supérieurs. Version contractuelle : ${n}.4.2. ` +
    `Tests requis : unitaires sur chaque état, intégration sur la navigation, accessibilité sur ` +
    `les contrastes et les libellés. Toute violation du contrat est un échec de compilation, ` +
    `jamais un avertissement.\n`;
  let s = `# REGISTRE DES CONTRATS (préfixe stable du banc — déterministe)\n`;
  for (let i = 1; i <= 24; i++) s += bloc(i);
  return s;
}

// Tarifs publics claude-opus-5, $/MTok [démontré].
const PRIX = { in: 5, cacheWrite: 6.25, cacheRead: 0.5, out: 25 };
const coutUSD = (u) =>
  ((u.input_tokens ?? 0) * PRIX.in +
    (u.cache_creation_input_tokens ?? 0) * PRIX.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRIX.cacheRead +
    (u.output_tokens ?? 0) * PRIX.out) / 1e6;

const QUESTIONS = [
  'Quel bloc conviendrait à un écran de liste de réservations ? Réponds en 2 phrases.',
  'Quels états un bloc doit-il rendre explicitement ? Réponds en 2 phrases.',
  'Pourquoi un bloc ne fait-il aucun accès réseau direct ? Réponds en 2 phrases.',
  'Que se passe-t-il en cas de violation de contrat ? Réponds en 2 phrases.',
];

const client = new Anthropic({ apiKey: apiKey() });
const PREFIX = stablePrefix();
const MODEL = 'claude-opus-5';
const ARM = process.argv[2] === 'disabled' ? 'disabled' : 'adaptive';

async function call(label, { cached, question }) {
  const system = cached
    ? [{ type: 'text', text: PREFIX, cache_control: { type: 'ephemeral' } }]
    : PREFIX;
  const t0 = process.hrtime.bigint();
  const r = await client.messages.create({
    model: MODEL,
    max_tokens: ARM === 'disabled' ? 200 : 1200,
    // Bras "disabled" : sortie bornee sans bruit. Bras "adaptive" (defaut
    // moteur, ARCHITECTURE §28) : thinking omis = adaptatif sur opus-5.
    ...(ARM === 'disabled' ? { thinking: { type: 'disabled' } } : {}),
    system,
    messages: [{ role: 'user', content: question }],
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const u = r.usage;
  return {
    label, cached, latence_ms: Math.round(ms),
    usage: {
      input_tokens: u.input_tokens,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      output_tokens: u.output_tokens,
    },
    cout_usd: +coutUSD(u).toFixed(6),
    stop_reason: r.stop_reason,
    stop_details: r.stop_details ?? null,
  };
}

const runs = [];
runs.push(await call('A-baseline-sans-cache', { cached: false, question: QUESTIONS[0] }));
runs.push(await call('B-ecriture-cache', { cached: true, question: QUESTIONS[0] }));
runs.push(await call('C-lecture-cache', { cached: true, question: QUESTIONS[1] }));
runs.push(await call('D-lecture-cache', { cached: true, question: QUESTIONS[2] }));
runs.push(await call('E-lecture-cache', { cached: true, question: QUESTIONS[3] }));

const lectures = runs.filter((r) => r.label.includes('lecture'));
const synthese = {
  modele: MODEL,
  bras_thinking: ARM,
  refus: runs.filter((r) => r.stop_reason === 'refusal').length,
  protocole: 'docs/mobile-generation/benchmarks/couts-unitaires.md VOLET 1',
  prefixe_tokens_factures_baseline: runs[0].usage.input_tokens,
  cache_hit_prouve: lectures.every((r) => r.usage.cache_read_input_tokens > 0),
  cout_appel_sans_cache_usd: runs[0].cout_usd,
  cout_appel_lecture_cache_usd_moyen:
    +(lectures.reduce((s, r) => s + r.cout_usd, 0) / lectures.length).toFixed(6),
  facteur_economie_entree:
    +(runs[0].cout_usd / (lectures.reduce((s, r) => s + r.cout_usd, 0) / lectures.length)).toFixed(2),
  cout_total_campagne_usd: +runs.reduce((s, r) => s + r.cout_usd, 0).toFixed(4),
};

const out = { date: new Date().toISOString(), synthese, runs };
mkdirSync(join(HERE, 'results'), { recursive: true });
const file = join(HERE, 'results', `${out.date.slice(0, 10)}-${MODEL}-${ARM}-prompt-caching.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log('\nRésultats écrits :', file);
