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
import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import type { PropsWithChildren } from "react";

export type FormValues = Readonly<Record<string, string>>;

export interface FormStore {
  read(blockId: string): FormValues;
  write(blockId: string, values: FormValues): void;
}

/** Magasin INERTE : chaque lecture rend le vide. Comportement d'avant D-066. */
export const EMPTY_FORM_STORE: FormStore = {
  read: () => ({}),
  write: () => undefined,
};

const FormContext = createContext<FormStore>(EMPTY_FORM_STORE);

export function FormStateRoot({ children }: PropsWithChildren) {
  const magasin = useRef<Record<string, FormValues>>({});
  const store = useMemo<FormStore>(
    () => ({
      read: (blockId) => magasin.current[blockId] ?? {},
      write: (blockId, values) => {
        magasin.current = { ...magasin.current, [blockId]: values };
      },
    }),
    [],
  );
  return <FormContext.Provider value={store}>{children}</FormContext.Provider>;
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
