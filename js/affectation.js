/**
 * affectation.js — Affectation nominative des élèves en salles
 * Orga Examens — v2.0
 *
 * Fonctionnement :
 *   - Groupes de séparation : élèves à ne pas placer dans la même salle.
 *   - Affectation automatique (alpha / par classe, remplir / répartir).
 *   - Vue kanban drag & drop : déplacer un élève d'une salle à une autre.
 *   - Alertes en temps réel : surcharge, aménagement hors salle, séparation violée.
 */

'use strict';

const Affectation = {

  _vue: 'groupes',        // 'groupes' | 'affectation'
  _dndCandidatId: null,   // id du candidat en cours de glissement
  _dndSalleId: null,      // salle d'origine du glissement
  _dndEpId: null,         // épreuve concernée

  // ────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────

  init() {
    $('#aff-btn-groupes')?.addEventListener('click', () => this._changerVue('groupes'));
    $('#aff-btn-affecter')?.addEventListener('click', () => this._changerVue('affectation'));

    // Groupes de séparation
    $('#btn-add-groupe')?.addEventListener('click', () => this._ajouterGroupe());
    $('#zone-groupes')?.addEventListener('click',  e => this._handleGroupeClick(e));
    $('#zone-groupes')?.addEventListener('change', e => this._handleGroupeChange(e));

    // Options affectation
    $('#btn-lancer-affectation')?.addEventListener('click', () => this._lancerAffectation());
    $('#btn-vider-affectation')?.addEventListener('click',  () => this._viderAffectation());
    $('#aff-epreuve')?.addEventListener('change', () => this._rendrePreview());

    // DnD — délégation globale (une seule fois)
    this._initDnD();
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
    $('#aff-btn-groupes')?.classList.toggle('active', vue === 'groupes');
    $('#aff-btn-affecter')?.classList.toggle('active', vue === 'affectation');
    const pg = $('#aff-panel-groupes');
    const pa = $('#aff-panel-affecter');
    if (pg) pg.hidden = vue !== 'groupes';
    if (pa) pa.hidden = vue !== 'affectation';
  },

  // ────────────────────────────────────────────────────────────
  // GROUPES DE SÉPARATION
  // ────────────────────────────────────────────────────────────

  _ajouterGroupe() {
    if (!AppData.candidats.length) {
      notifier('Importez d\'abord la liste des candidats (onglet Candidats).', 'warning');
      return;
    }
    AppData.addGroupeSeparation(`Groupe ${AppData.groupesSeparation.length + 1}`);
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
      AppData.updateGroupeSeparation(parseInt(inp.dataset.renameGroupe, 10), inp.value);
      Unsaved.marquer();
    }
  },

  _rendreGroupes() {
    const zone = $('#zone-groupes');
    if (!zone) return;

    if (!AppData.candidats.length) {
      zone.innerHTML = `<p class="table-empty" style="padding:18px 0">
        Aucun candidat importé. Allez dans l'onglet <strong>Candidats</strong> pour importer la liste nominative.</p>`;
      return;
    }
    if (!AppData.groupesSeparation.length) {
      zone.innerHTML = `<p class="table-empty" style="padding:18px 0">
        Aucun groupe défini. Cliquez sur <strong>+ Nouveau groupe</strong> pour commencer.<br>
        <span style="font-size:.88rem;color:#64748b">Un groupe de séparation empêche les élèves qu'il contient d'être affectés dans la même salle.</span></p>`;
      return;
    }

    zone.innerHTML = AppData.groupesSeparation.map(g => {
      const membres  = g.candidatIds.map(id => AppData.getCandidat(id)).filter(Boolean);
      const dispos   = AppData.candidats.filter(c => !g.candidatIds.includes(c.id));
      const chips    = membres.map(c => `
        <span class="groupe-chip">
          <span class="groupe-chip-nom">${escHtml(c.nom)} ${escHtml(c.prenom)}</span>
          <span class="groupe-chip-classe">${escHtml(c.classe || '')}</span>
          <button class="groupe-chip-del" data-del-cand-groupe="${g.id}:${c.id}" title="Retirer">✕</button>
        </span>`).join('');
      const opts = dispos.map(c =>
        `<option value="${c.id}">${escHtml(c.nom)} ${escHtml(c.prenom)}${c.classe ? ' — ' + escHtml(c.classe) : ''}</option>`
      ).join('');
      const badge = membres.length < 2
        ? `<span class="groupe-warn">⚠ Minimum 2 élèves pour activer la séparation</span>`
        : `<span class="groupe-ok">✔ ${membres.length} élèves — séparation active</span>`;
      return `
        <div class="groupe-sep-card" data-groupe-id="${g.id}">
          <div class="groupe-sep-header">
            <input class="groupe-sep-nom" type="text" value="${escHtml(g.nom)}"
              placeholder="Nom du groupe" data-rename-groupe="${g.id}" maxlength="60">
            ${badge}
            <button class="btn btn-icon btn-del" data-del-groupe="${g.id}" title="Supprimer">🗑</button>
          </div>
          <div class="groupe-sep-membres">
            ${chips || '<span class="groupe-vide">Aucun élève — ajoutez-en ci-dessous.</span>'}
          </div>
          <div class="groupe-sep-add">
            <select id="aff-select-cand-${g.id}" class="groupe-sep-select">
              <option value="">— Choisir un élève —</option>${opts}
            </select>
            <button class="btn btn-outline btn-sm" data-add-cand-groupe="${g.id}">+ Ajouter</button>
          </div>
        </div>`;
    }).join('');
  },

  // ────────────────────────────────────────────────────────────
  // MOTEUR D'AFFECTATION AUTOMATIQUE
  // ────────────────────────────────────────────────────────────

  _lancerAffectation() {
    if (!AppData.candidats.length) { notifier('Aucun candidat importé.', 'error'); return; }
    const sallesOrdinaires = AppData.salles.filter(s => s.type !== 'amenagee' && s.type !== 'secretariat');
    if (!sallesOrdinaires.length) { notifier('Aucune salle ordinaire définie.', 'error'); return; }

    const epSelect  = $('#aff-epreuve');
    const epId      = epSelect && epSelect.value !== 'toutes' ? parseInt(epSelect.value, 10) : null;
    const ordreVal  = $('input[name="aff-ordre"]:checked')?.value    || 'alpha';
    const stratVal  = $('input[name="aff-strategie"]:checked')?.value || 'remplir';
    const conserver = $('#aff-conserver')?.checked;

    // Index groupes de séparation
    const groupeParCand = {};
    AppData.groupesSeparation.forEach(g => {
      if (g.candidatIds.length < 2) return;
      g.candidatIds.forEach(cid => {
        (groupeParCand[cid] = groupeParCand[cid] || []).push(g.id);
      });
    });

    // Tri de base (réutilisé pour chaque épreuve)
    const trierCandidats = (liste) => [...liste].sort((a, b) => {
      if (ordreVal === 'classe') {
        const cmp = (a.classe || '').localeCompare(b.classe || '', 'fr');
        if (cmp !== 0) return cmp;
      }
      return (a.nom || '').localeCompare(b.nom || '', 'fr') ||
             (a.prenom || '').localeCompare(b.prenom || '', 'fr');
    });

    // ── Fonction d'affectation pour UNE épreuve donnée ──────────────────
    // Trois flux : aménagés avec salle fixée / aménagés sans salle / ordinaires
    const affecterEpreuve = (ep, sallesEp, affSalleGlobal) => {
      let aff = 0, imp = 0;
      const tousCandidat = AppData.candidatsPourEpreuve(ep);

      // ── FLUX 1 : aménagés avec salle fixée → affectation directe ────
      tousCandidat.forEach(c => {
        const am = AppData.amenagementDuCandidat(c);
        if (!am || !am.salleId) return;
        if (conserver && (c.salleParEpreuve || {})[ep.id]) return;
        if (!c.salleParEpreuve) c.salleParEpreuve = {};
        c.salleParEpreuve[ep.id] = am.salleId;
        aff++;
      });

      // ── FLUX 2 : aménagés SANS salle fixée → salles aménagées ──────
      const sallesAmenagees = AppData.sallesAmenageesPourEpreuve(ep);

      let candidatsAmenSansSalle = tousCandidat.filter(c => {
        const am = AppData.amenagementDuCandidat(c);
        return am && !am.salleId;
      });
      if (!conserver) {
        candidatsAmenSansSalle.forEach(c => {
          if (!c.salleParEpreuve) c.salleParEpreuve = {};
          delete c.salleParEpreuve[ep.id];
        });
      } else {
        candidatsAmenSansSalle = candidatsAmenSansSalle.filter(c => !(c.salleParEpreuve || {})[ep.id]);
      }

      if (candidatsAmenSansSalle.length) {
        if (sallesAmenagees.length) {
          const capAm = {};
          const affAm = {};
          sallesAmenagees.forEach(s => {
            affAm[s.id] = new Set(
              AppData.candidats.filter(c => (c.salleParEpreuve || {})[ep.id] === s.id).map(c => c.id)
            );
            capAm[s.id] = Math.max(0, s.capacite - affAm[s.id].size);
          });
          trierCandidats(candidatsAmenSansSalle).forEach(c => {
            if ((c.salleParEpreuve || {})[ep.id]) return;
            const dispo = sallesAmenagees.filter(s => capAm[s.id] > 0);
            if (!dispo.length) { imp++; return; }
            dispo.sort(stratVal === 'remplir'
              ? (a, b) => affAm[b.id].size - affAm[a.id].size || a.id - b.id
              : (a, b) => affAm[a.id].size - affAm[b.id].size || a.id - b.id);
            const salle = dispo[0];
            if (!c.salleParEpreuve) c.salleParEpreuve = {};
            c.salleParEpreuve[ep.id] = salle.id;
            affAm[salle.id].add(c.id);
            capAm[salle.id]--;
            aff++;
          });
        } else {
          // Pas de salle aménagée disponible → comptés impossibles
          candidatsAmenSansSalle.forEach(() => imp++);
        }
      }

      // ── FLUX 3 : candidats ordinaires → salles ordinaires ───────────
      let candidats = tousCandidat.filter(c => !AppData.amenagementDuCandidat(c));
      if (!conserver) {
        candidats.forEach(c => { if (c.salleParEpreuve) delete c.salleParEpreuve[ep.id]; });
      } else {
        candidats = candidats.filter(c => !(c.salleParEpreuve || {})[ep.id]);
      }
      if (!candidats.length) return { aff, imp };

      const sorted = trierCandidats(candidats);

      const affSalle = affSalleGlobal || (() => {
        const m = {};
        sallesEp.forEach(s => { m[s.id] = new Set(); });
        AppData.candidats.forEach(c => {
          const sid = (c.salleParEpreuve || {})[ep.id];
          if (sid && m[sid]) m[sid].add(c.id);
        });
        return m;
      })();
      sallesEp.forEach(s => { if (!affSalle[s.id]) affSalle[s.id] = new Set(); });

      const cap = {};
      sallesEp.forEach(s => { cap[s.id] = Math.max(0, s.capacite - affSalle[s.id].size); });

      const choisir = (cand) => {
        const interdit = new Set();
        (groupeParCand[cand.id] || []).forEach(gid => {
          const g = AppData.getGroupeSeparation(gid);
          if (!g) return;
          g.candidatIds.forEach(coId => {
            if (coId === cand.id) return;
            sallesEp.forEach(s => { if (affSalle[s.id].has(coId)) interdit.add(s.id); });
          });
        });
        let cands = sallesEp.filter(s => cap[s.id] > 0 && !interdit.has(s.id));
        if (!cands.length) cands = sallesEp.filter(s => cap[s.id] > 0);
        if (!cands.length) return null;
        cands.sort(stratVal === 'remplir'
          ? (a, b) => affSalle[b.id].size - affSalle[a.id].size || a.id - b.id
          : (a, b) => affSalle[a.id].size - affSalle[b.id].size || a.id - b.id);
        return cands[0];
      };

      sorted.forEach(cand => {
        if ((cand.salleParEpreuve || {})[ep.id]) return;
        const salle = choisir(cand);
        if (!salle) { imp++; return; }
        if (!cand.salleParEpreuve) cand.salleParEpreuve = {};
        cand.salleParEpreuve[ep.id] = salle.id;
        affSalle[salle.id].add(cand.id);
        cap[salle.id]--;
        aff++;
      });
      return { aff, imp };
    };

    // ── Détermine les épreuves à traiter ───────────────────────────────
    const epreuves = epId != null
      ? AppData.epreuves.filter(e => e.id === epId)
      : AppData.epreuves;

    // ── Nettoyage global si !conserver et toutes épreuves ─────────────
    if (!conserver && epId == null) {
      AppData.candidats.forEach(c => {
        const am = AppData.amenagementDuCandidat(c);
        if (!(am && am.salleId)) c.salleParEpreuve = {};
      });
    }

    let totalAff = 0, totalImp = 0;

    if (epId != null) {
      // ── Mode épreuve unique ──────────────────────────────────────────
      const ep = epreuves[0];
      const sallesEp = AppData.sallesPourEpreuve(ep.id)
        .filter(s => s.type !== 'amenagee' && s.type !== 'secretariat');
      if (!sallesEp.length) { notifier('Aucune salle ordinaire disponible pour cette épreuve.', 'error'); return; }
      const { aff, imp } = affecterEpreuve(ep, sallesEp, null);
      totalAff += aff; totalImp += imp;

    } else {
      // ── Mode toutes épreuves : communes d'abord, puis spécialités ───
      const communesSalles = AppData.salles.filter(s => s.type !== 'amenagee' && s.type !== 'secretariat');

      // Contexte partagé pour toutes les épreuves communes
      const affSalleCommune = {};
      communesSalles.forEach(s => { affSalleCommune[s.id] = new Set(); });
      // Pré-charger les affectations existantes (épreuves communes) dans le contexte partagé
      const epsCommunes = epreuves.filter(ep => ep.typeAffectation !== 'specialite' || !ep.optionsLiees.length);
      AppData.candidats.forEach(c => {
        epsCommunes.forEach(ep => {
          const sid = (c.salleParEpreuve || {})[ep.id];
          if (sid && affSalleCommune[sid]) affSalleCommune[sid].add(c.id);
        });
      });

      // 1) Épreuves communes : affSalleCommune partagé → même salle pour tous
      epsCommunes.forEach(ep => {
        const sallesEp = AppData.sallesPourEpreuve(ep.id)
          .filter(s => s.type !== 'amenagee' && s.type !== 'secretariat');
        if (!sallesEp.length) { totalImp++; return; }
        const { aff, imp } = affecterEpreuve(ep, sallesEp, affSalleCommune);
        totalAff += aff; totalImp += imp;
      });

      // 2) Épreuves spécialité : contexte indépendant par épreuve
      const epsSpecialite = epreuves.filter(ep => ep.typeAffectation === 'specialite' && ep.optionsLiees.length);
      epsSpecialite.forEach(ep => {
        const sallesEp = AppData.sallesPourEpreuve(ep.id)
          .filter(s => s.type !== 'amenagee' && s.type !== 'secretariat');
        if (!sallesEp.length) { totalImp++; return; }
        const { aff, imp } = affecterEpreuve(ep, sallesEp, null);
        totalAff += aff; totalImp += imp;
      });
    }

    Unsaved.marquer();
    this._rendrePreview();

    if (totalImp > 0)
      notifier(`${totalAff} candidat(s) affecté(s). ⚠ ${totalImp} impossible(s) — capacité insuffisante ou séparation trop stricte.`, 'warning', 7000);
    else
      notifier(`✔ ${totalAff} affectation(s) réalisée(s).`, 'success');
  },

  _viderAffectation() {
    const epSelect = $('#aff-epreuve');
    const epId = epSelect && epSelect.value !== 'toutes' ? parseInt(epSelect.value, 10) : null;
    if (!confirm(epId
      ? 'Effacer toutes les affectations de salle pour l\'épreuve sélectionnée ?'
      : 'Effacer toutes les affectations de salle pour toutes les épreuves ?')) return;
    AppData.candidats.forEach(c => {
      if (!c.salleParEpreuve) return;
      if (epId != null) delete c.salleParEpreuve[epId];
      else c.salleParEpreuve = {};
    });
    Unsaved.marquer();
    this._rendrePreview();
    notifier('Affectations effacées.', 'warning');
  },

  // ────────────────────────────────────────────────────────────
  // SÉLECTEUR D'ÉPREUVE
  // ────────────────────────────────────────────────────────────

  _rendreAffectation() {
    const sel = $('#aff-epreuve');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="toutes">— Toutes les épreuves —</option>` +
      AppData.epreuves.map(ep =>
        `<option value="${ep.id}">${escHtml(AppData.formatDateCourt(ep.date))} — ${escHtml(ep.matiere)}</option>`
      ).join('');
    if (prev) sel.value = prev;
  },

  // ────────────────────────────────────────────────────────────
  // VUE KANBAN + ALERTES
  // ────────────────────────────────────────────────────────────

  /** Calcule toutes les alertes pour un état d'affectation donné.
   *  Renvoie { global: [{type,msg}], parSalle: { salleId: [{type,msg}] } }
   */
  _calculerAlertes(epId) {
    const alertesGlobal = [];
    const alertesSalle  = {};   // salleId → [{type, msg}]

    const salles = (epId != null ? AppData.sallesPourEpreuve(epId) : AppData.salles)
      .filter(s => s.type !== 'secretariat');

    salles.forEach(s => { alertesSalle[s.id] = []; });

    // Index groupes : candidatId → [groupeId]
    const groupeParCand = {};
    AppData.groupesSeparation.forEach(g => {
      if (g.candidatIds.length < 2) return;
      g.candidatIds.forEach(cid => {
        (groupeParCand[cid] = groupeParCand[cid] || []).push(g.id);
      });
    });

    salles.forEach(s => {
      const membres = AppData.candidats.filter(c => {
        const m = c.salleParEpreuve || {};
        return epId != null ? m[epId] === s.id : Object.values(m).includes(s.id);
      });

      // ① Surcharge
      if (s.capacite > 0 && membres.length > s.capacite) {
        alertesSalle[s.id].push({
          type: 'error',
          msg: `Surcharge : ${membres.length} élève(s) pour ${s.capacite} place(s).`,
        });
      }

      // ② Aménagement hors salle spécifiée
      membres.forEach(c => {
        const am = AppData.amenagementDuCandidat(c);
        if (am && am.salleId && am.salleId !== s.id) {
          const salleAm = AppData.getSalle(am.salleId);
          alertesSalle[s.id].push({
            type: 'error',
            msg: `${c.nom} ${c.prenom} est affecté(e) ici, mais son aménagement spécifie la salle « ${salleAm ? salleAm.nom : '?'} ».`,
          });
        }
        // Aménagement (sans salle fixée) placé dans une salle ordinaire → doit être en salle aménagée
        if (am && !am.salleId && s.type === 'ordinaire') {
          alertesSalle[s.id].push({
            type: 'error',
            msg: `${c.nom} ${c.prenom} a un aménagement et devrait être en salle aménagée (♿), pas en salle ordinaire.`,
          });
        }
      });

      // ③ Groupes de séparation violés
      const ids = new Set(membres.map(c => c.id));
      const signales = new Set();
      membres.forEach(c => {
        (groupeParCand[c.id] || []).forEach(gid => {
          const g = AppData.getGroupeSeparation(gid);
          if (!g) return;
          g.candidatIds.forEach(coId => {
            if (coId === c.id || !ids.has(coId)) return;
            const cle = [c.id, coId].sort().join('-');
            if (signales.has(cle)) return;
            signales.add(cle);
            const co = AppData.getCandidat(coId);
            alertesSalle[s.id].push({
              type: 'error',
              msg: `Séparation violée (groupe « ${escHtml(g.nom)} ») : ${c.nom} ${c.prenom} et ${co ? co.nom + ' ' + co.prenom : '?'} sont dans la même salle.`,
            });
          });
        });
      });
    });

    // Candidats sans affectation
    const sansSalle = AppData.candidats.filter(c => {
      if (epId != null && c.epreuveIds.length && !c.epreuveIds.includes(epId)) return false;
      const m = c.salleParEpreuve || {};
      return epId != null ? !m[epId] : Object.keys(m).length === 0;
    }).length;
    if (sansSalle > 0) {
      alertesGlobal.push({ type: 'warning', msg: `${sansSalle} candidat(s) sans salle affectée.` });
    }

    // Vérifier qu'il existe une salle aménagée si des candidats avec aménagement (sans salle fixée) existent
    const nbAmenSansSalle = AppData.candidats.filter(c => {
      if (epId != null && c.epreuveIds.length && !c.epreuveIds.includes(epId)) return false;
      const am = AppData.amenagementDuCandidat(c);
      return am && !am.salleId;
    }).length;
    if (nbAmenSansSalle > 0) {
      // Vérifier pour chaque épreuve concernée qu'une salle aménagée est disponible
      const epreuvesAVerifier = epId != null
        ? AppData.epreuves.filter(e => e.id === epId)
        : AppData.epreuves;
      epreuvesAVerifier.forEach(ep => {
        const sallesAm = AppData.sallesAmenageesPourEpreuve(ep);
        if (!sallesAm.length) {
          const label = ep.typeAffectation === 'specialite' && ep.optionsLiees.length
            ? `spécialité « ${ep.optionsLiees.join(', ')} »`
            : 'épreuves communes';
          alertesGlobal.push({
            type: 'error',
            msg: `Aucune salle aménagée (♿) pour les ${label} — épreuve : ${ep.matiere}.`,
          });
        }
      });
    }

    return { global: alertesGlobal, parSalle: alertesSalle };
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

    const alertes = this._calculerAlertes(epId);

    // Bandeau alertes globales
    const bandeauGlobal = alertes.global.length
      ? `<div class="aff-alertes-global">${alertes.global.map(a =>
          `<div class="aff-alerte aff-alerte-${a.type}">
            ${a.type === 'error' ? '🔴' : '⚠'} ${escHtml(a.msg)}
          </div>`).join('')}</div>`
      : '';

    // Stats globales
    const totalAffectes = AppData.candidats.filter(c => {
      const m = c.salleParEpreuve || {};
      return epId != null ? m[epId] != null : Object.keys(m).length > 0;
    }).length;
    const totalCandidats = epId != null
      ? AppData.candidatsPourEpreuve(AppData.getEpreuve(epId)).length
      : AppData.candidats.length;

    const nbErreurs  = Object.values(alertes.parSalle).flat().filter(a => a.type === 'error').length
                     + alertes.global.filter(a => a.type === 'error').length;
    const nbWarnings = Object.values(alertes.parSalle).flat().filter(a => a.type === 'warning').length
                     + alertes.global.filter(a => a.type === 'warning').length;

    const badgeAlertes = nbErreurs
      ? `<span class="aff-badge-err">🔴 ${nbErreurs} erreur(s)</span>`
      : nbWarnings ? `<span class="aff-badge-warn">⚠ ${nbWarnings} avertissement(s)</span>`
      : `<span class="aff-badge-ok">✔ Aucune alerte</span>`;

    // Cartes kanban par salle
    const cartes = salles.map(s => {
      const membres = AppData.candidats.filter(c => {
        const m = c.salleParEpreuve || {};
        return epId != null ? m[epId] === s.id : Object.values(m).includes(s.id);
      }).sort((a, b) =>
        (a.nom || '').localeCompare(b.nom || '', 'fr') ||
        (a.prenom || '').localeCompare(b.prenom || '', 'fr')
      );

      const errs = alertes.parSalle[s.id] || [];
      const aSurcharge = errs.some(a => a.type === 'error' && a.msg.startsWith('Surcharge'));
      const taux = s.capacite > 0 ? membres.length / s.capacite : 0;
      const couleurJauge = aSurcharge ? '#ef4444' : taux > 0.9 ? '#f59e0b' : '#0d9488';

      const badgeSalle = s.type === 'amenagee'
        ? '<span class="badge badge-tt" title="Salle aménagée">TT</span> '
        : '';
      const classes = [...new Set(membres.map(c => c.classe).filter(Boolean))].sort().join(', ');

      // Alertes de la salle
      const blocAlertes = errs.length
        ? `<div class="aff-salle-alertes">${errs.map(a =>
            `<div class="aff-alerte aff-alerte-${a.type} aff-alerte-sm">
              ${a.type === 'error' ? '🔴' : '⚠'} ${a.msg}
            </div>`).join('')}</div>`
        : '';

      // Chips draggables
      const epIdAttr = epId != null ? epId : (AppData.epreuves[0]?.id ?? '');
      const chips = membres.map(c => {
        const am = AppData.amenagementDuCandidat(c);
        const amBadge = am ? ' <span class="badge badge-tt" title="Aménagement">♿</span>' : '';
        const dnd = attrJson({ cand: c.id, salle: s.id, ep: epId });
        return `<div class="aff-eleve-chip aff-eleve-draggable" draggable="true"
            data-aff-dnd="${dnd}" title="Glisser pour changer de salle">
            <span class="aff-chip-grip">⠿</span>
            <span class="aff-chip-nom">${escHtml(c.nom)} <strong>${escHtml(c.prenom)}</strong></span>
            ${c.classe ? `<span class="aff-chip-classe">${escHtml(c.classe)}</span>` : ''}
            ${amBadge}
            <button class="aff-chip-del" data-aff-retirer="${attrJson({ cand: c.id, ep: epId })}"
              title="Retirer de cette salle">✕</button>
          </div>`;
      }).join('');

      const dropZoneClass = `aff-drop-zone${errs.length ? (errs.some(a=>a.type==='error') ? ' aff-drop-has-error' : ' aff-drop-has-warn') : ''}`;

      return `
        <div class="aff-salle-card ${errs.some(a=>a.type==='error') ? 'aff-card-error' : errs.length ? 'aff-card-warn' : ''}">
          <div class="aff-salle-header">
            <span class="aff-salle-nom">${badgeSalle}${escHtml(s.nom)}</span>
            <span class="aff-salle-count ${aSurcharge ? 'aff-count-error' : ''}">${membres.length} / ${s.capacite || '?'}</span>
            ${classes ? `<span class="aff-salle-classes">${escHtml(classes)}</span>` : ''}
          </div>
          ${s.capacite > 0 ? `<div class="aff-jauge-wrap"><div class="aff-jauge-bar" style="width:${Math.min(100,Math.round(taux*100))}%;background:${couleurJauge}"></div></div>` : ''}
          ${blocAlertes}
          <div class="${dropZoneClass}" data-aff-drop="${attrJson({ salle: s.id, ep: epId })}">
            ${chips || `<span class="aff-vide">Déposez un élève ici</span>`}
          </div>
        </div>`;
    });

    // Zone "non affectés" (drop cible pour retirer)
    const nonAffectes = AppData.candidats.filter(c => {
      if (epId != null && c.epreuveIds.length && !c.epreuveIds.includes(epId)) return false;
      const am = AppData.amenagementDuCandidat(c);
      if (am && am.salleId) return false; // aménagés avec salle fixée : colonne à part
      const m = c.salleParEpreuve || {};
      return epId != null ? !m[epId] : Object.keys(m).length === 0;
    }).sort((a,b) => (a.nom||'').localeCompare(b.nom||'','fr'));

    const chipsNonAff = nonAffectes.map(c => {
      const am = AppData.amenagementDuCandidat(c);
      const amBadge = am ? ' <span class="badge badge-tt" title="Aménagement">♿</span>' : '';
      const dnd = attrJson({ cand: c.id, salle: null, ep: epId });
      return `<div class="aff-eleve-chip aff-eleve-draggable" draggable="true"
          data-aff-dnd="${dnd}" title="Glisser pour affecter dans une salle">
          <span class="aff-chip-grip">⠿</span>
          <span class="aff-chip-nom">${escHtml(c.nom)} <strong>${escHtml(c.prenom)}</strong></span>
          ${c.classe ? `<span class="aff-chip-classe">${escHtml(c.classe)}</span>` : ''}
          ${amBadge}
        </div>`;
    }).join('');

    // Badge type épreuve
    const epTypeInfo = epId != null ? (() => {
      const ep = AppData.getEpreuve(epId);
      if (!ep) return '';
      const isSpec = ep.typeAffectation === 'specialite' && ep.optionsLiees && ep.optionsLiees.length;
      return isSpec
        ? `<span class="stat-item" style="color:#1d4ed8">🎓 Spécialité : ${escHtml(ep.optionsLiees.join(', '))}</span>`
        : `<span class="stat-item" style="color:#166534">👥 Épreuve commune</span>`;
    })() : '';

    zone.innerHTML = `
      <div class="aff-stats">
        <span class="stat-item">🎓 ${totalAffectes} / ${totalCandidats} candidat(s) affecté(s)</span>
        <span class="stat-item">🚪 ${salles.length} salle(s)</span>
        ${epTypeInfo}
        ${badgeAlertes}
      </div>
      ${bandeauGlobal}
      <div class="aff-kanban">
        ${nonAffectes.length ? `
          <div class="aff-salle-card aff-card-nonaffectes">
            <div class="aff-salle-header">
              <span class="aff-salle-nom">📋 Non affectés</span>
              <span class="aff-salle-count aff-count-warn">${nonAffectes.length}</span>
            </div>
            <div class="aff-drop-zone" data-aff-drop="${attrJson({ salle: null, ep: epId })}">
              ${chipsNonAff || '<span class="aff-vide">Aucun élève en attente</span>'}
            </div>
          </div>` : ''}
        ${cartes.join('')}
      </div>`;
  },

  // ────────────────────────────────────────────────────────────
  // DRAG & DROP
  // ────────────────────────────────────────────────────────────

  _initDnD() {
    if (this._dndPret) return;
    this._dndPret = true;

    document.addEventListener('dragstart', e => {
      const chip = e.target.closest('[data-aff-dnd]');
      if (!chip) return;
      this._dndData = JSON.parse(chip.dataset.affDnd.replace(/&quot;/g, '"'));
      chip.classList.add('aff-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', chip.dataset.affDnd);
    });

    document.addEventListener('dragend', e => {
      const chip = e.target.closest('[data-aff-dnd]');
      if (chip) chip.classList.remove('aff-dragging');
      $$('.aff-drop-zone.aff-drag-over').forEach(el => el.classList.remove('aff-drag-over'));
      this._dndData = null;
    });

    document.addEventListener('dragover', e => {
      if (!this._dndData) return;
      const zone = e.target.closest('[data-aff-drop]');
      if (!zone) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      $$('.aff-drop-zone.aff-drag-over').forEach(el => el.classList.remove('aff-drag-over'));
      zone.classList.add('aff-drag-over');
    });

    document.addEventListener('dragleave', e => {
      const zone = e.target.closest('[data-aff-drop]');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('aff-drag-over');
    });

    document.addEventListener('drop', e => {
      if (!this._dndData) return;
      const zone = e.target.closest('[data-aff-drop]');
      if (!zone) return;
      e.preventDefault();
      $$('.aff-drop-zone.aff-drag-over').forEach(el => el.classList.remove('aff-drag-over'));

      const src  = this._dndData;
      this._dndData = null;
      const dst  = JSON.parse(zone.dataset.affDrop.replace(/&quot;/g, '"'));

      // Même salle → rien
      if (src.salle === dst.salle) return;

      this._deplacerCandidat(src.cand, src.salle, dst.salle, dst.ep);
    });

    // Bouton "retirer" (×) sur une chip
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-aff-retirer]');
      if (!btn) return;
      const data = JSON.parse(btn.dataset.affRetirer.replace(/&quot;/g, '"'));
      this._deplacerCandidat(data.cand, null, null, data.ep);  // null→null = désaffecter
    });
  },

  /** Déplace le candidat `candId` de `srcSalleId` vers `dstSalleId` pour l'épreuve `epId`.
   *  dstSalleId = null → désaffecter.
   *  Vérifie les contraintes et affiche les alertes inline sans bloquer.
   */
  _deplacerCandidat(candId, srcSalleId, dstSalleId, epId) {
    const c = AppData.getCandidat(candId);
    if (!c) return;
    if (!c.salleParEpreuve) c.salleParEpreuve = {};

    // Résoudre l'épreuve : si epId est null (mode "toutes"), utiliser la première épreuve concernée
    const resoudreEp = () => {
      if (epId != null) return [epId];
      return AppData.epreuves
        .filter(ep => !c.epreuveIds.length || c.epreuveIds.includes(ep.id))
        .map(ep => ep.id);
    };
    const epreuves = resoudreEp();

    if (dstSalleId === null) {
      // Désaffecter
      epreuves.forEach(eid => { delete c.salleParEpreuve[eid]; });
      Unsaved.marquer();
      this._rendrePreview();
      return;
    }

    const dstSalle = AppData.getSalle(dstSalleId);
    if (!dstSalle) return;

    // Vérifications préventives (non bloquantes : on déplace quand même, mais on alerte)
    const avertissements = [];

    epreuves.forEach(eid => {
      // Surcharge
      const deja = AppData.candidats.filter(x => {
        const m = x.salleParEpreuve || {};
        return m[eid] === dstSalleId && x.id !== candId;
      }).length;
      if (dstSalle.capacite > 0 && deja >= dstSalle.capacite) {
        avertissements.push(`⚠ La salle « ${dstSalle.nom} » sera en surcharge (${deja + 1}/${dstSalle.capacite}).`);
      }

      // Séparation
      const groupeParCand = {};
      AppData.groupesSeparation.forEach(g => {
        if (g.candidatIds.length < 2) return;
        g.candidatIds.forEach(id => {
          (groupeParCand[id] = groupeParCand[id] || []).push(g.id);
        });
      });
      (groupeParCand[candId] || []).forEach(gid => {
        const g = AppData.getGroupeSeparation(gid);
        if (!g) return;
        g.candidatIds.forEach(coId => {
          if (coId === candId) return;
          const co = AppData.getCandidat(coId);
          if (co && (co.salleParEpreuve || {})[eid] === dstSalleId) {
            avertissements.push(`⚠ Séparation violée (groupe « ${g.nom} ») : ${co.nom} ${co.prenom} est déjà dans cette salle.`);
          }
        });
      });

      // Aménagement hors salle spécifiée
      const am = AppData.amenagementDuCandidat(c);
      if (am && am.salleId && am.salleId !== dstSalleId) {
        const sa = AppData.getSalle(am.salleId);
        avertissements.push(`⚠ L'aménagement de ${c.nom} ${c.prenom} spécifie la salle « ${sa ? sa.nom : '?'} ».`);
      }

      c.salleParEpreuve[eid] = dstSalleId;
    });

    Unsaved.marquer();
    this._rendrePreview();

    if (avertissements.length) {
      notifier(avertissements.join('\n'), 'warning', 6000);
    }
  },
};

window.Affectation = Affectation;
