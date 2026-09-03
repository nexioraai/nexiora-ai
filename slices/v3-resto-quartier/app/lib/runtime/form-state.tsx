// RUNTIME COPIÉ — ÉTAT DE FORMULAIRE PARTAGÉ (D-066).
//
// `crossScreenFormState: false` : `useState` vivait DANS le composant. Un
// utilisateur qui remplissait ses coordonnées, revenait en arrière pour vérifier
// le panier, puis repartait — **retrouvait un formulaire vide**. Sur un parcours
// de commande, c'est l'abandon garanti.
//
// L'état est désormais tenu au-dessus des écrans, indexé par identifiant de
// bloc. Défaut : un magasin ÉPHÉMÈRE en mémoire, créé à la racine de l'app —
// donc partagé entre écrans, et remis à zéro au redémarrage. Aucune persistance
// disque n'est promise : ce serait une capability, et elle n'en est pas une.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

export type FormValues = Readonly<Record<string, string>>;

export interface FormStore {
  read(blockId: string): FormValues;
  /** Fusion de tous les formulaires — pour une action portée par un BOUTON. */
  readAll(): FormValues;
  write(blockId: string, values: FormValues): void;
}

/** Magasin INERTE : chaque lecture rend le vide. Comportement d'avant D-066. */
export const EMPTY_FORM_STORE: FormStore = {
  read: () => ({}),
  readAll: () => ({}),
  write: () => undefined,
};

const FormContext = createContext<FormStore>(EMPTY_FORM_STORE);

export function FormStateRoot({ children }: PropsWithChildren) {
  // DÉFAUT CORRIGÉ (D-071) — la première version tenait le magasin dans un
  // `useRef`. Elle partageait bien l'état entre écrans, mais **aucune écriture
  // ne provoquait de rendu** : ce que l'utilisateur tapait ne s'affichait pas,
  // et la soumission envoyait les valeurs du rendu PRÉCÉDENT, donc vides.
  // Trouvé en pressant réellement le formulaire, pas en relisant le code.
  const [magasin, setMagasin] = useState<Record<string, FormValues>>({});
  const store = useMemo<FormStore>(
    () => ({
      read: (blockId) => magasin[blockId] ?? {},
      readAll: () => Object.assign({}, ...Object.values(magasin)) as FormValues,
      write: (blockId, values) => {
        setMagasin((prec) => ({ ...prec, [blockId]: values }));
      },
    }),
    [magasin],
  );
  return <FormContext.Provider value={store}>{children}</FormContext.Provider>;
}

/**
 * Valeurs saisies dans TOUS les formulaires montés (D-083).
 *
 * Défaut trouvé en pressant l'application réellement envoyée : les documents
 * générés câblent la mutation sur un BOUTON, pas sur le formulaire — c'est même
 * la forme la plus naturelle (« Valider » est un bouton). Or l'état vivait
 * strictement par bloc : le bouton n'avait accès à RIEN. L'utilisateur
 * remplissait, appuyait, et la règle de validation refusait une saisie vide.
 * **Silencieusement.** Exactement la famille de défaut que ce chantier traque.
 */
export function useAllFormValues(): FormValues {
  const store = useContext(FormContext);
  return store.readAll();
}

export function useFormValues(
  blockId: string,
): [FormValues, (fieldId: string, value: string) => void] {
  const store = useContext(FormContext);
  const valeurs = store.read(blockId);
  const ecrire = useCallback(
    (fieldId: string, value: string) => {
      store.write(blockId, { ...store.read(blockId), [fieldId]: value });
    },
    [store, blockId],
  );
  return [valeurs, ecrire];
}
