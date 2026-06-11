/**
 * repartition.js — Moteur de répartition équilibrée + ajustement manuel + indicateurs d'équité
 * Orga Examens — v1.0
 *
 * Algorithme glouton équilibré :
 *   Pour chaque épreuve (ordre chronologique), pour chaque salle concernée,
 *   pourvoir les postes en choisissant à chaque fois le surveillant :
 *     1. disponible sur l'épreuve,
 *     2. non déjà mobilisé sur cette épreuve (autre salle),
 *     3. sous son quota éventuel,
 *     4. de charge cumulée (minutes) minimale — puis nb de créneaux minimal, puis ordre alphabétique.
 *   Les salles aménagées comptent en durée tiers temps (×4/3).
 */

'use strict';

const Repartition = {

  init() {
    $('#btn-lancer-repartition').addEventListener('click', () => this.lancer());
    $('#btn-vider-repartition').addEventListener('click', () => this.vider());
  },

  // ────────────────────────────────────────────────────────────
  // MOTEUR
  // ────────────────────────────────────────────────────────────

  lancer() {
    if (!AppData.epreuves.length || !AppData.salles.length || !AppData.surveillants.length) {
      notifier('Il faut au moins une épreuve, une salle et un surveillant.', 'error');
      return;
    }
    const conserver = $('#opt-conserver').checked;
    if (!conserver) AppData.affectations = {};

    // Charge de travail simulée pendant la passe
    const charge = {};   // survId → { minutes, creneaux }
    AppData.surveillants.forEach(s => {
      const c = AppData.chargeSurveillant(s.id);
      charge[s.id] = { minutes: c.minutes, creneaux: c.creneaux };
    });

    let pourvus = 0, manquants = 0;

    AppData.epreuves.forEach(ep => {
      AppData.sallesPourEpreuve(ep.id).forEach(salle => {
        const duree = AppData.dureeCreneau(ep, salle);
        const deja = AppData.getAffectes(ep.id, salle.id);
        let besoin = salle.nbSurveillants - deja.length;

        while (besoin > 0) {
          const candidats = AppData.surveillants.filter(s =>
            s.dispos[ep.id] &&
            !AppData.estAffecteEpreuve(ep.id, s.id) &&
            (!s.quotaMax || charge[s.id].creneaux < s.quotaMax));

          if (!candidats.length) { manquants += besoin; break; }

          candidats.sort((a, b) =>
            charge[a.id].minutes - charge[b.id].minutes ||
            charge[a.id].creneaux - charge[b.id].creneaux ||
            (a.nom + a.prenom).localeCompare(b.nom + b.prenom, 'fr'));

          const elu = candidats[0];
          AppData.affecter(ep.id, salle.id, elu.id);
          charge[elu.id].minutes += duree;
          charge[elu.id].creneaux++;
          pourvus++;
          besoin--;
        }
      });
    });

    Unsaved.marquer();
    this.rendre();
    if (manquants)
      notifier(`Répartition terminée : ${pourvus} poste(s) pourvu(s), <strong>${manquants} poste(s) non pourvu(s)</strong> (disponibilités ou quotas insuffisants).`, 'warning', 9000);
    else
      notifier(`Répartition terminée : ${pourvus} poste(s) pourvu(s). Répartition équilibrée sur les heures de surveillance.`);
  },

  vider() {
    if (!confirm('Effacer toutes les affectations de surveillance ?')) return;
    AppData.affectations = {};
    Unsaved.marquer();
    this.rendre();
    notifier('Affectations effacées.', 'warning');
  },

  // ────────────────────────────────────────────────────────────
  // RENDU — cartes épreuves + panneau équité
  // ────────────────────────────────────────────────────────────

  rendre() {
    this._rendreStats();
    this._rendreGrille();
    this._rendreEquite();
  },

  _postesTotaux() {
    let total = 0, pourvus = 0;
    AppData.epreuves.forEach(ep =>
      AppData.sallesPourEpreuve(ep.id).forEach(salle => {
        total += salle.nbSurveillants;
        pourvus += Math.min(AppData.getAffectes(ep.id, salle.id).length, salle.nbSurveillants);
      }));
    return { total, pourvus };
  },

  _rendreStats() {
    const { total, pourvus } = this._postesTotaux();
    const taux = total ? Math.round(pourvus / total * 100) : 0;
    $('#stats-repartition').innerHTML = `
      <span class="stat-item">📌 ${total} poste(s) de surveillance</span>
      <span class="stat-item ${pourvus < total ? 'stat-warn' : ''}">✅ ${pourvus} pourvu(s) (${taux} %)</span>
      <span class="stat-item">👥 ${AppData.surveillants.length} surveillant(s)</span>`;
  },

  _rendreGrille() {
    const zone = $('#zone-repartition');

    if (!AppData.epreuves.length) {
      zone.innerHTML = '<div class="placeholder-zone">Définissez les <strong>épreuves</strong> puis les <strong>salles</strong> pour préparer la répartition.</div>';
      return;
    }

    zone.innerHTML = AppData.epreuves.map(ep => {
      const salles = AppData.sallesPourEpreuve(ep.id);
      const lignes = salles.length ? salles.map(salle => this._ligneSalle(ep, salle)).join('')
        : '<tr><td colspan="3" class="table-empty">Aucune salle associée à cette épreuve.</td></tr>';
      return `
        <div class="jury-card">
          <div class="jury-card-header">
            <div class="jury-card-title">
              <strong>${escHtml(ep.matiere)}</strong>
              <span class="jury-card-salle">${escHtml(AppData.formatDate(ep.date))} · ${ep.heureDebut}–${AppData.heureFin(ep)} (tiers temps → ${AppData.heureFinTT(ep)})</span>
            </div>
            <div class="jury-card-meta">
              <span class="jury-card-count">${salles.reduce((a, s) => a + AppData.getAffectes(ep.id, s.id).length, 0)} / ${salles.reduce((a, s) => a + s.nbSurveillants, 0)} surveillants</span>
            </div>
          </div>
          <table class="affec-table">
            <thead><tr><th style="width:170px">Salle</th><th>Surveillants affectés</th><th style="width:230px">Ajouter</th></tr></thead>
            <tbody>${lignes}</tbody>
          </table>
        </div>`;
    }).join('');

    // Événements retirer / ajouter
    $$('#zone-repartition [data-remove]').forEach(btn =>
      btn.addEventListener('click', () => {
        const [epId, salleId, survId] = btn.dataset.remove.split('-').map(Number);
        AppData.desaffecter(epId, salleId, survId);
        Unsaved.marquer();
        this.rendre();
      }));

    $$('#zone-repartition select[data-add]').forEach(sel =>
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        const [epId, salleId] = sel.dataset.add.split('-').map(Number);
        AppData.affecter(epId, salleId, parseInt(sel.value, 10));
        Unsaved.marquer();
        this.rendre();
      }));
  },

  _ligneSalle(ep, salle) {
    const affectes = AppData.getAffectes(ep.id, salle.id);
    const manque = salle.nbSurveillants - affectes.length;
    const duree = AppData.dureeCreneau(ep, salle);

    const chips = affectes.map(id => {
      const s = AppData.getSurveillant(id);
      if (!s) return '';
      return `<span class="surv-chip">${escHtml(s.nom)} ${escHtml(s.prenom)}
        <button data-remove="${ep.id}-${salle.id}-${id}" title="Retirer">✕</button></span>`;
    }).join('');

    const disponibles = AppData.surveillants.filter(s =>
      s.dispos[ep.id] && !AppData.estAffecteEpreuve(ep.id, s.id));

    const options = disponibles.length
      ? '<option value="">+ Affecter…</option>' + disponibles.map(s => {
          const c = AppData.chargeSurveillant(s.id);
          return `<option value="${s.id}">${escHtml(s.nom)} ${escHtml(s.prenom)} (${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)})</option>`;
        }).join('')
      : '<option value="">Aucun surveillant disponible</option>';

    return `
      <tr>
        <td>
          <strong>${escHtml(salle.nom)}</strong>
          ${salle.type === 'amenagee' ? '<span class="badge badge-tt">♿ TT</span>' : ''}
          <small style="display:block;color:var(--gray-500)">${salle.nbSurveillants} requis · ${AppData.formatDuree(duree)}</small>
        </td>
        <td>
          ${chips || '<span class="calc-attente">Aucun surveillant</span>'}
          ${manque > 0 ? `<span class="badge badge-prio">${manque} manquant(s)</span>` : ''}
        </td>
        <td><select class="select-add" data-add="${ep.id}-${salle.id}" ${!disponibles.length ? 'disabled' : ''}>${options}</select></td>
      </tr>`;
  },

  // ────────────────────────────────────────────────────────────
  // PANNEAU ÉQUITÉ
  // ────────────────────────────────────────────────────────────

  _rendreEquite() {
    const zone = $('#zone-equite');
    if (!AppData.surveillants.length) { zone.innerHTML = ''; return; }

    const charges = AppData.surveillants.map(s => ({ s, ...AppData.chargeSurveillant(s.id) }));
    const maxMin = Math.max(1, ...charges.map(c => c.minutes));
    const actifs = charges.filter(c => c.creneaux > 0);
    const moyenne = actifs.length ? actifs.reduce((a, c) => a + c.minutes, 0) / actifs.length : 0;
    const ecart = actifs.length
      ? Math.sqrt(actifs.reduce((a, c) => a + Math.pow(c.minutes - moyenne, 2), 0) / actifs.length) : 0;

    zone.innerHTML = `
      <div class="calc-panel">
        <div class="calc-titre">⚖ Équité de la répartition</div>
        <div class="calc-desc">Charge moyenne : <strong>${AppData.formatDuree(Math.round(moyenne))}</strong>
          · Écart-type : <strong>${Math.round(ecart)} min</strong>
          · ${charges.filter(c => !c.creneaux).length} surveillant(s) sans créneau</div>
        <div class="equite-grid">
          ${charges.sort((a, b) => b.minutes - a.minutes).map(c => `
            <div class="equite-row">
              <span class="equite-nom">${escHtml(c.s.nom)} ${escHtml(c.s.prenom)}</span>
              <span class="equite-bar-wrap"><span class="equite-bar" style="width:${Math.round(c.minutes / maxMin * 100)}%"></span></span>
              <span class="equite-val">${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  },
};
window.Repartition = Repartition;
