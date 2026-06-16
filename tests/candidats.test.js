/**
 * candidats.test.js — Tests de non-régression du module Candidats (P0).
 * Exécution : node tests/candidats.test.js
 * Aucune dépendance externe. Charge js/data.js dans un contexte isolé (vm).
 */

'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ── Harnais : instancie un AppData neuf à partir du vrai js/data.js ──
function fresh() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;            // certaines méthodes lisent window.* ; neutralisé
  sandbox.globalThis = sandbox;
  sandbox.console = console;
  sandbox.notifier = () => {};
  vm.createContext(sandbox);
  vm.runInContext(code + '\nglobalThis.__AppData = AppData;', sandbox, { filename: 'data.js' });
  return sandbox.__AppData;
}

// ── Mini-runner ──
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; fails.push(label); console.log('  ✗ ' + label); }
}
function eq(a, b, label) { ok(a === b, `${label} (attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)})`); }
function test(name, fn) { console.log('• ' + name); try { fn(); } catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ EXCEPTION : ' + e.stack); } }

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-eleves.json'), 'utf8'));

// ════════════════════════════════════════════════════════════════
test('1. _mapCandidat mappe tous les champs importables (aucun champ perdu)', () => {
  const D = fresh();
  const m = D._mapCandidat({
    nom: ' martin ', prenom: 'Léa', sexe: 'féminin', dateNaissance: '12/05/2008',
    classe: 'TG1', option1: 'Maths', option2: '', option3: 'SES',
    epreuveIds: ['3', 5], amenagementId: '7', notes: 'RAS',
  });
  eq(m.nom, 'martin', 'nom trimé');
  eq(m.prenom, 'Léa', 'prénom');
  eq(m.sexe, 'F', 'sexe normalisé sur 1 lettre majuscule');
  eq(m.dateNaissance, '2008-05-12', 'date ISO');
  eq(m.classe, 'TG1', 'classe');
  eq(JSON.stringify(m.options), JSON.stringify(['Maths', 'SES']), 'options non vides only');
  eq(JSON.stringify(m.epreuveIds), JSON.stringify([3, 5]), 'epreuveIds en nombres');
  eq(m.amenagementId, 7, 'amenagementId en nombre');
  eq(m.notes, 'RAS', 'notes');
});

test('2. updateCandidat préserve l’état opérationnel (anti-régression type B1)', () => {
  const D = fresh();
  const c = D.addCandidat({ nom: 'DURAND', prenom: 'Hugo' });
  c.numerosAnonymat = { 3: '0042' };
  c.salleParEpreuve = { 3: 99 };
  c.presence = { 3: 'present' };
  D.updateCandidat(c.id, { nom: 'DURAND', prenom: 'Hugo', classe: 'TG2' });   // édition identité
  eq(c.classe, 'TG2', 'classe mise à jour');
  eq(c.numerosAnonymat['3'], '0042', 'numéro d’anonymat préservé');
  eq(c.salleParEpreuve['3'], 99, 'affectation salle préservée');
  eq(c.presence['3'], 'present', 'présence préservée');
});

test('3. addCandidat initialise l’état opérationnel et incrémente l’id', () => {
  const D = fresh();
  const a = D.addCandidat({ nom: 'A', prenom: 'a' });
  const b = D.addCandidat({ nom: 'B', prenom: 'b' });
  eq(b.id - a.id, 1, 'ids consécutifs');
  ok(a.numerosAnonymat && a.salleParEpreuve && a.presence, 'sous-objets initialisés');
});

test('4. Import du fichier réel : 12 candidats, 0 doublon, 0 aménagement', () => {
  const D = fresh();
  const r = D.importerCandidatsRows(fixture);
  eq(r.ajoutes, 12, 'ajoutés');
  eq(r.ignores, 0, 'ignorés');
  eq(r.amenagements, 0, 'aménagements (colonne vide dans le fichier)');
  eq(D.candidats.length, 12, 'total candidats');
});

test('5. Réimport idempotent (dédoublonnage nom+prénom+date)', () => {
  const D = fresh();
  D.importerCandidatsRows(fixture);
  const r2 = D.importerCandidatsRows(fixture);
  eq(r2.ajoutes, 0, 'aucun ajout au réimport');
  eq(r2.ignores, 12, '12 ignorés');
  eq(D.candidats.length, 12, 'toujours 12 candidats');
});

test('6. Import enrichi : options + classe + aménagement lié', () => {
  const D = fresh();
  const rows = [
    { 'Nom de famille': 'MARTIN', 'Prénom': 'Léa', 'Date Naissance': '12/05/2008', 'Classe': 'TG1',
      'Aménagements': 'Tiers temps', 'Option1': 'Mathématiques', 'Option2': 'SES', 'Option3': '' },
    { 'Nom de famille': 'DURAND', 'Prénom': 'Hugo', 'Date Naissance': '03/11/2008', 'Classe': 'TG2',
      'Aménagements': '', 'Option1': 'HGGSP', 'Option2': 'LLCER Anglais' },
    { 'Nom de famille': 'PETIT', 'Prénom': 'Inès', 'Date Naissance': '21/07/2008', 'Classe': 'TG1' },
  ];
  const r = D.importerCandidatsRows(rows);
  eq(r.ajoutes, 3, '3 candidats');
  eq(r.amenagements, 1, '1 aménagement créé');
  eq(D.amenagements.length, 1, 'amenagements[] alimenté');
  const lea = D.candidats.find(c => c.nom === 'MARTIN');
  eq(JSON.stringify(lea.options), JSON.stringify(['Mathématiques', 'SES']), 'options de Léa');
  eq(lea.classe, 'TG1', 'classe de Léa');
  ok(lea.amenagementId != null, 'Léa reliée à un aménagement');
  eq(D.candidatPourAmenagement(lea.amenagementId).id, lea.id, 'recherche inverse aménagement→candidat');
  ok(D.amenagementDuCandidat(lea) != null, 'résolution candidat→aménagement');
});

test('7. Dédoublonnage à l’intérieur d’un même lot', () => {
  const D = fresh();
  const rows = [
    { 'Nom de famille': 'ROUX', 'Prénom': 'Jo', 'Date Naissance': '01/01/2008' },
    { 'Nom de famille': 'roux', 'Prénom': 'JO', 'Date Naissance': '01/01/2008' },   // même clé, casse différente
  ];
  const r = D.importerCandidatsRows(rows);
  eq(r.ajoutes, 1, '1 seul ajouté');
  eq(r.ignores, 1, '1 ignoré');
});

test('8. effectifSalle : repli sur compteur manuel puis dérivation nominative', () => {
  const D = fresh();
  const s = D.addSalle({ nom: '101', candidats: 28 });
  eq(D.effectifSalle(s.id), 28, 'repli sur salle.candidats');
  const c1 = D.addCandidat({ nom: 'X', prenom: '1' });
  const c2 = D.addCandidat({ nom: 'Y', prenom: '2' });
  c1.salleParEpreuve = { 5: s.id };
  c2.salleParEpreuve = { 5: s.id };
  eq(D.effectifSalle(s.id, 5), 2, 'dérivé pour l’épreuve 5');
  eq(D.effectifSalle(s.id), 2, 'dérivé toutes épreuves confondues');
  eq(D.effectifSalle(s.id, 9), 28, 'épreuve sans nominatif → repli manuel');
});

test('9. cataloguerOptions : libellés distincts et triés', () => {
  const D = fresh();
  D.addCandidat({ nom: 'A', prenom: 'a', options: ['SES', 'Mathématiques'] });
  D.addCandidat({ nom: 'B', prenom: 'b', options: ['mathématiques', 'HGGSP'] });   // doublon insensible à la casse
  const cat = D.cataloguerOptions();
  eq(JSON.stringify(cat), JSON.stringify(['HGGSP', 'Mathématiques', 'SES']), 'catalogue dédupliqué et trié');
});

test('10. _normaliserDate : Date, série Excel, JJ/MM/AAAA, ISO', () => {
  const D = fresh();
  eq(D._normaliserDate(new Date(2008, 4, 12)), '2008-05-12', 'objet Date');
  eq(D._normaliserDate('12/05/2008'), '2008-05-12', 'JJ/MM/AAAA');
  eq(D._normaliserDate('2008-05-12'), '2008-05-12', 'ISO inchangée');
  eq(D._normaliserDate(39580), '2008-05-12', 'n° de série Excel');   // 12/05/2008
  eq(D._normaliserDate(''), '', 'vide');
});

test('11. Round-trip JSON : candidats et _nextId préservés', () => {
  const D = fresh();
  const c = D.addCandidat({ nom: 'MARTIN', prenom: 'Léa', options: ['SES'] });
  c.numerosAnonymat = { 3: '0001' };
  const json = JSON.parse(JSON.stringify(D.toJSON()));
  const D2 = fresh();
  D2.fromJSON(json);
  eq(D2.candidats.length, 1, 'candidat restauré');
  eq(D2.candidats[0].numerosAnonymat['3'], '0001', 'sous-objet restauré');
  eq(D2._nextId.candidat, D._nextId.candidat, '_nextId.candidat préservé');
});

test('12. Nettoyage référentiel : suppression d’épreuve et de salle', () => {
  const D = fresh();
  // épreuve
  D.epreuves.push({ id: 5, matiere: 'Test', date: '2026-06-01', heureDebut: '08:00', duree: 120, epreuveIds: [] });
  const c = D.addCandidat({ nom: 'Z', prenom: 'z' });
  c.salleParEpreuve = { 5: 1 }; c.numerosAnonymat = { 5: '0009' }; c.presence = { 5: 'absent' }; c.epreuveIds = [5];
  D.deleteEpreuve(5);
  ok(!('5' in c.salleParEpreuve) && !('5' in c.numerosAnonymat) && !('5' in c.presence), 'refs épreuve purgées');
  eq(c.epreuveIds.length, 0, 'epreuveIds purgé');
  // salle
  const s = D.addSalle({ nom: 'S', candidats: 10 });
  c.salleParEpreuve = { 8: s.id };
  D.deleteSalle(s.id);
  ok(!('8' in c.salleParEpreuve), 'ref salle purgée');
});

// ════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────');
console.log(`Résultat : ${pass} assertion(s) OK, ${fail} échec(s).`);
if (fail) { console.log('Échecs :'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('✓ Tous les tests passent.');
