// NOTE D'ARCHITECTURE (démontrée sur device, 3.4) : un écran généré DOIT
// être enveloppé dans la primitive ScreenShell — c'est elle qui peint le
// fond thémé ; sans elle, la bascule dark laisse un fond clair sous des
// textes clairs. Le compilateur (Phase 4) émettra : ScreenShell + blocs.
// LES 5 ÉCRANS DE LA MATRICE M1 — chaque écran est une COMPOSITION DE
// RÉFÉRENCE (D-023) rendue sur device, avec les états du critère ROADMAP.
// Le harnais fournit libellés/données/callbacks (rôle du compilateur, F3).
import { useState } from "react";
import { Text, View } from "react-native";
import { ScreenShell } from "@deribfy/primitives";
import {
  ButtonBlock,
  DetailHeaderBlock,
  EmptyStateBlock,
  FormBlock,
  HeaderBlock,
  ListBlock,
} from "@deribfy/blocks";
import { CATALOGUE, REGLAGES } from "./data";

const résultat = { fontSize: 12, padding: 4 } as const;

// ——— AuthFlow : header + form (champ secure) + button ———
export function EcranAuth() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  return (
    <ScreenShell title="Deribfy">
      <HeaderBlock title="Connexion" subtitle="Ravi de vous revoir" />
      <FormBlock
        testID="auth"
        fields={[
          { id: "fld_email", label: "Email", placeholder: "vous@exemple.ci" },
          { id: "fld_password", label: "Mot de passe", secure: true },
        ]}
        values={values}
        onChangeField={(id, v) => setValues((s) => ({ ...s, [id]: v }))}
        submitLabel="Se connecter"
        onSubmit={() => setResult("connexion demandée")}
      />
      <ButtonBlock
        testID="auth-register"
        label="Créer un compte"
        kind="ghost"
        onPress={() => setResult("inscription demandée")}
      />
      {result !== "" && (
        <Text style={résultat} testID="auth-result">{result}</Text>
      )}
    </ScreenShell>
  );
}

// ——— List/Detail : tap RÉEL sur une ligne → écran de détail (preuve D-024) ———
export function EcranListDetail() {
  const [selected, setSelected] = useState<string | null>(null);
  const item = CATALOGUE.find((c) => c.id === selected);
  if (item !== undefined) {
    return (
      <ScreenShell title="Deribfy" testID="detail-screen">
        <DetailHeaderBlock
          title={item.title}
          subtitle={item.subtitle}
          trailing={item.trailing}
          badges={item.badge === undefined ? ["Maison"] : [item.badge, "Maison"]}
        />
        <ButtonBlock
          testID="detail-retour"
          label="Retour au catalogue"
          kind="ghost"
          onPress={() => setSelected(null)}
        />
      </ScreenShell>
    );
  }
  return (
    <ScreenShell title="Deribfy">
      <HeaderBlock title="Catalogue" subtitle="8 plats du jour" />
      <ListBlock testID="catalogue" items={CATALOGUE} onItemPress={setSelected} />
    </ScreenShell>
  );
}

// ——— Form : états error (fieldErrors + message global) et submitting ———
export function EcranForm() {
  return (
    <ScreenShell title="Deribfy">
      <HeaderBlock title="Inscription commerçant" />
      <FormBlock
        testID="inscription"
        fields={[
          { id: "fld_nom", label: "Nom du commerce" },
          { id: "fld_email", label: "Email" },
        ]}
        values={{ fld_nom: "Chez Awa" }}
        onChangeField={() => undefined}
        submitLabel="Enregistrer"
        onSubmit={() => undefined}
        state="error"
        errorMessage="Le serveur est injoignable"
        fieldErrors={{ fld_email: "Format invalide" }}
      />
      <FormBlock
        testID="envoi"
        fields={[{ id: "fld_ville", label: "Ville" }]}
        values={{ fld_ville: "Abidjan" }}
        onChangeField={() => undefined}
        submitLabel="Envoi en cours"
        onSubmit={() => undefined}
        state="submitting"
      />
    </ScreenShell>
  );
}

// ——— Profile : header + liste de réglages + déconnexion ———
export function EcranProfile() {
  const [result, setResult] = useState("");
  return (
    <ScreenShell title="Deribfy">
      <HeaderBlock title="Awa K." subtitle="Compte commerçant" />
      <ListBlock testID="reglages" items={REGLAGES} onItemPress={setResult} />
      <ButtonBlock
        testID="logout"
        label="Se déconnecter"
        kind="ghost"
        onPress={() => setResult("deconnexion")}
      />
      {result !== "" && (
        <Text style={résultat} testID="profil-result">{`choix : ${result}`}</Text>
      )}
    </ScreenShell>
  );
}

// ——— États : loading / empty / error (critère ROADMAP) + empty_state ———
export function EcranEtats() {
  const [result, setResult] = useState("");
  return (
    <ScreenShell title="Deribfy">
      <ListBlock
        testID="etat-loading"
        items={[]}
        state={{ kind: "loading", title: "Chargement des plats" }}
      />
      <ListBlock
        testID="etat-empty"
        items={[]}
        state={{ kind: "empty", title: "Aucun plat", message: "Revenez demain" }}
      />
      <ListBlock
        testID="etat-error"
        items={[]}
        state={{
          kind: "error",
          title: "Échec du chargement",
          message: "Réseau indisponible",
          retryLabel: "Réessayer",
          onRetry: () => setResult("retry demandé"),
        }}
      />
      <EmptyStateBlock
        testID="etat-vide-action"
        title="Aucun favori"
        actionLabel="Parcourir la carte"
        onAction={() => setResult("parcourir demandé")}
      />
      {result !== "" && (
        <Text style={résultat} testID="etats-result">{result}</Text>
      )}
    </ScreenShell>
  );
}
