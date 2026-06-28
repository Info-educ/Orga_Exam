/**
 * conflits.test.js — Tests de la détection de conflits horaires surveillants.
 * Exécution : node tests/conflits.test.js
 */

'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

function fresh() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.console = console;
  sandbox.notifier = () => {};
  // PrintConfig simulé : minutesAvant = 20 (délai de présence configuré)
  sandbox.PrintConfig = { get: () => ({ minutesAvant: 20 }) };
  vm.createContext(sandbox);
  vm.runInContext(code + '\nglobalThis.__AppData = AppData;', sandbox, { filename: 'data.js' });
  return sandbox.__AppData;
}

let pass = 0, fail = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; fails.push(label); console.log('  ✗ ' + label); }
}
function eq(a, b, label) {
  ok(a === b, `${label} (attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)})`);
}
function test(name, fn) {
  console.log('• ' + name);
  try { fn(); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ EXCEPTION : ' + e.stack); }
}

// ── Helpers de construction de scénario ──────────────────────────

function creerSurveillant(D) {
  D._nextId = D._nextId || {};
  if (!D._nextId.surveillant) D._nextId.surveillant = 1;
  const s = { id: D._nextId.surveillant++, nom: 'TEST', prenom: 'Surv', fonction: 'professeur', heuresHebdo: 18, dispos: {}, quotaMax: 0 };
  D.surveillants.push(s);
  return s;
}

function creerSalle(D, opts = {}) {
  D._nextId = D._nextId || {};
  if (!D._nextId.salle) D._nextId.salle = 1;
  const salle = {
    id: D._nextId.salle++,
    nom: opts.nom || 'Salle X',
    type: opts.type || 'normale',
    nbSurveillants: 1,
    epreuveIds: [],
    nbPlaces: 30,
  };
  D.salles.push(salle);
  return salle;
}

function creerEpreuve(D, opts = {}) {
  D._nextId = D._nextId || {};
  if (!D._nextId.epreuve) D._nextId.epreuve = 1;
  const ep = {
    id: D._nextId.epreuve++,
    matiere: opts.matiere || 'Matière',
    date: opts.date || '2026-06-26',
    heureDebut: opts.heureDebut || '09:00',
    duree: opts.duree || 60,
    groupeId: null,
    ttDebut: opts.ttDebut || null,
    ttFin: opts.ttFin || null,
  };
  D.epreuves.push(ep);
  return ep;
}

function affecter(D, ep, salle, surv) {
  surv.dispos[ep.id] = true;
  D.affecter(ep.id, salle.id, surv.id);
}

// ════════════════════════════════════════════════════════════════
// BLOC 1 — Cas sans conflit
// ════════════════════════════════════════════════════════════════

test('1. Aucun créneau → pas de conflit', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, false, 'pas de blocage');
  eq(r.alerte, false, 'pas d\'alerte');
  eq(r.details.length, 0, 'aucun détail');
});

test('2. Un seul créneau → pas de conflit', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep = creerEpreuve(D, { heureDebut: '09:00', duree: 120 });
  affecter(D, ep, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, false, 'pas de blocage');
  eq(r.alerte, false, 'pas d\'alerte');
});

test('3. Deux créneaux le même jour avec assez de temps (fin 11h00, début 14h00, délai 20 min)', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 120 }); // fin 11:00
  const ep2 = creerEpreuve(D, { heureDebut: '14:00', duree: 60  }); // présence 13:40
  affecter(D, ep1, salle, s);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, false, 'pas de blocage');
  eq(r.alerte, false, 'pas d\'alerte (3h de battement)');
});

test('4. Deux créneaux des jours différents → pas de conflit', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { date: '2026-06-26', heureDebut: '09:00', duree: 120 });
  const ep2 = creerEpreuve(D, { date: '2026-06-27', heureDebut: '09:00', duree: 120 });
  affecter(D, ep1, salle, s);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, false, 'pas de blocage inter-jours');
  eq(r.alerte, false, 'pas d\'alerte inter-jours');
});

// ════════════════════════════════════════════════════════════════
// BLOC 2 — Cas de BLOCAGE (chevauchement réel)
// ════════════════════════════════════════════════════════════════

test('5. Chevauchement réel : fin 11h00 > début 10h45', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 120 }); // fin 11:00
  const ep2 = creerEpreuve(D, { heureDebut: '10:45', duree: 90  }); // début 10:45
  affecter(D, ep1, salle, s);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, true,  'blocage détecté');
  eq(r.alerte,  false, 'pas d\'alerte supplémentaire (blocage prioritaire)');
  ok(r.details.length > 0, 'un détail présent');
});

test('6. Chevauchement exact : fin = début suivant → pas de blocage', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 120 }); // fin 11:00
  const ep2 = creerEpreuve(D, { heureDebut: '11:00', duree: 60  }); // début 11:00
  affecter(D, ep1, salle, s);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, false, 'fin == début : pas de chevauchement');
  // Alerte attendue car fin + 20 min (11:20) > début suivant (11:00)
  eq(r.alerte, true, 'alerte présence car pas 20 min de battement');
});

test('7. Salle tiers-temps : fin TT prise en compte (cas LEMERCIER)', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  // Salle aménagée TT
  const salleTT = creerSalle(D, { type: 'amenagee', nom: 'Lucie Aubrac' });
  // Salle normale
  const salleN  = creerSalle(D, { type: 'normale',  nom: 'Salle 15' });
  // Épreuve 1 : Français Grammaire 09:00, durée 60 min → TT = 80 min → fin TT 10:20
  // Mais avec ttFin forcé à 11:00 (cas DNB chaîné)
  const ep1 = creerEpreuve(D, { matiere: 'Français Grammaire', heureDebut: '09:00', duree: 60, ttFin: '11:00' });
  // Épreuve 2 : Français Rédaction 10:45
  const ep2 = creerEpreuve(D, { matiere: 'Français Rédaction', heureDebut: '10:45', duree: 90 });
  affecter(D, ep1, salleTT, s);
  affecter(D, ep2, salleN,  s);
  const r = D.conflitsHoraires(s.id);
  // fin TT ep1 = 11:00 > début ep2 = 10:45 → BLOCAGE
  eq(r.blocage, true, 'blocage : fin TT 11:00 > début suivant 10:45');
  ok(r.details[0].includes('11:00'), 'détail mentionne 11:00');
});

// ════════════════════════════════════════════════════════════════
// BLOC 3 — Cas d'ALERTE (transition trop courte, délai 20 min)
// ════════════════════════════════════════════════════════════════

test('8. Alerte : fin 11:00, début suivant 11:15 (15 min < 20 min de délai)', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 120 }); // fin 11:00
  const ep2 = creerEpreuve(D, { heureDebut: '11:15', duree: 60  }); // présence requise 10:55
  affecter(D, ep1, salle, s);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, false, 'pas de chevauchement');
  eq(r.alerte,  true,  'alerte : 15 min < délai 20 min');
});

test('9. Frontière alerte : fin 11:00, début 11:20 (exactement 20 min) → pas d\'alerte', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 120 }); // fin 11:00
  const ep2 = creerEpreuve(D, { heureDebut: '11:20', duree: 60  }); // présence requise 11:00
  affecter(D, ep1, salle, s);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, false, 'pas de chevauchement');
  eq(r.alerte,  false, 'exactement 20 min : pas d\'alerte');
});

test('10. Alerte : fin 11:00, début 11:19 (19 min < 20 min) → alerte', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 120 }); // fin 11:00
  const ep2 = creerEpreuve(D, { heureDebut: '11:19', duree: 60  }); // présence requise 10:59
  affecter(D, ep1, salle, s);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.alerte, true, 'alerte : 19 min < délai 20 min');
});

// ════════════════════════════════════════════════════════════════
// BLOC 4 — aBlocageHoraire (créneau hypothétique)
// ════════════════════════════════════════════════════════════════

test('11. aBlocageHoraire : pas de blocage si créneau existant loin', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 60 }); // fin 10:00
  const ep2 = creerEpreuve(D, { heureDebut: '14:00', duree: 60 }); // loin
  affecter(D, ep1, salle, s);
  // ep2 non affectée, on simule l'affectation hypothétique
  eq(D.aBlocageHoraire(s.id, ep2.id, salle.id), false, 'pas de blocage hypothétique');
});

test('12. aBlocageHoraire : blocage si créneau hypothétique chevauche un existant', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 120 }); // fin 11:00
  const ep2 = creerEpreuve(D, { heureDebut: '10:30', duree: 60  }); // début 10:30 < fin 11:00
  affecter(D, ep1, salle, s);
  eq(D.aBlocageHoraire(s.id, ep2.id, salle.id), true, 'blocage hypothétique détecté');
});

test('13. aBlocageHoraire : pas de double-comptage de l\'épreuve déjà affectée', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 60 });
  affecter(D, ep1, salle, s);
  // Vérifier qu'ep1 avec elle-même ne crée pas de faux blocage
  eq(D.aBlocageHoraire(s.id, ep1.id, salle.id), false, 'pas de blocage avec soi-même');
});

test('14. Réserve normale incluse dans la détection de conflit', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 120 }); // fin 11:00
  const ep2 = creerEpreuve(D, { heureDebut: '10:30', duree: 60  }); // début 10:30
  // ep1 en réserve (pas en salle)
  s.dispos[ep1.id] = true;
  D.mettreEnReserve(ep1.id, s.id);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, true, 'blocage via réserve + salle');
});

test('15. Réserve tiers-temps incluse dans la détection', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { heureDebut: '09:00', duree: 60 }); // fin TT calculée = 09:00 + 80min = 10:20
  const ep2 = creerEpreuve(D, { heureDebut: '10:00', duree: 60 }); // début 10:00 < fin TT 10:20
  s.dispos[ep1.id] = true;
  D.mettreEnReserveTT(ep1.id, s.id);
  affecter(D, ep2, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, true, 'blocage via réserve TT + salle');
});

test('16. Plusieurs créneaux dans la journée : détecte le bon conflit', () => {
  const D = fresh();
  const s = creerSurveillant(D);
  const salle = creerSalle(D);
  const ep1 = creerEpreuve(D, { matiere: 'Maths',    heureDebut: '08:00', duree: 60  }); // fin 09:00
  const ep2 = creerEpreuve(D, { matiere: 'Histoire', heureDebut: '10:00', duree: 120 }); // fin 12:00
  const ep3 = creerEpreuve(D, { matiere: 'Sciences', heureDebut: '11:30', duree: 60  }); // début 11:30 < fin 12:00
  affecter(D, ep1, salle, s);
  affecter(D, ep2, salle, s);
  affecter(D, ep3, salle, s);
  const r = D.conflitsHoraires(s.id);
  eq(r.blocage, true, 'blocage détecté parmi 3 créneaux');
  ok(r.details.some(d => d.includes('Histoire') && d.includes('Sciences')), 'le bon conflit identifié');
});

// ════════════════════════════════════════════════════════════════
// Résultat
// ════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────');
if (fail === 0) {
  console.log(`Résultat : ${pass} assertion(s) OK, 0 échec(s).\n✓ Tous les tests passent.`);
} else {
  console.log(`Résultat : ${pass} OK, ${fail} ÉCHEC(S).`);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
