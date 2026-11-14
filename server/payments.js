'use strict';
/*
 * Moyens de paiement.
 *
 * Aujourd'hui : paiement à la livraison (« cod »), l'acheteur règle en espèces au transporteur.
 * Aucun paiement en ligne n'est actif : il faut un contrat avec un prestataire (CMI, Payzone, Stripe, etc.)
 * et ses clés API, que seul le propriétaire du site peut obtenir.
 *
 * Pour brancher un prestataire :
 *   1. ajouter un objet { id, label, enabled } dans METHODS ;
 *   2. dans createOrder (server/index.js), appeler provider.charge(...) avant d'insérer la commande ;
 *   3. recevoir la confirmation du prestataire par webhook et passer la commande en « à expédier ».
 */
const METHODS = [
  { id: 'cod', label: 'Paiement à la livraison (espèces)', enabled: true }
];
const enabled = () => METHODS.filter((m) => m.enabled);
const isEnabled = (id) => enabled().some((m) => m.id === id);
module.exports = { METHODS, enabled, isEnabled };
