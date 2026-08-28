// V5 (4.0, D-026) — HARNAIS ZÉRO-RÉSEAU : préchargé via `node --import`,
// il fait ÉCHOUER (fail-closed) toute tentative d'accès réseau du
// processus. DEUX COUCHES, toutes deux prouvées par contrôles :
//  1. INTERCEPTION AU CHARGEMENT (module.registerHooks) : toute résolution
//     d'un module réseau (net, dns, tls, http, https, http2, dgram,
//     child_process, undici) est réécrite vers un stub dont TOUT accès de
//     propriété lève NetworkForbiddenError — un import nommé échoue même
//     au linkage (fail-closed renforcé).
//  2. PATCHS D'APPEL sur les références déjà tenues : fetch/WebSocket
//     globaux, net.Socket.prototype.connect, objets par défaut de
//     net/dns/http/https.
// LIMITE CONNUE (mesurée, consignée) : les exports NOMMÉS d'un module cœur
// importés AVANT l'installation du harnais restent les originaux (les
// espaces de noms sont des instantanés — démontré le 2026-08-28) ; c'est
// la couche 1 qui ferme ce chemin pour tout import postérieur, et le
// harnais doit donc être chargé EN PREMIER (--import), jamais après coup.
// Complété en 4.6 par le cliquet STATIQUE d'imports du paquet compilateur.
import net from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { registerHooks } from "node:module";

const MARKER = "V5_NETWORK_FORBIDDEN";
let attempts = 0;

class NetworkForbiddenError extends Error {
  constructor(channel) {
    super(`${MARKER}: accès réseau interdit dans le chemin de compilation (${channel})`);
    this.name = "NetworkForbiddenError";
  }
}
const forbid = (channel) => {
  attempts += 1;
  throw new NetworkForbiddenError(channel);
};

// --- Couche 1 : interception au chargement (imports postérieurs).
const FORBIDDEN = new Set(
  ["net", "dns", "tls", "http", "https", "http2", "dgram", "child_process"]
    .flatMap((m) => [m, `node:${m}`])
    .concat(["undici", "dns/promises", "node:dns/promises"]),
);
// Stub : défaut = Proxy levant le MARKER à tout accès ; aucun export nommé
// (un import nommé casse au linkage — fail-closed).
const STUB_URL =
  "data:text/javascript," +
  encodeURIComponent(
    `const f = () => { throw Object.assign(new Error("${MARKER}: module réseau interdit dans le chemin de compilation"), { name: "NetworkForbiddenError" }); };
export default new Proxy(Object.create(null), { get: f, apply: f, construct: f, has: f });`,
  );
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (FORBIDDEN.has(specifier)) {
      attempts += 1;
      return { url: STUB_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

// --- Couche 2 : patchs d'appel sur les références déjà tenues.
globalThis.fetch = () => forbid("fetch");
if (typeof globalThis.WebSocket === "function") {
  globalThis.WebSocket = function () {
    forbid("WebSocket");
  };
}
net.Socket.prototype.connect = function () {
  forbid("net.Socket.connect");
};
net.connect = net.createConnection = () => forbid("net.connect");
dns.lookup = () => forbid("dns.lookup");
dns.resolve = () => forbid("dns.resolve");
dns.promises.lookup = async () => forbid("dns.promises.lookup");
dns.promises.resolve = async () => forbid("dns.promises.resolve");
http.request = http.get = () => forbid("http.request");
https.request = https.get = () => forbid("https.request");

process.on("exit", () => {
  process.stderr.write(`${MARKER}_ATTEMPTS=${attempts}\n`);
});
