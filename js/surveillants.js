/**
 * surveillants.js — Surveillants : CRUD + grille de disponibilités par épreuve
 * Orga Examens — v1.0
 */

'use strict';

const Surveillants = {

  _editId: null,
  _filtre: '',

  init() {
    $('#btn-add-surveillant').addEventListener('click', () => this.ouvrir());
    $('#form-surveillant').addEventListener('submit', (e) => { e.preventDefault(); this.enregistrer(); });
    $('#search-surveillants').addEventListener('input', (e) => {
      this._filtre = e.target.value.trim().toLowerCase();
      this.rendre();
    });
  },

  ouvrir(id = null) {
    this._editId = id;
    const s = id ? AppData.getSurveillant(id) : null;
    $('#modal-surv-titre').textContent = s ? 'Modifier le surveillant' : 'Ajouter un surveillant';
    $('#surv-nom').value = s ? s.nom : '';
    $('#surv-prenom').value = s ? s.prenom : '';
    $('#surv-fonction').value = s ? s.fonction : 'Professeur(e)';
    $('#surv-quota').value = s ? (s.quotaMax || '') : '';
    $('#surv-heures').value = s ? (s.heuresHebdo || '') : '';
    $('#surv-notes').value = s ? s.notes : '';
    ouvrirModal('modal-surveillant');
  },

  enregistrer() {
    const f = {
      nom: $('#surv-nom').value,
      prenom: $('#surv-prenom').value,
      fonction: $('#surv-fonction').value,
      quotaMax: $('#surv-quota').value,
      heuresHebdo: $('#surv-heures').value,
      notes: $('#surv-notes').value,
    };
    if (!f.nom.trim()) { notifier('Le nom est obligatoire.', 'error'); return; }
    if (this._editId) AppData.updateSurveillant(this._editId, f);
    else AppData.addSurveillant(f);
    fermerModal('modal-surveillant');
    Unsaved.marquer();
    this.rendre();
    notifier(this._editId ? 'Surveillant modifié.' : 'Surveillant ajouté.');
  },

  supprimer(id) {
    const s = AppData.getSurveillant(id);
    if (!s) return;
    if (!confirm(`Supprimer « ${s.nom} ${s.prenom} » ?\nSes affectations seront effacées.`)) return;
    AppData.deleteSurveillant(id);
    Unsaved.marquer();
    this.rendre();
    notifier('Surveillant supprimé.', 'warning');
  },

  // ────────────────────────────────────────────────────────────
  // GRILLE DE DISPONIBILITÉS
  // Lignes = surveillants · Colonnes = épreuves (groupées par jour)
  // ────────────────────────────────────────────────────────────

  rendre() {
    const zone = $('#zone-dispos');
    $('#count-surveillants').textContent = AppData.surveillants.length;

    const liste = AppData.surveillants.filter(s =>
      !this._filtre || (s.nom + ' ' + s.prenom + ' ' + s.fonction).toLowerCase().includes(this._filtre));

    if (!AppData.surveillants.length) {
      zone.innerHTML = `<div class="placeholder-zone">
        Aucun surveillant. Ajoutez les personnels mobilisables (<strong>+ Ajouter</strong>) ou
        importez-les via <strong>📥 Importer Excel</strong> (le modèle vierge contient déjà
        une colonne de disponibilité par épreuve).</div>`;
      return;
    }
    if (!AppData.epreuves.length) {
      zone.innerHTML = `<div class="placeholder-zone">
        Définissez d\u2019abord les <strong>épreuves</strong> pour saisir les disponibilités.</div>`
        + this._tableSimple(liste);
      return;
    }

    // Groupes de colonnes par jour
    const jours = AppData.jours();
    const epParJour = jours.map(j => ({ jour: j, eps: AppData.epreuves.filter(e => e.date === j) }));

    let html = `<div class="table-wrapper dispo-wrapper"><table class="data-table dispo-table" style="min-width:${185 + AppData.epreuves.length * 76}px">
      <thead>
        <tr>
          <th rowspan="2" class="dispo-col-nom">Surveillant</th>
          ${epParJour.map(g => `<th colspan="${g.eps.length}" class="dispo-col-jour">${escHtml(AppData.formatDateCourt(g.jour))}</th>`).join('')}
          <th rowspan="2" class="text-center">Dispo</th>
          <th rowspan="2" class="col-actions">Actions</th>
        </tr>
        <tr>
          ${AppData.epreuves.map(ep => `
            <th class="dispo-col-ep" title="${escHtml(ep.matiere)} — ${ep.heureDebut}">
              <span class="dispo-ep-mat">${escHtml(ep.matiere)}</span>
              <span class="dispo-ep-h">${ep.heureDebut}</span>
              <button class="dispo-toggle-col" data-col="${ep.id}" title="Tout cocher / décocher cette épreuve">⇅</button>
            </th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

    liste.forEach(s => {
      const nbDispos = AppData.epreuves.filter(ep => s.dispos[ep.id]).length;
      html += `<tr>
        <td class="dispo-col-nom">
          <strong>${escHtml(s.nom)}</strong> ${escHtml(s.prenom)}
          <small>${escHtml(s.fonction)}${s.heuresHebdo ? ` · ${s.heuresHebdo} h/sem` : ''}${s.quotaMax ? ` · max ${s.quotaMax} cr.` : ''}</small>
          <button class="dispo-toggle-row" data-row="${s.id}" title="Tout cocher / décocher pour ce surveillant">⇄</button>
        </td>
        ${AppData.epreuves.map(ep => `
          <td class="dispo-cell ${s.dispos[ep.id] ? 'on' : ''}">
            <input type="checkbox" data-surv="${s.id}" data-ep="${ep.id}" ${s.dispos[ep.id] ? 'checked' : ''}
                   aria-label="${escHtml(s.nom)} disponible ${escHtml(ep.matiere)}">
          </td>`).join('')}
        <td class="text-center"><span class="badge ${nbDispos ? 'badge-duo' : 'badge-prio'}">${nbDispos}/${AppData.epreuves.length}</span></td>
        <td class="col-actions">
          <button class="btn btn-icon btn-edit" data-edit="${s.id}" title="Modifier">✏</button>
          <button class="btn btn-icon btn-del" data-del="${s.id}" title="Supprimer">🗑</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    zone.innerHTML = html;

    // Événements
    $$('#zone-dispos input[type=checkbox]').forEach(cb =>
      cb.addEventListener('change', () => {
        AppData.setDispo(parseInt(cb.dataset.surv, 10), parseInt(cb.dataset.ep, 10), cb.checked);
        cb.closest('td').classList.toggle('on', cb.checked);
        Unsaved.marquer();
        this._majBadgeLigne(cb.dataset.surv);
      }));

    $$('#zone-dispos .dispo-toggle-row').forEach(btn =>
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.row, 10);
        const s = AppData.getSurveillant(id);
        const toutCoche = AppData.epreuves.every(ep => s.dispos[ep.id]);
        AppData.epreuves.forEach(ep => AppData.setDispo(id, ep.id, !toutCoche));
        Unsaved.marquer();
        this.rendre();
      }));

    $$('#zone-dispos .dispo-toggle-col').forEach(btn =>
      btn.addEventListener('click', () => {
        const epId = parseInt(btn.dataset.col, 10);
        const toutCoche = AppData.surveillants.every(s => s.dispos[epId]);
        AppData.surveillants.forEach(s => AppData.setDispo(s.id, epId, !toutCoche));
        Unsaved.marquer();
        this.rendre();
      }));

    $$('#zone-dispos [data-edit]').forEach(b =>
      b.addEventListener('click', () => this.ouvrir(parseInt(b.dataset.edit, 10))));
    $$('#zone-dispos [data-del]').forEach(b =>
      b.addEventListener('click', () => this.supprimer(parseInt(b.dataset.del, 10))));
  },

  _majBadgeLigne(survId) {
    // Mise à jour ciblée du compteur de la ligne — sans re-rendu (le défilement est préservé)
    const s = AppData.getSurveillant(parseInt(survId, 10));
    if (!s) return;
    const cb = document.querySelector(`#zone-dispos input[data-surv="${survId}"]`);
    const badge = cb && cb.closest('tr') ? cb.closest('tr').querySelector('.badge') : null;
    if (!badge) return;
    const nb = AppData.epreuves.filter(ep => s.dispos[ep.id]).length;
    badge.textContent = `${nb}/${AppData.epreuves.length}`;
    badge.className = `badge ${nb ? 'badge-duo' : 'badge-prio'}`;
  },

  _tableSimple(liste) {
    if (!liste.length) return '';
    return `<div class="table-wrapper" style="margin-top:1rem"><table class="data-table">
      <thead><tr><th>#</th><th>Nom</th><th>Fonction</th><th class="col-actions">Actions</th></tr></thead>
      <tbody>${liste.map(s => `
        <tr><td>${s.id}</td><td><strong>${escHtml(s.nom)}</strong> ${escHtml(s.prenom)}</td>
        <td>${escHtml(s.fonction)}</td>
        <td class="col-actions">
          <button class="btn btn-icon btn-edit" data-edit="${s.id}">✏</button>
          <button class="btn btn-icon btn-del" data-del="${s.id}">🗑</button>
        </td></tr>`).join('')}
      </tbody></table></div>`;
  },
};
window.Surveillants = Surveillants;
