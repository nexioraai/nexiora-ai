import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase as supabaseAnon } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TURNS = 12;

type Turn = { role: 'user' | 'assistant'; content: string };

const SYSTEM = `You are Nexiora's friendly onboarding assistant. Your job: interview the user to gather what's needed to build their website, then signal completion.

ALWAYS reply in the EXACT same language the user writes in (detect automatically).

REQUIRED info you MUST gather before finishing (read the whole history, never re-ask what's already known, ask ONE question at a time):
1. Business sector / what kind of business it is
2. What they sell or offer (products, services, or just showcase)
3. Their mode — ask ONE clear, appealing question (adapt to the user's language). Offer exactly these three options:
   "Vous voulez quoi exactement : un site vitrine (pour vous faire connaître), une boutique en ligne (vous vendez, vous gérez votre stock), ou une boutique autonome (dropshipping — vous ne gérez aucun stock, tout est automatique : ça travaille pour vous 24h/24, même pendant que vous dormez, sans gérer d'inventaire ni d'expédition) ?"
   Map their choice: showcase = mode 1, online boutique with own stock = mode 2, autonomous dropshipping = mode 3. Always present all three options so they discover what Nexiora offers.
   FORMATTING: when presenting the three options, put EACH option on its own separate line/paragraph (separate them with a blank line "\n\n"), never in one dense block. Make it scannable and easy to read.

   DROPSHIPPING COMPATIBILITY (be honest, never oversell): autonomous dropshipping (mode 3) relies on CJ Dropshipping, which supplies MANUFACTURED, shippable goods (gadgets, electronics, accessories, home decor, beauty tools, clothing, etc.). It does NOT cover perishables (flowers, food, fresh products), local hands-on services (hairdresser, mechanic, cleaning), made-to-order craftsmanship, or anything that cannot be warehoused and shipped internationally.
   - You may still present all three options as Nexiora's offer.
   - BUT if the user explicitly asks for dropshipping / autonomous mode for a business CJ cannot supply, be direct and sincere: explain that autonomous dropshipping is not possible for that specific product/service, briefly say what CJ does cover, and steer them to a classic boutique (mode 2) where they manage their own stock, or a showcase (mode 1). Never assign mode 3 to an incompatible business.

Do NOT ask about visual style or mood — Nexiora's AI automatically derives the right premium aesthetic from the sector (a florist is naturally elegant, a gym is energetic, etc.). Never ask the user to pick a style.

AFTER the required info is gathered, OPTIONALLY offer (each is optional, the user can skip any and edit later — make that clear):
A) A preferred brand COLOR, if they have one — so the site is truly tailored. If they give one, capture it (name or hex). This is the ONLY design question allowed.
B) Real CONTACT details so the site is ready with nothing to edit: professional phone, email, WhatsApp link, address.

OUTPUT FORMAT — respond with ONLY a JSON object, no markdown, no code fences:
- To ask a question: {"type":"ask","reply":"<your message in user's language>","skippable":<boolean>}
  CRITICAL skippable rule: set "skippable":true on EVERY turn where you offer an OPTIONAL item — this means BOTH the preferred-color question AND the contact-details question must ALWAYS have "skippable":true, every single time you ask them. Set "skippable":false ONLY for the required questions (sector, what they sell, mode). Never forget skippable:true on an optional offer.
- When everything needed is gathered (or user chose to skip the optional parts): {"type":"done","summary":"<a single rich English paragraph describing the business. You MUST start with the exact mode as a token: 'mode: 1' or 'mode: 2' or 'mode: 3'. Then describe: sector, what they sell, the chosen mode in words, the desired visual style/mood if given, the preferred color if given (state it explicitly, e.g. 'preferred color: deep emerald green'), and any real contact details the user provided (phone/email/whatsapp/address). Omit anything skipped. Be factual — only include what the user actually said.>"}

FINALIZATION RULES (critical):
- As soon as the required info (sector, what they sell, mode) is gathered and you have offered the optional color/contact steps (or the user skipped them), you MUST return {"type":"done",...}. Do NOT keep chatting.
- If the user says anything meaning "go ahead / do it / create it / yes let's go / vas-y / fais-le / c'est bon" after the info is gathered, return {"type":"done",...} immediately. Never answer such a message with another "ask".
- Site generation is FULLY AUTOMATIC and INSTANT once you return "done". NEVER describe yourself as "just an onboarding assistant", never say the site will be built "by the Nexiora team", never say the user will "receive a link later". You are the creator; the site is generated immediately. Do not explain your internal role or process to the user.

Never invent contact details. Only include details the user explicitly gave.`;

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

    const body = await req.json();
    const rawHistory = Array.isArray(body.history) ? body.history : [];
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
      // Génération : on relaie vers /api/chat (logique validée, intouchée)
      const origin = new URL(req.url).origin;
      const genBody: Record<string, string> = { message: intent.summary, location: '' };
      if (language !== 'auto') genBody.language = language;

      const genRes = await fetch(origin + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(genBody),
      });
      const genData = await genRes.json();
      if (!genRes.ok || !genData.slug) {
        return NextResponse.json({ error: genData.error || 'Generation failed' }, { status: 500 });
      }
      return NextResponse.json({ type: 'done', slug: genData.slug });
    }

    return NextResponse.json({ type: 'ask', reply: 'Pouvez-vous préciser votre activité ?' });
  } catch (e: any) {
    console.error('[onboarding] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
