import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';

/** POST /api/shop/upload-design — visiteur uploade son design (image). Retourne l'URL publique. */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });

    const ext = file.name.split('.').pop() || 'png';
    const path = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabaseAdmin.storage
      .from('custom-designs')
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (error) {
      console.error('Upload error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('custom-designs')
      .getPublicUrl(path);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e: any) {
    console.error('upload-design error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
