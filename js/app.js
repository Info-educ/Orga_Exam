/**
 * app.js — Point d'entrée : initialisation ordonnée des modules
 * Orga Examens — v1.0
 */

'use strict';

/**
 * Enveloppe toutes les méthodes de rendu avec preserverScroll :
 * aucun re-rendu, où qu'il soit déclenché (case cochée, ajout, suppression,
 * glisser-déposer, changement de paramètre…), ne fait remonter la page.
 */
function protegerScrollGlobal() {
  const cibles = [
    [Parametres,   ['rendreEpreuves']],
    [Salles,       ['rendre', 'rendreAmenagements']],
    [Candidats,    ['rendre']],
    [Surveillants, ['rendre']],
    [Repartition,  ['rendre']],
    [Recap,        ['rendre']],
  ];
  cibles.forEach(([obj, methodes]) => methodes.forEach(m => {
    if (typeof obj[m] !== 'function') return;
    const original = obj[m].bind(obj);
    obj[m] = (...args) => preserverScroll(() => original(...args));
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  // Restauration de l'autosauvegarde locale (filet anti-crash).
  // Proposée uniquement si elle contient davantage que la session courante (vierge au lancement).
  const auto = AppData.lireAutosauvegarde();
  if (auto && (auto.obj.epreuves?.length || auto.obj.surveillants?.length || auto.obj.salles?.length)) {
    const quand = auto.date ? auto.date.toLocaleString('fr-FR') : 'date inconnue';
    if (confirm(`Une session non exportée a été retrouvée sur ce poste (autosauvegarde du ${quand}).\n\nLa restaurer ?\n\n« Annuler » démarre une session vierge (l'autosauvegarde sera remplacée à la prochaine modification).`)) {
      try { AppData.fromJSON(auto.obj); } catch (e) { console.warn('Restauration impossible :', e); }
    }
  }

  Parametres.init();
  Salles.init();
  Candidats.init();
  Surveillants.init();
  Repartition.init();
  Recap.init();
  Impressions.init();
  UI.init();
  protegerScrollGlobal();

  // Premier lancement : ouvrir les paramètres si la session est vierge
  if (!AppData.params.etablissement && !AppData.epreuves.length) {
    setTimeout(() => Parametres.ouvrir(), 300);
  } else if (auto && AppData.epreuves.length) {
    // Session restaurée depuis l'autosauvegarde : rappeler qu'un export JSON reste à faire.
    Unsaved.marquer();
    notifier('Session restaurée depuis l\u2019autosauvegarde locale. Pensez à exporter la session (JSON) pour une sauvegarde pérenne.', 'info', 8000);
  }
});
