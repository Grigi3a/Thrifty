# Thrifty — marketplace de seconde main

Site complet : comptes, annonces avec photos, offres, messagerie, commandes, avis, administration (commissions, versements, litiges, modération).
Aucun mode démo : tout passe par le serveur et une base de données.

## Ce qui fonctionne
- Acheteurs : catalogue Femmes / Hommes / Enfants, filtres, promos, favoris (alerte baisse de prix), offres, messages, commande, suivi, confirmation de réception, signalement de problème, avis.
- Vendeurs : annonces avec vraies photos, brouillons, baisse de prix, mode vacances, ventes, versements.
- Admin : commissions, commandes, dossiers (résoudre / rembourser), versements, annonces, membres (suspension), messages, réglages (commission, livraison), export CSV.
- Sécurité : mots de passe scrypt, sessions en cookie HttpOnly, contrôle d'origine, limitation de débit, validation côté serveur, vente unique garantie (pas de double vente).
- Partage WhatsApp : chaque annonce a son aperçu (titre, prix, photo), plus sitemap.xml et robots.txt.

## Nouveautés (v5)
- Hero avec l'image fournie (webp 480/720/1122 + jpg), cadrage mobile/bureau séparé, sans décalage de mise en page.
- Animations discrètes (150–300 ms), `prefers-reduced-motion` respecté, rien de permanent.
- **Drops Thrifty** (admin → Drops) : section d'accueil et page `/drops/...` visibles seulement s'il y a des pièces disponibles.
- **Tailles et mesures** : coupe (petit/normal/grand), mesures à plat en cm selon la catégorie, aide « comment mesurer ». Anciennes annonces inchangées.
- **Lots** (`/lots`) : plusieurs pièces du même vendeur, prix réel < somme, commande groupée (un seul colis, livraison facturée une fois), aucune double vente.
- **Profils vendeurs** : présentation, stats issues des vraies commandes, avis liés à une commande confirmée, signalement de profils/annonces/avis (admin → Signalements). « E-mail confirmé » seulement après vraie confirmation (nécessite `SMTP_URL`). Aucun badge « compte vérifié », aucune vérification de téléphone.
- **Partage** : copier le lien, partage natif, carte story téléchargeable (publiée par le vendeur lui-même).
- **Zone Rabat · Salé · Témara** + autres villes (choix volontaire, pas de géolocalisation).
- **Recherches sauvegardées** (`/recherches`) : alertes dans le site ; e-mail seulement si `SMTP_URL` est configuré et si l'utilisateur l'a demandé. Tâche toutes les 5 min, un seul message regroupé par recherche.
- **Offre de lancement** (admin → Réglages) : désactivée par défaut, période obligatoire. Les tarifs ne changent jamais tout seuls.

## Ce qui n'est PAS branché (à connaître avant de lancer)
1. **Paiement en ligne** : seul le paiement à la livraison (espèces) est actif. CMI / Payzone / Stripe demandent un contrat marchand et des clés qu'il faut obtenir vous-même. L'emplacement est prêt dans `server/payments.js`.
2. **Transporteur** : aucune API, donc aucun suivi automatique ni délai garanti ; « main propre » non proposé. Le vendeur indique « expédiée », l'administrateur marque « livrée », puis l'acheteur confirme.
3. **Versements vendeurs** : manuels. Vous faites le virement, puis cliquez « Versement effectué » dans l'admin.
4. **E-mails** : sans `SMTP_URL`, le lien de réinitialisation de mot de passe est seulement écrit dans les logs du serveur.
5. **Pages légales** (CGU, confidentialité, mentions) : ce sont des modèles. Remplissez les variables `COMPANY_*` et faites-les relire par un juriste. Vérifiez aussi la déclaration CNDP (loi 09-08), le statut commercial de la société et les règles de protection du consommateur.

## Prérequis
Node.js **22.13 ou plus** (la base SQLite est intégrée à Node, aucune base à installer).

## Lancer en local
```bash
npm install
ADMIN_EMAIL=vous@exemple.ma ADMIN_PASSWORD=un-long-mot-de-passe npm start
# http://localhost:3000
```
Sans `ADMIN_PASSWORD`, un mot de passe aléatoire est affiché une seule fois dans la console.

## Mettre en ligne
Il faut un **disque persistant** : la base (`thrifty.db`) et les photos sont dans `DATA_DIR`. Sans disque persistant, tout est perdu à chaque redéploiement.

**Render** : poussez le dossier sur GitHub, créez un « Blueprint » (le fichier `render.yaml` prépare le disque), renseignez `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BASE_URL`.

**Docker / VPS** :
```bash
docker build -t thrifty .
docker run -d --name thrifty -p 3000:3000 -v thrifty-data:/data \
  -e ADMIN_EMAIL=vous@exemple.ma -e ADMIN_PASSWORD=... -e BASE_URL=https://www.votre-domaine.ma \
  -e COOKIE_SECURE=1 thrifty
```
Placez devant un proxy HTTPS (Caddy, Nginx, Cloudflare). Le HTTPS est obligatoire en production.

**Sauvegardes** : copiez régulièrement le dossier `DATA_DIR` (base + `uploads/`).

## Variables d'environnement
Voir `.env.example` (port, dossier de données, admin, URL publique, SMTP, tarifs, mentions légales).

## Modifier les textes en darija
Tout est dans l'objet `T.DJ` en haut de `public/core.js`.

## Tests
`npm test` (API + nouvelles fonctions), `npm run test:e2e`, `node test/responsive.js` (360/390/430/768/1280 px).

```bash
npm test            # API : comptes, annonces, offres, commandes, litiges, droits d'accès
npm run test:e2e    # navigateur (nécessite : npm i -D playwright && npx playwright install chromium)
```

## Structure
`server/` API Express + SQLite · `public/` site (HTML, CSS, JS sans build) · `test/` tests.
