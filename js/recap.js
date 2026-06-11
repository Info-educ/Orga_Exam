/**
 * recap.js — Tableau de bord récapitulatif : indicateurs, alertes, planning général
 * Orga Examens — v1.0
 */

'use strict';

const Recap = {

  init() {},

  rendre() {
    this._rendreCartes();
    this._rendreAlertes();
    this._rendrePlanning();
  },

  // ── Indicateurs ──────────────────────────────────────────────

  _rendreCartes() {
    const { total, pourvus } = Repartition._postesTotaux();
    const taux = total ? Math.round(pourvus / total * 100) : 0;
    const totCand = AppData.salles.reduce((a, s) => a + (s.type !== 'secretariat' ? s.candidats : 0), 0);

    $('#recap-cartes').innerHTML = `
      <div class="calc-card calc-card-primary"><div class="calc-value">${AppData.epreuves.length}</div><div class="calc-label">Épreuves</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.jours().length}</div><div class="calc-label">Jours d\u2019examen</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.salles.length}</div><div class="calc-label">Salles</div></div>
      <div class="calc-card"><div class="calc-value">${totCand}</div><div class="calc-label">Candidats répartis</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.amenagements.length}</div><div class="calc-label">Aménagements</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.surveillants.length}</div><div class="calc-label">Surveillants</div></div>
      <div class="calc-card ${taux < 100 ? '' : 'calc-card-primary'}"><div class="calc-value">${taux} %</div><div class="calc-label">Postes pourvus (${pourvus}/${total})</div></div>`;
  },

  // ── Alertes de pilotage ──────────────────────────────────────

  _rendreAlertes() {
    const alertes = [];

    if (!AppData.params.etablissement)
      alertes.push({ t: 'warning', m: 'Le nom de l\u2019établissement n\u2019est pas renseigné (Paramètres).' });

    if (!AppData.epreuves.length)
      alertes.push({ t: 'error', m: 'Aucune épreuve définie.' });

    // Postes non pourvus par épreuve
    AppData.epreuves.forEach(ep => {
      AppData.sallesPourEpreuve(ep.id).forEach(salle => {
        const manque = salle.nbSurveillants - AppData.getAffectes(ep.id, salle.id).length;
        if (manque > 0)
          alertes.push({ t: 'error', m: `${ep.matiere} (${AppData.formatDateCourt(ep.date)}) — salle ${salle.nom} : ${manque} surveillant(s) manquant(s).` });
      });
      if (!AppData.sallesPourEpreuve(ep.id).length)
        alertes.push({ t: 'warning', m: `${ep.matiere} (${AppData.formatDateCourt(ep.date)}) : aucune salle associée.` });
    });

    // Capacités dépassées
    AppData.salles.forEach(s => {
      if (s.capacite && s.candidats > s.capacite)
        alertes.push({ t: 'error', m: `Salle ${s.nom} : ${s.candidats} candidats pour ${s.capacite} places.` });
    });

    // Aménagements incomplets
    AppData.amenagements.forEach(a => {
      if (!a.salleId)
        alertes.push({ t: 'warning', m: `Aménagement « ${a.candidat} » : salle à définir.` });
      if ((a.lecteur || a.scripteur) && !a.accompagnant)
        alertes.push({ t: 'warning', m: `Aménagement « ${a.candidat} » : secrétaire lecteur/scripteur à désigner.` });
    });

    // Surveillants sans aucune disponibilité
    const sansDispo = AppData.surveillants.filter(s => !Object.keys(s.dispos).length);
    if (AppData.epreuves.length && sansDispo.length)
      alertes.push({ t: 'info', m: `${sansDispo.length} surveillant(s) sans aucune disponibilité saisie.` });

    const zone = $('#recap-alertes');
    if (!alertes.length) {
      zone.innerHTML = '<div class="alerte alerte-ok">✅ Aucun point bloquant : l\u2019organisation est complète.</div>';
      return;
    }
    const icones = { error: '⛔', warning: '⚠', info: 'ℹ' };
    zone.innerHTML = alertes.map(a =>
      `<div class="alerte alerte-${a.t}">${icones[a.t]} ${escHtml(a.m)}</div>`).join('');
  },

  // ── Planning général ─────────────────────────────────────────

  _rendrePlanning() {
    const zone = $('#recap-planning');
    if (!AppData.epreuves.length) { zone.innerHTML = ''; return; }

    let html = `<div class="table-wrapper"><table class="data-table">
      <thead><tr><th>Date</th><th>Épreuve</th><th>Horaires</th><th>Salle</th><th>Candidats</th><th>Surveillants</th></tr></thead><tbody>`;

    AppData.epreuves.forEach(ep => {
      const salles = AppData.sallesPourEpreuve(ep.id);
      if (!salles.length) {
        html += `<tr><td>${escHtml(AppData.formatDateCourt(ep.date))}</td><td><strong>${escHtml(ep.matiere)}</strong></td>
          <td>${ep.heureDebut}–${AppData.heureFin(ep)}</td><td colspan="3" class="calc-attente">Aucune salle associée</td></tr>`;
        return;
      }
      salles.forEach((salle, i) => {
        const fin = salle.type === 'amenagee' ? AppData.heureFinTT(ep) : AppData.heureFin(ep);
        const noms = AppData.getAffectes(ep.id, salle.id)
          .map(id => { const s = AppData.getSurveillant(id); return s ? `${escHtml(s.nom)} ${escHtml(s.prenom)}` : ''; })
          .filter(Boolean).join(', ') || '<span class="badge badge-prio">Non pourvu</span>';
        html += `<tr>
          ${i === 0 ? `<td rowspan="${salles.length}">${escHtml(AppData.formatDateCourt(ep.date))}</td>
                       <td rowspan="${salles.length}"><strong>${escHtml(ep.matiere)}</strong></td>` : ''}
          <td>${ep.heureDebut}–${fin}${salle.type === 'amenagee' ? ' <span class="badge badge-tt">TT</span>' : ''}</td>
          <td>${escHtml(salle.nom)}</td>
          <td class="text-center">${salle.candidats || '—'}</td>
          <td>${noms}</td>
        </tr>`;
      });
    });

    html += '</tbody></table></div>';
    zone.innerHTML = html;
  },
};
window.Recap = Recap;
