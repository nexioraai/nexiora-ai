-- ============================================================
-- DEBT-084 -- `pod-designs` ETAIT ECRIVABLE ET EFFACABLE PAR N'IMPORTE QUEL
-- UTILISATEUR AUTHENTIFIE.
--
-- A executer manuellement dans l'editeur SQL Supabase (convention du dossier).
--
-- ------------------------------------------------------------
-- LE DEFAUT, RELEVE DANS `pg_policies`
-- ------------------------------------------------------------
--   INSERT  with_check = (bucket_id = 'pod-designs')   <- et RIEN d'autre
--   DELETE  qual       = (bucket_id = 'pod-designs')   <- et RIEN d'autre
--
-- Leurs NOMS disent « their pod designs ». Leurs CONDITIONS ne le disent pas.
--
-- Contrairement aux trois policies de `site-images`, elles n'interrogent pas
-- `sites` : elles ne beneficient donc d'AUCUNE protection implicite par la RLS
-- de cette table (mecanisme mesure et documente en DEBT-072). Rien, nulle
-- part, ne borne l'ecriture au proprietaire.
--
-- LE CHEMIN D'EXPLOITATION EXISTE DEJA DANS LE PRODUIT :
--   `src/app/edit/[slug]/page.tsx:449` construit `path = ${slug}/${Date.now()}`
--   DANS LE NAVIGATEUR et televerse avec la cle `authenticated`. `slug` est une
--   variable du client.
--
-- ------------------------------------------------------------
-- POURQUOI C'EST PLUS QU'UNE DEGRADATION
-- ------------------------------------------------------------
-- `isOwnPodDesignUrl` (`lib/mode3/podBrandMockups.ts`) repond « ce design
-- appartient-il a ce site ? » par `url.includes('/pod-designs/<slug>/')`. Le
-- checkout s'en sert comme GARDE avant d'envoyer un design en fabrication
-- reelle -- et c'est la PLATEFORME qui avance le cout fournisseur (LOT 3 /
-- L3-04).
--
-- Or un prefixe ne prouve l'appartenance QUE si le proprietaire seul peut y
-- ecrire. D'ou la substitution : DELETE du fichier d'un autre marchand, puis
-- INSERT d'une autre image AU MEME CHEMIN. Son `sites.pod_designs` pointe
-- toujours cette URL -- la fabrication suivante part avec l'image substituee.
--
-- CE FICHIER NE CORRIGE PAS `isOwnPodDesignUrl` : son raisonnement redevient
-- juste des lors que le prefixe est reellement reserve. C'est la premisse qui
-- manquait, pas la fonction.
--
-- ------------------------------------------------------------
-- LA CORRECTION, ET SES BORNES
-- ------------------------------------------------------------
-- Meme forme que `site-images` -- le premier segment du chemin doit etre le
-- slug d'un site possede -- avec UNE difference deliberee : la propriete est
-- verifiee par `owner_id = auth.uid()`, JAMAIS par `owner_email`.
--
--   * `owner_id` est l'identite canonique du depot depuis M2-02, et elle est
--     `NOT NULL` sur 14 sites sur 14 (verifie) : aucun repli n'est necessaire ;
--   * `owner_email` est ecrite une seule fois et jamais mise a jour. La
--     reprendre ici introduirait dans une policy NEUVE exactement ce que
--     DEBT-072 existe pour retirer ;
--   * la garde devient EXPLICITE. Sur `site-images`, elle n'est aujourd'hui
--     correcte que parce que la RLS de `sites` ajoute `owner_id` en silence --
--     un couplage avec une policy d'une AUTRE table, resserree pour une raison
--     sans rapport. Ici, rien n'est implicite.
--
-- CE FICHIER NE TOUCHE PAS :
--   * les policies de `site-images` (DEBT-072, dette distincte) ;
--   * `Public can read pod designs` -- le bucket est public par conception, et
--     le fournisseur POD lit ces URL ;
--   * les tables, les grants, les donnees.
--
-- IL N'AJOUTE AUCUNE POLICY : il RESSERRE les deux qui existent. Rejouable --
-- reappliquer la meme expression est sans effet.
--
-- LES NOMS DE POLICY NE SONT PAS ECRITS EN DUR : ils sont resolus depuis
-- `pg_policies`. Deux relectures successives du meme dump les ont transcrits
-- differemment (« upload pod designs » / « upload their pod designs ») -- un
-- nom devine ferait echouer l'ALTER, ou pire, en viserait un autre.
-- ============================================================


-- ============================================================
-- 1/2 -- RESSERREMENT DES DEUX POLICIES D'ECRITURE
-- ============================================================
DO $$
DECLARE
  r record;
  n_resserrees int := 0;
  -- Meme forme que `site-images`, mais sur `owner_id`.
  cond text := '(bucket_id = ''pod-designs''::text) AND (EXISTS ('
               || 'SELECT 1 FROM public.sites '
               || 'WHERE sites.slug = split_part(objects.name, ''/''::text, 1) '
               || 'AND sites.owner_id = auth.uid()))';
BEGIN
  FOR r IN
    SELECT policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND cmd IN ('INSERT', 'DELETE')
      AND coalesce(qual, with_check) LIKE '%pod-designs%'
    ORDER BY cmd
  LOOP
    IF r.cmd = 'INSERT' THEN
      -- Sur une policy INSERT, PostgreSQL n'evalue QUE `with_check`.
      EXECUTE format('ALTER POLICY %I ON storage.objects WITH CHECK (%s)', r.policyname, cond);
    ELSE
      -- Sur une policy DELETE, PostgreSQL n'evalue QUE `USING`.
      EXECUTE format('ALTER POLICY %I ON storage.objects USING (%s)', r.policyname, cond);
    END IF;
    n_resserrees := n_resserrees + 1;
    RAISE NOTICE 'RESSERREE : % (%)', r.policyname, r.cmd;
  END LOOP;

  IF n_resserrees <> 2 THEN
    RAISE EXCEPTION 'DEBT-084 : % policy(ies) resserree(s), 2 attendues (INSERT et DELETE). '
                    'Rien n''est applique -- la transaction est annulee. Verifier `pg_policies` '
                    'avant de rejouer : un nom ou une condition a change.', n_resserrees;
  END IF;
END $$;


-- ============================================================
-- 2/2 -- VERIFICATIONS (lecture seule) -- a executer et me renvoyer.
-- ============================================================

-- A. Les six policies de `storage.objects`.
--    ATTENDU : les deux policies d'ecriture `pod-designs` portent desormais
--    l'EXISTS sur `sites` avec `owner_id`. `Public can read pod designs` reste
--    inchangee. Les trois `site-images` restent inchangees (DEBT-072 intacte).
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- B. Verdict compact : aucune policy d'ECRITURE de `storage.objects` ne doit
--    plus se contenter du bucket. ATTENDU : `borne_au_proprietaire = true`
--    pour les quatre policies INSERT/UPDATE/DELETE.
SELECT policyname,
       cmd,
       (coalesce(qual, with_check) LIKE '%owner_id%'
        OR coalesce(qual, with_check) LIKE '%owner_email%') AS borne_au_proprietaire
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY cmd, policyname;
