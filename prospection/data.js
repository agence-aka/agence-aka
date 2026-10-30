// Données de référence : zones de prospection, statuts du pipeline et catégories.
// Les bbox sont au format [sud, ouest, nord, est].
window.AKA_DATA = {
  zones: [
    { id: 'vaudreuil', name: 'Vaudreuil-Dorion', sub: 'Vaudreuil-Dorion, Vaudreuil-sur-le-Lac', center: [45.400, -74.033], bbox: [45.360, -74.110, 45.445, -73.975] },
    { id: 'ile-perrot', name: 'Île-Perrot', sub: "Pincourt, L'Île-Perrot, Notre-Dame-de-l'Île-Perrot, Terrasse-Vaudreuil", center: [45.375, -73.935], bbox: [45.330, -73.990, 45.420, -73.860] },
    { id: 'st-lazare', name: 'Saint-Lazare & Hudson', sub: 'Saint-Lazare, Hudson, Sainte-Marthe (est)', center: [45.420, -74.130], bbox: [45.360, -74.230, 45.500, -74.110] },
    { id: 'cedres', name: 'Les Cèdres & Coteau-du-Lac', sub: 'Les Cèdres, Pointe-des-Cascades, Coteau-du-Lac', center: [45.310, -74.090], bbox: [45.270, -74.210, 45.365, -73.970] },
    { id: 'coteaux', name: 'Les Coteaux & Saint-Zotique', sub: 'Les Coteaux, Saint-Zotique, Rivière-Beaudette', center: [45.250, -74.260], bbox: [45.195, -74.400, 45.300, -74.200] },
    { id: 'rigaud', name: 'Rigaud', sub: 'Rigaud, Pointe-Fortune, Très-Saint-Rédempteur', center: [45.480, -74.300], bbox: [45.400, -74.420, 45.560, -74.230] },
    { id: 'soulanges', name: 'Soulanges (rural)', sub: 'Saint-Clet, Saint-Polycarpe, Saint-Télesphore, Sainte-Justine-de-Newton', center: [45.330, -74.320], bbox: [45.250, -74.500, 45.400, -74.210] },
    { id: 'valleyfield', name: 'Salaberry-de-Valleyfield', sub: 'Valleyfield, Saint-Timothée, Grande-Île', center: [45.255, -74.130], bbox: [45.200, -74.210, 45.300, -74.030] }
  ],

  statuses: [
    { id: 'a_visiter', label: 'À visiter', color: '#2563eb' },
    { id: 'planifie', label: 'Planifié', color: '#f59e0b' },
    { id: 'visite', label: 'Visité', color: '#8b5cf6' },
    { id: 'suivi', label: 'À relancer', color: '#ec4899' },
    { id: 'interesse', label: 'Intéressé', color: '#10b981' },
    { id: 'client', label: 'Client ✓', color: '#111111' },
    { id: 'refus', label: 'Pas intéressé', color: '#ef4444' }
  ],

  // Secteurs : "weight" = potentiel marketing relatif (0–2).
  groups: {
    resto:       { label: 'Restos & cafés', weight: 2 },
    beaute:      { label: 'Beauté & bien-être', weight: 2 },
    sante:       { label: 'Santé & cliniques', weight: 2 },
    detail:      { label: 'Boutiques', weight: 2 },
    alimentation:{ label: 'Alimentation', weight: 1 },
    auto:        { label: 'Automobile', weight: 2 },
    services:    { label: 'Services professionnels', weight: 2 },
    loisirs:     { label: 'Sports & loisirs', weight: 2 },
    hebergement: { label: 'Hébergement & tourisme', weight: 1 },
    metiers:     { label: 'Construction & métiers', weight: 2 },
    autre:       { label: 'Autres', weight: 0 }
  },

  // Correspondance des tags OpenStreetMap → [libellé, secteur]
  categories: {
    amenity: {
      restaurant: ['Restaurant', 'resto'], cafe: ['Café', 'resto'], bar: ['Bar', 'resto'], pub: ['Pub', 'resto'],
      fast_food: ['Restauration rapide', 'resto'], ice_cream: ['Crèmerie', 'resto'], biergarten: ['Terrasse', 'resto'],
      dentist: ['Dentiste', 'sante'], clinic: ['Clinique', 'sante'], doctors: ['Médecin', 'sante'], pharmacy: ['Pharmacie', 'sante'],
      veterinary: ['Vétérinaire', 'sante'], car_wash: ['Lave-auto', 'auto'], car_rental: ['Location auto', 'auto'],
      driving_school: ["École de conduite", 'services'], childcare: ['Garderie', 'services'], kindergarten: ['Garderie / CPE', 'services'],
      cinema: ['Cinéma', 'loisirs'], theatre: ['Théâtre', 'loisirs'], nightclub: ['Boîte de nuit', 'loisirs'],
      fuel: ['Station-service', 'auto'], bank: ['Banque', 'autre'], studio: ['Studio', 'services']
    },
    shop: {
      hairdresser: ['Salon de coiffure', 'beaute'], beauty: ['Esthétique', 'beaute'], cosmetics: ['Cosmétiques', 'beaute'],
      massage: ['Massothérapie', 'beaute'], tattoo: ['Tatouage', 'beaute'], perfumery: ['Parfumerie', 'beaute'],
      clothes: ['Vêtements', 'detail'], shoes: ['Chaussures', 'detail'], jewelry: ['Bijouterie', 'detail'], gift: ['Cadeaux', 'detail'],
      florist: ['Fleuriste', 'detail'], furniture: ['Meubles', 'detail'], interior_decoration: ['Déco', 'detail'],
      hardware: ['Quincaillerie', 'detail'], doityourself: ['Rénovation', 'detail'], garden_centre: ['Centre jardin', 'detail'],
      pet: ['Animalerie', 'detail'], pet_grooming: ['Toilettage', 'beaute'], bicycle: ['Vélo', 'detail'], sports: ['Articles de sport', 'detail'],
      toys: ['Jouets', 'detail'], books: ['Librairie', 'detail'], electronics: ['Électronique', 'detail'], mobile_phone: ['Cellulaires', 'detail'],
      computer: ['Informatique', 'detail'], optician: ['Optométriste', 'sante'], boutique: ['Boutique', 'detail'], second_hand: ["Friperie", 'detail'],
      art: ['Galerie d\'art', 'detail'], craft: ['Artisanat', 'detail'], music: ['Musique', 'detail'], variety_store: ['Magasin à rabais', 'detail'],
      bakery: ['Boulangerie', 'alimentation'], butcher: ['Boucherie', 'alimentation'], pastry: ['Pâtisserie', 'alimentation'],
      cheese: ['Fromagerie', 'alimentation'], deli: ['Épicerie fine', 'alimentation'], chocolate: ['Chocolaterie', 'alimentation'],
      confectionery: ['Confiserie', 'alimentation'], wine: ['Vins', 'alimentation'], alcohol: ['Alcool', 'alimentation'],
      greengrocer: ['Fruiterie', 'alimentation'], seafood: ['Poissonnerie', 'alimentation'], farm: ['Kiosque fermier', 'alimentation'],
      convenience: ['Dépanneur', 'alimentation'], supermarket: ['Épicerie', 'alimentation'], coffee: ['Café (boutique)', 'alimentation'],
      car: ['Concessionnaire', 'auto'], car_repair: ['Garage', 'auto'], tyres: ['Pneus', 'auto'], car_parts: ['Pièces auto', 'auto'],
      motorcycle: ['Moto', 'auto'], boat: ['Marine / bateaux', 'auto'],
      laundry: ['Buanderie', 'services'], dry_cleaning: ['Nettoyeur', 'services'], copyshop: ['Imprimerie', 'services'],
      travel_agency: ['Agence de voyages', 'services'], funeral_directors: ['Salon funéraire', 'services'], photo: ['Photo', 'services']
    },
    office: {
      estate_agent: ['Courtier immobilier', 'services'], insurance: ['Assurances', 'services'], lawyer: ['Avocat', 'services'],
      accountant: ['Comptable', 'services'], architect: ['Architecte', 'services'], financial: ['Services financiers', 'services'],
      notary: ['Notaire', 'services'], company: ['Entreprise', 'services'], travel_agent: ['Agence de voyages', 'services'],
      tax_advisor: ['Fiscaliste', 'services'], employment_agency: ['Agence de placement', 'services'], it: ['Informatique', 'services'],
      therapist: ['Thérapeute', 'sante'], physician: ['Médecin', 'sante']
    },
    healthcare: {
      physiotherapist: ['Physiothérapie', 'sante'], chiropractor: ['Chiropraticien', 'sante'], optometrist: ['Optométriste', 'sante'],
      psychotherapist: ['Psychothérapie', 'sante'], dentist: ['Dentiste', 'sante'], clinic: ['Clinique', 'sante'],
      alternative: ['Médecine douce', 'sante'], podiatrist: ['Podiatre', 'sante'], audiologist: ['Audiologiste', 'sante']
    },
    leisure: {
      fitness_centre: ['Centre de conditionnement', 'loisirs'], sports_centre: ['Centre sportif', 'loisirs'], dance: ['École de danse', 'loisirs'],
      golf_course: ['Golf', 'loisirs'], escape_game: ['Jeu d\'évasion', 'loisirs'], bowling_alley: ['Quilles', 'loisirs'],
      marina: ['Marina', 'loisirs'], amusement_arcade: ['Arcade', 'loisirs'], trampoline_park: ['Trampoline', 'loisirs']
    },
    tourism: {
      hotel: ['Hôtel', 'hebergement'], motel: ['Motel', 'hebergement'], guest_house: ['Gîte / B&B', 'hebergement'],
      attraction: ['Attraction', 'hebergement'], camp_site: ['Camping', 'hebergement'], winery: ['Vignoble', 'hebergement']
    },
    craft: {
      _default: ['Artisan / métier', 'metiers'], electrician: ['Électricien', 'metiers'], plumber: ['Plombier', 'metiers'],
      carpenter: ['Menuisier', 'metiers'], roofer: ['Couvreur', 'metiers'], hvac: ['Chauffage / clim', 'metiers'],
      painter: ['Peintre', 'metiers'], brewery: ['Microbrasserie', 'resto'], winery: ['Vignoble', 'hebergement'],
      photographer: ['Photographe', 'services'], caterer: ['Traiteur', 'resto'], landscaper: ['Paysagiste', 'metiers']
    }
  }
};
