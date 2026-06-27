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
    ['ep-tt-debut', 'ep-tt-fin'].forEach(id =>
      $('#' + id).addEventListener('input', () => this._majApercuHoraires()));
    $('#ep-type-affectation')?.addEventListener('change', () => this._toggleSpecialites());
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
    // Champs tiers temps : valeur saisie si présente, sinon valeur calculée (modifiable)
    $('#ep-tt-debut').value = ep && ep.ttDebut ? ep.ttDebut : (ep ? ep.heureDebut : '09:00');
    $('#ep-tt-fin').value = ep && ep.ttFin
      ? ep.ttFin
      : AppData.addMinutes(
          ep && ep.ttDebut ? ep.ttDebut : (ep ? ep.heureDebut : '09:00'),
          AppData.dureeTiersTemps(ep ? ep.duree : 120));
    $('#ep-notes').value = ep ? ep.notes : '';
    // Type d'épreuve et spécialités
    const typeAff = ep ? (ep.typeAffectation || 'commune') : 'commune';
    $('#ep-type-affectation').value = typeAff;
    this._rendreSpecialites(ep ? (ep.optionsLiees || []) : []);
    this._toggleSpecialites();
    this._majApercuHoraires();
    ouvrirModal('modal-epreuve');
  },

  _toggleSpecialites() {
    const isSpec = $('#ep-type-affectation').value === 'specialite';
    const grp = $('#ep-group-specialites');
    if (grp) grp.hidden = !isSpec;
  },

  /** Peuple la liste des cases à cocher spécialités */
  _rendreSpecialites(selectedLabels = []) {
    const zone = $('#ep-specialites-liste');
    const vide = $('#ep-specialites-vide');
    if (!zone) return;
    const specialites = AppData.cataloguerOptions();
    if (!specialites.length) {
      if (vide) vide.hidden = false;
      // Ne retirer que les checkboxes précédemment générées
      zone.querySelectorAll('label.spec-chip').forEach(el => el.remove());
      return;
    }
    if (vide) vide.hidden = true;
    zone.querySelectorAll('label.spec-chip').forEach(el => el.remove());
    const selSet = new Set(selectedLabels.map(s => String(s).trim().toLowerCase()));
    specialites.forEach(sp => {
      const key = sp.trim().toLowerCase();
      const lbl = document.createElement('label');
      lbl.className = 'spec-chip';
      lbl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;border:1px solid var(--gray-300);background:var(--gray-50);cursor:pointer;font-size:.88rem;user-select:none;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = sp;
      cb.checked = selSet.has(key);
      cb.addEventListener('change', () => {
        lbl.style.background = cb.checked ? 'var(--primary-50,#eff6ff)' : 'var(--gray-50)';
        lbl.style.borderColor = cb.checked ? 'var(--primary-400,#60a5fa)' : 'var(--gray-300)';
        lbl.style.fontWeight = cb.checked ? '600' : '';
      });
      // Style initial
      lbl.style.background = cb.checked ? 'var(--primary-50,#eff6ff)' : 'var(--gray-50)';
      lbl.style.borderColor = cb.checked ? 'var(--primary-400,#60a5fa)' : 'var(--gray-300)';
      lbl.style.fontWeight = cb.checked ? '600' : '';
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + sp));
      zone.appendChild(lbl);
    });
  },

  _majApercuHoraires() {
    const debut = $('#ep-debut').value, duree = parseInt($('#ep-duree').value, 10) || 0;
    const fin = AppData.addMinutes(debut, duree);
    const ttDebut = $('#ep-tt-debut').value || debut;
    const ttFin = $('#ep-tt-fin').value || AppData.addMinutes(ttDebut, AppData.dureeTiersTemps(duree));
    $('#ep-apercu').innerHTML = duree
      ? `Fin de l\u2019épreuve : <strong>${fin}</strong> · Tiers temps : <strong>${ttDebut} → ${ttFin}</strong>`
        + ` <button type="button" class="btn-link" id="ep-tt-reset">↺ recalculer auto</button>`
      : '';
    const reset = $('#ep-tt-reset');
    if (reset) reset.addEventListener('click', () => {
      $('#ep-tt-debut').value = $('#ep-debut').value;
      $('#ep-tt-fin').value = AppData.addMinutes(
        $('#ep-debut').value, AppData.dureeTiersTemps(parseInt($('#ep-duree').value, 10) || 0));
      this._majApercuHoraires();
    });
  },

  enregistrerEpreuve() {
    const debut = $('#ep-debut').value;
    const duree = $('#ep-duree').value;
    const ttDebutSaisi = $('#ep-tt-debut').value;
    const ttFinSaisi = $('#ep-tt-fin').value;
    // Valeurs auto de référence
    const autoDebut = debut;
    const autoFin = AppData.addMinutes(
      ttDebutSaisi || debut, AppData.dureeTiersTemps(parseInt(duree, 10) || 0));
    // On ne mémorise un horaire TT que s'il diffère du calcul automatique
    const ttDebut = (ttDebutSaisi && ttDebutSaisi !== autoDebut) ? ttDebutSaisi : '';
    const ttFin = (ttFinSaisi && ttFinSaisi !== autoFin) ? ttFinSaisi : '';

    // Type affectation et spécialités sélectionnées
    const typeAffectation = $('#ep-type-affectation').value || 'commune';
    const optionsLiees = typeAffectation === 'specialite'
      ? Array.from($$('#ep-specialites-liste input[type=checkbox]:checked')).map(cb => cb.value)
      : [];

    const f = {
      date: $('#ep-date').value,
      matiere: $('#ep-matiere').value,
      heureDebut: debut,
      duree: duree,
      ttDebut: ttDebut,
      ttFin: ttFin,
      notes: $('#ep-notes').value,
      typeAffectation,
      optionsLiees,
    };
    if (!f.date || !f.matiere.trim()) { notifier('Date et matière sont obligatoires.', 'error'); return; }
    if (typeAffectation === 'specialite' && !optionsLiees.length) {
      notifier('Sélectionnez au moins une spécialité pour ce type d\'épreuve.', 'warning'); return;
    }
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
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty">
        Aucune épreuve. Cliquez sur <strong>+ Ajouter une épreuve</strong> pour bâtir le calendrier
        (une ligne par épreuve : date, matière, horaires). Le tiers temps est calculé automatiquement.</td></tr>`;
      return;
    }

    let jourPrec = null;
    tbody.innerHTML = AppData.epreuves.map(ep => {
      const nouvelleJournee = ep.date !== jourPrec;
      jourPrec = ep.date;
      const sep = nouvelleJournee
        ? `<tr class="row-jour"><td colspan="8">📅 ${escHtml(AppData.formatDate(ep.date))}</td></tr>` : '';
      const typeAff = ep.typeAffectation || 'commune';
      const badgeType = typeAff === 'specialite'
        ? `<span class="badge" style="background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd">🎓 Spéc.</span>`
        : `<span class="badge" style="background:#f0fdf4;color:#166534;border:1px solid #86efac">👥 Commune</span>`;
      const tooltipSpec = typeAff === 'specialite' && ep.optionsLiees && ep.optionsLiees.length
        ? ` title="${escHtml(ep.optionsLiees.join(', '))}"` : '';
      return sep + `
        <tr>
          <td>${ep.id}</td>
          <td><strong>${escHtml(ep.matiere)}</strong></td>
          <td>${ep.heureDebut}</td>
          <td>${AppData.formatDuree(ep.duree)}</td>
          <td>${AppData.heureFin(ep)}</td>
          <td><span class="badge badge-tt">⏱ ${AppData.heureDebutTT(ep)}–${AppData.heureFinTT(ep)}</span></td>
          <td${tooltipSpec}>${badgeType}${typeAff === 'specialite' && ep.optionsLiees && ep.optionsLiees.length
            ? `<span style="font-size:.8rem;color:var(--gray-500);margin-left:4px">${escHtml(ep.optionsLiees.join(', '))}</span>` : ''}</td>
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
