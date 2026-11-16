# Thrifty — marketplace de seconde main

Site complet : comptes, annonces avec photos, offres, messagerie, commandes, avis, administration (commissions, versements, litiges, modération).
Aucun mode démo : tout passe par le serveur et une base de données.

## Ce qui fonctionne
- Acheteurs : catalogue Femmes / Hommes / Enfants, filtres, promos, favoris (alerte baisse de prix), offres, messages, commande, suivi, confirmation de réception, signalement de problème, avis.
- Vendeurs : annonces avec vraies photos, brouillons, baisse de prix, mode vacances, ventes, versements.
- Admin : commissions, commandes, dossiers (résoudre / rembourser), versements, annonces, membres (suspension), messages, réglages (commission, livraison), export CSV.
- Sécurité : mots de passe scrypt, sessions en cookie HttpOnly, contrôle d'origine, limitation de débit, validation côté serveur, vente unique garantie (pas de double vente).
- Partage WhatsApp : chaque annonce a son aperçu (titre, prix, photo), plus sitemap.xml et robots.txt.

## Nouveautés (v8) : revenus dès le lancement
- **Crédits vendeur** (`/credits`, 1 crédit = 1 DH) : le vendeur recharge par virement, CashPlus/Wafacash ou espèces et indique la référence ; l'administration valide dans **Admin → Crédits** après avoir vu l'argent arriver. Aucun argent d'acheteur ne transite par Thrifty.
- **Frais main propre** : 5 % du prix, minimum 5 DH (réglables dans Réglages), prélevés sur les crédits du vendeur à la commande, remboursés si la commande est annulée ou remboursée. Découvert toléré : 30 DH (réglable), pour que les premières ventes ne demandent aucune recharge ; au-delà, la main propre disparaît des annonces du vendeur (la livraison reste possible) et il est prévenu. 0 % = gratuit.
- **Options payantes** (dressing) : « Remonter » 5 DH (repasse en tête des nouveautés, 1 fois / 24 h) et « À la une » 20 DH pour 7 jours (en tête du catalogue et de l'accueil, badge). Payables seulement avec un solde positif. Prix réglables dans Admin → Crédits.
- Admin → Crédits : recharges à valider/refuser, soldes, ajustement manuel (crédits offerts), coordonnées de paiement affichées aux vendeurs, revenus (crédits vendus, options, frais main propre, dettes).
- CGU et aide : section crédits (non transférables, non convertibles, solde remboursé à la fermeture du compte).

## Nouveautés (v7)
- **Remise en main propre** à Rabat · Salé · Témara (article ET acheteur dans la zone) : 0 DH de livraison, lieu public proposé, paiement en espèces au vendeur. L'acheteur reçoit un **code à 6 chiffres** qu'il donne au vendeur après avoir vérifié l'article ; le vendeur le saisit et la vente est conclue. 5 essais maximum, puis l'admin est alerté. Le téléphone du vendeur est montré à l'acheteur. Admin → Réglages : activer/désactiver, commission main propre (0 % par défaut ; si > 0, elle est due par le vendeur et suivie dans Commandes → « Commission reçue »). Les lots restent en livraison.
- **Anti-contournement** : numéros, e-mails et liens WhatsApp/Telegram masqués dans les messages tant qu'aucune commande n'existe entre les deux membres pour l'article, et toujours dans les titres, descriptions, défauts, offres et présentations de profil.
- **SEO** : URL `/article/12-veste-en-jean` (301 depuis `/article/12`), contenu de l'annonce et des catalogues rendu dans le HTML (lisible sans JavaScript, affichage immédiat), données structurées `Product` (prix MAD, état, disponibilité) et `WebSite`, textes alternatifs « … d'occasion au Maroc ».
- **Appli installable (PWA)** : manifest, icône 512 px, service worker (pages hors ligne, photos en cache, API jamais en cache), proposition « Installer » sur Android.
- **Confiance** : vues de l'annonce (1 par visiteur / 6 h, pas celles du vendeur), nombre de favoris, délai de réponse habituel du vendeur (médiane sur 90 jours, affiché dès 3 conversations).
- Boutons de la fiche article qui débordaient sur mobile : corrigé.

## Correctifs (v6)
- **Domaine unique** : si `BASE_URL` est défini, toute requête arrivant sur un autre nom (`xxx.onrender.com`, `www.`) est redirigée en 301 vers lui (sauf `/healthz`). Canonical, sitemap, robots et aperçus WhatsApp utilisent `BASE_URL`. Désactivable avec `CANONICAL_REDIRECT=0`.
- **Pages légales** : plus aucun « [à compléter] » affiché au public ; les champs vides sont omis et le contact renvoie vers le formulaire d'aide. Les obligations légales restent à remplir (variables `COMPANY_*`, `CONTACT_EMAIL`, `HOSTING_PROVIDER`).
- **Mot de passe oublié sans e-mail** : Admin → Membres → « Lien mot de passe » génère un lien valable 24 h (copie + envoi WhatsApp). La page « Mot de passe oublié » explique la marche à suivre tant que `SMTP_URL` n'est pas configuré.
- **Anti-abus** : les limites (inscriptions, connexions…) se basent sur l'IP réelle du visiteur (`CF-Connecting-IP`, puis `X-Forwarded-For`) et non plus sur celle du proxy, qui faisait partager une seule limite à tous les visiteurs. `PROXY_IP_HEADERS=0` pour revenir à l'ancien comportement.
- **Administration → Résumé** : encadré listant ce qui manque dans la configuration (BASE_URL, SMTP_URL, mentions légales).
- **Article inexistant** : vrai code 404 + `noindex`.

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
