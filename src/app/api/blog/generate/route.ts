import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { logAiUsage } from "@/lib/ai-usage";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================================
// LOT 6 -- CETTE ROUTE ETAIT OUVERTE A TOUT INTERNET.
//
// CE QU'ELLE PERMETTAIT. Aucune authentification, aucune limite de debit,
// aucun appelant dans le depot : n'importe qui pouvait POSTER un `topic`
// arbitraire, faire executer un appel Claude Sonnet FACTURE (2 000 jetons)
// sur un prompt qu'il choisissait, et faire INSERER le resultat dans
// `blog_posts` -- table lue par `/blog`, `/blog/[slug]` et le sitemap
// deribfy.com. Trois problemes en un : depense illimitee, injection de prompt
// (`topic` interpole brut), et ecriture dans une table publiee.
//
// A QUI APPARTIENT CE CONTENU. Etabli avant toute correction : `blog_posts`
// n'a AUCUNE colonne de site (id, title, slug, content, cover_image,
// published, created_at) et ses trois consommateurs sont tous des surfaces
// de la PLATEFORME. Le blog des sites clients existe separement --
// `/api/marketing/generate` -> `marketing_assets`, avec `slug` et
// `owner_email` -- et n'est pas touche. Deux systemes, deux tables, deux
// regimes d'autorisation.
//
// L'AUTORITE N'EST PAS NOUVELLE : c'est le controle admin deja present dans
// les cinq routes `admin/*`, desormais nomme `requirePlatformAdmin`.
// `requireSiteOwner` serait ici non seulement inadapte mais IMPOSSIBLE : il
// n'existe aucun site a posseder.
// ============================================================

/** Une minute, comme la limite deja en place sur `catalog/image-search`. */
const FENETRE_MS = 60_000;
/**
 * Un administrateur ne redige pas dix articles par minute ; une boucle, si.
 *
 * CE QUE CETTE LIMITE NE FAIT PAS, ET IL FAUT LE DIRE : elle n'est PAS
 * atomique. Deux requetes simultanees peuvent lire le meme compteur avant que
 * l'une ou l'autre n'ait trace sa depense, et passer toutes les deux. Elle
 * borne une boucle, pas une rafale parallele. Rendre le comptage atomique
 * exigerait une reservation en base (meme patron que la consommation de
 * `design_uploads`) -- ce n'est pas necessaire ici : la route est desormais
 * reservee aux administrateurs de la plateforme, ou le risque est l'erreur
 * de script, pas l'attaque distribuee.
 */
const PLAFOND_PAR_MINUTE = 3;
/** Un sujet d'article, pas un prompt. Borne la surface d'injection. */
const TOPIC_MAX = 200;

export async function POST(req: NextRequest) {
  try {
    // 1. IDENTITE -- avant toute lecture de corps et toute depense.
    const admin = await requirePlatformAdmin(req);
    if (!admin.ok) return admin.response;

    const { topic } = await req.json();
    if (!topic || typeof topic !== "string" || topic.length > TOPIC_MAX) {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }

    // 2. DEPENSE -- meme mecanisme que `catalog/image-search` : un comptage
    // DB-natif sur `ai_usage_log`, table deja alimentee par `logAiUsage`, qui
    // documentait deja `'blog'` parmi ses types d'usage. Le blog central
    // n'appartient a aucun site : les lignes portent `site_id = null`, et le
    // comptage se fait sur ce meme critere. Aucune table nouvelle.
    const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
    const { count: recents, error: erreurCompteur } = await supabaseAdmin
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .is("site_id", null)
      .eq("usage_type", "blog")
      .gte("created_at", depuis);
    // AUDIT AGRESSIF DU LOT 6 -- FAILLE TROUVEE DANS LE PREMIER TOUR, ET
    // DEMONTREE PAR EXECUTION : l'`error` de cette requete n'etait pas lu.
    // supabase-js rend alors `count: null`, et `(null ?? 0) >= 3` vaut FAUX --
    // la requete poursuivait donc, et l'appel Claude FACTURE avait lieu. Une
    // panne de base transformait silencieusement la limite en « illimitee ».
    //
    // C'est exactement la forme que ce chantier proscrit : une garde presente
    // mais qui ne s'applique pas. Sur une protection de DEPENSE, l'incertitude
    // doit couter un refus, jamais une facture. 503 : c'est une indisponibilite
    // du serveur, pas une faute de l'appelant.
    if (erreurCompteur) {
      return NextResponse.json(
        { error: "Service momentanement indisponible." },
        { status: 503 }
      );
    }
    if ((recents ?? 0) >= PLAFOND_PAR_MINUTE) {
      return NextResponse.json(
        { error: "Trop de requetes, reessayez dans une minute." },
        { status: 429 }
      );
    }

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Write an SEO blog article in French for Deribfy, an AI website generator for entrepreneurs (vitrine, boutique, dropshipping sites). Topic: "${topic}". Return ONLY valid JSON, no markdown fences: {"title": "...", "slug": "...", "content": "..."}. Slug must be lowercase, hyphenated, no accents. Content should be 600-900 words, plain text paragraphs separated by newlines.`,
        },
      ],
    });

    // 3. TRACE -- la depense est comptabilisee AVANT l'ecriture : meme si
    // l'article echoue a s'inserer, l'appel a bien ete facture et doit peser
    // sur la fenetre. `siteId: null` -- le blog central n'a pas de site.
    await logAiUsage({ siteId: null, usageType: "blog", model: "claude-sonnet-4-6", usage: msg.usage });

    const raw = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    const { error } = await supabaseAdmin.from("blog_posts").insert({
      title: parsed.title,
      slug: parsed.slug,
      content: parsed.content,
      published: false,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true, slug: parsed.slug });
  } catch (e) {
    console.error("blog generate failed:", e);
    return NextResponse.json({ error: "generation failed" }, { status: 500 });
  }
}
