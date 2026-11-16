# Intégration FedaPay — Luna Whiteboard

**État : préparée, non opérationnelle.** Le site affiche « Paiement bientôt activé » tant que les étapes ci-dessous ne sont pas faites. Aucun paiement n'est simulé.

## Séparation frontend / backend
| Où | Contenu |
|---|---|
| Site (`Luna_Whiteboard.html`, public) | prix affiché, fenêtre de paiement, états (en cours, confirmé, échoué, annulé), `CONFIG.pay.apiBase` et `CONFIG.pay.publicKey` (clé **publique** seulement), `FedaPayAdapter` |
| Serveur (`worker.js`, privé) | création de transaction, vérification du statut, webhook, clés secrètes, montant (22 000 FCFA) |

## À faire, dans l'ordre
1. Créer votre compte FedaPay et lire https://docs.fedapay.com (mode test d'abord).
2. Déployer le Worker : `npx wrangler kv namespace create TX`, coller l'id dans `wrangler.toml`, puis `npx wrangler secret put FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`, et définir `ALLOWED_ORIGIN` et `DOWNLOAD_URL`.
3. Écrire les 3 fonctions `TODO(FEDAPAY)` de `worker.js` et compléter `normalizeStatus` d'après la doc.
4. Déclarer `https://<votre-worker>/webhook` dans le tableau de bord FedaPay.
5. Dans le site : renseigner `CONFIG.pay.apiBase` (adresse du Worker) et `CONFIG.pay.publicKey`, puis implémenter `FedaPayAdapter.ready()` / `open()` (ouverture du paiement dans la page) et passer `ready()` à `true`.
6. Tester en mode test : succès, échec, annulation, fermeture de la fenêtre, webhook en retard.

## Contrat entre le site et le serveur
- `POST /create-transaction` ← `{name,email,phone}` → `{transactionId, …}` (le montant n'est jamais envoyé par le navigateur)
- `GET /transaction-status?id=…` → `{status:"paid"|"pending"|"failed"|"cancelled", downloadUrl?}`
- `POST /webhook` ← appelé par FedaPay ; le serveur revérifie l'état auprès de FedaPay.
- Après paiement, le site peut aussi être rouvert avec `?tx=IDENTIFIANT` pour vérifier le statut côté serveur.
- Si vous utilisez `CONFIG.pay.successUrl`, cette page doit elle aussi vérifier le statut côté serveur avant de donner l'application.

## Ce qui ne doit jamais arriver
Clé secrète dans le HTML/JS, montant décidé par le navigateur, « succès » affiché sans réponse `paid` du serveur.
