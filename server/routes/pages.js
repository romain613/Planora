import { Router } from 'express';
import { db, getByCompany, getById, insert, update, remove } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// ─── AI PAGE TEMPLATES ─────────────────────────────────

const sec = (type, order, content) => ({ id: `sec_${type}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, type, order, visible: true, content });

// ─── Unsplash stock photos per industry ───
const STOCK = {
  beauty: {
    hero: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1605497788044-5a32c7078486?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=600&q=80"],
  },
  medical: {
    hero: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1666214280557-f1b5022eb634?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1551190822-a9ce113ac100?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80"],
  },
  restaurant: {
    hero: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1495214783159-3503fd1b572d?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80"],
  },
  coaching: {
    hero: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1573497620053-ea5300f94f21?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=600&q=80"],
  },
  realestate: {
    hero: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=600&q=80"],
  },
  garage: {
    hero: "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1530046339160-ce3e530c7d2f?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=600&q=80"],
  },
  generic: {
    hero: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=600&q=80"],
  },
  avocat: {
    hero: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1521791055366-0d553872125f?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80"],
  },
  hotel: {
    hero: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1590490360182-c33d82de0e5c?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=600&q=80"],
  },
  freelance: {
    hero: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=600&q=80"],
  },
  formation: {
    hero: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&w=600&q=80"],
  },
  event: {
    hero: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80",
    about: "https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=800&q=80",
    svc: ["https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=600&q=80"],
  },
};

const PAGE_TEMPLATES = {
  beauty: {
    industry: "beaute", color: "#EC4899",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Votre Salon de Beauté", subtitle: info.city ? `Salon de coiffure & beauté à ${info.city}` : "Coiffure, coloration & soins professionnels", cta: "Prendre rendez-vous", ctaLink: "calendar", imageUrl: STOCK.beauty.hero }),
      sec("about", 1, { title: "Notre salon", text: `Bienvenue${info.businessName ? ` chez ${info.businessName}` : ''}. ${info.teamSize ? `Notre équipe de ${info.teamSize} professionnels passionnés` : 'Notre équipe de professionnels passionnés'} vous accueille dans un cadre chaleureux et moderne. ${info.specialties.length ? `Spécialisés en ${info.specialties.join(', ')}, nous` : 'Nous'} mettons notre savoir-faire à votre service pour sublimer votre beauté.`, imageUrl: STOCK.beauty.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Réservez votre soin en 3 étapes simples", items: [
        { title: "Choisissez votre soin", description: "Parcourez nos prestations et sélectionnez le service qui vous convient" },
        { title: "Réservez en ligne", description: "Choisissez la date et l'heure qui vous arrangent, 24h/24" },
        { title: "Profitez de l'expérience", description: "Installez-vous et laissez notre équipe prendre soin de vous" },
      ]}),
      sec("services", 3, { title: "Nos prestations", items: [
        { name: "Coupe & Brushing", description: "Coupe personnalisée, shampoing et brushing professionnel", price: "", imageUrl: STOCK.beauty.svc[0] },
        { name: "Coloration", description: "Coloration complète, mèches, balayage ou ombré", price: "", imageUrl: STOCK.beauty.svc[1] },
        { name: "Soins capillaires", description: "Soins profonds, kératine, reconstruction", price: "", imageUrl: STOCK.beauty.svc[2] },
        { name: "Coiffure événement", description: "Chignons, coiffures de mariée et événements", price: "", imageUrl: STOCK.beauty.svc[3] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+500", label: "Clients satisfaits" },
        { value: "10+", label: "Années d'expérience" },
        { value: "4.9/5", label: "Note moyenne" },
        { value: "100%", label: "Produits pro" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans notre salon", items: [
        { title: "Équipe passionnée", description: "Des coiffeurs formés aux dernières tendances et techniques" },
        { title: "Produits haut de gamme", description: "Nous utilisons exclusivement des produits professionnels de qualité" },
        { title: "Ambiance chaleureuse", description: "Un cadre agréable et relaxant pour un moment de détente" },
        { title: "Sans rendez-vous possible", description: "Réservation recommandée mais walk-in accepté selon disponibilité" },
        { title: "Tarifs transparents", description: "Pas de mauvaise surprise, tous nos prix sont affichés" },
        { title: "Fidélité récompensée", description: "Programme de fidélité avec des avantages exclusifs" },
      ]}),
      sec("testimonials", 6, { title: "Avis de nos clients", items: [
        { name: "Sophie M.", text: "Un salon au top ! Équipe accueillante et résultat toujours parfait.", rating: 5 },
        { name: "Julie R.", text: "Ma coloration est exactement ce que je voulais. Merci !", rating: 5 },
        { name: "Claire D.", text: "Je recommande vivement. Toujours satisfaite depuis 3 ans.", rating: 4 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Satisfaction garantie ou retouche offerte" },
        { text: "Produits professionnels certifiés" },
        { text: "Hygiène et stérilisation irréprochables" },
        { text: "Conseils personnalisés pour l'entretien à domicile" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "Faut-il prendre rendez-vous ?", a: "Oui, nous vous recommandons de réserver en ligne pour garantir votre créneau." },
        { q: "Quels sont vos horaires ?", a: "Nous sommes ouverts du lundi au samedi, de 9h à 19h." },
        { q: "Proposez-vous des produits professionnels ?", a: "Oui, nous vendons une sélection de produits capillaires professionnels." },
      ]}),
      sec("cta", 9, { title: "Envie d'un nouveau look ?", subtitle: "Réservez votre créneau en quelques clics", buttonText: "Réserver maintenant", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Nous trouver", showForm: true, address: "", phone: "", email: "", hours: "Lun-Sam : 9h-19h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Salon de beauté'}${info.city ? ` à ${info.city}` : ''} — Coiffure & Soins`, description: `${info.businessName || 'Salon de beauté'}${info.city ? ` à ${info.city}` : ''}. ${info.teamSize ? info.teamSize + ' coiffeurs spécialisés' : 'Coiffeurs professionnels'}. Prenez rendez-vous en ligne.`, keywords: "coiffeur, salon, beauté, coloration, coupe" }),
  },

  medical: {
    industry: "sante", color: "#059669",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Cabinet Médical", subtitle: info.city ? `Votre santé à ${info.city}` : "Votre santé, notre priorité", cta: "Prendre rendez-vous", ctaLink: "calendar", imageUrl: STOCK.medical.hero }),
      sec("about", 1, { title: "Notre cabinet", text: `${info.businessName || 'Notre cabinet médical'} vous accueille ${info.city ? `à ${info.city} ` : ''}dans un environnement professionnel et bienveillant. ${info.teamSize ? `Notre équipe de ${info.teamSize} praticiens` : 'Notre équipe de praticiens'} est à votre écoute pour un suivi personnalisé de votre santé.`, imageUrl: STOCK.medical.about }),
      sec("process", 2, { title: "Votre parcours de soins", subtitle: "Simple, rapide et sécurisé", items: [
        { title: "Prenez rendez-vous", description: "Réservez en ligne 24h/24 ou par téléphone" },
        { title: "Consultation", description: "Rencontrez votre praticien dans un cadre bienveillant" },
        { title: "Suivi personnalisé", description: "Bénéficiez d'un plan de soins adapté à votre situation" },
      ]}),
      sec("services", 3, { title: "Nos spécialités", items: [
        { name: "Consultation générale", description: "Bilan de santé, suivi médical, renouvellement d'ordonnances", price: "", imageUrl: STOCK.medical.svc[0] },
        { name: "Consultation spécialisée", description: "Avis expert dans nos domaines de compétence", price: "", imageUrl: STOCK.medical.svc[1] },
        { name: "Examens complémentaires", description: "Bilan sanguin, ECG, examens de dépistage", price: "", imageUrl: STOCK.medical.svc[2] },
        { name: "Suivi chronique", description: "Diabète, hypertension, pathologies chroniques", price: "", imageUrl: STOCK.medical.svc[3] },
        { name: "Médecine préventive", description: "Vaccination, dépistage, bilan de prévention", price: "", imageUrl: STOCK.medical.svc[4] },
      ]}),
      sec("stats", 4, { title: "Notre cabinet en chiffres", items: [
        { value: "+2000", label: "Patients suivis" },
        { value: "15+", label: "Années d'expérience" },
        { value: "4.8/5", label: "Satisfaction patients" },
        { value: "48h", label: "Délai de RDV moyen" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi notre cabinet ?", subtitle: "Un engagement qualité au quotidien", items: [
        { title: "Équipement moderne", description: "Cabinet équipé des dernières technologies de diagnostic" },
        { title: "Écoute et bienveillance", description: "Chaque patient est unique et mérite une attention particulière" },
        { title: "Tiers payant", description: "Nous pratiquons le tiers payant pour vous simplifier la vie" },
        { title: "Créneaux d'urgence", description: "Des plages horaires réservées pour les consultations urgentes" },
        { title: "Téléconsultation", description: "Consultez à distance quand c'est possible" },
        { title: "Dossier médical sécurisé", description: "Vos données de santé sont protégées et confidentielles" },
      ]}),
      sec("testimonials", 6, { title: "Témoignages patients", items: [
        { name: "Marc L.", text: "Médecin à l'écoute, prise en charge rapide. Je recommande.", rating: 5 },
        { name: "Anne B.", text: "Cabinet moderne, équipe professionnelle et chaleureuse.", rating: 5 },
        { name: "Paul D.", text: "Suivi médical de qualité depuis plusieurs années.", rating: 4 },
      ]}),
      sec("guarantee", 7, { title: "Nos engagements", subtitle: "La qualité des soins avant tout", items: [
        { text: "Confidentialité totale de vos données médicales" },
        { text: "Respect des protocoles sanitaires stricts" },
        { text: "Délai de rendez-vous rapide" },
        { text: "Accompagnement humain et personnalisé" },
      ]}),
      sec("faq", 8, { title: "Informations pratiques", items: [
        { q: "Comment prendre rendez-vous ?", a: "Vous pouvez réserver en ligne 24h/24 ou par téléphone pendant nos horaires d'ouverture." },
        { q: "Acceptez-vous la carte vitale ?", a: "Oui, nous acceptons la carte vitale et pratiquons le tiers payant." },
        { q: "Quels sont vos horaires ?", a: "Du lundi au vendredi de 8h30 à 19h, samedi de 9h à 13h." },
        { q: "Consultez-vous en urgence ?", a: "Nous réservons des créneaux quotidiens pour les urgences. Appelez-nous directement." },
      ]}),
      sec("cta", 9, { title: "Besoin d'un rendez-vous médical ?", subtitle: "Consultez rapidement grâce à la prise de rendez-vous en ligne", buttonText: "Prendre rendez-vous", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Coordonnées", showForm: true, address: "", phone: "", email: "", hours: "Lun-Ven : 8h30-19h | Sam : 9h-13h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Cabinet médical'}${info.city ? ` à ${info.city}` : ''} — Consultations & Suivi`, description: `${info.businessName || 'Cabinet médical'}${info.city ? ` à ${info.city}` : ''}. Consultations, suivi médical. Rendez-vous en ligne.`, keywords: "médecin, cabinet médical, consultation, santé, rendez-vous" }),
  },

  restaurant: {
    industry: "commerce", color: "#D97706",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Notre Restaurant", subtitle: info.city ? `Cuisine raffinée à ${info.city}` : "Une expérience culinaire unique", cta: "Réserver une table", ctaLink: "calendar", imageUrl: STOCK.restaurant.hero }),
      sec("about", 1, { title: "Notre histoire", text: `${info.businessName || 'Notre restaurant'} vous invite à découvrir une cuisine ${info.specialties.length ? `${info.specialties.join(', ')}` : 'authentique et savoureuse'}${info.city ? ` au cœur de ${info.city}` : ''}. ${info.teamSize ? `Notre brigade de ${info.teamSize} passionnés` : 'Notre équipe passionnée'} sélectionne les meilleurs produits pour vous offrir une expérience gustative inoubliable.`, imageUrl: STOCK.restaurant.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Réservez votre table en 3 étapes simples", items: [
        { title: "Réservez votre table", description: "Choisissez la date, l'heure et le nombre de convives" },
        { title: "Confirmation instantanée", description: "Recevez la confirmation par email ou SMS" },
        { title: "Savourez l'instant", description: "Installez-vous et profitez de notre cuisine" },
      ]}),
      sec("services", 3, { title: "Nos formules", items: [
        { name: "Menu du midi", description: "Entrée + Plat ou Plat + Dessert, produits frais du marché", price: "", imageUrl: STOCK.restaurant.svc[0] },
        { name: "Menu dégustation", description: "5 plats pour une expérience culinaire complète", price: "", imageUrl: STOCK.restaurant.svc[1] },
        { name: "À la carte", description: "Sélection de plats signatures et créations du chef", price: "", imageUrl: STOCK.restaurant.svc[2] },
        { name: "Privatisation", description: "Événements privés, séminaires, anniversaires", price: "", imageUrl: STOCK.restaurant.svc[3] },
        { name: "Brunch week-end", description: "Buffet sucré-salé le samedi et dimanche matin", price: "", imageUrl: STOCK.restaurant.svc[4] },
        { name: "Traiteur & Emporter", description: "Commandes à emporter et service traiteur", price: "", imageUrl: STOCK.restaurant.svc[5] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+1000", label: "Repas servis/mois" },
        { value: "4.8/5", label: "Note Google" },
        { value: "100%", label: "Produits frais" },
        { value: "15+", label: "Années d'expérience" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans notre restaurant", items: [
        { title: "Produits frais du marché", description: "Approvisionnement quotidien chez nos producteurs locaux" },
        { title: "Chef expérimenté", description: "Une cuisine créative et maîtrisée par notre brigade" },
        { title: "Cadre unique", description: "Un décor soigné pour une expérience mémorable" },
        { title: "Options végétariennes", description: "Des plats adaptés à tous les régimes alimentaires" },
        { title: "Privatisation possible", description: "Organisez vos événements privés dans notre établissement" },
        { title: "Service attentionné", description: "Un service en salle chaleureux et professionnel" },
      ]}),
      sec("testimonials", 6, { title: "Avis gourmands", items: [
        { name: "Marine P.", text: "Une cuisine raffinée et un service impeccable. On y retourne !", rating: 5 },
        { name: "Thomas G.", text: "Le menu dégustation est une pure merveille. Bravo au chef.", rating: 5 },
        { name: "Isabelle F.", text: "Cadre magnifique, carte variée, rapport qualité-prix excellent.", rating: 4 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Produits frais et de saison" },
        { text: "Allergènes clairement identifiés" },
        { text: "Réservation modifiable jusqu'à 24h avant" },
        { text: "Prix affichés, aucun supplément caché" },
      ]}),
      sec("faq", 8, { title: "Infos pratiques", items: [
        { q: "Faut-il réserver ?", a: "Nous vous recommandons vivement de réserver, surtout le week-end." },
        { q: "Proposez-vous des options végétariennes ?", a: "Oui, notre carte propose plusieurs plats végétariens et végan." },
        { q: "Acceptez-vous les groupes ?", a: "Oui ! Nous pouvons accueillir des groupes jusqu'à 30 personnes. Contactez-nous pour les privatisations." },
      ]}),
      sec("cta", 9, { title: "Réservez votre table", subtitle: "Vivez une expérience culinaire d'exception", buttonText: "Réserver maintenant", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Nous trouver", showForm: true, address: "", phone: "", email: "", hours: "Mar-Sam : 12h-14h30, 19h-22h30 | Dim : Brunch 10h-14h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Restaurant'}${info.city ? ` à ${info.city}` : ''} — Réservation en ligne`, description: `${info.businessName || 'Restaurant'}${info.city ? ` à ${info.city}` : ''}. Cuisine raffinée, produits frais. Réservez votre table en ligne.`, keywords: "restaurant, réservation, cuisine, gastronomie, table" }),
  },

  coaching: {
    industry: "pro", color: "#7C3AED",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Coach & Bien-être", subtitle: info.specialties.length ? `${info.specialties.join(', ')}` : "Accompagnement personnalisé vers votre meilleure version", cta: "Réserver une séance", ctaLink: "calendar", imageUrl: STOCK.coaching.hero }),
      sec("about", 1, { title: "Mon approche", text: `${info.businessName || 'Je suis coach professionnel(le)'} et je vous accompagne ${info.specialties.length ? `en ${info.specialties.join(', ')}` : 'dans votre développement personnel et professionnel'}. Mon approche est bienveillante, structurée et orientée résultats. Chaque parcours est unique et adapté à vos objectifs.`, imageUrl: STOCK.coaching.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Votre accompagnement en 3 étapes simples", items: [
        { title: "Séance découverte gratuite", description: "30 min pour faire connaissance et définir vos objectifs" },
        { title: "Programme personnalisé", description: "Un plan d'accompagnement adapté à vos besoins" },
        { title: "Suivi et résultats", description: "Des séances régulières pour atteindre vos objectifs" },
      ]}),
      sec("services", 3, { title: "Mes accompagnements", items: [
        { name: "Séance découverte", description: "Premier échange gratuit pour définir vos objectifs", price: "Gratuit", imageUrl: STOCK.coaching.svc[0] },
        { name: "Coaching individuel", description: "Séances personnalisées de 60 min en présentiel ou visio", price: "", imageUrl: STOCK.coaching.svc[1] },
        { name: "Programme intensif", description: "Forfait 10 séances pour une transformation profonde", price: "", imageUrl: STOCK.coaching.svc[2] },
        { name: "Atelier de groupe", description: "Sessions collectives thématiques (6-12 participants)", price: "", imageUrl: STOCK.coaching.svc[3] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+200", label: "Clients accompagnés" },
        { value: "95%", label: "Taux de satisfaction" },
        { value: "8", label: "Ans d'expérience" },
        { value: "100%", label: "Approche personnalisée" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans mon accompagnement", items: [
        { title: "Première séance gratuite", description: "Rencontrez-moi sans engagement pour voir si le courant passe" },
        { title: "Présentiel ou visio", description: "Séances en cabinet ou en visioconférence selon vos préférences" },
        { title: "Approche sur mesure", description: "Chaque parcours est unique et adapté à votre situation" },
        { title: "Résultats concrets", description: "Des objectifs mesurables et un suivi de votre progression" },
        { title: "Confidentialité totale", description: "Tout ce qui est partagé en séance reste strictement confidentiel" },
        { title: "Flexibilité horaire", description: "Des créneaux adaptés à votre emploi du temps" },
      ]}),
      sec("testimonials", 6, { title: "Témoignages", items: [
        { name: "Sarah K.", text: "Un accompagnement qui a transformé ma vie professionnelle. Merci infiniment.", rating: 5 },
        { name: "David M.", text: "Approche structurée et bienveillante. Résultats concrets dès les premières séances.", rating: 5 },
        { name: "Nathalie R.", text: "J'ai retrouvé confiance et motivation. Je recommande à 100%.", rating: 5 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Séance découverte offerte et sans engagement" },
        { text: "Confidentialité absolue" },
        { text: "Annulation gratuite 24h avant" },
        { text: "Résultats mesurables ou prolongation offerte" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "Comment se déroule la première séance ?", a: "C'est un échange gratuit de 30 min pour faire connaissance, définir vos objectifs et voir si le courant passe." },
        { q: "Proposez-vous des séances en visio ?", a: "Oui, toutes mes séances peuvent se faire en présentiel ou en visioconférence." },
        { q: "Combien de séances faut-il ?", a: "Cela dépend de vos objectifs. En moyenne, un accompagnement dure 8 à 12 séances." },
      ]}),
      sec("cta", 9, { title: "Prêt(e) à avancer ?", subtitle: "Réservez votre séance découverte gratuite", buttonText: "Réserver ma séance", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Me contacter", showForm: true, address: "", phone: "", email: "", hours: "Lun-Ven : 9h-19h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Coach professionnel'}${info.city ? ` à ${info.city}` : ''} — Séances & Accompagnement`, description: `Coaching personnalisé${info.city ? ` à ${info.city}` : ''}. Développement personnel et professionnel. Réservez en ligne.`, keywords: "coaching, développement personnel, bien-être, accompagnement" }),
  },

  realestate: {
    industry: "pro", color: "#2563EB",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Agence Immobilière", subtitle: info.city ? `Votre partenaire immobilier à ${info.city}` : "Achat, vente et location de biens immobiliers", cta: "Prendre rendez-vous", ctaLink: "calendar", imageUrl: STOCK.realestate.hero }),
      sec("about", 1, { title: "Notre agence", text: `${info.businessName || 'Notre agence immobilière'}${info.city ? `, implantée à ${info.city},` : ''} vous accompagne dans tous vos projets immobiliers. ${info.teamSize ? `Avec ${info.teamSize} agents expérimentés` : 'Avec une équipe d\'agents expérimentés'}, nous mettons notre connaissance du marché local à votre service.`, imageUrl: STOCK.realestate.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Votre projet immobilier en 3 étapes simples", items: [
        { title: "Estimation gratuite", description: "Évaluation précise de votre bien par nos experts du marché local" },
        { title: "Stratégie personnalisée", description: "Plan de vente ou recherche adapté à votre projet" },
        { title: "Accompagnement complet", description: "De la signature du mandat jusqu'à la remise des clés" },
      ]}),
      sec("services", 3, { title: "Nos services", items: [
        { name: "Estimation gratuite", description: "Évaluation précise de votre bien par nos experts", price: "Gratuit", imageUrl: STOCK.realestate.svc[0] },
        { name: "Vente immobilière", description: "Mise en vente, visites, négociation et accompagnement notarial", price: "", imageUrl: STOCK.realestate.svc[1] },
        { name: "Recherche de biens", description: "Trouvez le bien idéal selon vos critères", price: "", imageUrl: STOCK.realestate.svc[2] },
        { name: "Gestion locative", description: "Gestion complète de vos biens en location", price: "", imageUrl: STOCK.realestate.svc[3] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+300", label: "Biens vendus" },
        { value: "45j", label: "Délai de vente moyen" },
        { value: "98%", label: "Prix de vente atteint" },
        { value: "15+", label: "Années d'expertise" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans notre agence", items: [
        { title: "Estimation offerte", description: "Évaluation gratuite et sans engagement de votre bien" },
        { title: "Connaissance locale", description: "Expertise approfondie du marché immobilier de votre secteur" },
        { title: "Réseau d'acquéreurs", description: "Base de clients qualifiés prêts à acheter" },
        { title: "Photos professionnelles", description: "Shooting photo et visite virtuelle pour valoriser votre bien" },
        { title: "Accompagnement juridique", description: "Suivi administratif et juridique jusqu'au notaire" },
        { title: "Courtier partenaire", description: "Mise en relation avec nos courtiers pour le financement" },
      ]}),
      sec("testimonials", 6, { title: "Avis clients", items: [
        { name: "François L.", text: "Vente rapide et au bon prix. Équipe réactive et professionnelle.", rating: 5 },
        { name: "Marie C.", text: "Ils ont trouvé notre appartement idéal en 3 semaines. Merci !", rating: 5 },
        { name: "Jean-Pierre B.", text: "Accompagnement de qualité du début à la fin. Je recommande.", rating: 4 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Estimation gratuite et sans engagement" },
        { text: "Transparence totale sur les honoraires" },
        { text: "Mandat résiliable à tout moment" },
        { text: "Accompagnement de A à Z" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "L'estimation est-elle gratuite ?", a: "Oui, nous proposons une estimation gratuite et sans engagement de votre bien." },
        { q: "Quels sont vos honoraires ?", a: "Nos honoraires varient selon le type de transaction. Contactez-nous pour un devis personnalisé." },
        { q: "Accompagnez-vous pour le financement ?", a: "Oui, nous travaillons avec des courtiers partenaires pour vous aider à obtenir le meilleur prêt." },
      ]}),
      sec("cta", 9, { title: "Un projet immobilier ?", subtitle: "Prenez rendez-vous avec un de nos conseillers", buttonText: "Prendre rendez-vous", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Notre agence", showForm: true, address: "", phone: "", email: "", hours: "Lun-Ven : 9h-19h | Sam : 10h-17h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Agence immobilière'}${info.city ? ` à ${info.city}` : ''} — Achat, Vente, Location`, description: `Agence immobilière${info.city ? ` à ${info.city}` : ''}. Estimation gratuite, vente, achat et gestion locative.`, keywords: "immobilier, agence, vente, achat, location, estimation" }),
  },

  garage: {
    industry: "pro", color: "#64748B",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Garage Automobile", subtitle: info.city ? `Entretien & réparation auto à ${info.city}` : "Entretien, réparation et contrôle technique", cta: "Prendre rendez-vous", ctaLink: "calendar", imageUrl: STOCK.garage.hero }),
      sec("about", 1, { title: "Notre garage", text: `${info.businessName || 'Notre garage'} vous accueille ${info.city ? `à ${info.city} ` : ''}pour l'entretien et la réparation de votre véhicule. ${info.teamSize ? `Nos ${info.teamSize} mécaniciens qualifiés` : 'Nos mécaniciens qualifiés'} interviennent sur toutes marques avec un équipement de pointe.`, imageUrl: STOCK.garage.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Votre véhicule entre de bonnes mains en 3 étapes", items: [
        { title: "Prenez rendez-vous", description: "Réservez en ligne le créneau qui vous convient" },
        { title: "Déposez votre véhicule", description: "Apportez votre véhicule, nous établissons un diagnostic" },
        { title: "Récupérez votre auto", description: "Votre véhicule est prêt, garanti pièces et main d'œuvre" },
      ]}),
      sec("services", 3, { title: "Nos prestations", items: [
        { name: "Entretien & Révision", description: "Vidange, filtres, freins, pneus, climatisation", price: "", imageUrl: STOCK.garage.svc[0] },
        { name: "Réparation mécanique", description: "Moteur, boîte de vitesse, embrayage, distribution", price: "", imageUrl: STOCK.garage.svc[1] },
        { name: "Carrosserie & Peinture", description: "Réparation carrosserie, peinture, débosselage", price: "", imageUrl: STOCK.garage.svc[2] },
        { name: "Contrôle technique", description: "Contrôle technique + contre-visite si nécessaire", price: "", imageUrl: STOCK.garage.svc[3] },
        { name: "Diagnostic électronique", description: "Valise diagnostic toutes marques", price: "", imageUrl: STOCK.garage.svc[4] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+5000", label: "Véhicules réparés" },
        { value: "20+", label: "Années d'expérience" },
        { value: "100%", label: "Toutes marques" },
        { value: "4.7/5", label: "Note clients" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans notre garage", items: [
        { title: "Toutes marques", description: "Nos mécaniciens interviennent sur tous types de véhicules" },
        { title: "Devis gratuit", description: "Diagnostic et devis transparents avant toute intervention" },
        { title: "Pièces d'origine", description: "Utilisation de pièces constructeur ou équivalentes certifiées" },
        { title: "Véhicule de prêt", description: "Véhicule de courtoisie disponible pour les longues réparations" },
        { title: "Garantie pièces et MO", description: "Toutes nos interventions sont garanties" },
        { title: "Tarifs compétitifs", description: "Des prix justes sans sacrifier la qualité du travail" },
      ]}),
      sec("testimonials", 6, { title: "Avis clients", items: [
        { name: "Pierre M.", text: "Garage de confiance, tarifs transparents. Je recommande.", rating: 5 },
        { name: "Stéphane R.", text: "Réparation rapide et travail soigné. Très satisfait.", rating: 5 },
        { name: "Catherine V.", text: "Équipe sympathique et compétente. Mon garagiste depuis 5 ans.", rating: 4 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Devis gratuit avant intervention" },
        { text: "Garantie pièces et main d'œuvre" },
        { text: "Pas de travaux sans votre accord" },
        { text: "Véhicule de prêt disponible" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "Travaillez-vous sur toutes les marques ?", a: "Oui, nous intervenons sur toutes marques et tous modèles de véhicules." },
        { q: "Proposez-vous un véhicule de prêt ?", a: "Oui, sous réserve de disponibilité pour les réparations de plus d'une journée." },
        { q: "Faites-vous les contrôles techniques ?", a: "Oui, nous effectuons les contrôles techniques et contre-visites sur rendez-vous." },
      ]}),
      sec("cta", 9, { title: "Besoin d'un rendez-vous auto ?", subtitle: "Réservez en ligne, c'est simple et rapide", buttonText: "Prendre rendez-vous", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Nous trouver", showForm: true, address: "", phone: "", email: "", hours: "Lun-Ven : 8h-18h | Sam : 8h-12h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Garage automobile'}${info.city ? ` à ${info.city}` : ''} — Entretien & Réparation`, description: `Garage automobile${info.city ? ` à ${info.city}` : ''}. Entretien, réparation toutes marques. Rendez-vous en ligne.`, keywords: "garage, automobile, réparation, entretien, mécanique" }),
  },

  avocat: {
    industry: "pro", color: "#1E3A5F",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Cabinet d'Avocats", subtitle: info.specialties.length ? `${info.specialties.join(' • ')}` : "Conseil juridique et défense de vos droits", cta: "Consultation", ctaLink: "calendar", imageUrl: STOCK.avocat.hero }),
      sec("about", 1, { title: "Le cabinet", text: `${info.businessName || 'Notre cabinet d\'avocats'}${info.city ? `, situé à ${info.city},` : ''} vous accompagne avec rigueur et engagement. ${info.teamSize ? `Fort de ${info.teamSize} avocats spécialisés` : 'Nos avocats spécialisés'}, nous défendons vos intérêts avec détermination et discrétion.`, imageUrl: STOCK.avocat.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Votre accompagnement juridique en 3 étapes", items: [
        { title: "Premier contact", description: "Échangez sur votre situation lors d'un premier rendez-vous" },
        { title: "Analyse du dossier", description: "Étude approfondie et définition de la stratégie juridique" },
        { title: "Défense de vos droits", description: "Représentation et suivi de votre dossier jusqu'à sa résolution" },
      ]}),
      sec("services", 3, { title: "Domaines d'intervention", items: [
        { name: "Droit des affaires", description: "Création de société, contrats, contentieux commerciaux", price: "", imageUrl: STOCK.avocat.svc[0] },
        { name: "Droit de la famille", description: "Divorce, garde d'enfants, succession, patrimoine", price: "", imageUrl: STOCK.avocat.svc[1] },
        { name: "Droit du travail", description: "Licenciement, harcèlement, prud'hommes, négociation", price: "", imageUrl: STOCK.avocat.svc[2] },
        { name: "Droit immobilier", description: "Baux, copropriété, litiges, transactions", price: "", imageUrl: STOCK.avocat.svc[3] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+500", label: "Dossiers traités" },
        { value: "92%", label: "Taux de réussite" },
        { value: "20+", label: "Années au Barreau" },
        { value: "24h", label: "Délai de réponse" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans notre cabinet", items: [
        { title: "Première consultation", description: "Un premier rendez-vous pour évaluer votre situation sans engagement" },
        { title: "Expertise reconnue", description: "Avocats spécialisés avec une solide expérience" },
        { title: "Transparence des honoraires", description: "Convention d'honoraires claire dès le début" },
        { title: "Disponibilité", description: "Réactivité et suivi régulier de l'avancement de votre dossier" },
        { title: "Aide juridictionnelle", description: "Dossiers éligibles à l'aide juridictionnelle acceptés" },
        { title: "Secret professionnel", description: "Confidentialité absolue garantie par le serment d'avocat" },
      ]}),
      sec("testimonials", 6, { title: "Témoignages", items: [
        { name: "Laurent H.", text: "Cabinet sérieux et réactif. Mon dossier a été traité avec professionnalisme.", rating: 5 },
        { name: "Émilie G.", text: "Maître X m'a défendue avec détermination. Résultat positif obtenu.", rating: 5 },
        { name: "Robert P.", text: "Conseils juridiques clairs et stratégie efficace. Merci.", rating: 5 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Secret professionnel absolu" },
        { text: "Convention d'honoraires transparente" },
        { text: "Réactivité et suivi personnalisé" },
        { text: "Intervention en urgence possible" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "Proposez-vous une première consultation ?", a: "Oui, nous proposons un premier rendez-vous pour analyser votre situation et définir une stratégie." },
        { q: "Quels sont vos honoraires ?", a: "Nos honoraires dépendent de la complexité du dossier. Un devis vous sera remis lors de la première consultation." },
        { q: "Intervenez-vous en urgence ?", a: "Oui, pour les situations urgentes (garde à vue, référé), nous pouvons intervenir rapidement." },
        { q: "Travaillez-vous à l'aide juridictionnelle ?", a: "Oui, nous acceptons les dossiers éligibles à l'aide juridictionnelle." },
      ]}),
      sec("cta", 9, { title: "Besoin d'un conseil juridique ?", subtitle: "Prenez rendez-vous pour une première consultation", buttonText: "Consulter", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Le cabinet", showForm: true, address: "", phone: "", email: "", hours: "Lun-Ven : 9h-18h30" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Cabinet d\'avocats'}${info.city ? ` à ${info.city}` : ''} — Conseil juridique`, description: `Cabinet d'avocats${info.city ? ` à ${info.city}` : ''}. Droit des affaires, famille, travail, immobilier.`, keywords: "avocat, cabinet, juridique, droit, consultation" }),
  },

  hotel: {
    industry: "commerce", color: "#0D9488",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Hôtel & Hébergement", subtitle: info.city ? `Séjour d'exception à ${info.city}` : "Confort et hospitalité au cœur de la ville", cta: "Réserver", ctaLink: "calendar", imageUrl: STOCK.hotel.hero }),
      sec("about", 1, { title: "Notre établissement", text: `${info.businessName || 'Notre hôtel'} vous accueille ${info.city ? `à ${info.city} ` : ''}pour un séjour confortable et mémorable. Que vous voyagiez pour affaires ou pour le plaisir, nous mettons tout en œuvre pour rendre votre séjour inoubliable.`, imageUrl: STOCK.hotel.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Réservez votre séjour en 3 étapes simples", items: [
        { title: "Choisissez votre chambre", description: "Parcourez nos chambres et suites selon vos envies" },
        { title: "Réservez en direct", description: "Meilleurs tarifs garantis en réservation directe" },
        { title: "Profitez de votre séjour", description: "Check-in rapide et services personnalisés" },
      ]}),
      sec("services", 3, { title: "Nos services", items: [
        { name: "Chambres & Suites", description: "Chambres confortables avec literie premium et wifi gratuit", price: "", imageUrl: STOCK.hotel.svc[0] },
        { name: "Petit-déjeuner", description: "Buffet varié avec produits locaux et bio", price: "", imageUrl: STOCK.hotel.svc[1] },
        { name: "Spa & Bien-être", description: "Espace détente, sauna, hammam et massages", price: "", imageUrl: STOCK.hotel.svc[2] },
        { name: "Salle de séminaire", description: "Espaces modulables pour vos réunions et événements", price: "", imageUrl: STOCK.hotel.svc[3] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+3000", label: "Nuits réservées/an" },
        { value: "4.6/5", label: "Note Booking" },
        { value: "50+", label: "Chambres & suites" },
        { value: "24/7", label: "Réception ouverte" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans notre hôtel", items: [
        { title: "Meilleur tarif garanti", description: "Réservez en direct pour bénéficier des meilleurs prix" },
        { title: "Annulation flexible", description: "Annulation gratuite jusqu'à 48h avant l'arrivée" },
        { title: "Petit-déjeuner inclus", description: "Buffet complet avec produits locaux et bio" },
        { title: "WiFi haut débit", description: "Connexion internet rapide et gratuite dans tout l'hôtel" },
        { title: "Spa & Bien-être", description: "Accès au spa, sauna et hammam pour votre détente" },
        { title: "Conciergerie", description: "Notre équipe vous conseille sur les activités et restaurants" },
      ]}),
      sec("testimonials", 6, { title: "Avis voyageurs", items: [
        { name: "Amélie T.", text: "Hôtel magnifique, chambre spacieuse et petit-déjeuner excellent.", rating: 5 },
        { name: "Nicolas B.", text: "Emplacement idéal, personnel aux petits soins. On reviendra !", rating: 5 },
        { name: "Emma W.", text: "Très bon rapport qualité-prix. Le spa est un vrai plus.", rating: 4 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Meilleur prix garanti en direct" },
        { text: "Annulation flexible" },
        { text: "Chambre non-fumeur garantie" },
        { text: "Satisfaction ou nuit offerte" },
      ]}),
      sec("faq", 8, { title: "Informations pratiques", items: [
        { q: "À quelle heure est le check-in/check-out ?", a: "Check-in à partir de 14h, check-out avant 11h. Early check-in et late check-out possibles sur demande." },
        { q: "Le parking est-il inclus ?", a: "Un parking sécurisé est disponible sur réservation (supplément)." },
        { q: "Acceptez-vous les animaux ?", a: "Les petits animaux de compagnie sont acceptés sous conditions. Merci de nous prévenir à la réservation." },
      ]}),
      sec("cta", 9, { title: "Réservez votre séjour", subtitle: "Les meilleurs tarifs garantis en réservation directe", buttonText: "Réserver une chambre", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Nous contacter", showForm: true, address: "", phone: "", email: "", hours: "Réception 24h/24" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Hôtel'}${info.city ? ` à ${info.city}` : ''} — Réservation en ligne`, description: `${info.businessName || 'Hôtel'}${info.city ? ` à ${info.city}` : ''}. Chambres confortables, services premium. Réservez en direct.`, keywords: "hôtel, hébergement, chambre, réservation, séjour" }),
  },

  freelance: {
    industry: "pro", color: "#6366F1",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Freelance & Agence", subtitle: info.specialties.length ? info.specialties.join(' • ') : "Solutions digitales sur mesure pour votre entreprise", cta: "Demander un devis", ctaLink: "calendar", imageUrl: STOCK.freelance.hero }),
      sec("about", 1, { title: "Mon expertise", text: `${info.businessName ? `Chez ${info.businessName}` : 'En tant que freelance'}, je mets mon expertise ${info.specialties.length ? `en ${info.specialties.join(', ')}` : 'digitale'} au service de votre croissance. Chaque projet est unique et mérite une attention particulière pour des résultats concrets et mesurables.`, imageUrl: STOCK.freelance.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Votre projet en 3 étapes simples", items: [
        { title: "Brief & Échange", description: "Compréhension de vos besoins lors d'un appel découverte gratuit" },
        { title: "Proposition & Maquette", description: "Présentation d'une proposition créative et d'un devis détaillé" },
        { title: "Réalisation & Livraison", description: "Développement avec validations à chaque étape clé" },
      ]}),
      sec("services", 3, { title: "Mes services", items: [
        { name: "Site web & Landing page", description: "Création de sites modernes, rapides et optimisés SEO", price: "", imageUrl: STOCK.freelance.svc[0] },
        { name: "Identité visuelle", description: "Logo, charte graphique, supports de communication", price: "", imageUrl: STOCK.freelance.svc[1] },
        { name: "Stratégie digitale", description: "Audit, stratégie de contenu, réseaux sociaux", price: "", imageUrl: STOCK.freelance.svc[2] },
        { name: "Développement sur mesure", description: "Applications web, automatisations, intégrations API", price: "", imageUrl: STOCK.freelance.svc[3] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+80", label: "Projets livrés" },
        { value: "100%", label: "Clients satisfaits" },
        { value: "7j", label: "Délai moyen de livraison" },
        { value: "5+", label: "Années d'expertise" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans mes services", items: [
        { title: "Appel découverte gratuit", description: "Premier échange sans engagement pour comprendre votre besoin" },
        { title: "Devis détaillé", description: "Proposition claire avec prix fixe, pas de surprises" },
        { title: "Livrables validés", description: "Vous validez chaque étape avant qu'on passe à la suite" },
        { title: "Support post-livraison", description: "Accompagnement et maintenance après la mise en ligne" },
        { title: "Code propre et documenté", description: "Des livrables de qualité professionnelle et maintenables" },
        { title: "Respect des délais", description: "Engagement ferme sur le calendrier de livraison" },
      ]}),
      sec("testimonials", 6, { title: "Projets réalisés", items: [
        { name: "StartupXYZ", text: "Site livré en 2 semaines, design moderne et performant. Collaboration parfaite.", rating: 5 },
        { name: "PME Services", text: "Notre CA a augmenté de 40% grâce à la stratégie digitale mise en place.", rating: 5 },
        { name: "Association ABC", text: "Travail soigné, écoute et réactivité. Budget respecté.", rating: 4 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Devis gratuit et sans engagement" },
        { text: "Prix fixe, pas de surprises" },
        { text: "Retouches illimitées sur la maquette" },
        { text: "Garantie 30 jours après livraison" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "Quel est votre processus de travail ?", a: "Briefing → Proposition → Maquette → Développement → Livraison. Vous validez chaque étape." },
        { q: "Quels sont vos tarifs ?", a: "Chaque projet est unique. Je vous propose un devis détaillé après notre premier échange." },
        { q: "Proposez-vous la maintenance ?", a: "Oui, je propose des forfaits de maintenance et d'accompagnement après livraison." },
      ]}),
      sec("cta", 9, { title: "Un projet en tête ?", subtitle: "Discutons-en lors d'un premier appel gratuit", buttonText: "Prendre rendez-vous", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Me contacter", showForm: true, address: "", phone: "", email: "", hours: "Lun-Ven : 9h-18h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Freelance'}${info.city ? ` à ${info.city}` : ''} — Services digitaux`, description: `Freelance${info.city ? ` à ${info.city}` : ''}. Sites web, design, stratégie digitale. Devis gratuit.`, keywords: "freelance, agence, web, design, développement, digital" }),
  },

  formation: {
    industry: "pro", color: "#EA580C",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Centre de Formation", subtitle: info.specialties.length ? `Formations en ${info.specialties.join(', ')}` : "Formations professionnelles certifiantes", cta: "S'inscrire", ctaLink: "calendar", imageUrl: STOCK.formation.hero }),
      sec("about", 1, { title: "Notre organisme", text: `${info.businessName || 'Notre centre de formation'}${info.city ? `, basé à ${info.city},` : ''} propose des formations professionnelles de qualité. ${info.teamSize ? `Nos ${info.teamSize} formateurs experts` : 'Nos formateurs experts'} vous accompagnent vers la réussite avec des programmes concrets et certifiants.`, imageUrl: STOCK.formation.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Votre formation en 3 étapes simples", items: [
        { title: "Choisissez votre formation", description: "Parcourez notre catalogue et trouvez le programme adapté" },
        { title: "Inscrivez-vous", description: "Inscription en ligne ou via votre CPF en quelques clics" },
        { title: "Formez-vous et certifiez", description: "Suivez la formation et obtenez votre certification" },
      ]}),
      sec("services", 3, { title: "Nos formations", items: [
        { name: "Formation initiale", description: "Programmes complets pour débutants, certifiants et reconnus", price: "", imageUrl: STOCK.formation.svc[0] },
        { name: "Perfectionnement", description: "Montée en compétences pour professionnels en activité", price: "", imageUrl: STOCK.formation.svc[1] },
        { name: "Formation sur mesure", description: "Programmes adaptés aux besoins spécifiques de votre entreprise", price: "", imageUrl: STOCK.formation.svc[2] },
        { name: "E-learning", description: "Formations en ligne accessibles 24h/24 à votre rythme", price: "", imageUrl: STOCK.formation.svc[3] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+1500", label: "Stagiaires formés" },
        { value: "97%", label: "Taux de réussite" },
        { value: "100%", label: "Certifications reconnues" },
        { value: "4.9/5", label: "Satisfaction stagiaires" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans notre centre", items: [
        { title: "Certifications reconnues", description: "Formations certifiantes validées par l'État et les entreprises" },
        { title: "Éligible CPF", description: "Financez votre formation avec votre Compte Personnel de Formation" },
        { title: "Formateurs experts", description: "Des professionnels en activité qui partagent leur expérience terrain" },
        { title: "Présentiel ou distanciel", description: "Choisissez le format qui vous convient : en salle ou en visio" },
        { title: "Petits groupes", description: "Maximum 12 participants pour un apprentissage de qualité" },
        { title: "Accompagnement post-formation", description: "Suivi et support même après la fin de votre formation" },
      ]}),
      sec("testimonials", 6, { title: "Témoignages stagiaires", items: [
        { name: "Karim A.", text: "Formation très concrète et applicable immédiatement. Formateur excellent.", rating: 5 },
        { name: "Céline M.", text: "J'ai obtenu ma certification du premier coup grâce à cette formation.", rating: 5 },
        { name: "Olivier T.", text: "Bon rapport qualité-prix, contenu actualisé et pertinent.", rating: 4 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Certification garantie en cas de réussite" },
        { text: "Financement CPF accepté" },
        { text: "Remboursement si annulation 7j avant" },
        { text: "Support pédagogique inclus" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "Vos formations sont-elles certifiantes ?", a: "Oui, nos formations délivrent des certifications reconnues par l'État et les entreprises." },
        { q: "Acceptez-vous le CPF ?", a: "Oui, la plupart de nos formations sont éligibles au Compte Personnel de Formation." },
        { q: "Proposez-vous du présentiel et du distanciel ?", a: "Oui, nos formations sont disponibles en présentiel, distanciel ou hybride selon vos préférences." },
      ]}),
      sec("cta", 9, { title: "Prêt à vous former ?", subtitle: "Inscrivez-vous à notre prochaine session", buttonText: "S'inscrire", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Nous contacter", showForm: true, address: "", phone: "", email: "", hours: "Lun-Ven : 9h-18h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Centre de formation'}${info.city ? ` à ${info.city}` : ''} — Formations certifiantes`, description: `Organisme de formation${info.city ? ` à ${info.city}` : ''}. Formations certifiantes, CPF éligible.`, keywords: "formation, certifiante, CPF, cours, organisme, professionnelle" }),
  },

  event: {
    industry: "event", color: "#DB2777",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Événementiel", subtitle: info.specialties.length ? info.specialties.join(' • ') : "Créons ensemble des moments inoubliables", cta: "Demander un devis", ctaLink: "calendar", imageUrl: STOCK.event.hero }),
      sec("about", 1, { title: "Notre agence", text: `${info.businessName || 'Notre agence événementielle'}${info.city ? `, basée à ${info.city},` : ''} conçoit et organise vos événements de A à Z. ${info.teamSize ? `Avec ${info.teamSize} professionnels créatifs` : 'Avec une équipe de professionnels créatifs'}, nous transformons vos idées en moments exceptionnels.`, imageUrl: STOCK.event.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Votre événement en 3 étapes simples", items: [
        { title: "Parlez-nous de votre projet", description: "Premier échange pour comprendre votre vision et vos envies" },
        { title: "Proposition créative", description: "Nous concevons un concept unique et un devis détaillé" },
        { title: "Organisation & Jour J", description: "Gestion complète et coordination le jour de l'événement" },
      ]}),
      sec("services", 3, { title: "Nos prestations", items: [
        { name: "Mariages", description: "Organisation complète, décoration, coordination jour J", price: "", imageUrl: STOCK.event.svc[0] },
        { name: "Événements corporate", description: "Séminaires, team building, soirées d'entreprise", price: "", imageUrl: STOCK.event.svc[1] },
        { name: "Anniversaires & Fêtes", description: "Anniversaires, baptêmes, fêtes privées personnalisées", price: "", imageUrl: STOCK.event.svc[2] },
        { name: "Conférences & Salons", description: "Logistique, scénographie, gestion des intervenants", price: "", imageUrl: STOCK.event.svc[3] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+150", label: "Événements organisés" },
        { value: "100%", label: "Clients satisfaits" },
        { value: "+10000", label: "Invités accueillis" },
        { value: "8+", label: "Années d'expérience" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence dans notre agence", items: [
        { title: "Sur mesure", description: "Chaque événement est unique et entièrement personnalisé" },
        { title: "Réseau de prestataires", description: "Accès à nos partenaires triés sur le volet (traiteur, DJ, photographe...)" },
        { title: "Gestion clé en main", description: "De la conception à la coordination, on s'occupe de tout" },
        { title: "Budget maîtrisé", description: "Transparence totale sur les coûts, pas de mauvaises surprises" },
        { title: "Coordination Jour J", description: "Un chef de projet dédié présent le jour de l'événement" },
        { title: "Couverture nationale", description: "Nous intervenons partout en France et à l'étranger" },
      ]}),
      sec("testimonials", 6, { title: "Événements réalisés", items: [
        { name: "Entreprise ABC", text: "Séminaire parfaitement organisé, 200 participants ravis. Merci !", rating: 5 },
        { name: "Léa & Thomas", text: "Notre mariage était magique grâce à vous. Chaque détail était parfait.", rating: 5 },
        { name: "Association XYZ", text: "Gala réussi au-delà de nos attentes. Professionnalisme exemplaire.", rating: 5 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Devis détaillé et transparent" },
        { text: "Coordinateur dédié le jour J" },
        { text: "Assurance événementielle incluse" },
        { text: "Plan B en cas d'imprévu" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "Combien de temps à l'avance faut-il réserver ?", a: "Idéalement 6 à 12 mois pour un mariage, 2 à 3 mois pour un événement corporate." },
        { q: "Travaillez-vous sur tout le territoire ?", a: "Oui, nous intervenons partout en France et à l'international sur demande." },
        { q: "Proposez-vous un service le jour J ?", a: "Oui, un coordinateur est présent le jour de l'événement pour s'assurer que tout se déroule parfaitement." },
      ]}),
      sec("cta", 9, { title: "Un événement à organiser ?", subtitle: "Contactez-nous pour un devis personnalisé et gratuit", buttonText: "Demander un devis", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Nous contacter", showForm: true, address: "", phone: "", email: "", hours: "Lun-Sam : 9h-19h" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Agence événementielle'}${info.city ? ` à ${info.city}` : ''} — Organisation d'événements`, description: `Agence événementielle${info.city ? ` à ${info.city}` : ''}. Mariages, séminaires, fêtes. Devis gratuit.`, keywords: "événementiel, mariage, séminaire, organisation, événement" }),
  },

  generic: {
    industry: "general", color: "#2563EB",
    sections: (info) => [
      sec("hero", 0, { title: info.businessName || "Bienvenue", subtitle: info.city ? `À votre service à ${info.city}` : "Professionnalisme et qualité à votre service", cta: "Prendre rendez-vous", ctaLink: "calendar", imageUrl: STOCK.generic.hero }),
      sec("about", 1, { title: "Qui sommes-nous", text: `${info.businessName || 'Notre entreprise'} est à votre service ${info.city ? `à ${info.city} ` : ''}avec une équipe ${info.teamSize ? `de ${info.teamSize} professionnels` : 'de professionnels'} dédiés à votre satisfaction. ${info.specialties.length ? `Spécialisés en ${info.specialties.join(', ')}, nous` : 'Nous'} mettons notre expertise à votre disposition.`, imageUrl: STOCK.generic.about }),
      sec("process", 2, { title: "Comment ça marche ?", subtitle: "Un accompagnement en 3 étapes simples", items: [
        { title: "Prenez contact", description: "Échangeons sur votre besoin lors d'un premier rendez-vous" },
        { title: "Solution personnalisée", description: "Nous vous proposons une solution adaptée à votre situation" },
        { title: "Mise en œuvre", description: "Réalisation et suivi pour votre entière satisfaction" },
      ]}),
      sec("services", 3, { title: "Nos services", items: [
        { name: "Consultation", description: "Premier échange pour comprendre vos besoins", price: "", imageUrl: STOCK.generic.svc[0] },
        { name: "Prestation sur mesure", description: "Service adapté à vos attentes spécifiques", price: "", imageUrl: STOCK.generic.svc[1] },
        { name: "Suivi & Accompagnement", description: "Un accompagnement continu pour votre satisfaction", price: "", imageUrl: STOCK.generic.svc[2] },
      ]}),
      sec("stats", 4, { title: "Nos chiffres parlent d'eux-mêmes", items: [
        { value: "+500", label: "Clients satisfaits" },
        { value: "10+", label: "Années d'expérience" },
        { value: "4.8/5", label: "Note de satisfaction" },
        { value: "24h", label: "Délai de réponse" },
      ]}),
      sec("benefits", 5, { title: "Pourquoi nous choisir ?", subtitle: "Ce qui fait la différence chez nous", items: [
        { title: "Expertise reconnue", description: "Des professionnels qualifiés à votre service" },
        { title: "Approche personnalisée", description: "Solutions adaptées à chaque situation unique" },
        { title: "Réactivité", description: "Réponse rapide à vos demandes et questions" },
        { title: "Transparence", description: "Des tarifs clairs et un suivi transparent" },
        { title: "Satisfaction garantie", description: "Votre satisfaction est notre priorité absolue" },
        { title: "Accompagnement complet", description: "Suivi de A à Z pour votre tranquillité d'esprit" },
      ]}),
      sec("testimonials", 6, { title: "Avis clients", items: [
        { name: "Client satisfait", text: "Service professionnel et de qualité. Je recommande vivement.", rating: 5 },
        { name: "Client fidèle", text: "Une équipe à l'écoute et des résultats concrets.", rating: 5 },
      ]}),
      sec("guarantee", 7, { title: "Notre engagement qualité", subtitle: "Votre satisfaction est notre priorité absolue", items: [
        { text: "Devis gratuit et sans engagement" },
        { text: "Satisfaction garantie" },
        { text: "Données personnelles protégées" },
        { text: "Support réactif et disponible" },
      ]}),
      sec("faq", 8, { title: "Questions fréquentes", items: [
        { q: "Comment prendre rendez-vous ?", a: "Vous pouvez réserver directement en ligne via notre système de prise de rendez-vous." },
        { q: "Quels sont vos horaires ?", a: "Nous sommes disponibles du lundi au vendredi. Consultez nos horaires détaillés ci-dessous." },
      ]}),
      sec("cta", 9, { title: "Intéressé(e) ?", subtitle: "Prenez contact avec nous dès maintenant", buttonText: "Nous contacter", buttonLink: "calendar" }),
      sec("contact", 10, { title: "Contact", showForm: true, address: "", phone: "", email: "", hours: "" }),
    ],
    seo: (info) => ({ title: `${info.businessName || 'Notre entreprise'}${info.city ? ` à ${info.city}` : ''}`, description: `${info.businessName || 'Notre entreprise'}${info.city ? ` à ${info.city}` : ''}. Prenez rendez-vous en ligne.`, keywords: "" }),
  },
};

// ─── KEYWORD MAP ───────────────────────────────────────
const PAGE_AI_MAP = {
  // Beauté
  "coiffeur":"beauty","coiffeuse":"beauty","salon":"beauty","beaute":"beauty","esthetique":"beauty",
  "estheticienne":"beauty","barbier":"beauty","barber":"beauty","manucure":"beauty","onglerie":"beauty",
  "coloration":"beauty","maquillage":"beauty","extension":"beauty","brushing":"beauty","coiffure":"beauty",
  // Médical
  "medecin":"medical","docteur":"medical","cabinet":"medical","clinique":"medical","dentiste":"medical",
  "dermatologue":"medical","ophtalmologue":"medical","kinesitherapeute":"medical","kine":"medical",
  "osteopathe":"medical","psychologue":"medical","infirmier":"medical","sage-femme":"medical",
  "orthophoniste":"medical","pharmacie":"medical","veterinaire":"medical","therapeute":"medical",
  // Restaurant
  "restaurant":"restaurant","bistrot":"restaurant","brasserie":"restaurant","chef":"restaurant",
  "traiteur":"restaurant","pizzeria":"restaurant","boulangerie":"restaurant","patisserie":"restaurant",
  "cafe":"restaurant","bar":"restaurant","cuisine":"restaurant","gastronomie":"restaurant",
  // Coaching
  "coach":"coaching","coaching":"coaching","bien-etre":"coaching","bienetre":"coaching",
  "developpement personnel":"coaching","meditation":"coaching","yoga":"coaching","sophrologie":"coaching",
  "naturopathe":"coaching","hypnose":"coaching","therapie":"coaching","psychotherapeute":"coaching",
  // Immobilier
  "immobilier":"realestate","agence immobiliere":"realestate","appartement":"realestate",
  "maison":"realestate","location":"realestate","vente":"realestate","estimation":"realestate",
  // Garage
  "garage":"garage","mecanique":"garage","mecanicien":"garage","automobile":"garage",
  "voiture":"garage","reparation":"garage","carrosserie":"garage","controle technique":"garage",
  // Avocat
  "avocat":"avocat","juridique":"avocat","notaire":"avocat","huissier":"avocat","droit":"avocat",
  // Hôtel
  "hotel":"hotel","hebergement":"hotel","chambre":"hotel","gite":"hotel","auberge":"hotel",
  "location vacances":"hotel","airbnb":"hotel","bed and breakfast":"hotel",
  // Freelance
  "freelance":"freelance","agence":"freelance","web":"freelance","graphiste":"freelance",
  "designer":"freelance","developpeur":"freelance","photographe":"freelance","consultant":"freelance",
  "marketing":"freelance","communication":"freelance","seo":"freelance","community manager":"freelance",
  // Formation
  "formation":"formation","formateur":"formation","cours":"formation","stage":"formation",
  "ecole":"formation","apprentissage":"formation","certifiant":"formation","cpf":"formation",
  "enseignement":"formation","atelier":"formation","tuteur":"formation",
  // Event
  "evenementiel":"event","mariage":"event","wedding":"event","seminaire":"event","conference":"event",
  "team building":"event","gala":"event","soiree":"event","fete":"event","anniversaire":"event",
  "bapteme":"event","organisation":"event",
};

// ─── PROMPT PARSER ─────────────────────────────────────
function parsePrompt(prompt, companyName) {
  const info = { businessName: companyName || "", city: "", teamSize: "", specialties: [] };
  // City: "à Paris", "a Lyon"
  const cityMatch = prompt.match(/(?:à|a)\s+([A-ZÀ-Ü][a-zà-ü]+(?:[- ][A-ZÀ-Ü][a-zà-ü]+)*)/);
  if (cityMatch) info.city = cityMatch[1];
  // Team size: "3 coiffeurs", "une equipe de 5"
  const teamMatch = prompt.match(/(\d+)\s+(?:coiffeur|personne|collaborateur|membre|employé|salarié|avocat|médecin|coach|formateur|cuisinier|mecanicien|agent)/i);
  if (teamMatch) info.teamSize = teamMatch[1];
  // Specialties: "spécialisé en X"
  const specMatch = prompt.match(/(?:spécialisé|specialise|spécialité|specialite|expert)\s*(?:en|dans|:)?\s*(.+?)(?:\.|,|$)/i);
  if (specMatch) info.specialties = specMatch[1].split(/[,&]|(?:\s+et\s+)/).map(s => s.trim()).filter(Boolean);
  // Business name from prompt (simple heuristic — "je suis X" or "nous sommes X")
  if (!info.businessName) {
    const nameMatch = prompt.match(/(?:je suis|nous sommes|mon|notre|l'entreprise|la société|le cabinet|le salon|le restaurant|le garage|l'agence|l'hôtel|le centre)\s+(.+?)(?:\s+(?:à|a|,|\.|\s+spé|\s+situé|\s+basé|\s+qui))/i);
    if (nameMatch) info.businessName = nameMatch[1].trim();
  }
  return info;
}

// ─── AI MATCHING ───────────────────────────────────────
function findBestTemplate(prompt) {
  const normalized = prompt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let bestKey = null, bestScore = 0;
  for (const [keyword, tplId] of Object.entries(PAGE_AI_MAP)) {
    const normKey = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized.includes(normKey)) {
      const score = normKey.length + (normKey.includes(' ') ? 10 : 0);
      if (score > bestScore) { bestScore = score; bestKey = tplId; }
    }
  }
  return bestKey || 'generic';
}

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// ─── GET /api/pages?companyId=xxx ─── List pages (admin)
router.get('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId requis' });
    const rows = getByCompany('pages', companyId);
    // Add leads count
    const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM page_leads WHERE pageId = ?');
    for (const p of rows) {
      p.leadsCount = countStmt.get(p.id)?.cnt || 0;
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/pages/:id ─── Single page
router.get('/:id', (req, res) => {
  try {
    // Avoid matching "public" and "generate" as :id
    if (req.params.id === 'public' || req.params.id === 'generate') return res.status(404).json({ error: 'Not found' });
    const page = getById('pages', req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/pages ─── Create a page
router.post('/', requireAuth, enforceCompany, (req, res) => {
  try {
    const p = req.body;
    const id = p.id || 'page_' + Date.now();
    const now = new Date().toISOString();
    const safeCompanyId = req.auth.isSupra ? (p.companyId || req.auth.companyId) : req.auth.companyId;
    let slug = p.slug || p.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || id;
    // Ensure slug is unique for this company
    const existing = db.prepare('SELECT id FROM pages WHERE companyId = ? AND slug = ?').get(safeCompanyId, slug);
    if (existing) slug = slug + '-' + Date.now().toString(36);
    insert('pages', {
      id,
      companyId: safeCompanyId,
      name: p.name || 'Nouvelle page',
      slug,
      sections_json: JSON.stringify(p.sections || []),
      settings_json: JSON.stringify(p.settings || {}),
      seo_json: JSON.stringify(p.seo || {}),
      calendarId: p.calendarId || null,
      formId: p.formId || null,
      active: 1,
      published: p.published ? 1 : 0,
      industry: p.industry || null,
      color: p.color || '#2563EB',
      createdAt: now,
      updatedAt: now,
    });
    const created = getById('pages', id);
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/pages/:id ─── Update page
router.put('/:id', requireAuth, (req, res) => {
  try {
    const pageCheck = db.prepare('SELECT companyId FROM pages WHERE id = ?').get(req.params.id);
    if (!pageCheck) return res.status(404).json({ error: 'Page not found' });
    if (!req.auth.isSupra && pageCheck.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    const p = req.body;
    const data = {};
    if ('name' in p) data.name = p.name;
    if ('slug' in p) {
      // Ensure slug uniqueness for this company (exclude current page)
      const current = getById('pages', req.params.id);
      if (current) {
        const dup = db.prepare('SELECT id FROM pages WHERE companyId = ? AND slug = ? AND id != ?').get(current.companyId, p.slug, req.params.id);
        data.slug = dup ? p.slug + '-' + Date.now().toString(36) : p.slug;
      } else { data.slug = p.slug; }
    }
    if ('sections' in p) data.sections_json = JSON.stringify(p.sections);
    if ('settings' in p) data.settings_json = JSON.stringify(p.settings);
    if ('seo' in p) data.seo_json = JSON.stringify(p.seo);
    if ('calendarId' in p) data.calendarId = p.calendarId;
    if ('formId' in p) data.formId = p.formId;
    if ('published' in p) data.published = p.published ? 1 : 0;
    if ('industry' in p) data.industry = p.industry;
    if ('color' in p) data.color = p.color;
    data.updatedAt = new Date().toISOString();
    const updated = update('pages', req.params.id, data);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/pages/:id ─── Delete page + leads
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const pageCheck = db.prepare('SELECT companyId FROM pages WHERE id = ?').get(req.params.id);
    if (!pageCheck) return res.status(404).json({ error: 'Page not found' });
    if (!req.auth.isSupra && pageCheck.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    db.prepare('DELETE FROM page_leads WHERE pageId = ?').run(req.params.id);
    remove('pages', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/pages/:id/leads ─── List leads (auth + company check)
router.get('/:id/leads', requireAuth, (req, res) => {
  try {
    // Vérifier que la page appartient à la company du user
    const page = db.prepare('SELECT companyId FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    if (!req.auth.isSupra && page.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Acces interdit' });
    const rows = db.prepare('SELECT * FROM page_leads WHERE pageId = ? ORDER BY createdAt DESC').all(req.params.id);
    const parsed = rows.map(r => {
      try { r.data = JSON.parse(r.data_json || '{}'); } catch { r.data = {}; }
      delete r.data_json;
      return r;
    });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/pages/:id/lead ─── Public lead submission
router.post('/:id/lead', (req, res) => {
  try {
    const page = getById('pages', req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const b = req.body;
    const id = 'plead_' + Date.now();
    const now = new Date().toISOString();

    insert('page_leads', {
      id,
      pageId: page.id,
      companyId: page.companyId,
      name: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      message: b.message || '',
      data_json: JSON.stringify(b.data || {}),
      source: 'page',
      createdAt: now,
    });

    // Auto-create/update CRM contact
    try {
      if (b.email || b.name) {
        // Check email OR phone for existing contact (dédup)
        let existing = b.email
          ? db.prepare('SELECT id FROM contacts WHERE email = ? AND companyId = ?').get(b.email, page.companyId)
          : null;
        if (!existing && b.phone) {
          const cleanPh = (b.phone||'').replace(/[^\d]/g,'').slice(-9);
          if (cleanPh.length >= 9) {
            existing = db.prepare("SELECT id FROM contacts WHERE companyId = ? AND phone LIKE ?").get(page.companyId, '%' + cleanPh + '%');
          }
        }
        if (existing) {
          db.prepare("UPDATE contacts SET name = COALESCE(NULLIF(?, ''), name), phone = COALESCE(NULLIF(?, ''), phone), email = COALESCE(NULLIF(?, ''), email), lastVisit = ?, notes = COALESCE(notes, '') || ? WHERE id = ?")
            .run(b.name || '', b.phone || '', b.email || '', now.split('T')[0], `\nLead depuis page: ${page.name}`, existing.id);
        } else {
          const ctId = 'ct_' + Date.now();
          // Assigner a l'admin de la company par defaut (jamais orphelin)
          const defaultAdmin = db.prepare("SELECT id FROM collaborators WHERE companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '') LIMIT 1").get(page.companyId)?.id || '';
          db.prepare("INSERT INTO contacts (id, companyId, name, email, phone, totalBookings, lastVisit, tags_json, notes, rating, docs_json, pipeline_stage, assignedTo, source) VALUES (?,?,?,?,?,0,?,'[]',?,NULL,'[]','nouveau',?,'form')")
            .run(ctId, page.companyId, b.name || '', b.email || '', b.phone || '', now.split('T')[0], `Lead depuis page: ${page.name}`, defaultAdmin);
        }
      }
    } catch (crmErr) {
      console.error('[CRM LEAD ERROR]', crmErr.message);
    }

    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/pages/public/:companySlug/:pageSlug ─── Public page data
router.get('/public/:companySlug/:pageSlug', (req, res) => {
  try {
    const company = db.prepare('SELECT id, name, slug FROM companies WHERE slug = ?').get(req.params.companySlug);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const page = db.prepare('SELECT * FROM pages WHERE companyId = ? AND slug = ? AND published = 1').get(company.id, req.params.pageSlug);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    let sections = [], settings = {}, seo = {};
    try { sections = JSON.parse(page.sections_json || '[]'); } catch {}
    try { settings = JSON.parse(page.settings_json || '{}'); } catch {}
    try { seo = JSON.parse(page.seo_json || '{}'); } catch {}

    // Get linked calendar slug if exists
    let calendarSlug = null;
    if (page.calendarId) {
      const cal = db.prepare('SELECT slug FROM calendars WHERE id = ?').get(page.calendarId);
      if (cal) calendarSlug = cal.slug;
    }

    res.json({
      id: page.id,
      name: page.name,
      slug: page.slug,
      sections,
      settings,
      seo,
      color: page.color,
      calendarId: page.calendarId,
      calendarSlug,
      companyName: company.name,
      companySlug: company.slug,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/pages/generate ─── AI page generation (OpenAI enhanced)
router.post('/generate', async (req, res) => {
  try {
    const { companyId, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });

    const company = companyId ? db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) : null;
    const info = parsePrompt(prompt, company?.name || '');
    const templateId = findBestTemplate(prompt);
    const template = PAGE_TEMPLATES[templateId];

    // Generate base template sections
    const baseSections = template.sections(info);
    const baseSeo = template.seo(info);
    const pageName = info.businessName || (company?.name ? `Page ${company.name}` : 'Ma page business');

    // Try OpenAI enhancement if key available
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const systemPrompt = `Tu es un expert en création de pages web professionnelles pour des entreprises francophones. Tu génères du contenu marketing de qualité en français.
Tu reçois une description d'entreprise et tu dois générer le contenu pour chaque section d'une page web one-page.
Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans explication.`;

        const userPrompt = `Entreprise: "${prompt}"
${info.businessName ? `Nom: ${info.businessName}` : ''}
${info.city ? `Ville: ${info.city}` : ''}
${info.teamSize ? `Équipe: ${info.teamSize} personnes` : ''}
${info.specialties.length ? `Spécialités: ${info.specialties.join(', ')}` : ''}

Génère le contenu JSON suivant pour une page web professionnelle:
{
  "pageName": "Nom de la page",
  "hero": { "title": "Titre accrocheur (max 60 car)", "subtitle": "Sous-titre descriptif (max 120 car)", "cta": "Texte du bouton CTA (max 25 car)" },
  "about": { "title": "Titre section à propos", "text": "Paragraphe de présentation engageant (150-250 mots)" },
  "services": { "title": "Titre section services", "items": [
    { "name": "Service 1", "description": "Description courte (20-30 mots)" },
    { "name": "Service 2", "description": "Description courte" },
    { "name": "Service 3", "description": "Description courte" },
    { "name": "Service 4", "description": "Description courte" }
  ]},
  "testimonials": { "title": "Titre section témoignages", "items": [
    { "name": "Prénom N.", "text": "Témoignage réaliste et positif (20-40 mots)", "rating": 5 },
    { "name": "Prénom N.", "text": "Témoignage varié", "rating": 5 },
    { "name": "Prénom N.", "text": "Témoignage authentique", "rating": 4 }
  ]},
  "faq": { "title": "Titre FAQ", "items": [
    { "q": "Question pertinente 1 ?", "a": "Réponse utile et détaillée" },
    { "q": "Question pertinente 2 ?", "a": "Réponse utile" },
    { "q": "Question pertinente 3 ?", "a": "Réponse utile" }
  ]},
  "cta": { "title": "Titre appel à l'action", "subtitle": "Sous-titre motivant", "buttonText": "Texte bouton" },
  "contact": { "title": "Titre section contact", "hours": "Horaires d'ouverture réalistes" },
  "seo": { "title": "Titre SEO optimisé (50-60 car)", "description": "Meta description SEO (140-160 car)", "keywords": "mot1, mot2, mot3, mot4, mot5" },
  "color": "Code couleur hex adapté au secteur"
}`;

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (openaiRes.ok) {
          const openaiData = await openaiRes.json();
          const content = openaiData.choices?.[0]?.message?.content;
          if (content) {
            // Clean potential markdown wrapping
            const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const ai = JSON.parse(cleaned);

            // Merge AI content into base template sections
            const aiColor = ai.color || template.color;
            const enhancedSections = [
              sec("hero", 0, { title: ai.hero?.title || baseSections[0].content.title, subtitle: ai.hero?.subtitle || baseSections[0].content.subtitle, cta: ai.hero?.cta || "Prendre rendez-vous", ctaLink: "calendar" }),
              sec("about", 1, { title: ai.about?.title || "À propos", text: ai.about?.text || baseSections[1]?.content?.text || "" }),
              sec("services", 2, { title: ai.services?.title || "Nos services", items: (ai.services?.items || []).map(item => ({ name: item.name, description: item.description, price: item.price || "" })) }),
              sec("testimonials", 3, { title: ai.testimonials?.title || "Témoignages", items: (ai.testimonials?.items || []).map(t => ({ name: t.name, text: t.text, rating: t.rating || 5 })) }),
              sec("faq", 4, { title: ai.faq?.title || "FAQ", items: (ai.faq?.items || []).map(f => ({ q: f.q, a: f.a })) }),
              sec("cta", 5, { title: ai.cta?.title || "Prêt à commencer ?", subtitle: ai.cta?.subtitle || "", buttonText: ai.cta?.buttonText || "Réserver", buttonLink: "calendar" }),
              sec("contact", 6, { title: ai.contact?.title || "Contact", showForm: true, address: "", phone: "", email: "", hours: ai.contact?.hours || "" }),
            ];

            return res.json({
              name: ai.pageName || pageName,
              sections: enhancedSections,
              settings: { colorPrimary: aiColor, colorBg: '#FFFFFF', colorText: '#1A1917', font: 'Onest', showPoweredBy: true },
              seo: ai.seo || baseSeo,
              industry: template.industry,
              color: aiColor,
              templateId,
              aiGenerated: true,
            });
          }
        }
      } catch (aiErr) {
        console.error('[OPENAI PAGE ERROR]', aiErr.message);
        // Fall through to template-based generation
      }
    }

    // Fallback: template-based generation (no API key or API error)
    res.json({
      name: pageName,
      sections: baseSections,
      settings: { colorPrimary: template.color, colorBg: '#FFFFFF', colorText: '#1A1917', font: 'Onest', showPoweredBy: true },
      seo: baseSeo,
      industry: template.industry,
      color: template.color,
      templateId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
