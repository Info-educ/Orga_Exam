/**
 * app.js — Point d'entrée : initialisation ordonnée des modules
 * Orga Examens — v1.0
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  Parametres.init();
  Salles.init();
  Surveillants.init();
  Repartition.init();
  Recap.init();
  Impressions.init();
  UI.init();

  // Premier lancement : ouvrir les paramètres si la session est vierge
  if (!AppData.params.etablissement && !AppData.epreuves.length) {
    setTimeout(() => Parametres.ouvrir(), 300);
  }
});
