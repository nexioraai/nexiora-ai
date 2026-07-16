import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TURNS = 12;

type Turn = { role: 'user' | 'assistant'; content: string };

const SYSTEM = `You are Nexiora's friendly onboarding assistant. Your job: interview the user to gather what is needed to build their website, then signal completion.

ALWAYS reply in the EXACT same language the user writes in (detect automatically).

You do NOT decide the business mode. The mode (showcase / online boutique / autonomous dropshipping) is chosen by the user via clickable cards in the interface, handled separately. NEVER ask the user to choose a mode in text, NEVER mention "mode 1/2/3", NEVER map their words to a mode.

REQUIRED info you MUST gather (read the whole history, never re-ask what is already known, ask ONE question at a time):
1. Business sector / what kind of business it is
2. What they sell or offer

Do NOT ask about visual style or mood — Nexiora derives the right premium aesthetic from the sector automatically. Never ask the user to pick a style.

AFTER the required info is gathered, OPTIONALLY offer (each optional, user can skip and edit later — say so):
A) A preferred brand COLOR if they have one (name or hex). This is the ONLY design question allowed.
B) Real CONTACT details: professional phone, email, WhatsApp link, address.

OUTPUT FORMAT — respond with ONLY a JSON object, no markdown, no code fences:
- To ask a question: {"type":"ask","reply":"<message in user's language>","skippable":<boolean>}
  Set "skippable":true on EVERY optional offer (color AND contact). Set "skippable":false only for required questions (sector, what they sell).
- When everything needed is gathered (or optional parts skipped): {"type":"done","summary":"<a single rich English paragraph: sector, what they sell, the preferred color if given (state explicitly), and any real contact details provided. Do NOT mention any mode. Be factual — only what the user actually said.>"}

FINALIZATION RULES:
- As soon as sector + what they sell are gathered and you have offered the optional color/contact steps (or user skipped), return {"type":"done",...}. Do NOT keep chatting.
- If the user says anything meaning "go ahead / do it / yes / vas-y / c'est bon" after info is gathered, return {"type":"done",...} immediately.
- Generation is FULLY AUTOMATIC and INSTANT once you return "done". Never say the site is built "by the team" or "sent later". You are the creator; it is generated immediately.

Never invent contact details. Only include details the user explicitly gave.`;

function detectSector(message: string): string {
  const lower = message.toLowerCase();
  if (/\b(restaurant|café|cafe|coffee|bar|brasserie|bistro|pizzeria|fast.?food|food.?truck|cantine|traiteur|boulangerie|pâtisserie|patisserie|cuisine|chef|menu|plat|repas|food|fleuriste|fleur|flower|florist)\b/i.test(lower)) return 'restaurant';
  if (/\b(pièces?\s+détachées?|pieces?\s+detachees?|pièce\s+auto|pieces?\s+auto|pièces?\s+d'origine|pieces?\s+d'origine|oem|spare\s+parts?)\b/i.test(lower)) return 'auto_parts';
  if (/\b(boutique|shop|store|magasin|épicerie|epicerie|marché|marche|e-commerce|ecommerce|vente|produit|product|vêtement|vetement|mode|clothing|gadget|accessoire|accessory|electronics|électronique)\b/i.test(lower)) return 'shop';
  if (/\b(service|consulting|conseil|salon|coiffeur|barber|spa|massage|clinique|cabinet|garage|réparation|reparation|nettoyage|plombier|électricien|electricien|avocat|comptable)\b/i.test(lower)) return 'services';
  if (/\b(portfolio|designer|photograph|artist|artiste|musicien|developer|développeur|developpeur|freelance)\b/i.test(lower)) return 'portfolio';
  return 'general';
}

// Modes valides par secteur (déterministe — le dropshipping CJ n'a de sens que pour des biens manufacturés expédiables)
const VALID_MODES: Record<string, number[]> = {
  auto_parts: [1, 2],
  restaurant: [1, 2],
  services: [1, 2],
  portfolio: [1],
  shop: [1, 2, 3],
  general: [1, 2, 3],
};
function validModesForHistory(history: Turn[]): number[] {
  const userText = history.filter((t) => t.role === 'user').map((t) => t.content).join(' ');
  const sector = detectSector(userText);
  return VALID_MODES[sector] || [1, 2, 3];
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: missing Bearer token' }, { status: 401 });
    }
    const { data: authData, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !authData.user || !authData.user.email) {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
    }

    // ============ FREEMIUM LIMIT CHECK ============
    const UNLIMITED_EMAILS = ['issayamiyoussouf@gmail.com'];
    const FREE_LIMIT = 3;
    if (!UNLIMITED_EMAILS.includes(authData.user.email!)) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('generation_count')
        .eq('id', authData.user.id)
        .maybeSingle();
      if ((profile?.generation_count ?? 0) >= FREE_LIMIT) {
        return NextResponse.json(
          { error: "Vous avez atteint la limite de la version gratuite (3 sites). Passez à l'abonnement pour en créer davantage.", limitReached: true },
          { status: 402 }
        );
      }
    }
    // ===============================================

    const body = await req.json();
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const chosenMode: number | null = [1, 2, 3].includes(body.chosenMode) ? body.chosenMode : null;
    const language = typeof body.language === 'string' ? body.language : 'auto';

    // Validation stricte de l'historique reçu
    const history: Turn[] = rawHistory
      .filter((t: any) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
      .slice(-MAX_TURNS)
      .map((t: any) => ({ role: t.role, content: t.content.slice(0, 2000) }));

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Invalid history' }, { status: 400 });
    }

    const interview = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM,
      messages: [
        ...history.map((t) => ({ role: t.role, content: t.content })),
        { role: 'assistant' as const, content: '{' },
      ],
    });

    const text = ('{' + interview.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('')).trim();
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    // Isoler le bloc JSON même si l'IA ajoute du texte autour
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }

    // Filet de sécurité : ne jamais laisser fuiter un payload technique vers l'utilisateur
    const FALLBACK = "Pouvez-vous préciser votre activité ?";
    const looksLikePayload = (str: string) =>
      /"type"\s*:|"summary"\s*:|"skippable"\s*:|mode:\s*[123]/i.test(str);

    let intent: any = null;
    try {
      intent = JSON.parse(clean);
    } catch {
      // JSON strict cassé (apostrophes/guillemets dans le summary, etc.).
      // Extraction tolérante : on récupère type + summary/reply sans jeter un "done" valide.
      const typeMatch = clean.match(/"type"\s*:\s*"(done|ask)"/i);
      const t = typeMatch ? typeMatch[1].toLowerCase() : null;
      if (t === 'done') {
        const sumMatch = clean.match(/"summary"\s*:\s*"([\s\S]*?)"\s*}\s*$/);
        const summary = sumMatch ? sumMatch[1] : '';
        if (summary) intent = { type: 'done', summary };
      } else if (t === 'ask') {
        const replyMatch = clean.match(/"reply"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"skippable"|})/);
        const reply = replyMatch ? replyMatch[1] : '';
        const skip = /"skippable"\s*:\s*true/i.test(clean);
        if (reply) intent = { type: 'ask', reply, skippable: skip };
      }
      if (!intent) {
        return NextResponse.json({ type: 'ask', reply: FALLBACK, skippable: false });
      }
    }

    if (intent.type === 'ask' && typeof intent.reply === 'string') {
      // Si le reply contient malgré tout un payload technique, on le bloque
      const safeReply = looksLikePayload(intent.reply) ? FALLBACK : intent.reply;
      return NextResponse.json({ type: 'ask', reply: safeReply, skippable: intent.skippable === true });
    }

    if (intent.type === 'done' && typeof intent.summary === 'string') {
      return NextResponse.json({ type: 'ready_to_generate', summary: intent.summary, mode: chosenMode });
    }

    return NextResponse.json({ type: 'ask', reply: 'Pouvez-vous préciser votre activité ?' });
  } catch (e: any) {
    console.error('[onboarding] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
