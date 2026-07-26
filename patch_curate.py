# Patch curate/route.ts — Option C: greffe la génération de familles sur l'appel IA existant (mode 3 only)
p = 'src/app/api/catalog/curate/route.ts'
s = open(p).read()

# ---- (a) PROMPT: étendre les instructions de sortie ----
old_a = """          'For each selected product provide:\\n' +
          '- index: the number in the list\\n' +
          '- reason: short justification in ' + (lang === 'fr' ? 'French' : 'English') + '\\n\\n' +
          'RESPOND WITH ONLY a valid JSON array, no text before or after:\\n' +
          '[{"index":0,"reason":"..."}]\\n\\n' +
          'If only 5 products are truly relevant, return only those 5. NEVER pad the list with irrelevant products.'"""
new_a = """          'For each selected product provide:\\n' +
          '- index: the number in the list\\n' +
          '- reason: short justification in ' + (lang === 'fr' ? 'French' : 'English') + '\\n\\n' +
          'ALSO - PRODUCT FAMILIES:\\n' +
          'Look at the [cat:supplier_category] of every product you SELECTED. Group these raw supplier categories into 4 to 6 clean customer-facing FAMILIES that fit a ' + nicheLabel + ' store (e.g. many jewelry categories -> "Bijoux"; makeup+skincare -> "Beaute"). Family names MUST be in ' + (lang === 'fr' ? 'French' : lang === 'es' ? 'Spanish' : lang === 'ar' ? 'Arabic' : lang === 'pt' ? 'Portuguese' : lang === 'de' ? 'German' : lang === 'it' ? 'Italian' : 'English') + ', short (1-2 words), Title Case. EVERY supplier category of your selected products MUST map to exactly one family.\\n\\n' +
          'RESPOND WITH ONLY a valid JSON object, no text before or after:\\n' +
          '{"products":[{"index":0,"reason":"..."}],"families":{"Rings":"Bijoux","Makeup Brushes":"Beaute"}}\\n\\n' +
          'If only 5 products are truly relevant, return only those 5 in "products". NEVER pad with irrelevant products.'"""
assert s.count(old_a) == 1, f"(a) prompt count={s.count(old_a)}"
s = s.replace(old_a, new_a)

# ---- (b) PARSING: lire {products, families} au lieu d'un tableau nu ----
old_b = """    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    let selections: { index: number; reason: string }[];
    try {
      const cleaned = raw.replace(/```json\\s?/g, '').replace(/```/g, '').trim();
      selections = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Erreur parsing reponse IA', raw }, { status: 500 });
    }"""
new_b = """    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    let selections: { index: number; reason: string }[];
    let families: Record<string, string> = {};
    try {
      const cleaned = raw.replace(/```json\\s?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      // Nouveau format {products, families}; tolère l'ancien format tableau nu.
      if (Array.isArray(parsed)) {
        selections = parsed;
      } else {
        selections = Array.isArray(parsed.products) ? parsed.products : [];
        families = parsed.families && typeof parsed.families === 'object' ? parsed.families : {};
      }
    } catch {
      return NextResponse.json({ error: 'Erreur parsing reponse IA', raw }, { status: 500 });
    }"""
assert s.count(old_b) == 1, f"(b) parsing count={s.count(old_b)}"
s = s.replace(old_b, new_b)

# ---- (c) ÉCRITURE: persister product_families sur sites avant le return ----
old_c = """    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    return NextResponse.json({
      success: true,"""
new_c = """    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Familles produit (Option C) : mapping catégorie fournisseur -> famille cliente.
    // Mode 3 uniquement (ce endpoint rejette déjà les autres modes plus haut).
    if (families && Object.keys(families).length > 0) {
      await supabaseAdmin
        .from('sites')
        .update({ product_families: families })
        .eq('id', site.id);
    }

    return NextResponse.json({
      success: true,
      families,"""
assert s.count(old_c) == 1, f"(c) write count={s.count(old_c)}"
s = s.replace(old_c, new_c)

open(p, 'w').write(s)
print("OK — 3 patches applied to curate/route.ts")
