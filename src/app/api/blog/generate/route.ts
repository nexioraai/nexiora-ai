import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { topic } = await req.json();
    if (!topic) {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Write an SEO blog article in French for Nexiora, an AI website generator for entrepreneurs (vitrine, boutique, dropshipping sites). Topic: "${topic}". Return ONLY valid JSON, no markdown fences: {"title": "...", "slug": "...", "content": "..."}. Slug must be lowercase, hyphenated, no accents. Content should be 600-900 words, plain text paragraphs separated by newlines.`,
        },
      ],
    });

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
