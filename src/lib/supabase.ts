import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Client Supabase singleton — utilisé par TOUS les composants client (browser + serveur).
 *
 * SÉCURITÉ : ce client utilise la clé ANON (publique). Sans danger côté browser.
 * Ne JAMAIS exposer SUPABASE_SERVICE_ROLE_KEY ici — utiliser src/lib/supabase-admin.ts pour ça.
 *
 * Centraliser ici évite l'erreur "Multiple GoTrueClient instances detected" et garantit
 * une seule source de vérité pour la session auth.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
