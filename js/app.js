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
  Parametres.init();
  Salles.init();
  Surveillants.init();
  Repartition.init();
  Recap.init();
  Impressions.init();
  UI.init();
  protegerScrollGlobal();

  // Premier lancement : ouvrir les paramètres si la session est vierge
  if (!AppData.params.etablissement && !AppData.epreuves.length) {
    setTimeout(() => Parametres.ouvrir(), 300);
  }
});
