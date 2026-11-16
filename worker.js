/**
 * Luna Whiteboard — backend de paiement FedaPay (Cloudflare Worker)
 *
 * ÉTAT : SQUELETTE. Rien n'est encaissé tant que les 3 fonctions marquées
 * TODO(FEDAPAY) ne sont pas écrites d'après la documentation officielle :
 * https://docs.fedapay.com . Tant qu'elles ne sont pas implémentées, le
 * serveur répond 501 et le site n'affiche jamais « Paiement confirmé ».
 *
 * RÈGLES DE SÉCURITÉ
 *  - Les clés FedaPay sont des variables d'environnement du Worker
 *    (wrangler secret put …). Elles n'apparaissent jamais dans le site.
 *  - Le montant est fixé ICI. Le navigateur n'envoie jamais le prix.
 *  - Un paiement n'est « paid » que si FedaPay le confirme au serveur
 *    (interrogation directe de l'API ou webhook vérifié), jamais sur la
 *    base d'une information venue du navigateur.
 *
 * Variables attendues (voir .dev.vars.example) :
 *   FEDAPAY_SECRET_KEY, FEDAPAY_WEBHOOK_SECRET, ALLOWED_ORIGIN, DOWNLOAD_URL
 * Stockage : un KV nommé TX (voir wrangler.toml).
 */

const AMOUNT = 22000;          // FCFA — source de vérité du prix
const DESCRIPTION = "Luna Whiteboard — accès à vie";

class NotImplementedError extends Error {}

/* ---------- À IMPLÉMENTER d'après la doc FedaPay ---------- */

// TODO(FEDAPAY): créer la transaction chez FedaPay (montant AMOUNT, devise FCFA
// telle que définie par FedaPay, client = customer) et renvoyer ce dont l'adaptateur
// du site a besoin (identifiant FedaPay + jeton/élément de paiement intégré).
async function createFedaPayTransaction(env, customer) {
  throw new NotImplementedError("createFedaPayTransaction");
}

// TODO(FEDAPAY): interroger FedaPay pour obtenir l'état réel de la transaction.
// Renvoyer l'état BRUT de FedaPay ; normalizeStatus() le convertit.
async function fetchFedaPayStatus(env, fedapayId) {
  throw new NotImplementedError("fetchFedaPayStatus");
}

// TODO(FEDAPAY): vérifier la signature du webhook avec FEDAPAY_WEBHOOK_SECRET,
// selon la doc. Renvoyer l'identifiant de transaction FedaPay, ou lever une erreur.
async function verifyWebhook(request, env) {
  throw new NotImplementedError("verifyWebhook");
}

// TODO(FEDAPAY): compléter la correspondance avec les états réels de la doc.
// Tout état inconnu reste « pending » : on ne valide jamais par défaut.
function normalizeStatus(raw) {
  const map = {
    // "<état FedaPay>": "paid" | "failed" | "cancelled" | "pending",
  };
  return map[raw] || "pending";
}

/* ---------- Routes (contrat attendu par le site) ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      // POST /create-transaction  {name,email,phone} → {transactionId, ...}
      if (url.pathname === "/create-transaction" && request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const customer = {
          name: String(b.name || "").trim().slice(0, 100),
          email: String(b.email || "").trim().slice(0, 150),
          phone: String(b.phone || "").trim().slice(0, 30),
        };
        if (!customer.name || !/^\S+@\S+\.\S+$/.test(customer.email)) return json({ error: "invalid_customer" }, 400);
        const tx = await createFedaPayTransaction(env, customer); // doit renvoyer {fedapayId, ...données pour l'adaptateur}
        const id = crypto.randomUUID();
        await env.TX.put(id, JSON.stringify({ fedapayId: tx.fedapayId, email: customer.email, status: "pending", amount: AMOUNT, at: Date.now() }));
        const { fedapayId, ...forBrowser } = tx;
        return json({ transactionId: id, ...forBrowser });
      }

      // GET /transaction-status?id=…  → {status:"paid"|"pending"|"failed"|"cancelled", downloadUrl?}
      if (url.pathname === "/transaction-status" && request.method === "GET") {
        const id = url.searchParams.get("id") || "";
        const rec = JSON.parse((await env.TX.get(id)) || "null");
        if (!rec) return json({ error: "not_found" }, 404);
        if (rec.status !== "paid") {
          rec.status = normalizeStatus(await fetchFedaPayStatus(env, rec.fedapayId));
          await env.TX.put(id, JSON.stringify(rec));
        }
        // TODO : remplacer DOWNLOAD_URL par un lien signé/temporaire si vous le souhaitez.
        return json({ status: rec.status, ...(rec.status === "paid" && env.DOWNLOAD_URL ? { downloadUrl: env.DOWNLOAD_URL } : {}) });
      }

      // POST /webhook  (adresse à déclarer dans le tableau de bord FedaPay)
      if (url.pathname === "/webhook" && request.method === "POST") {
        const fedapayId = await verifyWebhook(request, env);
        // Ne pas se fier au contenu du webhook : on revérifie l'état auprès de FedaPay.
        const status = normalizeStatus(await fetchFedaPayStatus(env, fedapayId));
        // TODO : retrouver l'enregistrement KV par fedapayId et mettre son statut à jour
        // (ex. clé secondaire "fp:<fedapayId>" → id interne écrite dans /create-transaction).
        return json({ received: true, status });
      }

      return json({ error: "not_found" }, 404);
    } catch (e) {
      if (e instanceof NotImplementedError) return json({ error: "not_implemented", detail: e.message }, 501);
      return json({ error: "server_error" }, 500);
    }
  },
};
