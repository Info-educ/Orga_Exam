/**
 * affectation.js — Affectation nominative des élèves en salles
 * Orga Examens
 *
 * Fonctionnement :
 *   - Groupes de séparation : des élèves qui ne doivent PAS être dans la même salle.
 *   - Affectation automatique avec options :
 *       • Ordre : alphabétique ou par classe (puis alphabétique)
 *       • Stratégie : compléter les salles une par une, ou répartir dans toutes
 *   - Les candidats à aménagement disposant d'une salle fixée ne sont pas déplacés.
 *   - Fonctionne par épreuve sélectionnée (ou toutes épreuves).
 */

'use strict';

const Affectation = {

  _vue: 'groupes',   // 'groupes' | 'affectation'

  init() {
    // Sous-navigation interne
    $('#aff-btn-groupes')?.addEventListener('click', () => this._changerVue('groupes'));
    $('#aff-btn-affecter')?.addEventListener('click', () => this._changerVue('affectation'));

    // Groupes de séparation
    $('#btn-add-groupe')?.addEventListener('click', () => this._ajouterGroupe());
    $('#zone-groupes')?.addEventListener('click', (e) => this._handleGroupeClick(e));
    $('#zone-groupes')?.addEventListener('change', (e) => this._handleGroupeChange(e));

    // Affectation
    $('#btn-lancer-affectation')?.addEventListener('click', () => this._lancerAffectation());
    $('#btn-vider-affectation')?.addEventListener('click', () => this._viderAffectation());
    $('#aff-epreuve')?.addEventListener('change', () => this._rendrePreview());
  },

  rendre() {
    this._rendreGroupes();
    this._rendreAffectation();
    this._rendrePreview();
  },

  // ────────────────────────────────────────────────────────────
  // NAVIGATION INTERNE
  // ────────────────────────────────────────────────────────────

  _changerVue(vue) {
    this._vue = vue;
    // Boutons
    $('#aff-btn-groupes')?.classList.toggle('active', vue === 'groupes');
    $('#aff-btn-affecter')?.classList.toggle('active', vue === 'affectation');
    // Panels
    const panelGroupes = $('#aff-panel-groupes');
    const panelAffecter = $('#aff-panel-affecter');
    if (panelGroupes) panelGroupes.hidden = vue !== 'groupes';
    if (panelAffecter) panelAffecter.hidden = vue !== 'affectation';
  },

  // ────────────────────────────────────────────────────────────
  // GROUPES DE SÉPARATION
  // ────────────────────────────────────────────────────────────

  _ajouterGroupe() {
    if (!AppData.candidats.length) {
      notifier('Importez d\'abord la liste des candidats (onglet Candidats).', 'warning');
      return;
    }
    const nom = `Groupe ${AppData.groupesSeparation.length + 1}`;
    AppData.addGroupeSeparation(nom);
    Unsaved.marquer();
    this._rendreGroupes();
  },

  _handleGroupeClick(e) {
    const btnDel = e.target.closest('[data-del-groupe]');
    if (btnDel) {
      const id = parseInt(btnDel.dataset.delGroupe, 10);
      const g = AppData.getGroupeSeparation(id);
      if (!g) return;
      if (!confirm(`Supprimer le groupe « ${g.nom || 'Sans nom'} » ?`)) return;
      AppData.deleteGroupeSeparation(id);
      Unsaved.marquer();
      this._rendreGroupes();
      return;
    }
    const btnDelCand = e.target.closest('[data-del-cand-groupe]');
    if (btnDelCand) {
      const [gid, cid] = btnDelCand.dataset.delCandGroupe.split(':').map(Number);
      AppData.removeCandidatGroupe(gid, cid);
      Unsaved.marquer();
      this._rendreGroupes();
      return;
    }
    const btnAdd = e.target.closest('[data-add-cand-groupe]');
    if (btnAdd) {
      const gid = parseInt(btnAdd.dataset.addCandGroupe, 10);
      const sel = $(`#aff-select-cand-${gid}`);
      if (!sel || !sel.value) return;
      const cid = parseInt(sel.value, 10);
      if (!AppData.addCandidatGroupe(gid, cid)) {
        notifier('Ce candidat est déjà dans ce groupe.', 'info');
        return;
      }
      Unsaved.marquer();
      this._rendreGroupes();
    }
  },

  _handleGroupeChange(e) {
    const inp = e.target.closest('[data-rename-groupe]');
    if (inp) {
      const id = parseInt(inp.dataset.renameGroupe, 10);
      AppData.updateGroupeSeparation(id, inp.value);
      Unsaved.marquer();
    }
  },

  _rendreGroupes() {
    const zone = $('#zone-groupes');
    if (!zone) return;

    const groupes = AppData.groupesSeparation;
    const hasCandidats = AppData.candidats.length > 0;

    if (!hasCandidats) {
      zone.innerHTML = `<p class="table-empty" style="padding:18px 0">
        Aucun candidat importé. Allez dans l'onglet <strong>Candidats</strong> pour importer la liste nominative avant de créer des groupes de séparation.</p>`;
      return;
    }

    if (!groupes.length) {
      zone.innerHTML = `<p class="table-empty" style="padding:18px 0">
        Aucun groupe de séparation défini. Cliquez sur <strong>+ Nouveau groupe</strong> pour commencer.<br>
        <span style="font-size:0.88rem;color:#64748b">Un groupe de séparation empêche les élèves qu'il contient d'être affectés dans la même salle.</span></p>`;
      return;
    }

    // Candidats disponibles par groupe (exclu déjà membres)
    const tousLesIds = new Set(AppData.groupesSeparation.flatMap(g => g.candidatIds));

    zone.innerHTML = groupes.map(g => {
      const membres = g.candidatIds.map(id => AppData.getCandidat(id)).filter(Boolean);
      const disponibles = AppData.candidats.filter(c => !g.candidatIds.includes(c.id));

      const chips = membres.map(c => `
        <span class="groupe-chip">
          <span class="groupe-chip-nom">${escHtml(c.nom)} ${escHtml(c.prenom)}</span>
          <span class="groupe-chip-classe">${escHtml(c.classe || '')}</span>
          <button class="groupe-chip-del" data-del-cand-groupe="${g.id}:${c.id}" title="Retirer">✕</button>
        </span>`).join('');

      const optsCandidats = disponibles.map(c =>
        `<option value="${c.id}">${escHtml(c.nom)} ${escHtml(c.prenom)}${c.classe ? ' — ' + escHtml(c.classe) : ''}</option>`
      ).join('');

      const avertissement = membres.length < 2
        ? `<span class="groupe-warn">⚠ Minimum 2 élèves pour activer la séparation</span>`
        : `<span class="groupe-ok">✔ ${membres.length} élèves — séparation active</span>`;

      return `
        <div class="groupe-sep-card" data-groupe-id="${g.id}">
          <div class="groupe-sep-header">
            <input class="groupe-sep-nom" type="text" value="${escHtml(g.nom)}"
              placeholder="Nom du groupe" data-rename-groupe="${g.id}" maxlength="60">
            ${avertissement}
            <button class="btn btn-icon btn-del" data-del-groupe="${g.id}" title="Supprimer le groupe">🗑</button>
          </div>
          <div class="groupe-sep-membres">
            ${chips || '<span class="groupe-vide">Aucun élève — ajoutez-en ci-dessous.</span>'}
          </div>
          <div class="groupe-sep-add">
            <select id="aff-select-cand-${g.id}" class="groupe-sep-select">
              <option value="">— Choisir un élève à ajouter —</option>
              ${optsCandidats}
            </select>
            <button class="btn btn-outline btn-sm" data-add-cand-groupe="${g.id}">+ Ajouter</button>
          </div>
        </div>`;
    }).join('');
  },

  // ────────────────────────────────────────────────────────────
  // AFFECTATION EN SALLES
  // ────────────────────────────────────────────────────────────

  _lancerAffectation() {
    if (!AppData.candidats.length) {
      notifier('Aucun candidat importé.', 'error'); return;
    }
    const sallesOrdinaires = AppData.salles.filter(s => s.type !== 'amenagee' && s.type !== 'secretariat');
    if (!sallesOrdinaires.length) {
      notifier('Aucune salle ordinaire définie.', 'error'); return;
    }

    const epSelect = $('#aff-epreuve');
    const epId = epSelect && epSelect.value !== 'toutes' ? parseInt(epSelect.value, 10) : null;

    const ordreVal = $('input[name="aff-ordre"]:checked')?.value || 'alpha';
    const strategieVal = $('input[name="aff-strategie"]:checked')?.value || 'remplir';
    const conserver = $('#aff-conserver')?.checked;

    // Candidats concernés (avec filtrage épreuve si applicable)
    let candidats = AppData.candidats.filter(c => {
      if (epId != null && c.epreuveIds.length && !c.epreuveIds.includes(epId)) return false;
      // Exclure les candidats à aménagement ayant déjà une salle fixée
      const am = AppData.amenagementDuCandidat(c);
      if (am && am.salleId) return false;
      return true;
    });

    // Si "conserver", ne toucher que ceux sans affectation
    if (conserver && epId != null) {
      candidats = candidats.filter(c => !(c.salleParEpreuve || {})[epId]);
    } else if (!conserver && epId != null) {
      // Vider les affectations existantes pour cette épreuve
      candidats.forEach(c => {
        if (c.salleParEpreuve) delete c.salleParEpreuve[epId];
      });
    } else if (!conserver && epId == null) {
      // Toutes épreuves : vider tout
      candidats.forEach(c => { c.salleParEpreuve = {}; });
    }

    // Tri selon l'ordre choisi
    const sorted = [...candidats].sort((a, b) => {
      if (ordreVal === 'classe') {
        const cmp = (a.classe || '').localeCompare(b.classe || '', 'fr');
        if (cmp !== 0) return cmp;
      }
      return (a.nom || '').localeCompare(b.nom || '', 'fr') ||
             (a.prenom || '').localeCompare(b.prenom || '', 'fr');
    });

    // Salles disponibles pour l'épreuve
    const salles = epId != null
      ? AppData.sallesPourEpreuve(epId).filter(s => s.type !== 'amenagee' && s.type !== 'secretariat')
      : sallesOrdinaires;

    if (!salles.length) {
      notifier('Aucune salle ordinaire disponible pour cette épreuve.', 'error'); return;
    }

    // Capacités restantes (on ne dépasse jamais la capacité)
    const capacites = {};
    salles.forEach(s => {
      const occupes = AppData.candidats.filter(c => {
        const map = c.salleParEpreuve || {};
        return epId != null ? map[epId] === s.id : Object.values(map).includes(s.id);
      }).length;
      capacites[s.id] = Math.max(0, s.capacite - occupes);
    });

    // Groupes de séparation : index par candidatId → groupeIds
    const groupeParCand = {};
    AppData.groupesSeparation.forEach(g => {
      if (g.candidatIds.length < 2) return;
      g.candidatIds.forEach(cid => {
        if (!groupeParCand[cid]) groupeParCand[cid] = [];
        groupeParCand[cid].push(g.id);
      });
    });

    // Affectations en cours : { salleId: Set<candidatId> }
    const affSalle = {};
    salles.forEach(s => { affSalle[s.id] = new Set(); });

    // Candidats déjà affectés (si conserver)
    AppData.candidats.forEach(c => {
      const map = c.salleParEpreuve || {};
      const sid = epId != null ? map[epId] : Object.values(map)[0];
      if (sid && affSalle[sid]) affSalle[sid].add(c.id);
    });

    /**
     * Choisir une salle pour un candidat :
     *   - Respecter les contraintes de séparation
     *   - Stratégie : remplir (première salle non pleine) ou répartir (salle avec le moins de candidats)
     *   - Ne jamais dépasser la capacité
     */
    const choisirSalle = (cand) => {
      const groupesInterdit = groupeParCand[cand.id] || [];

      // Salles interdites : contient un co-membre d'un groupe de séparation
      const sallesInterdites = new Set();
      groupesInterdit.forEach(gid => {
        const g = AppData.getGroupeSeparation(gid);
        if (!g) return;
        g.candidatIds.forEach(coId => {
          if (coId === cand.id) return;
          salles.forEach(s => {
            if (affSalle[s.id].has(coId)) sallesInterdites.add(s.id);
          });
        });
      });

      // Salles candidates (capacité > 0 et non interdites)
      let candidates = salles.filter(s => capacites[s.id] > 0 && !sallesInterdites.has(s.id));

      if (!candidates.length) {
        // Relâchement des contraintes de séparation si impossible
        candidates = salles.filter(s => capacites[s.id] > 0);
        if (!candidates.length) return null;
      }

      if (strategieVal === 'remplir') {
        // Compléter : préférer les salles déjà partiellement remplies
        candidates.sort((a, b) => affSalle[b.id].size - affSalle[a.id].size || a.id - b.id);
      } else {
        // Répartir : préférer les salles les moins occupées
        candidates.sort((a, b) => affSalle[a.id].size - affSalle[b.id].size || a.id - b.id);
      }

      return candidates[0];
    };

    // Affecter chaque candidat
    let affectes = 0, impossibles = 0;
    const epreuves = epId != null ? [epId] : AppData.epreuves.map(e => e.id);

    sorted.forEach(cand => {
      epreuves.forEach(eid => {
        if (cand.epreuveIds.length && !cand.epreuveIds.includes(eid)) return;
        if ((cand.salleParEpreuve || {})[eid]) return; // déjà affecté

        const salle = choisirSalle(cand);
        if (!salle) { impossibles++; return; }

        if (!cand.salleParEpreuve) cand.salleParEpreuve = {};
        cand.salleParEpreuve[eid] = salle.id;
        affSalle[salle.id].add(cand.id);
        capacites[salle.id]--;
        affectes++;
      });
    });

    Unsaved.marquer();
    this._rendrePreview();

    if (impossibles > 0) {
      notifier(`${affectes} candidat(s) affecté(s). ⚠ ${impossibles} affectation(s) impossible(s) (capacité insuffisante ou contraintes de séparation trop strictes).`, 'warning', 7000);
    } else {
      notifier(`✔ ${affectes} affectation(s) réalisée(s).`, 'success');
    }
  },

  _viderAffectation() {
    const epSelect = $('#aff-epreuve');
    const epId = epSelect && epSelect.value !== 'toutes' ? parseInt(epSelect.value, 10) : null;

    if (!confirm(epId
      ? `Effacer toutes les affectations de salle pour l'épreuve sélectionnée ?`
      : `Effacer toutes les affectations de salle pour toutes les épreuves ?`)) return;

    AppData.candidats.forEach(c => {
      if (!c.salleParEpreuve) return;
      if (epId != null) {
        delete c.salleParEpreuve[epId];
      } else {
        c.salleParEpreuve = {};
      }
    });

    Unsaved.marquer();
    this._rendrePreview();
    notifier('Affectations effacées.', 'warning');
  },

  _rendreAffectation() {
    // Mettre à jour le sélecteur d'épreuve
    const sel = $('#aff-epreuve');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="toutes">— Toutes les épreuves —</option>` +
      AppData.epreuves.map(ep =>
        `<option value="${ep.id}">${escHtml(AppData.formatDateCourt(ep.date))} — ${escHtml(ep.matiere)}</option>`
      ).join('');
    if (prev) sel.value = prev;
  },

  _rendrePreview() {
    const zone = $('#aff-preview');
    if (!zone) return;

    const epSelect = $('#aff-epreuve');
    const epId = epSelect && epSelect.value !== 'toutes' ? parseInt(epSelect.value, 10) : null;

    const salles = (epId != null ? AppData.sallesPourEpreuve(epId) : AppData.salles)
      .filter(s => s.type !== 'secretariat');

    if (!salles.length) {
      zone.innerHTML = '<p class="table-empty">Aucune salle à afficher.</p>';
      return;
    }

    const rows = salles.map(s => {
      const candidatsSalle = AppData.candidats.filter(c => {
        const map = c.salleParEpreuve || {};
        return epId != null ? map[epId] === s.id : Object.values(map).includes(s.id);
      }).sort((a, b) =>
        (a.nom || '').localeCompare(b.nom || '', 'fr') ||
        (a.prenom || '').localeCompare(b.prenom || '', 'fr')
      );

      const badge = s.type === 'amenagee'
        ? '<span class="badge badge-tt" title="Salle aménagée">TT</span>'
        : '';

      const classesSalle = [...new Set(candidatsSalle.map(c => c.classe).filter(Boolean))].sort().join(', ');

      const listeEleves = candidatsSalle.length
        ? candidatsSalle.map(c => {
            const am = AppData.amenagementDuCandidat(c);
            const amBadge = am ? '<span class="badge badge-tt" title="Aménagement">♿</span>' : '';
            return `<span class="aff-eleve-chip">${escHtml(c.nom)} ${escHtml(c.prenom)} ${escHtml(c.classe ? '(' + c.classe + ')' : '')} ${amBadge}</span>`;
          }).join('')
        : '<span class="aff-vide">Aucun élève affecté</span>';

      const tauxRemplissage = s.capacite > 0
        ? Math.round((candidatsSalle.length / s.capacite) * 100)
        : 0;
      const jauge = s.capacite > 0
        ? `<div class="aff-jauge-wrap"><div class="aff-jauge-bar" style="width:${Math.min(100, tauxRemplissage)}%;background:${tauxRemplissage > 100 ? 'var(--red-500,#ef4444)' : 'var(--teal-500,#0d9488)'}"></div></div>`
        : '';

      return `
        <div class="aff-salle-card">
          <div class="aff-salle-header">
            <span class="aff-salle-nom">${badge} ${escHtml(s.nom)}</span>
            <span class="aff-salle-count">${candidatsSalle.length} / ${s.capacite || '?'}</span>
            ${classesSalle ? `<span class="aff-salle-classes">${escHtml(classesSalle)}</span>` : ''}
          </div>
          ${jauge}
          <div class="aff-eleves-liste">${listeEleves}</div>
        </div>`;
    });

    // Stats globales
    const totalAffectes = AppData.candidats.filter(c => {
      const map = c.salleParEpreuve || {};
      return epId != null ? map[epId] != null : Object.keys(map).length > 0;
    }).length;
    const totalCandidats = AppData.candidats.filter(c =>
      epId == null || !c.epreuveIds.length || c.epreuveIds.includes(epId)
    ).length;

    zone.innerHTML = `
      <div class="aff-stats">
        <span class="stat-item">🎓 ${totalAffectes} / ${totalCandidats} candidat(s) affecté(s)</span>
        <span class="stat-item">🚪 ${salles.length} salle(s)</span>
      </div>
      <div class="aff-salles-grid">${rows.join('')}</div>`;
  },
};

window.Affectation = Affectation;
