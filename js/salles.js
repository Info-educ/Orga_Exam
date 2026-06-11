/**
 * salles.js — Salles & besoins matériels + Aménagements / secrétariat d'examen
 * Orga Examens — v1.0
 *
 * RGPD : pour les candidats à aménagement, privilégier les initiales.
 */

'use strict';

const Salles = {

  _editId: null,
  _editAmId: null,

  init() {
    // Salles
    $('#btn-add-salle').addEventListener('click', () => this.ouvrirSalle());
    $('#form-salle').addEventListener('submit', (e) => { e.preventDefault(); this.enregistrerSalle(); });
    $('#salle-type').addEventListener('change', () => this._suggererSurveillants());

    // Aménagements
    $('#btn-add-amenagement').addEventListener('click', () => this.ouvrirAmenagement());
    $('#form-amenagement').addEventListener('submit', (e) => { e.preventDefault(); this.enregistrerAmenagement(); });
  },

  // ────────────────────────────────────────────────────────────
  // SALLES
  // ────────────────────────────────────────────────────────────

  ouvrirSalle(id = null) {
    this._editId = id;
    const s = id ? AppData.getSalle(id) : null;
    $('#modal-salle-titre').textContent = s ? 'Modifier la salle' : 'Ajouter une salle';
    $('#salle-nom').value = s ? s.nom : '';
    $('#salle-type').value = s ? s.type : 'ordinaire';
    $('#salle-capacite').value = s ? s.capacite : '';
    $('#salle-candidats').value = s ? s.candidats : '';
    $('#salle-nb-surv').value = s ? s.nbSurveillants : 2;
    $('#salle-materiel').value = s ? s.materiel : '';
    $('#salle-notes').value = s ? s.notes : '';

    // Épreuves concernées (vide = toutes)
    const zone = $('#salle-epreuves');
    if (!AppData.epreuves.length) {
      zone.innerHTML = '<span class="field-hint">Aucune épreuve définie : la salle sera utilisée pour toutes les épreuves.</span>';
    } else {
      zone.innerHTML = AppData.epreuves.map(ep => `
        <label class="checkbox-label">
          <input type="checkbox" value="${ep.id}" ${s && s.epreuveIds.includes(ep.id) ? 'checked' : ''}>
          ${escHtml(AppData.formatDateCourt(ep.date))} — ${escHtml(ep.matiere)}
        </label>`).join('');
    }
    ouvrirModal('modal-salle');
  },

  _suggererSurveillants() {
    // Repère terrain : 2 surveillants en salle ordinaire, 1 en salle aménagée / secrétariat
    const t = $('#salle-type').value;
    $('#salle-nb-surv').value = t === 'ordinaire' ? 2 : 1;
  },

  enregistrerSalle() {
    const epreuveIds = $$('#salle-epreuves input:checked').map(c => parseInt(c.value, 10));
    const f = {
      nom: $('#salle-nom').value,
      type: $('#salle-type').value,
      capacite: $('#salle-capacite').value,
      candidats: $('#salle-candidats').value,
      nbSurveillants: $('#salle-nb-surv').value,
      epreuveIds,
      materiel: $('#salle-materiel').value,
      notes: $('#salle-notes').value,
    };
    if (!f.nom.trim()) { notifier('Le nom de la salle est obligatoire.', 'error'); return; }
    if (this._editId) AppData.updateSalle(this._editId, f);
    else AppData.addSalle(f);
    fermerModal('modal-salle');
    Unsaved.marquer();
    this.rendre();
    notifier(this._editId ? 'Salle modifiée.' : 'Salle ajoutée.');
  },

  supprimerSalle(id) {
    const s = AppData.getSalle(id);
    if (!s) return;
    if (!confirm(`Supprimer la salle « ${s.nom} » ?\nLes affectations de surveillance liées seront effacées.`)) return;
    AppData.deleteSalle(id);
    Unsaved.marquer();
    this.rendre();
    notifier('Salle supprimée.', 'warning');
  },

  rendre() {
    const tbody = $('#tbody-salles');
    $('#count-salles').textContent = AppData.salles.length;

    // Stat candidats / postes
    const totCand = AppData.salles.reduce((a, s) => a + (s.type !== 'secretariat' ? s.candidats : 0), 0);
    $('#stat-salles').innerHTML = `
      <span class="stat-item">🚪 ${AppData.salles.length} salle(s)</span>
      <span class="stat-item">🎓 ${totCand} candidat(s) répartis</span>
      <span class="stat-item">♿ ${AppData.salles.filter(s => s.type === 'amenagee').length} salle(s) aménagée(s)</span>
      <span class="stat-item">🗂 ${AppData.salles.filter(s => s.type === 'secretariat').length} secrétariat(s)</span>`;

    if (!AppData.salles.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty">
        Aucune salle. Ajoutez les salles d\u2019examen : <strong>ordinaires</strong>, <strong>aménagées</strong>
        (tiers temps) et <strong>secrétariat d\u2019examen</strong>. Les besoins en copies, brouillons et sujets
        sont calculés automatiquement à partir du nombre de candidats.</td></tr>`;
      return;
    }

    const badgesType = { ordinaire: '', amenagee: '<span class="badge badge-tt">♿ Tiers temps</span>', secretariat: '<span class="badge badge-secr">🗂 Secrétariat</span>' };

    tbody.innerHTML = AppData.salles.map(s => {
      const b = AppData.besoinsSalle(s);
      const eps = !s.epreuveIds.length ? 'Toutes'
        : s.epreuveIds.map(id => { const ep = AppData.getEpreuve(id); return ep ? escHtml(ep.matiere) : ''; }).filter(Boolean).join(', ');
      return `
        <tr>
          <td>${s.id}</td>
          <td><strong>${escHtml(s.nom)}</strong> ${badgesType[s.type] || ''}</td>
          <td class="text-center">${s.capacite || '—'}</td>
          <td class="text-center"><strong>${s.candidats || 0}</strong></td>
          <td class="text-center">${s.type === 'secretariat' ? '—' : `${b.sujets} suj. · ${b.copies} cop. · ${b.brouillons} brouil.`}</td>
          <td class="text-center">${s.nbSurveillants}</td>
          <td class="cell-sujet" title="${escHtml(s.materiel)}">${escHtml(eps)}${s.materiel ? ' · ' + escHtml(s.materiel) : ''}</td>
          <td class="col-actions">
            <button class="btn btn-icon btn-edit" data-edit="${s.id}" title="Modifier">✏</button>
            <button class="btn btn-icon btn-del" data-del="${s.id}" title="Supprimer">🗑</button>
          </td>
        </tr>`;
    }).join('');

    $$('#tbody-salles [data-edit]').forEach(b =>
      b.addEventListener('click', () => this.ouvrirSalle(parseInt(b.dataset.edit, 10))));
    $$('#tbody-salles [data-del]').forEach(b =>
      b.addEventListener('click', () => this.supprimerSalle(parseInt(b.dataset.del, 10))));
  },

  // ────────────────────────────────────────────────────────────
  // AMÉNAGEMENTS / SECRÉTARIAT D'EXAMEN
  // ────────────────────────────────────────────────────────────

  ouvrirAmenagement(id = null) {
    this._editAmId = id;
    const a = id ? AppData.getAmenagement(id) : null;
    $('#modal-am-titre').textContent = a ? 'Modifier l\u2019aménagement' : 'Ajouter un candidat à aménagement';
    $('#am-candidat').value = a ? a.candidat : '';
    $('#am-classe').value = a ? a.classe : '';
    $('#am-tt').checked = a ? a.tiersTemps : true;
    $('#am-lecteur').checked = a ? a.lecteur : false;
    $('#am-scripteur').checked = a ? a.scripteur : false;
    $('#am-isolement').checked = a ? a.isolement : false;
    $('#am-qualite').checked = a ? !!a.qualiteRedac : false;
    $('#am-avs').checked = a ? !!a.avs : false;
    $('#am-dictee').checked = a ? !!a.dictee : false;
    $('#am-calculatrice').checked = a ? !!a.calculatrice : false;
    $('#am-ordi').checked = a ? a.ordinateur : false;
    $('#am-autre').value = a ? a.autre : '';
    $('#am-accompagnant').value = a ? a.accompagnant : '';
    $('#am-notes').value = a ? a.notes : '';

    const sel = $('#am-salle');
    const sallesDediees = AppData.salles.filter(s => s.type !== 'ordinaire');
    sel.innerHTML = '<option value="">— À définir —</option>' +
      (sallesDediees.length ? sallesDediees : AppData.salles)
        .map(s => `<option value="${s.id}" ${a && a.salleId === s.id ? 'selected' : ''}>${escHtml(s.nom)} (${escHtml(AppData.typeSalleLabel(s.type))})</option>`).join('');

    ouvrirModal('modal-amenagement');
  },

  enregistrerAmenagement() {
    const f = {
      candidat: $('#am-candidat').value,
      classe: $('#am-classe').value,
      tiersTemps: $('#am-tt').checked,
      lecteur: $('#am-lecteur').checked,
      scripteur: $('#am-scripteur').checked,
      isolement: $('#am-isolement').checked,
      qualiteRedac: $('#am-qualite').checked,
      avs: $('#am-avs').checked,
      dictee: $('#am-dictee').checked,
      calculatrice: $('#am-calculatrice').checked,
      ordinateur: $('#am-ordi').checked,
      autre: $('#am-autre').value,
      salleId: $('#am-salle').value,
      accompagnant: $('#am-accompagnant').value,
      notes: $('#am-notes').value,
    };
    if (!f.candidat.trim()) { notifier('Renseignez le candidat (initiales recommandées).', 'error'); return; }
    if (this._editAmId) AppData.updateAmenagement(this._editAmId, f);
    else AppData.addAmenagement(f);
    fermerModal('modal-amenagement');
    Unsaved.marquer();
    this.rendreAmenagements();
    notifier(this._editAmId ? 'Aménagement modifié.' : 'Aménagement ajouté.');
  },

  supprimerAmenagement(id) {
    const a = AppData.getAmenagement(id);
    if (!a) return;
    if (!confirm(`Supprimer l\u2019aménagement de « ${a.candidat} » ?`)) return;
    AppData.deleteAmenagement(id);
    Unsaved.marquer();
    this.rendreAmenagements();
    notifier('Aménagement supprimé.', 'warning');
  },

  rendreAccompagnantsEp() {
    const zone = $('#zone-accomp-ep');
    if (!zone) return;
    if (!AppData.epreuves.length) {
      zone.innerHTML = '<div class="placeholder-zone">Définissez les épreuves pour affecter des accompagnants.</div>';
      return;
    }

    const noms = AppData.nomsAccompagnants();
    const datalist = `<datalist id="dl-accompagnants">${noms.map(n => `<option value="${escHtml(n)}">`).join('')}</datalist>`;

    zone.innerHTML = datalist + `<div class="table-wrapper"><table class="data-table">
      <thead><tr><th style="width:220px">Épreuve</th><th>Accompagnants (épreuve entière)</th><th style="width:280px">Ajouter</th></tr></thead>
      <tbody>` + AppData.epreuves.map(ep => `
        <tr>
          <td><strong>${escHtml(ep.matiere)}</strong>
            <small style="display:block;color:var(--gray-500)">${escHtml(AppData.formatDateCourt(ep.date))} · ${ep.heureDebut}–${AppData.heureFinTT(ep)} <span class="badge badge-tt">fin TT</span></small></td>
          <td>${AppData.getAccompagnantsEp(ep.id).map(n =>
            `<span class="surv-chip">🤝 ${escHtml(n)}
              <button data-acc-del='${JSON.stringify({ ep: ep.id, nom: n })}' title="Retirer">✕</button></span>`).join(' ')
            || '<span class="calc-attente">Personne</span>'}</td>
          <td style="white-space:nowrap">
            <input type="text" list="dl-accompagnants" data-acc-input="${ep.id}" placeholder="Nom de l\u2019accompagnant" style="width:190px">
            <button class="btn btn-outline btn-icon" data-acc-add="${ep.id}" title="Ajouter">+</button>
          </td>
        </tr>`).join('') + '</tbody></table></div>';

    zone.querySelectorAll('[data-acc-add]').forEach(btn =>
      btn.addEventListener('click', () => {
        const epId = parseInt(btn.dataset.accAdd, 10);
        const input = zone.querySelector(`[data-acc-input="${epId}"]`);
        if (AppData.ajouterAccompagnantEp(epId, input.value)) {
          Unsaved.marquer();
          this.rendreAccompagnantsEp();
          if (window.Recap) Recap.rendre();
        } else if (input.value.trim()) {
          notifier('Cet accompagnant est déjà affecté à cette épreuve.', 'warning');
        }
      }));
    zone.querySelectorAll('[data-acc-input]').forEach(input =>
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); zone.querySelector(`[data-acc-add="${input.dataset.accInput}"]`).click(); }
      }));
    zone.querySelectorAll('[data-acc-del]').forEach(btn =>
      btn.addEventListener('click', () => {
        const d = JSON.parse(btn.dataset.accDel);
        AppData.retirerAccompagnantEp(d.ep, d.nom);
        Unsaved.marquer();
        this.rendreAccompagnantsEp();
        if (window.Recap) Recap.rendre();
      }));
  },

  rendreAmenagements() {
    this.rendreAccompagnantsEp();
    const tbody = $('#tbody-amenagements');
    $('#count-amenagements').textContent = AppData.amenagements.length;

    if (!AppData.amenagements.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">
        Aucun candidat à aménagement. Recensez ici les <strong>tiers temps</strong>, besoins de
        <strong>secrétaire lecteur / scripteur</strong>, salles à effectif réduit, ordinateurs…
        puis affectez chaque candidat à une salle aménagée ou au secrétariat d\u2019examen.<br>
        <small>RGPD : utilisez de préférence les initiales du candidat.</small></td></tr>`;
      return;
    }

    tbody.innerHTML = AppData.amenagements.map(a => {
      const salle = a.salleId ? AppData.getSalle(a.salleId) : null;
      const badges = AppData.amenagementBadges(a)
        .map(b => `<span class="badge badge-amem">${escHtml(b)}</span>`).join(' ');
      return `
        <tr>
          <td>${a.id}</td>
          <td><strong>${escHtml(a.candidat)}</strong></td>
          <td>${escHtml(a.classe || '—')}</td>
          <td>${badges || '—'}</td>
          <td>${salle ? escHtml(salle.nom) : '<span class="badge badge-prio">À définir</span>'}</td>
          <td>${escHtml(a.accompagnant || '—')}</td>
          <td class="col-actions">
            <button class="btn btn-icon btn-edit" data-edit="${a.id}" title="Modifier">✏</button>
            <button class="btn btn-icon btn-del" data-del="${a.id}" title="Supprimer">🗑</button>
          </td>
        </tr>`;
    }).join('');

    $$('#tbody-amenagements [data-edit]').forEach(b =>
      b.addEventListener('click', () => this.ouvrirAmenagement(parseInt(b.dataset.edit, 10))));
    $$('#tbody-amenagements [data-del]').forEach(b =>
      b.addEventListener('click', () => this.supprimerAmenagement(parseInt(b.dataset.del, 10))));
  },
};
window.Salles = Salles;
