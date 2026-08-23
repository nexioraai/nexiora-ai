// ============================================================
// M1-01 -- POINT D'ENTREE UNIQUE POUR EMETTRE DU JSON-LD.
//
// LE DEFAUT, prouve par rendu React reel (renderToStaticMarkup) pendant
// l'audit MODE 1 :
//
//   JSON.stringify({ name: '</script><script>alert(1)</script>' })
//   -> {"name":"</script><script>alert(1)</script>"}
//
// `JSON.stringify` n'echappe NI `<` NI `/`. Injectee via
// `dangerouslySetInnerHTML` dans un <script>, cette chaine contient une
// balise fermante LITTERALE : le parseur HTML termine le script au premier
// `</script>` rencontre, puis execute ce qui suit.
//
// POURQUOI C'ETAIT ATTEIGNABLE, et pourquoi la gravite depassait le site
// fautif :
//   * `sites.name`, `slogan`, `about`, `faq`, `hero_*` sont explicitement
//     accordes en UPDATE a `authenticated` (lot_g_final_field_level_
//     authorization.sql) -- un marchand les ecrit legitimement, depuis le
//     navigateur, en PostgREST direct ;
//   * la page publique `/sites/[slug]` n'exige aucune authentification ;
//   * `proxy.ts` sert ces pages AUSSI sur l'origine plateforme
//     (www.deribfy.com/sites/{slug}), pas uniquement sur domaine perso ;
//   * la CSP autorise `script-src 'unsafe-inline'` -- elle ne bloque donc
//     pas le script injecte ;
//   * la session Supabase vit dans localStorage (createClient par defaut).
// L'attaquant ecrit sur SON PROPRE site -- ecriture parfaitement legitime,
// qu'aucune correction de RLS ne peut empecher -- et le code s'executait
// ensuite sur l'origine de la plateforme avec la session du visiteur.
//
// CE QUI EST CORRIGE ICI : la CLASSE, pas le payload.
// Les cinq caracteres echappes sont exactement ceux qui peuvent rompre le
// contexte d'un <script> ou d'un parseur JS -- c'est le jeu de reference
// utilise par Next.js lui-meme pour serialiser ses donnees de page :
//   <  >  &  U+2028  U+2029
// Un seul passage, via une table : aucun ordre de remplacement a raisonner,
// donc aucun echappement qui en reintroduirait un autre.
//
// LE JSON RESTE VALIDE. `<` est une sequence d'echappement JSON
// standard : `JSON.parse` restitue `<` a l'identique. Les consommateurs de
// `application/ld+json` (Google, Bing, moteurs GEO) parsent du JSON --
// aucune degradation SEO/GEO, la donnee structuree est inchangee.
//
// NE JAMAIS reintroduire `JSON.stringify` directement dans un
// `dangerouslySetInnerHTML` : une garde structurelle
// (src/lib/architecture/__tests__/jsonLdSerialization.test.ts) echoue si un
// fichier le refait, precisement pour que ce correctif ne se reperde pas au
// prochain ajout de donnee structuree -- c'est ainsi que ces trois sinks
// etaient apparus (commits SEO/GEO successifs, jamais repasses en revue).
// ============================================================

/** Caracteres capables de rompre le contexte `<script>` ou le parseur JS.
 *  Ecrits en sequences d'echappement, jamais en litteraux : U+2028 et U+2029
 *  sont invisibles dans un editeur et seraient silencieusement corrompus par
 *  un copier-coller ou une normalisation d'encodage. */
const HTML_UNSAFE = /[<>&\u2028\u2029]/g;
const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Serialise une donnee structuree pour insertion dans un
 * `<script type="application/ld+json">`.
 *
 * Exporte separement du composant pour rester testable directement : le test
 * de non-regression verifie la chaine produite, pas seulement le rendu.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(HTML_UNSAFE, (c) => ESCAPES[c]);
}

/**
 * Emet un bloc JSON-LD. SEUL endroit du depot autorise a passer du JSON a
 * `dangerouslySetInnerHTML` -- les appelants ne peuvent plus se tromper,
 * puisqu'ils ne manipulent plus la serialisation.
 */
export default function JsonLdScript({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
