/**
 * repartition.js — Moteur de répartition équilibrée + ajustement manuel + drag & drop + équité
 * Orga Examens — v1.1
 *
 * Organisation du module :
 *   1. Secrétariat d'examen : affectation 100 % MANUELLE, à faire en premier
 *      (l'algorithme n'y touche jamais : il considère ces personnels comme mobilisés).
 *   2. Surveillance + Réserve : affectation automatique équilibrée.
 *      Les postes de réserve (params.nbReserves par épreuve) sont pourvus
 *      au même titre que les postes de surveillance et pèsent dans la charge.
 *
 * Algorithme glouton équilibré :
 *   Pour chaque épreuve (ordre chronologique), pour chaque salle non-secrétariat,
 *   puis pour la réserve, pourvoir les postes en choisissant le surveillant :
 *     1. disponible sur l'épreuve,
 *     2. non déjà mobilisé sur cette épreuve (salle, secrétariat ou réserve),
 *     3. sous son quota éventuel,
 *     4. de charge cumulée (minutes) minimale — puis créneaux, puis alphabétique.
 *   Salles aménagées : durée tiers temps (×4/3). Réserve : durée de l'épreuve.
 *
 * Drag & drop (module DnD, partagé avec le Récapitulatif) :
 *   chips [data-dnd] déplaçables vers les zones [data-drop] (salle ou réserve).
 *   Déposer sur une autre chip = échange des deux surveillants (dispos validées).
 */

'use strict';

const Repartition = {

  init() {
    $('#btn-lancer-repartition').addEventListener('click', () => this.lancer());
    $('#btn-vider-repartition').addEventListener('click', () => this.vider());
    $('#opt-nb-reserves').addEventListener('change', () => {
      AppData.params.nbReserves = Math.max(0, parseInt($('#opt-nb-reserves').value, 10) || 0);
      Unsaved.marquer();
      this.rendre();
    });
    DnD.init();
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
    if (!conserver) {
      // On préserve TOUJOURS le secrétariat (affecté à la main) et les affectations
      // VERROUILLÉES (📌) ; tout le reste est vidé avant la nouvelle passe.
      const secrIds = AppData.salles.filter(s => s.type === 'secretariat').map(s => s.id);
      Object.keys(AppData.affectations).forEach(epId => {
        Object.keys(AppData.affectations[epId]).forEach(sid => {
          if (secrIds.includes(parseInt(sid, 10))) return;
          AppData.affectations[epId][sid] =
            AppData.affectations[epId][sid].filter(survId => AppData.estVerrouille(epId, sid, survId));
        });
      });
      Object.keys(AppData.reserves).forEach(epId => {
        AppData.reserves[epId] = AppData.reserves[epId].filter(survId => AppData.estVerrouille(epId, null, survId));
      });
    }

    // Charge simulée pendant la passe (inclut secrétariat et réserve déjà en place)
    const charge = {};
    AppData.surveillants.forEach(s => {
      const c = AppData.chargeSurveillant(s.id);
      charge[s.id] = { minutes: c.minutes, creneaux: c.creneaux };
    });

    let pourvus = 0, manquants = 0;

    /**
     * Choix pondéré par la quotité hebdomadaire :
     * on minimise minutes / heuresHebdo (référence 18 h si non renseigné).
     * Ainsi un 18 h surveille 2× plus qu'un 9 h — mais tous les postes
     * sont pourvus tant qu'il reste un candidat (le ratio n'est jamais bloquant).
     */
    const poids = (s) => s.heuresHebdo > 0 ? s.heuresHebdo : 18;
    const ratio = (s) => charge[s.id].minutes / poids(s);
    const choisir = (ep) => {
      const candidats = AppData.surveillants.filter(s =>
        s.dispos[ep.id] &&
        !AppData.estMobiliseEpreuve(ep.id, s.id) &&
        (!s.quotaMax || charge[s.id].creneaux < s.quotaMax));
      if (!candidats.length) return null;
      candidats.sort((a, b) =>
        ratio(a) - ratio(b) ||
        charge[a.id].creneaux - charge[b.id].creneaux ||
        (a.nom + a.prenom).localeCompare(b.nom + b.prenom, 'fr'));
      return candidats[0];
    };

    AppData.epreuves.forEach(ep => {
      // 1) Salles de surveillance (le secrétariat est exclu : affectation manuelle)
      AppData.sallesPourEpreuve(ep.id).filter(s => s.type !== 'secretariat').forEach(salle => {
        const duree = AppData.dureeCreneau(ep, salle);
        let besoin = salle.nbSurveillants - AppData.getAffectes(ep.id, salle.id).length;
        while (besoin > 0) {
          const elu = choisir(ep);
          if (!elu) { manquants += besoin; break; }
          AppData.affecter(ep.id, salle.id, elu.id);
          charge[elu.id].minutes += duree;
          charge[elu.id].creneaux++;
          pourvus++; besoin--;
        }
      });

      // 2) Réserve : pourvue comme les autres postes
      let besoinRes = (AppData.params.nbReserves || 0) - AppData.getReserve(ep.id).length;
      while (besoinRes > 0) {
        const elu = choisir(ep);
        if (!elu) { manquants += besoinRes; break; }
        AppData.mettreEnReserve(ep.id, elu.id);
        charge[elu.id].minutes += ep.duree;
        charge[elu.id].creneaux++;
        pourvus++; besoinRes--;
      }
    });

    Unsaved.marquer();
    this.rendre();
    if (manquants)
      notifier(`Répartition terminée : ${pourvus} poste(s) pourvu(s), <strong>${manquants} poste(s) non pourvu(s)</strong> (disponibilités ou quotas insuffisants). Le secrétariat et les affectations figées 📌 ont été préservés.`, 'warning', 9000);
    else
      notifier(`Répartition terminée : ${pourvus} poste(s) pourvu(s) — surveillance et réserve équilibrées. Le secrétariat et les affectations figées 📌 ont été préservés.`);
  },

  vider() {
    AppData.affectations = {};
    AppData.reserves = {};
    AppData.verrous = {};
    Unsaved.marquer();
    this.rendre();
    notifier('Toutes les affectations ont été effacées (secrétariat et verrous compris).', 'info');
  },

  // ────────────────────────────────────────────────────────────
  // RENDU
  // ────────────────────────────────────────────────────────────

  rendre() {
    $('#opt-nb-reserves').value = AppData.params.nbReserves || 0;
    this._rendreStats();
    this._rendreSecretariat();
    this._rendreGrille();
    this._rendreEquite();
  },

  _postesTotaux() {
    let total = 0, pourvus = 0;
    AppData.epreuves.forEach(ep => {
      AppData.sallesPourEpreuve(ep.id).forEach(salle => {
        total += salle.nbSurveillants;
        pourvus += Math.min(AppData.getAffectes(ep.id, salle.id).length, salle.nbSurveillants);
      });
      total += AppData.params.nbReserves || 0;
      pourvus += Math.min(AppData.getReserve(ep.id).length, AppData.params.nbReserves || 0);
    });
    return { total, pourvus };
  },

  _rendreStats() {
    const { total, pourvus } = this._postesTotaux();
    const taux = total ? Math.round(pourvus / total * 100) : 0;
    $('#stats-repartition').innerHTML = `
      <span class="stat-item">📌 ${total} poste(s) — surveillance, secrétariat et réserve</span>
      <span class="stat-item ${pourvus < total ? 'stat-warn' : ''}">✅ ${pourvus} pourvu(s) (${taux} %)</span>
      <span class="stat-item">👥 ${AppData.surveillants.length} surveillant(s)</span>`;
  },

  // ── 1. Secrétariat d'examen (manuel) ─────────────────────────

  _rendreSecretariat() {
    const zone = $('#zone-secretariat');
    const sallesSecr = AppData.salles.filter(s => s.type === 'secretariat');
    if (!sallesSecr.length || !AppData.epreuves.length) { zone.innerHTML = ''; return; }

    let html = `<div class="calc-panel">
      <div class="calc-titre">🗂 1. Secrétariat d\u2019examen — affectation manuelle</div>
      <div class="calc-desc">À pourvoir <strong>avant</strong> de lancer la répartition automatique :
        les personnels placés ici sont considérés comme mobilisés et ne seront pas affectés en surveillance.
        L\u2019algorithme ne modifie jamais ces affectations.</div>
      <table class="affec-table">
        <thead><tr><th style="width:190px">Épreuve</th><th style="width:160px">Salle</th><th>Personnels affectés</th><th style="width:230px">Ajouter</th></tr></thead>
        <tbody>`;

    AppData.epreuves.forEach(ep => {
      const salles = sallesSecr.filter(s => !s.epreuveIds.length || s.epreuveIds.includes(ep.id));
      salles.forEach((salle, i) => {
        html += `<tr>
          ${i === 0 ? `<td rowspan="${salles.length}"><strong>${escHtml(ep.matiere)}</strong>
            <small style="display:block;color:var(--gray-500)">${escHtml(AppData.formatDateCourt(ep.date))} · ${ep.heureDebut}</small></td>` : ''}
          <td><strong>${escHtml(salle.nom)}</strong> <span class="badge badge-secr">Secrétariat</span>
            <small style="display:block;color:var(--gray-500)">${salle.nbSurveillants} requis</small></td>
          <td class="dnd-zone" data-drop='${JSON.stringify({ ep: ep.id, salle: salle.id })}'>
            ${this._chips(ep, salle.id)}
            ${this._badgeManque(salle.nbSurveillants - AppData.getAffectes(ep.id, salle.id).length)}
          </td>
          <td>${this._selectAjout(ep, { salle: salle.id })}</td>
        </tr>`;
      });
    });

    html += '</tbody></table></div>';
    zone.innerHTML = html;
    this._brancherActions(zone);
  },

  // ── 2. Surveillance + réserve ────────────────────────────────

  _rendreGrille() {
    const zone = $('#zone-repartition');

    if (!AppData.epreuves.length) {
      zone.innerHTML = '<div class="placeholder-zone">Définissez les <strong>épreuves</strong> puis les <strong>salles</strong> pour préparer la répartition.</div>';
      return;
    }

    zone.innerHTML = AppData.epreuves.map(ep => {
      const salles = AppData.sallesPourEpreuve(ep.id).filter(s => s.type !== 'secretariat');
      const nbRes = AppData.params.nbReserves || 0;

      let lignes = salles.map(salle => this._ligneSalle(ep, salle)).join('');
      if (!salles.length)
        lignes = '<tr><td colspan="3" class="table-empty">Aucune salle de surveillance associée à cette épreuve.</td></tr>';

      // Ligne réserve
      const enReserve = AppData.getReserve(ep.id);
      lignes += `
        <tr class="row-reserve">
          <td><strong>🛟 Réserve</strong>
            <small style="display:block;color:var(--gray-500)">${nbRes} souhaité(s) · ${AppData.formatDuree(ep.duree)}</small></td>
          <td class="dnd-zone" data-drop='${JSON.stringify({ ep: ep.id, reserve: true })}'>
            ${this._chips(ep, null, enReserve)}
            ${this._badgeManque(nbRes - enReserve.length)}
          </td>
          <td>${this._selectAjout(ep, { reserve: true })}</td>
        </tr>`;

      const pourvusEp = salles.reduce((a, s) => a + AppData.getAffectes(ep.id, s.id).length, 0) + enReserve.length;
      const totalEp = salles.reduce((a, s) => a + s.nbSurveillants, 0) + nbRes;

      return `
        <div class="jury-card">
          <div class="jury-card-header">
            <div class="jury-card-title">
              <strong>${escHtml(ep.matiere)}</strong>
              <span class="jury-card-salle">${escHtml(AppData.formatDate(ep.date))} · ${ep.heureDebut}–${AppData.heureFin(ep)} (tiers temps → ${AppData.heureFinTT(ep)})</span>
            </div>
            <div class="jury-card-meta">
              <span class="jury-card-count">${pourvusEp} / ${totalEp} postes</span>
            </div>
          </div>
          <table class="affec-table">
            <thead><tr><th style="width:170px">Salle</th><th>Surveillants affectés <small style="font-weight:400">(glisser-déposer pour déplacer ou échanger)</small></th><th style="width:230px">Ajouter</th></tr></thead>
            <tbody>${lignes}</tbody>
          </table>
        </div>`;
    }).join('');

    this._brancherActions(zone);
  },

  _ligneSalle(ep, salle) {
    const affectes = AppData.getAffectes(ep.id, salle.id);
    const manque = salle.nbSurveillants - affectes.length;
    const duree = AppData.dureeCreneau(ep, salle);

    return `
      <tr>
        <td>
          <strong>${escHtml(salle.nom)}</strong>
          ${salle.type === 'amenagee' ? '<span class="badge badge-tt">♿ TT</span>' : ''}
          <small style="display:block;color:var(--gray-500)">${salle.nbSurveillants} requis · ${AppData.formatDuree(duree)}</small>
        </td>
        <td class="dnd-zone" data-drop='${JSON.stringify({ ep: ep.id, salle: salle.id })}'>
          ${this._chips(ep, salle.id)}
          ${this._badgeManque(manque)}
        </td>
        <td>${this._selectAjout(ep, { salle: salle.id })}</td>
      </tr>`;
  },

  // ── Briques communes (chips draggables, selects, badges) ─────

  _chips(ep, salleId, listeIds) {
    const enReserve = salleId === null || salleId === undefined;
    const ids = listeIds || AppData.getAffectes(ep.id, salleId);
    return ids.map(id => {
      const s = AppData.getSurveillant(id);
      if (!s) return '';
      const verrou = AppData.estVerrouille(ep.id, enReserve ? null : salleId, id);
      const dnd = JSON.stringify(enReserve
        ? { ep: ep.id, reserve: true, surv: id }
        : { ep: ep.id, salle: salleId, surv: id });
      return `<span class="surv-chip ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}"
        ${verrou ? '' : `data-dnd='${dnd}'`} title="${verrou ? 'Affectation figée — l\u2019algorithme la préserve' : 'Glisser pour déplacer ou échanger'}">
        ${verrou ? '📌 ' : ''}${escHtml(s.nom)} ${escHtml(s.prenom)}
        <button class="chip-lock" data-lock='${dnd}' title="${verrou ? 'Libérer cette affectation' : 'Figer : préservée si vous relancez la répartition'}">${verrou ? '🔓' : '📌'}</button>
        <button data-remove='${dnd}' title="Retirer">✕</button></span>`;
    }).join('') || '<span class="calc-attente">Personne</span>';
  },

  _badgeManque(n) {
    return n > 0 ? `<span class="badge badge-prio">${n} manquant(s)</span>` : '';
  },

  _selectAjout(ep, cible) {
    const disponibles = AppData.surveillants.filter(s =>
      s.dispos[ep.id] && !AppData.estMobiliseEpreuve(ep.id, s.id));
    const options = disponibles.length
      ? '<option value="">+ Affecter…</option>' + disponibles.map(s => {
          const c = AppData.chargeSurveillant(s.id);
          return `<option value="${s.id}">${escHtml(s.nom)} ${escHtml(s.prenom)} (${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)})</option>`;
        }).join('')
      : '<option value="">Aucun surveillant disponible</option>';
    return `<select class="select-add" data-add='${JSON.stringify({ ep: ep.id, ...cible })}' ${!disponibles.length ? 'disabled' : ''}>${options}</select>`;
  },

  _brancherActions(zone) {
    zone.querySelectorAll('[data-lock]').forEach(btn =>
      btn.addEventListener('click', () => {
        const d = JSON.parse(btn.dataset.lock);
        const fige = AppData.basculerVerrou(d.ep, d.reserve ? null : d.salle, d.surv);
        Unsaved.marquer();
        DnD.toutRafraichir();
        const s = AppData.getSurveillant(d.surv);
        notifier(fige
          ? `📌 ${escHtml(s ? s.nom + ' ' + s.prenom : '')} : affectation figée — préservée lors des prochaines répartitions.`
          : `🔓 ${escHtml(s ? s.nom + ' ' + s.prenom : '')} : affectation libérée.`, 'info');
      }));

    zone.querySelectorAll('[data-remove]').forEach(btn =>
      btn.addEventListener('click', () => {
        const d = JSON.parse(btn.dataset.remove);
        if (d.reserve) AppData.retirerReserve(d.ep, d.surv);
        else AppData.desaffecter(d.ep, d.salle, d.surv);
        Unsaved.marquer();
        DnD.toutRafraichir();
      }));

    zone.querySelectorAll('select[data-add]').forEach(sel =>
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        const d = JSON.parse(sel.dataset.add);
        const survId = parseInt(sel.value, 10);
        if (d.reserve) AppData.mettreEnReserve(d.ep, survId);
        else AppData.affecter(d.ep, d.salle, survId);
        Unsaved.marquer();
        DnD.toutRafraichir();
      }));
  },

  // ────────────────────────────────────────────────────────────
  // PANNEAU ÉQUITÉ
  // ────────────────────────────────────────────────────────────

  _rendreEquite() {
    const zone = $('#zone-equite');
    if (!AppData.surveillants.length) { zone.innerHTML = ''; return; }

    const charges = AppData.surveillants.map(s => {
      const c = AppData.chargeSurveillant(s.id);
      const poids = s.heuresHebdo > 0 ? s.heuresHebdo : 18;
      return { s, ...c, poids, pondere: c.minutes * 18 / poids };  // ramené à l'équivalent 18 h
    });
    const maxMin = Math.max(1, ...charges.map(c => c.pondere));
    const actifs = charges.filter(c => c.creneaux > 0);
    const moyenne = actifs.length ? actifs.reduce((a, c) => a + c.minutes, 0) / actifs.length : 0;
    const ecart = actifs.length
      ? Math.sqrt(actifs.reduce((a, c) => a + Math.pow(c.pondere - (actifs.reduce((x, y) => x + y.pondere, 0) / actifs.length), 2), 0) / actifs.length) : 0;

    zone.innerHTML = `
      <div class="calc-panel">
        <div class="calc-titre">⚖ Équité de la répartition <small style="font-weight:400">(surveillance + secrétariat + réserve, pondérée par la quotité hebdomadaire)</small></div>
        <div class="calc-desc">Charge moyenne : <strong>${AppData.formatDuree(Math.round(moyenne))}</strong>
          · Écart-type pondéré : <strong>${Math.round(ecart)} min éq. 18 h</strong>
          · ${charges.filter(c => !c.creneaux).length} surveillant(s) sans créneau
          — les barres représentent la charge <strong>ramenée à 18 h/sem</strong> : à barres égales, répartition équitable.</div>
        <div class="equite-grid">
          ${charges.sort((a, b) => b.pondere - a.pondere).map(c => `
            <div class="equite-row">
              <span class="equite-nom">${escHtml(c.s.nom)} ${escHtml(c.s.prenom)}<span class="dispo-count"> ${c.s.heuresHebdo ? c.s.heuresHebdo + ' h/sem' : ''}</span></span>
              <span class="equite-bar-wrap"><span class="equite-bar" style="width:${Math.round(c.pondere / maxMin * 100)}%"></span></span>
              <span class="equite-val">${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  },
};
window.Repartition = Repartition;

// ══════════════════════════════════════════════════════════════
// DnD — glisser-déposer des surveillants (Répartition & Récap)
//   chip [data-dnd]  →  zone [data-drop]  : déplacement
//   chip [data-dnd]  →  autre chip        : échange
// ══════════════════════════════════════════════════════════════

const DnD = {

  _origine: null,

  init() {
    if (this._pret) return;
    this._pret = true;

    document.addEventListener('dragstart', (e) => {
      const chip = e.target.closest('[data-dnd]');
      if (!chip) return;
      this._origine = JSON.parse(chip.dataset.dnd);
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', chip.dataset.dnd);
    });

    document.addEventListener('dragend', (e) => {
      const chip = e.target.closest('[data-dnd]');
      if (chip) chip.classList.remove('dragging');
      $$('.drag-over').forEach(el => el.classList.remove('drag-over'));
      this._origine = null;
    });

    document.addEventListener('dragover', (e) => {
      if (!this._origine) return;
      const cible = e.target.closest('[data-dnd], [data-drop]');
      if (!cible) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      $$('.drag-over').forEach(el => el.classList.remove('drag-over'));
      cible.classList.add('drag-over');
    });

    document.addEventListener('drop', (e) => {
      if (!this._origine) return;
      const src = this._origine;
      this._origine = null;
      $$('.drag-over').forEach(el => el.classList.remove('drag-over'));

      const chipCible = e.target.closest('[data-dnd]');
      const zoneCible = e.target.closest('[data-drop]');
      if (!chipCible && !zoneCible) return;
      e.preventDefault();

      if (chipCible) {
        const dst = JSON.parse(chipCible.dataset.dnd);
        if (dst.surv === src.surv && dst.ep === src.ep) return;
        this._echanger(src, dst);
      } else {
        this._deplacer(src, JSON.parse(zoneCible.dataset.drop));
      }
    });
  },

  _retirer(p)  { p.reserve ? AppData.retirerReserve(p.ep, p.surv) : AppData.desaffecter(p.ep, p.salle, p.surv); },
  _placer(p, survId) { p.reserve ? AppData.mettreEnReserve(p.ep, survId) : AppData.affecter(p.ep, p.salle, survId); },
  _nom(id) { const s = AppData.getSurveillant(id); return s ? `${s.nom} ${s.prenom}` : '?'; },

  /** Déplacement d'un surveillant vers une autre zone (salle ou réserve) */
  _deplacer(src, dst) {
    if (src.ep === dst.ep && !dst.reserve === !src.reserve && dst.salle === src.salle) return; // même zone

    const s = AppData.getSurveillant(src.surv);
    if (!s) return;
    if (!s.dispos[dst.ep]) {
      notifier(`${escHtml(this._nom(src.surv))} n\u2019est pas disponible sur cette épreuve.`, 'error');
      return;
    }
    this._retirer(src);
    if (AppData.estMobiliseEpreuve(dst.ep, src.surv)) {
      this._placer(src, src.surv);  // restaurer
      notifier(`${escHtml(this._nom(src.surv))} est déjà mobilisé(e) sur cette épreuve.`, 'error');
      return;
    }
    this._placer(dst, src.surv);
    Unsaved.marquer();
    this.toutRafraichir();
  },

  /** Échange de deux surveillants (zones quelconques, dispos validées) */
  _echanger(a, b) {
    const sa = AppData.getSurveillant(a.surv), sb = AppData.getSurveillant(b.surv);
    if (!sa || !sb) return;
    if (!sa.dispos[b.ep]) { notifier(`${escHtml(this._nom(a.surv))} n\u2019est pas disponible sur l\u2019épreuve cible.`, 'error'); return; }
    if (!sb.dispos[a.ep]) { notifier(`${escHtml(this._nom(b.surv))} n\u2019est pas disponible sur l\u2019épreuve cible.`, 'error'); return; }

    this._retirer(a);
    this._retirer(b);
    const conflitA = AppData.estMobiliseEpreuve(b.ep, a.surv);
    const conflitB = AppData.estMobiliseEpreuve(a.ep, b.surv);
    if (conflitA || conflitB) {
      this._placer(a, a.surv); this._placer(b, b.surv);  // restaurer
      notifier(`Échange impossible : ${escHtml(this._nom(conflitA ? a.surv : b.surv))} est déjà mobilisé(e) sur l\u2019épreuve cible.`, 'error');
      return;
    }
    this._placer(b, a.surv);
    this._placer(a, b.surv);
    Unsaved.marquer();
    notifier(`Échange effectué : ${escHtml(this._nom(a.surv))} ⇄ ${escHtml(this._nom(b.surv))}.`);
    this.toutRafraichir();
  },

  /** Rafraîchit les deux modules concernés */
  toutRafraichir() {
    if (window.Repartition) Repartition.rendre();
    if (window.Recap) Recap.rendre();
  },
};
window.DnD = DnD;
