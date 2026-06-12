/**
 * parametres.js — Paramètres de session + calendrier des épreuves
 * Orga Examens — v1.0
 */

'use strict';

const Parametres = {

  // ────────────────────────────────────────────────────────────
  // MODAL PARAMÈTRES
  // ────────────────────────────────────────────────────────────

  init() {
    $('#form-params').addEventListener('submit', (e) => { e.preventDefault(); this.enregistrer(); });
    $('#param-examen').addEventListener('change', () => this._toggleAutre());

    // Épreuves
    $('#btn-add-epreuve').addEventListener('click', () => this.ouvrirEpreuve());
    $('#form-epreuve').addEventListener('submit', (e) => { e.preventDefault(); this.enregistrerEpreuve(); });
    ['ep-debut', 'ep-duree'].forEach(id =>
      $('#' + id).addEventListener('input', () => this._majApercuHoraires()));
  },

  ouvrir() {
    const p = AppData.params;
    $('#param-etablissement').value = p.etablissement;
    $('#param-annee').value = p.annee;
    $('#param-lieu').value = p.lieuSignature;
    $('#param-examen').value = p.examen;
    $('#param-examen-autre').value = p.examenAutre;
    $('#param-session').value = p.session;
    $('#param-coef-copies').value = p.coefCopies;
    $('#param-coef-brouillons').value = p.coefBrouillons;
    $('#param-marge').value = p.margeMateriel;
    $('#param-marge-secr').value = p.margeSecr !== undefined ? p.margeSecr : 10;
    this._toggleAutre();
    ouvrirModal('modal-params');
  },

  _toggleAutre() {
    $('#group-examen-autre').hidden = $('#param-examen').value !== 'AUTRE';
  },

  enregistrer() {
    const p = AppData.params;
    p.etablissement  = $('#param-etablissement').value.trim();
    p.annee          = $('#param-annee').value.trim();
    p.lieuSignature  = $('#param-lieu').value.trim();
    p.examen         = $('#param-examen').value;
    p.examenAutre    = $('#param-examen-autre').value.trim();
    p.session        = $('#param-session').value.trim();
    p.coefCopies     = parseFloat($('#param-coef-copies').value) || 2;
    p.coefBrouillons = parseFloat($('#param-coef-brouillons').value) || 2;
    p.margeMateriel  = parseFloat($('#param-marge').value) || 0;
    p.margeSecr      = Math.max(0, parseInt($('#param-marge-secr').value, 10) || 0);
    fermerModal('modal-params');
    Unsaved.marquer();
    UI.rafraichirTout();
    notifier('Paramètres enregistrés.');
  },

  // ────────────────────────────────────────────────────────────
  // ÉPREUVES
  // ────────────────────────────────────────────────────────────

  _editId: null,

  ouvrirEpreuve(id = null) {
    this._editId = id;
    const ep = id ? AppData.getEpreuve(id) : null;
    $('#modal-epreuve-titre').textContent = ep ? 'Modifier l\u2019épreuve' : 'Ajouter une épreuve';
    $('#ep-date').value = ep ? ep.date : (AppData.jours().slice(-1)[0] || '');
    $('#ep-matiere').value = ep ? ep.matiere : '';
    $('#ep-debut').value = ep ? ep.heureDebut : '09:00';
    $('#ep-duree').value = ep ? ep.duree : 120;
    $('#ep-notes').value = ep ? ep.notes : '';
    this._majApercuHoraires();
    ouvrirModal('modal-epreuve');
  },

  _majApercuHoraires() {
    const debut = $('#ep-debut').value, duree = parseInt($('#ep-duree').value, 10) || 0;
    const fin = AppData.addMinutes(debut, duree);
    const finTT = AppData.addMinutes(debut, AppData.dureeTiersTemps(duree));
    $('#ep-apercu').innerHTML = duree
      ? `Fin de l\u2019épreuve : <strong>${fin}</strong> · Fin avec tiers temps : <strong>${finTT}</strong> (${AppData.formatDuree(AppData.dureeTiersTemps(duree))})`
      : '';
  },

  enregistrerEpreuve() {
    const f = {
      date: $('#ep-date').value,
      matiere: $('#ep-matiere').value,
      heureDebut: $('#ep-debut').value,
      duree: $('#ep-duree').value,
      notes: $('#ep-notes').value,
    };
    if (!f.date || !f.matiere.trim()) { notifier('Date et matière sont obligatoires.', 'error'); return; }
    if (this._editId) AppData.updateEpreuve(this._editId, f);
    else AppData.addEpreuve(f);
    fermerModal('modal-epreuve');
    Unsaved.marquer();
    this.rendreEpreuves();
    UI.majBandeauSession();
    notifier(this._editId ? 'Épreuve modifiée.' : 'Épreuve ajoutée.');
  },

  supprimerEpreuve(id) {
    const ep = AppData.getEpreuve(id);
    if (!ep) return;
    if (!confirm(`Supprimer l\u2019épreuve « ${ep.matiere} » du ${AppData.formatDateCourt(ep.date)} ?\nLes disponibilités et affectations liées seront effacées.`)) return;
    AppData.deleteEpreuve(id);
    Unsaved.marquer();
    this.rendreEpreuves();
    UI.majBandeauSession();
    notifier('Épreuve supprimée.', 'warning');
  },

  rendreEpreuves() {
    const tbody = $('#tbody-epreuves');
    $('#count-epreuves').textContent = AppData.epreuves.length;

    if (!AppData.epreuves.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">
        Aucune épreuve. Cliquez sur <strong>+ Ajouter une épreuve</strong> pour bâtir le calendrier
        (une ligne par épreuve : date, matière, horaires). Le tiers temps est calculé automatiquement.</td></tr>`;
      return;
    }

    let jourPrec = null;
    tbody.innerHTML = AppData.epreuves.map(ep => {
      const nouvelleJournee = ep.date !== jourPrec;
      jourPrec = ep.date;
      const sep = nouvelleJournee
        ? `<tr class="row-jour"><td colspan="7">📅 ${escHtml(AppData.formatDate(ep.date))}</td></tr>` : '';
      return sep + `
        <tr>
          <td>${ep.id}</td>
          <td><strong>${escHtml(ep.matiere)}</strong></td>
          <td>${ep.heureDebut}</td>
          <td>${AppData.formatDuree(ep.duree)}</td>
          <td>${AppData.heureFin(ep)}</td>
          <td><span class="badge badge-tt">⏱ ${AppData.heureFinTT(ep)}</span></td>
          <td class="col-actions">
            <button class="btn btn-icon btn-edit" data-edit="${ep.id}" title="Modifier">✏</button>
            <button class="btn btn-icon btn-del" data-del="${ep.id}" title="Supprimer">🗑</button>
          </td>
        </tr>`;
    }).join('');

    $$('#tbody-epreuves [data-edit]').forEach(b =>
      b.addEventListener('click', () => this.ouvrirEpreuve(parseInt(b.dataset.edit, 10))));
    $$('#tbody-epreuves [data-del]').forEach(b =>
      b.addEventListener('click', () => this.supprimerEpreuve(parseInt(b.dataset.del, 10))));
  },
};
window.Parametres = Parametres;
