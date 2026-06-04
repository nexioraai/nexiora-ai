import 'server-only';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante dans .env.local');
}

/**
 * Client Supabase admin singleton — UTILISER UNIQUEMENT CÔTÉ SERVEUR.
 *
 * Bypasse les Row Level Security (RLS) grâce à la clé service_role.
 * Réservé aux API routes (/api/*) et server components.
 *
 * SÉCURITÉ ABSOLUE :
 * - Le marker 'server-only' (ligne 1) fait throw au build-time si ce fichier
 *   est importé par erreur depuis un composant 'use client'.
 * - persistSession: false → pas de session stockée (chaque request est indépendante).
 * - autoRefreshToken: false → pas besoin de rafraîchir un token, on utilise une clé statique.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
