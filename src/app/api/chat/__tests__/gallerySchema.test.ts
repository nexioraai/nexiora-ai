import { describe, it, expect, vi } from 'vitest';

// GeneratedSiteSchema est un objet Zod pur, sans dependance runtime reelle --
// mais route.ts instancie ses clients (Supabase/Anthropic) au chargement du
// module, ce qui echoue sans env reelles. Mocks minimaux pour isoler le
// schema, meme principe que les autres tests de routes de ce projet.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));
vi.mock('@/lib/generationFailures', () => ({ logGenerationFailure: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() }; } }));

import { GeneratedSiteSchema } from '../route';

// Audit /api/chat (FUNC-05) : deux reproductions live (secteurs restaurant et
// services) ont capture le meme rejet Zod -- Claude renvoie systematiquement
// gallery comme un tableau d'OBJETS, jamais de chaines, en l'absence de toute
// consigne explicite (mode 1, la seule ou aucune instruction gallery
// n'existait). z.array(z.string()) rejetait alors TOUTE la generation pour
// un champ qui n'est jamais consomme (voir route.ts, `const gallery =
// fetchPexelsImages(...)` ecrase systematiquement parsed.gallery avant tout
// usage). Ce test verrouille la tolerance desormais volontaire, sans jamais
// affaiblir les champs qui restent reellement consommes (name/heroTitle/about/mode).

function validSitePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Riad Essaada',
    heroTitle: 'Un voyage culinaire au coeur de Montreal',
    about: 'Restaurant marocain authentique.',
    mode: 1,
    ...overrides,
  };
}

describe('GeneratedSiteSchema.gallery', () => {
  it('accepte un tableau d\'objets -- exactement la forme capturee en production (FUNC-05)', () => {
    const result = GeneratedSiteSchema.safeParse(
      validSitePayload({
        gallery: [
          { url: 'https://example.com/1.jpg', caption: 'Interieur' },
          { description: 'Plat signature' },
        ],
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepte toujours un tableau de chaines (retro-compatibilite, non regresse)', () => {
    const result = GeneratedSiteSchema.safeParse(
      validSitePayload({ gallery: ['https://example.com/1.jpg', 'https://example.com/2.jpg'] })
    );
    expect(result.success).toBe(true);
  });

  it('accepte l\'absence totale de gallery -- defaut []', () => {
    const result = GeneratedSiteSchema.safeParse(validSitePayload());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gallery).toEqual([]);
  });

  it('accepte un tableau vide explicite', () => {
    const result = GeneratedSiteSchema.safeParse(validSitePayload({ gallery: [] }));
    expect(result.success).toBe(true);
  });

  it('les champs reellement consommes restent strictement valides -- pas d\'affaiblissement collateral', () => {
    const missingName = GeneratedSiteSchema.safeParse(validSitePayload({ name: '' }));
    expect(missingName.success).toBe(false);

    const missingHeroTitle = GeneratedSiteSchema.safeParse(validSitePayload({ heroTitle: '' }));
    expect(missingHeroTitle.success).toBe(false);

    const invalidMode = GeneratedSiteSchema.safeParse(validSitePayload({ mode: 4 }));
    expect(invalidMode.success).toBe(false);

    const invalidRating = GeneratedSiteSchema.safeParse(
      validSitePayload({ testimonials: [{ name: 'A', role: 'Client', content: 'Top', rating: '5' }] })
    );
    expect(invalidRating.success).toBe(false);
  });
});
