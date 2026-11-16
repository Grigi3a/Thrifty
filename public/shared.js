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
  const ORDER_LBL = { to_ship: 'À expédier', shipping: 'Expédiée (déclarée par le vendeur)', delivered: 'Livraison enregistrée · à vérifier', confirmed: 'Réception confirmée', issue: 'Problème signalé', refunded: 'Remboursée', cancelled: 'Annulée' };
  const PAY_LBL = { pending: 'En attente', due: 'À verser', paid: 'Versé', suspended: 'Suspendu', cancelled: 'Annulé', none: 'Payé en main propre', owed: 'Commission à régler', collected: 'Commission réglée' };
  const ZONES = { rabat: { label: 'Rabat · Salé · Témara', cities: ['Rabat', 'Salé', 'Témara'] } };
  /* Remise en main propre : seulement si l'article ET l'acheteur sont dans la zone. */
  const HAND_ZONE = 'rabat';
  const inHandZone = (city) => ZONES[HAND_ZONE].cities.includes(city);
  const MEET_SPOTS = ['Gare Rabat-Ville', 'Gare Rabat-Agdal', 'Arribat Center', 'Mega Mall', 'Marina de Salé', 'Gare Salé-Ville', 'Témara Plaza', 'Autre lieu public (à convenir)'];
  /* Coordonnées masquées dans la messagerie tant qu'aucune commande n'existe : évite les ventes hors plateforme, donc hors protection. */
  function maskContacts(text) {
    let t = String(text || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    let hit = false;
    const rep = (re) => { t = t.replace(re, () => { hit = true; return '[coordonnée masquée]'; }); };
    rep(/\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|m\.me)\/\S*/gi);
    rep(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g);
    rep(/(?:\+|00)?\d(?:[\s.\-()]{0,3}\d){8,}/g); // 9 chiffres ou plus : un numéro marocain, pas un prix ni une date
    return { text: t, masked: hit };
  }
  const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const FITS = { petit: 'Taille petit', normal: 'Taille normalement', grand: 'Taille grand' };
  const MEAS = {
    haut: [
      { k: 'poitrine', label: 'Largeur poitrine (à plat)', help: "Posez le vêtement bien à plat, fermé. Mesurez d'une aisselle à l'autre, bord à bord, sous les manches." },
      { k: 'longueur', label: 'Longueur', help: "Du point le plus haut de l'épaule, près du col, jusqu'à l'ourlet du bas." },
      { k: 'manche', label: 'Longueur de manche', help: "De la couture d'épaule jusqu'au bout de la manche." }
    ],
    robe: [
      { k: 'poitrine', label: 'Largeur poitrine (à plat)', help: "Robe à plat, mesurez d'une aisselle à l'autre, bord à bord." },
      { k: 'taille', label: 'Largeur taille (à plat)', help: 'Robe à plat, mesurez à l’endroit le plus étroit du buste, bord à bord.' },
      { k: 'longueur', label: 'Longueur', help: "Du point le plus haut de l'épaule jusqu'à l'ourlet." }
    ],
    pantalon: [
      { k: 'taille', label: 'Largeur taille (à plat)', help: 'Pantalon fermé et posé à plat : mesurez la ceinture d’un bord à l’autre.' },
      { k: 'entrejambe', label: 'Entrejambe', help: "De la couture d'entrejambe jusqu'au bas de la jambe, le long de l'intérieur." },
      { k: 'longueur', label: 'Longueur totale', help: "Du haut de la ceinture jusqu'au bas de la jambe." }
    ],
    chaussure: [
      { k: 'semelle', label: 'Longueur intérieure', help: "À l'intérieur, du fond du talon jusqu'au bout, sur la semelle." }
    ],
    accessoire: [
      { k: 'largeur', label: 'Largeur', help: 'Le point le plus large, objet posé à plat.' },
      { k: 'hauteur', label: 'Hauteur', help: 'Du point le plus bas au point le plus haut.' }
    ]
  };
  const MEAS_GROUP = { Chemises: 'haut', 'Tee-shirts': 'haut', 'Pulls et gilets': 'haut', 'Vestes et blazers': 'haut', Manteaux: 'haut', Robes: 'robe', Pantalons: 'pantalon', Chaussures: 'chaussure', Accessoires: 'accessoire' };
  const measuresFor = (cat) => MEAS[MEAS_GROUP[cat]] || [];
  const measureGroup = (cat) => MEAS_GROUP[cat] || '';
  const FLAT_NOTE = "Les mesures sont prises vêtement posé à plat, de bord à bord, et saisies par le vendeur. Elles ne sont pas des tours : pour un vêtement non extensible, le tour est environ 2 fois la largeur à plat.";
  return { HAND_ZONE, inHandZone, MEET_SPOTS, maskContacts, slugify, ZONES, FITS, MEAS, measuresFor, measureGroup, FLAT_NOTE, UNIV, CATS, catsFor, COND, COLORS, CITIES, PACKS, REASONS, sizesFor, allSizes, packFor, ORDER_LBL, PAY_LBL };
});
