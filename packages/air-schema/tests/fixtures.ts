import type { DeploymentState, ProjectAir, ProjectLock } from "../src";

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);

// AIR de référence : mini-app restaurant, sémantiquement cohérente — le
// validateur doit retourner ZÉRO diagnostic dessus. Les tests négatifs
// partent d'une copie (structuredClone) et cassent UNE cohérence à la fois.
export function buildValidAir(): ProjectAir {
  return {
    airSchemaVersion: "1.0.0",
    projectId: "prj_resto_demo",
    app: {
      name: "Chez Awa",
      slug: "chez-awa",
      locales: {
        userLanguage: "fr",
        appLocales: ["fr", "en"],
        defaultAppLocale: "fr",
        contentLocales: ["fr"],
        rtlSupported: false,
      },
    },
    screens: [
      {
        id: "scr_menu",
        title: { fr: "Menu", en: "Menu" },
        blocks: [
          {
            id: "blk_menu_list",
            blockType: "list",
            entityId: "ent_menu_item",
            props: { pageSize: 20 },
          },
        ],
      },
      {
        id: "scr_commande",
        title: { fr: "Commande", en: "Order" },
        blocks: [
          { id: "blk_panier", blockType: "cart", entityId: "ent_order" },
          { id: "blk_payer", blockType: "button", props: { variant: "primary" } },
        ],
      },
    ],
    navigation: {
      entryScreenId: "scr_menu",
      routes: [
        { id: "nav_menu", screenId: "scr_menu", title: { fr: "Menu" } },
        { id: "nav_commande", screenId: "scr_commande", title: { fr: "Commande" } },
      ],
    },
    entities: [
      {
        id: "ent_menu_item",
        name: "menu_item",
        fields: [
          { id: "fld_item_name", name: "name", type: "string", required: true },
          { id: "fld_item_price", name: "price", type: "decimal", required: true },
          {
            id: "fld_item_category",
            name: "category",
            type: "enum",
            required: true,
            enumValues: ["plat", "boisson", "dessert"],
          },
        ],
      },
      {
        id: "ent_order",
        name: "order",
        fields: [
          {
            id: "fld_order_status",
            name: "status",
            type: "enum",
            required: true,
            enumValues: ["draft", "paid", "served"],
          },
          {
            id: "fld_order_item",
            name: "item",
            type: "reference",
            required: true,
            referencesEntityId: "ent_menu_item",
          },
        ],
      },
    ],
    relations: [
      {
        id: "rel_order_items",
        fromEntityId: "ent_order",
        toEntityId: "ent_menu_item",
        kind: "one_to_many",
      },
    ],
    datasets: [
      { id: "data_menu_initial", entityId: "ent_menu_item", contentHash: HEX_A, rowCount: 12 },
    ],
    actions: [
      {
        id: "act_payer",
        name: "Payer la commande",
        trigger: { kind: "ui", blockId: "blk_payer" },
        effect: { kind: "capability", capability: "payments", method: "checkout" },
      },
      {
        id: "act_notifier",
        name: "Notifier la cuisine",
        trigger: { kind: "data", entityId: "ent_order", event: "updated" },
        effect: { kind: "slot", slotId: "slot_notif_cuisine" },
      },
    ],
    rules: [
      {
        id: "rule_prix_positif",
        description: "Le prix d'un article est strictement positif",
        kind: "validation",
        entityId: "ent_menu_item",
        assertions: [{ fieldId: "fld_item_price", operator: "gt", value: 0 }],
      },
    ],
    slots: [
      {
        id: "slot_notif_cuisine",
        description: "Formate le message de notification cuisine",
        inputs: [{ name: "orderStatus", type: "string" }],
        outputs: [{ name: "message", type: "string" }],
        allowedImports: [],
      },
    ],
    capabilities: [{ capability: "payments" }, { capability: "push_notifications" }],
    permissions: [
      {
        platform: "ios",
        permission: "ios.notifications",
        reason: { fr: "Recevoir l'état de votre commande" },
        requiredByCapability: "push_notifications",
      },
    ],
    design: { theme: "deribfy_default" },
    integrations: [
      { id: "intg_psp", providerClass: "psp", capability: "payments", config: { mode: "test" } },
    ],
    network: { policy: "deny_by_default", allowedDomains: ["api.example.com"] },
    native: { minIosVersion: "15.1", minAndroidSdk: 24 },
    compliance: {
      commerceClass: "physical_or_offapp",
      accountDeletionRequired: true,
      dataCollected: ["contact_info", "purchases"],
    },
    expectedTests: [
      {
        id: "test_paiement",
        description: "Le paiement fait passer la commande à l'état payé",
        kind: "e2e",
        targetId: "act_payer",
      },
    ],
  };
}

export function buildValidLock(): ProjectLock {
  return {
    lockSchemaVersion: "1.0.0",
    airSchemaVersion: "1.0.0",
    airHash: HEX_A,
    resolved: {
      blocks: [{ blockType: "list", version: "1.2.0", integrity: HEX_B }],
      capabilities: [
        { capability: "payments", implementation: "psp_checkout", version: "1.0.0" },
      ],
      providers: [{ providerClass: "psp", provider: "stripe" }],
      releaseTrain: { id: "train_2026_q3", version: "1.0.0" },
      toolchain: { node: "24.16.0", expoSdk: "54", reactNative: "0.81" },
    },
  };
}

export function buildValidDeploymentState(): DeploymentState {
  return {
    stateSchemaVersion: "1.0.0",
    projectId: "prj_resto_demo",
    platforms: {
      ios: { distribution: "preview" },
    },
    otaChannels: [
      {
        channel: "preview",
        airHash: HEX_A,
        lockHash: HEX_B,
        updatedAt: "2026-08-27T12:00:00Z",
      },
    ],
  };
}
