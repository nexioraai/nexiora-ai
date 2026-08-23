# Protocole — établir le montant réellement débité par CJ

## La question, et pourquoi elle n'est pas tranchée

Le devis CJ expose trois montants sans jamais dire lequel est facturé :

```
logisticPrice            prix de transport, converti du yuan (taux 6,197 verifie sur 1 379 options)
clearanceOperationFee    "customs clearance fee" -- non nul sur DE/ES/IT (0,70 / 0,80 / 2,40)
totalPostageFee          "total postage" -- >= logisticPrice, ecart en UE uniquement
```

La documentation officielle décrit ces champs mais **ne dit nulle part lequel est débité**, et
son exemple de réponse ne contient même pas `totalPostageFee`.

**Tant que ce point n'est pas établi, Deribfy facture sur `logisticPrice`.** Facturer
`totalPostageFee` sans preuve surfacturerait l'acheteur de 2,30 à 3,50 USD en zone UE.

## ⚠️ Le relevé de solde ne suffira pas — vérifié

```
node scripts/measure-cj-freight.mjs --balance --label=baseline
-> { "amount": 0, "noWithdrawalAmount": 0, "freezeAmount": 0 }
```

**Le portefeuille CJ est à zéro.** Si les commandes sont payées par carte ou PayPal au moment
du paiement manuel, le solde restera à zéro et **le delta ne mesurera rien**.

Le relevé n'est donc utile **que si** le portefeuille est approvisionné et que le paiement est
prélevé dessus. **À vérifier avant de compter dessus.**

## Voie primaire — la commande elle-même

`cjGetOrderDetail` *(`/shopping/order/getOrderDetail`)* est **déjà appelé** par
`reconcile.ts`, qui n'en lit qu'un seul champ : `orderStatus`. La réponse complète n'a jamais
été inspectée. Si elle porte le montant de transport facturé, **la preuve est là, sans rien
payer de plus**.

## Procédure — une commande FR réelle

### 1. Avant le paiement manuel

Relever le solde *(utile seulement si le portefeuille est approvisionné)* :

```bash
node scripts/measure-cj-freight.mjs --balance --label=avant --out=measures/balance
```

Relever le devis de la même destination et des mêmes produits :

```bash
node scripts/measure-cj-freight.mjs \
  --pid=<PID_1> --pid=<PID_2> --country=FR --quantities=<QTE_REELLE> \
  --out=measures/debit-fr --confirm
```

Consigner, depuis `/admin` (anomalies de la commande) et depuis le devis :

| Donnée | Source |
|---|---|
| `logisticPrice` | devis, méthode retenue |
| `clearanceOperationFee` | devis, même méthode |
| `totalPostageFee` | devis, même méthode |
| méthode (`logisticName`) | `shop_orders.shipment_logistic_name` |
| montant encaissé | `shop_orders.shipping_amount` |
| `cj_order_id` | `shop_orders.cj_order_id` |

Les anomalies `cj_shipping_total_exceeds_charged` *(warning)* et
`cj_shipping_named_fee_ignored` *(info)* portent déjà **la décomposition complète** — c'est la
source la plus fiable, elle est enregistrée au moment exact du fulfillment.

### 2. Le paiement manuel

Payer la commande chez CJ, comme d'habitude. **Noter le montant de livraison affiché par
l'interface CJ au moment du paiement** — c'est déjà une observation directe, et peut-être
suffisante à elle seule.

### 3. Après le paiement

```bash
node scripts/measure-cj-freight.mjs --balance --label=apres --out=measures/balance
```

### 4. Comparaison

| Hypothèse | Conséquence |
|---|---|
| débit = `logisticPrice` | base actuelle **correcte**, ne rien changer, clore le point |
| débit = `totalPostageFee` | preuve obtenue — l'intégration devient **envisageable** *(elle augmenterait le prix UE de 2,30 à 3,50 : décision commerciale)* |
| débit = `logisticPrice + clearanceOperationFee` | seul `clearanceOperationFee` est à intégrer |
| **aucun des trois** | ne rien modifier — identifier d'abord le montant réel |

## Ce que le protocole ne peut pas donner

Une commande **ne prouve qu'une méthode, un pays, une quantité**. Le résidu non nommé varie
selon la méthode *(3,50 sur 379 options, 2,30 sur 25, valeurs plus petites sur les
« CJPacket Euro \* »)*. **Une seule mesure ne généralise pas.** Elle tranche la question de
principe — *quel champ est débité* — pas la totalité des cas.
