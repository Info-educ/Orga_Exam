/**
 * candidats.js — Liste nominative des candidats (P0)
 * Orga Examens
 *
 * Import via le fichier Excel (feuille « Élèves »), affichage, suppression, purge.
 * RGPD : données locales, à conserver le temps de la session puis à purger.
 * Les options et numéros d'anonymat seront exploités au P1.
 */

'use strict';

const Candidats = {

  _filtre: '',

  init() {
    $('#btn-cand-modele')?.addEventListener('click', () => AppData.telechargerModeleExcel());
    $('#btn-cand-import')?.addEventListener('click', () => $('#input-import-xlsx')?.click());
    $('#btn-cand-purge')?.addEventListener('click', () => this.purger());

    const rech = $('#search-candidats');
    if (rech) rech.addEventListener('input', () => { this._filtre = rech.value.trim().toLowerCase(); this.rendre(); });

    // Délégation : suppression d'un candidat
    $('#tbody-candidats')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del-cand]');
      if (btn) this.supprimer(parseInt(btn.dataset.delCand, 10));
    });
  },

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

    // Statistiques
    const nbAmen = AppData.candidats.filter(c => c.amenagementId != null).length;
    const nbClasses = new Set(AppData.candidats.map(c => c.classe).filter(Boolean)).size;
    const nbOptions = AppData.cataloguerOptions().length;
    const stat = $('#stat-candidats');
    if (stat) stat.innerHTML = `
      <span class="stat-item">🎓 ${total} candidat(s)</span>
      <span class="stat-item">🏫 ${nbClasses} classe(s)</span>
      <span class="stat-item">♿ ${nbAmen} avec aménagement</span>
      <span class="stat-item">🧩 ${nbOptions} option(s) distincte(s)</span>`;

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
      const amen = c.amenagementId != null ? '<span class="badge badge-tt">♿ Aménagement</span>' : '';
      const naiss = this._naissance(c.dateNaissance);
      return `
        <tr>
          <td>${c.id}</td>
          <td><strong>${escHtml(c.nom)}</strong> ${escHtml(c.prenom)} ${amen}</td>
          <td class="text-center">${escHtml(c.sexe || '—')}</td>
          <td class="text-center">${escHtml(c.classe || '—')}</td>
          <td class="cell-sujet" title="${escHtml(opts)}">${escHtml(opts) || '—'}</td>
          <td class="text-center">${escHtml(naiss)}</td>
          <td class="col-actions">
            <button class="btn btn-icon btn-del" data-del-cand="${c.id}" title="Retirer">🗑</button>
          </td>
        </tr>`;
    }).join('');
  },
};
window.Candidats = Candidats;
