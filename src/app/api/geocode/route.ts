import { NextResponse } from 'next/server';

// Geocodage d'une adresse via Nominatim (OpenStreetMap).
// Appele uniquement quand l'adresse change (onBlur cote editeur) -> cout minimal.
export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'address required' }, { status: 400 });
    }
    // Nettoyage adresse pour Nominatim : abreviations + retrait code postal canadien
    let q = address
      .replace(/\bTerr\.?/gi, 'Terrasse')
      .replace(/\bAve\.?/gi, 'Avenue')
      .replace(/\bBlvd\.?/gi, 'Boulevard')
      .replace(/\bSt\.?/gi, 'Saint')
      .replace(/\bRte\.?/gi, 'Route')
      // retire code postal canadien (ex H3J 1E7) qui fait echouer Nominatim
      .replace(/\b[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d/g, '')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ',')
      .trim()
    const res = await fetch(

      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'Nexiora/1.0 (contact@nexiora.ca)' } }
    );
    const json = await res.json();
    if (Array.isArray(json) && json[0]) {
      return NextResponse.json({
        lat: parseFloat(json[0].lat),
        lng: parseFloat(json[0].lon),
      });
    }
    return NextResponse.json({ lat: null, lng: null });
  } catch (e) {
    console.error('Geocode failed:', e);
    return NextResponse.json({ error: 'geocode failed' }, { status: 500 });
  }
}
