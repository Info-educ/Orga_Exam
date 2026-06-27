/**
 * candidats.js — Liste nominative des candidats (P0)
 * Orga Examens
 *
 * Import via le fichier Excel (feuille « Élèves »), affichage, édition inline,
 * suppression, purge.
 * RGPD : données locales, à conserver le temps de la session puis à purger.
 */

'use strict';

const Candidats = {

  _filtre: '',
  _editId: null,

  init() {
    $('#btn-cand-modele')?.addEventListener('click', () => AppData.telechargerModeleExcel());
    $('#btn-cand-import')?.addEventListener('click', () => $('#input-import-xlsx')?.click());
    $('#btn-cand-purge')?.addEventListener('click', () => this.purger());

    const rech = $('#search-candidats');
    if (rech) rech.addEventListener('input', () => { this._filtre = rech.value.trim().toLowerCase(); this.rendre(); });

    // Délégation : édition et suppression
    $('#tbody-candidats')?.addEventListener('click', (e) => {
      const btnDel = e.target.closest('[data-del-cand]');
      if (btnDel) { this.supprimer(parseInt(btnDel.dataset.delCand, 10)); return; }
      const btnEdit = e.target.closest('[data-edit-cand]');
      if (btnEdit) { this.ouvrirEdition(parseInt(btnEdit.dataset.editCand, 10)); return; }
    });

    // Formulaire édition
    $('#form-candidat')?.addEventListener('submit', (e) => { e.preventDefault(); this.enregistrer(); });
    $('#btn-cand-option-add')?.addEventListener('click', () => this._ajouterOptionManuelle());
    $('#cand-option-new')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._ajouterOptionManuelle(); }
    });
  },

  // ── Édition ──────────────────────────────────────────────────

  ouvrirEdition(id) {
    const c = AppData.getCandidat(id);
    if (!c) return;
    this._editId = id;

    $('#cand-nom').value    = c.nom || '';
    $('#cand-prenom').value = c.prenom || '';
    $('#cand-sexe').value   = c.sexe || '';
    $('#cand-classe').value = c.classe || '';
    $('#cand-naissance').value = this._naissance(c.dateNaissance);
    $('#cand-notes').value  = c.notes || '';

    this._rendreOptionsEdition(c.options || []);
    ouvrirModal('modal-candidat');
  },

  /** Peuple la zone options : cases à cocher des spécialités connues + chips des options du candidat */
  _rendreOptionsEdition(optionsActuelles) {
    const zone = $('#cand-options-liste');
    if (!zone) return;
    zone.innerHTML = '';

    // Toutes les spécialités connues dans la session
    const connues = AppData.cataloguerOptions();
    const actSet  = new Set(optionsActuelles.map(o => String(o).trim().toLowerCase()));

    // 1) Cases à cocher pour les spécialités connues
    connues.forEach(sp => {
      const key     = sp.trim().toLowerCase();
      const checked = actSet.has(key);
      const lbl     = document.createElement('label');
      lbl.className = 'spec-chip';
      lbl.dataset.optionKey = key;
      lbl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;border:1px solid var(--gray-300);cursor:pointer;font-size:.88rem;user-select:none;transition:background .1s;';
      const cb      = document.createElement('input');
      cb.type       = 'checkbox';
      cb.value      = sp;
      cb.checked    = checked;
      const _update = () => {
        lbl.style.background   = cb.checked ? 'var(--primary-50,#eff6ff)' : 'var(--gray-50,#f8fafc)';
        lbl.style.borderColor  = cb.checked ? 'var(--primary-400,#60a5fa)' : 'var(--gray-300)';
        lbl.style.fontWeight   = cb.checked ? '600' : '';
      };
      cb.addEventListener('change', _update);
      _update();
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + sp));
      zone.appendChild(lbl);
    });

    // 2) Chips pour les options du candidat qui ne sont PAS dans la liste connue (saisie manuelle antérieure)
    optionsActuelles.forEach(opt => {
      const key = String(opt).trim().toLowerCase();
      if (!key || connues.some(sp => sp.trim().toLowerCase() === key)) return;
      zone.appendChild(this._creerChipManuelle(opt));
    });
  },

  /** Crée un chip pour une option saisie manuellement (avec croix de suppression) */
  _creerChipManuelle(valeur) {
    const chip = document.createElement('span');
    chip.className = 'spec-chip spec-chip-manuelle';
    chip.dataset.optionManuelle = valeur;
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;border:1px solid var(--primary-300,#93c5fd);background:var(--primary-50,#eff6ff);font-size:.88rem;font-weight:600;';
    chip.innerHTML = `<span>${escHtml(valeur)}</span><button type="button" style="background:none;border:none;cursor:pointer;font-size:.85rem;padding:0;line-height:1;color:var(--gray-500)" title="Supprimer">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => chip.remove());
    return chip;
  },

  /** Lit toutes les options sélectionnées/saisies depuis la zone d'édition */
  _lireOptions() {
    const zone = $('#cand-options-liste');
    if (!zone) return [];
    const opts = [];
    // Cases à cocher cochées
    zone.querySelectorAll('input[type=checkbox]:checked').forEach(cb => opts.push(cb.value));
    // Chips manuelles
    zone.querySelectorAll('[data-option-manuelle]').forEach(chip => {
      const v = chip.dataset.optionManuelle;
      if (v && !opts.some(o => o.trim().toLowerCase() === v.trim().toLowerCase()))
        opts.push(v);
    });
    return opts;
  },

  _ajouterOptionManuelle() {
    const inp = $('#cand-option-new');
    if (!inp) return;
    const valeur = inp.value.trim();
    if (!valeur) return;

    const zone = $('#cand-options-liste');
    const key  = valeur.toLowerCase();

    // Si c'est une spécialité connue → cocher la case existante
    const cbExistant = zone.querySelector(`input[type=checkbox][value="${CSS.escape(valeur)}"], input[type=checkbox]`);
    const cbMatch = Array.from(zone.querySelectorAll('input[type=checkbox]'))
      .find(cb => cb.value.trim().toLowerCase() === key);
    if (cbMatch) {
      cbMatch.checked = true;
      cbMatch.dispatchEvent(new Event('change'));
      inp.value = '';
      return;
    }

    // Si déjà en chip manuelle
    const dejaDans = Array.from(zone.querySelectorAll('[data-option-manuelle]'))
      .some(c => c.dataset.optionManuelle.trim().toLowerCase() === key);
    if (dejaDans) { inp.value = ''; return; }

    zone.appendChild(this._creerChipManuelle(valeur));
    inp.value = '';
  },

  enregistrer() {
    const id = this._editId;
    if (!id) return;

    const nomVal    = $('#cand-nom').value.trim();
    const prenomVal = $('#cand-prenom').value.trim();
    if (!nomVal || !prenomVal) { notifier('Nom et prénom sont obligatoires.', 'error'); return; }

    // Normaliser la date saisie JJ/MM/AAAA → AAAA-MM-JJ
    const naissRaw = $('#cand-naissance').value.trim();
    const dateNaissance = AppData._normaliserDate(naissRaw);

    AppData.updateCandidat(id, {
      nom          : nomVal,
      prenom       : prenomVal,
      sexe         : $('#cand-sexe').value,
      classe       : $('#cand-classe').value.trim(),
      dateNaissance,
      options      : this._lireOptions(),
      notes        : $('#cand-notes').value.trim(),
      // Préserver les champs non modifiés ici (epreuveIds, amenagementId)
      epreuveIds   : (AppData.getCandidat(id) || {}).epreuveIds || [],
      amenagementId: (AppData.getCandidat(id) || {}).amenagementId ?? null,
    });

    fermerModal('modal-candidat');
    Unsaved.marquer();
    this.rendre();
    // Mettre à jour les cases à cocher dans les épreuves spécialité si besoin
    if (typeof Parametres !== 'undefined') Parametres.rendreEpreuves();
    notifier('Candidat mis à jour.');
  },

  // ── Suppression / Purge ──────────────────────────────────────

  purger() {
    if (!AppData.candidats.length) { notifier('Aucun candidat à purger.', 'info'); return; }
    if (!confirm(`Purger définitivement la liste des ${AppData.candidats.length} candidat(s) ?\n\nÀ faire en fin de session (minimisation RGPD). Les aménagements déjà créés ne sont pas supprimés.`)) return;
    AppData.purgerCandidats();
    Unsaved.marquer();
    this.rendre();
    notifier('Liste des candidats purgée.', 'warning');
  },

  supprimer(id) {
    const c = AppData.getCandidat(id);
    if (!c) return;
    if (!confirm(`Retirer ${c.prenom} ${c.nom} de la liste ?`)) return;
    AppData.deleteCandidat(id);
    Unsaved.marquer();
    this.rendre();
    notifier('Candidat retiré.', 'warning');
  },

  // ── Rendu ────────────────────────────────────────────────────

  _lignesFiltrees() {
    if (!this._filtre) return AppData.candidats;
    const f = this._filtre;
    return AppData.candidats.filter(c =>
      `${c.nom} ${c.prenom} ${c.classe} ${(c.options || []).join(' ')}`.toLowerCase().includes(f));
  },

  _naissance(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
  },

  rendre() {
    const tbody = $('#tbody-candidats');
    if (!tbody) return;

    const total = AppData.candidats.length;
    $('#count-candidats').textContent = total;

    const nbAmen    = AppData.candidats.filter(c => c.amenagementId != null).length;
    const nbClasses = new Set(AppData.candidats.map(c => c.classe).filter(Boolean)).size;
    const nbOptions = AppData.cataloguerOptions().length;
    const stat = $('#stat-candidats');
    if (stat) stat.innerHTML = `
      <span class="stat-item">🎓 ${total} candidat(s)</span>
      <span class="stat-item">🏫 ${nbClasses} classe(s)</span>
      <span class="stat-item">♿ ${nbAmen} avec aménagement</span>
      <span class="stat-item">🧩 ${nbOptions} spécialité(s) distincte(s)</span>`;

    if (!total) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">
        Aucun candidat. Importez la liste depuis un fichier Excel (feuille <strong>« Élèves »</strong>)
        via le bouton <strong>Importer (Excel)</strong> ci-dessus, ou téléchargez d'abord le
        <strong>modèle vierge</strong>. Utile notamment pour les <strong>examens blancs</strong>,
        que Cyclades ne prend pas en charge.</td></tr>`;
      return;
    }

    const lignes = this._lignesFiltrees();
    if (!lignes.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Aucun candidat ne correspond à « ${escHtml(this._filtre)} ».</td></tr>`;
      return;
    }

    tbody.innerHTML = lignes.map(c => {
      const opts = (c.options || []).join(', ');
      const amen = c.amenagementId != null ? '<span class="badge badge-tt">♿</span>' : '';
      const naiss = this._naissance(c.dateNaissance);
      return `
        <tr>
          <td>${c.id}</td>
          <td><strong>${escHtml(c.nom)}</strong> ${escHtml(c.prenom)} ${amen}</td>
          <td class="text-center">${escHtml(c.sexe || '—')}</td>
          <td class="text-center">${escHtml(c.classe || '—')}</td>
          <td class="cell-sujet" title="${escHtml(opts)}">${escHtml(opts) || '<span style="color:var(--gray-400)">—</span>'}</td>
          <td class="text-center">${escHtml(naiss)}</td>
          <td class="col-actions">
            <button class="btn btn-icon btn-edit" data-edit-cand="${c.id}" title="Modifier">✏</button>
            <button class="btn btn-icon btn-del"  data-del-cand="${c.id}"  title="Retirer">🗑</button>
          </td>
        </tr>`;
    }).join('');
  },
};
window.Candidats = Candidats;
