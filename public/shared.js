/* Constantes partagées entre le serveur (require) et le navigateur (window.SHARED). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SHARED = factory();
})(this, function () {
  const UNIV = { femmes: 'Femmes', hommes: 'Hommes', enfants: 'Enfants' };
  const CATS = ['Vestes et blazers', 'Chemises', 'Pulls et gilets', 'Manteaux', 'Robes', 'Pantalons', 'Tee-shirts', 'Chaussures', 'Accessoires'];
  const catsFor = (u) => (u === 'hommes' ? CATS.filter((c) => c !== 'Robes') : CATS);
  const COND = ['Neuf avec étiquette', 'Neuf sans étiquette', 'Très bon état', 'Bon état', 'Satisfaisant'];
  const COLORS = { Noir: '#2b2d31', Blanc: '#f1efe8', Beige: '#d6c3a0', Gris: '#9aa0a8', Bleu: '#6f93d6', 'Bleu marine': '#27385f', Vert: '#4f7a5c', Rouge: '#c94a4a', Rose: '#e9a7b8', Marron: '#8a5a3b', Jaune: '#e8c14b', Denim: '#5f84b3' };
  const CITIES = ['Casablanca', 'Rabat', 'Fès', 'Marrakech', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Témara', 'Mohammédia', 'El Jadida', 'Nador', 'Béni Mellal', 'Settat', 'Khouribga', 'Autre ville'];
  const PACKS = { Petit: 'Petit (tee-shirt, accessoire)', Moyen: 'Moyen (pull, chemise, robe)', Grand: 'Grand (manteau, chaussures)' };
  const REASONS = ['Article non reçu', 'Mauvais article', 'Défaut non déclaré', 'Autre difficulté'];
  function sizesFor(u, c) {
    if (c === 'Accessoires') return ['Unique'];
    if (c === 'Chaussures') return u === 'femmes' ? ['35', '36', '37', '38', '39', '40', '41'] : u === 'hommes' ? ['40', '41', '42', '43', '44', '45', '46'] : ['20', '22', '24', '26', '28', '30', '32', '34', '36'];
    if (u === 'enfants') return ['0-6 mois', '6-12 mois', '1-2 ans', '2-3 ans', '4-5 ans', '6-7 ans', '8-9 ans', '10-11 ans', '12-13 ans'];
    return u === 'hommes' ? ['S', 'M', 'L', 'XL', 'XXL'] : ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  }
  function allSizes(u) {
    const s = [];
    catsFor(u).forEach((c) => sizesFor(u, c).forEach((x) => { if (!s.includes(x) && x !== 'Unique') s.push(x); }));
    return s;
  }
  const packFor = (c) => ({ Manteaux: 'Grand', Chaussures: 'Grand', 'Tee-shirts': 'Petit', Accessoires: 'Petit' }[c] || 'Moyen');
  const ORDER_LBL = { to_ship: 'À expédier', shipping: 'En cours de livraison', delivered: 'Livré · à vérifier', confirmed: 'Réception confirmée', issue: 'Problème signalé', refunded: 'Remboursée', cancelled: 'Annulée' };
  const PAY_LBL = { pending: 'En attente', due: 'À verser', paid: 'Versé', suspended: 'Suspendu', cancelled: 'Annulé' };
  return { UNIV, CATS, catsFor, COND, COLORS, CITIES, PACKS, REASONS, sizesFor, allSizes, packFor, ORDER_LBL, PAY_LBL };
});
