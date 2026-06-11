/**
 * recap.js — Tableau de bord récapitulatif : indicateurs, alertes, planning général
 * Orga Examens — v1.0
 */

'use strict';

const Recap = {

  vue: 'epreuves',   // epreuves | salles | surveillants

  init() {
    $$('#recap-vues .vue-btn').forEach(b =>
      b.addEventListener('click', () => {
        this.vue = b.dataset.vue;
        $$('#recap-vues .vue-btn').forEach(x => x.classList.toggle('active', x === b));
        this._rendreVue();
      }));
  },

  rendre() {
    this._rendreCartes();
    this._rendreAlertes();
    this._rendreVue();
  },

  _rendreVue() {
    if (this.vue === 'salles')            this._rendreParSalle();
    else if (this.vue === 'surveillants') this._rendreParSurveillant();
    else if (this.vue === 'reserve')      this._rendreReserve();
    else                                  this._rendrePlanning();
  },

  // ── Indicateurs ──────────────────────────────────────────────

  _rendreCartes() {
    const { total, pourvus } = Repartition._postesTotaux();
    const taux = total ? Math.round(pourvus / total * 100) : 0;
    const totCand = AppData.salles.reduce((a, s) => a + (s.type !== 'secretariat' ? s.candidats : 0), 0);

    $('#recap-cartes').innerHTML = `
      <div class="calc-card calc-card-primary"><div class="calc-value">${AppData.epreuves.length}</div><div class="calc-label">Épreuves</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.jours().length}</div><div class="calc-label">Jours d\u2019examen</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.salles.length}</div><div class="calc-label">Salles</div></div>
      <div class="calc-card"><div class="calc-value">${totCand}</div><div class="calc-label">Candidats répartis</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.amenagements.length}</div><div class="calc-label">Aménagements</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.surveillants.length}</div><div class="calc-label">Surveillants</div></div>
      <div class="calc-card ${taux < 100 ? '' : 'calc-card-primary'}"><div class="calc-value">${taux} %</div><div class="calc-label">Postes pourvus (${pourvus}/${total})</div></div>`;
  },

  // ── Alertes de pilotage ──────────────────────────────────────

  _rendreAlertes() {
    const alertes = [];

    if (!AppData.params.etablissement)
      alertes.push({ t: 'warning', m: 'Le nom de l\u2019établissement n\u2019est pas renseigné (Paramètres).' });

    if (!AppData.epreuves.length)
      alertes.push({ t: 'error', m: 'Aucune épreuve définie.' });

    // Postes non pourvus par épreuve
    AppData.epreuves.forEach(ep => {
      AppData.sallesPourEpreuve(ep.id).forEach(salle => {
        const manque = salle.nbSurveillants - AppData.getAffectes(ep.id, salle.id).length;
        if (manque > 0)
          alertes.push({ t: 'error', m: `${ep.matiere} (${AppData.formatDateCourt(ep.date)}) — salle ${salle.nom} : ${manque} surveillant(s) manquant(s).` });
      });
      if (!AppData.sallesPourEpreuve(ep.id).length)
        alertes.push({ t: 'warning', m: `${ep.matiere} (${AppData.formatDateCourt(ep.date)}) : aucune salle associée.` });
    });

    // Capacités dépassées
    AppData.salles.forEach(s => {
      if (s.capacite && s.candidats > s.capacite)
        alertes.push({ t: 'error', m: `Salle ${s.nom} : ${s.candidats} candidats pour ${s.capacite} places.` });
    });

    // Aménagements incomplets
    AppData.amenagements.forEach(a => {
      if (!a.salleId)
        alertes.push({ t: 'warning', m: `Aménagement « ${a.candidat} » : salle à définir.` });
      if ((a.lecteur || a.scripteur) && !a.accompagnant)
        alertes.push({ t: 'warning', m: `Aménagement « ${a.candidat} » : secrétaire lecteur/scripteur à désigner.` });
    });

    // Surveillants sans aucune disponibilité
    const sansDispo = AppData.surveillants.filter(s => !Object.keys(s.dispos).length);
    if (AppData.epreuves.length && sansDispo.length)
      alertes.push({ t: 'info', m: `${sansDispo.length} surveillant(s) sans aucune disponibilité saisie.` });

    const zone = $('#recap-alertes');
    if (!alertes.length) {
      zone.innerHTML = '<div class="alerte alerte-ok">✅ Aucun point bloquant : l\u2019organisation est complète.</div>';
      return;
    }
    const icones = { error: '⛔', warning: '⚠', info: 'ℹ' };
    zone.innerHTML = alertes.map(a =>
      `<div class="alerte alerte-${a.t}">${icones[a.t]} ${escHtml(a.m)}</div>`).join('');
  },

  // ── Planning général ─────────────────────────────────────────

  _rendrePlanning() {
    const zone = $('#recap-planning');
    if (!AppData.epreuves.length) { zone.innerHTML = ''; return; }

    let html = `<div class="table-wrapper"><table class="data-table">
      <thead><tr><th>Date</th><th>Épreuve</th><th>Horaires</th><th>Salle</th><th>Candidats</th><th>Surveillants</th></tr></thead><tbody>`;

    AppData.epreuves.forEach(ep => {
      const salles = AppData.sallesPourEpreuve(ep.id);
      if (!salles.length) {
        html += `<tr><td>${escHtml(AppData.formatDateCourt(ep.date))}</td><td><strong>${escHtml(ep.matiere)}</strong></td>
          <td>${ep.heureDebut}–${AppData.heureFin(ep)}</td><td colspan="3" class="calc-attente">Aucune salle associée</td></tr>`;
        return;
      }
      salles.forEach((salle, i) => {
        const fin = salle.type === 'amenagee' ? AppData.heureFinTT(ep) : AppData.heureFin(ep);
        const noms = AppData.getAffectes(ep.id, salle.id)
          .map(id => { const s = AppData.getSurveillant(id); return s ? `${escHtml(s.nom)} ${escHtml(s.prenom)}` : ''; })
          .filter(Boolean).join(', ') || '<span class="badge badge-prio">Non pourvu</span>';
        html += `<tr>
          ${i === 0 ? `<td rowspan="${salles.length}">${escHtml(AppData.formatDateCourt(ep.date))}</td>
                       <td rowspan="${salles.length}"><strong>${escHtml(ep.matiere)}</strong></td>` : ''}
          <td>${ep.heureDebut}–${fin}${salle.type === 'amenagee' ? ' <span class="badge badge-tt">TT</span>' : ''}</td>
          <td>${escHtml(salle.nom)}</td>
          <td class="text-center">${salle.candidats || '—'}</td>
          <td>${noms}</td>
        </tr>`;
      });
    });

    html += '</tbody></table></div>';
    zone.innerHTML = html;
  },

  // ── Vue par salle ────────────────────────────────────────────

  _rendreParSalle() {
    const zone = $('#recap-planning');
    if (!AppData.salles.length) {
      zone.innerHTML = '<div class="placeholder-zone">Aucune salle définie.</div>';
      return;
    }

    let html = '';
    AppData.salles.forEach(salle => {
      const eps = AppData.epreuves.filter(ep => AppData.sallesPourEpreuve(ep.id).some(s => s.id === salle.id));
      const besoins = AppData.besoinsSalle(salle);
      const typeBadge = salle.type === 'amenagee'
        ? '<span class="badge badge-tt">Aménagée — tiers temps</span>'
        : salle.type === 'secretariat'
          ? '<span class="badge badge-secr">Secrétariat d\u2019examen</span>'
          : '<span class="badge">Ordinaire</span>';

      html += `<div class="jury-card">
        <div class="jury-card-header">
          <strong>🚪 Salle ${escHtml(salle.nom)}</strong> ${typeBadge}
          <span class="jury-card-meta">${salle.candidats || 0} candidat(s)${salle.capacite ? ` / ${salle.capacite} places` : ''}
            ${salle.type !== 'secretariat' ? ` · ${besoins.sujets} sujets · ${besoins.copies} copies · ${besoins.brouillons} brouillons` : ''}</span>
        </div>`;

      if (!eps.length) {
        html += '<div class="calc-attente" style="padding:10px 16px">Aucune épreuve associée à cette salle.</div></div>';
        return;
      }

      html += `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Date</th><th>Épreuve</th><th>Horaires</th><th>Surveillants</th></tr></thead><tbody>`;
      eps.forEach(ep => {
        const fin = salle.type === 'amenagee' ? AppData.heureFinTT(ep) : AppData.heureFin(ep);
        const affectes = AppData.getAffectes(ep.id, salle.id);
        const noms = affectes
          .map(id => { const s = AppData.getSurveillant(id); return s ? `${escHtml(s.nom)} ${escHtml(s.prenom)}` : ''; })
          .filter(Boolean).join(', ');
        const manque = salle.nbSurveillants - affectes.length;
        html += `<tr>
          <td>${escHtml(AppData.formatDateCourt(ep.date))}</td>
          <td><strong>${escHtml(ep.matiere)}</strong></td>
          <td>${ep.heureDebut}–${fin}${salle.type === 'amenagee' ? ' <span class="badge badge-tt">TT</span>' : ''}</td>
          <td>${noms || ''}${manque > 0 ? ` <span class="badge badge-prio">${manque} manquant(s)</span>` : ''}</td>
        </tr>`;
      });
      html += '</tbody></table></div></div>';
    });

    zone.innerHTML = html;
  },

  // ── Vue heures par surveillant ───────────────────────────────

  _rendreParSurveillant() {
    const zone = $('#recap-planning');
    if (!AppData.surveillants.length) {
      zone.innerHTML = '<div class="placeholder-zone">Aucun surveillant défini.</div>';
      return;
    }

    // Détail des créneaux par surveillant
    const lignes = AppData.surveillants.map(sv => {
      const creneaux = [];
      AppData.epreuves.forEach(ep => {
        AppData.sallesPourEpreuve(ep.id).forEach(salle => {
          if (AppData.getAffectes(ep.id, salle.id).includes(sv.id)) {
            creneaux.push({ ep, salle, duree: AppData.dureeCreneau(ep, salle) });
          }
        });
      });
      const minutes = creneaux.reduce((a, c) => a + c.duree, 0);
      return { sv, creneaux, minutes };
    }).sort((a, b) => b.minutes - a.minutes || (a.sv.nom + a.sv.prenom).localeCompare(b.sv.nom + b.sv.prenom, 'fr'));

    const totalMin = lignes.reduce((a, l) => a + l.minutes, 0);
    const actifs = lignes.filter(l => l.creneaux.length).length;
    const moyenne = actifs ? Math.round(totalMin / actifs) : 0;
    const maxMin = Math.max(1, ...lignes.map(l => l.minutes));

    let html = `<div class="equite-stats" style="margin-bottom:14px">
      <span>Total : <strong>${AppData.formatDuree(totalMin)}</strong></span>
      <span>Surveillants mobilisés : <strong>${actifs} / ${lignes.length}</strong></span>
      <span>Moyenne (mobilisés) : <strong>${AppData.formatDuree(moyenne)}</strong></span>
    </div>`;

    html += `<div class="table-wrapper"><table class="data-table">
      <thead><tr><th>Surveillant</th><th>Fonction</th><th class="text-center">Créneaux</th>
      <th class="text-center">Heures</th><th>Charge</th><th>Détail des affectations</th></tr></thead><tbody>`;

    lignes.forEach(({ sv, creneaux, minutes }) => {
      const detail = creneaux.map(c =>
        `${escHtml(AppData.formatDateCourt(c.ep.date))} ${escHtml(c.ep.matiere)} — salle ${escHtml(c.salle.nom)}` +
        `${c.salle.type === 'amenagee' ? ' <span class="badge badge-tt">TT</span>' : ''} (${AppData.formatDuree(c.duree)})`
      ).join('<br>') || '<span class="calc-attente">Aucune affectation</span>';
      const pct = Math.round(minutes / maxMin * 100);
      const ecart = moyenne ? minutes - moyenne : 0;
      const ecartTxt = creneaux.length && moyenne
        ? ` <span class="dispo-count">(${ecart >= 0 ? '+' : '−'}${AppData.formatDuree(Math.abs(ecart))} vs moy.)</span>` : '';

      html += `<tr ${creneaux.length ? '' : 'style="opacity:.55"'}>
        <td><strong>${escHtml(sv.nom)}</strong> ${escHtml(sv.prenom)}</td>
        <td>${escHtml(sv.fonction || '')}</td>
        <td class="text-center">${creneaux.length}${sv.quotaMax ? ` / ${sv.quotaMax}` : ''}</td>
        <td class="text-center"><strong>${AppData.formatDuree(minutes)}</strong>${ecartTxt}</td>
        <td><div class="equite-bar-wrap" style="min-width:90px"><div class="equite-bar" style="width:${pct}%"></div></div></td>
        <td style="font-size:.82rem">${detail}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    zone.innerHTML = html;
  },

  // ── Vue réserve : disponibles non affectés, par épreuve ──────

  _rendreReserve() {
    const zone = $('#recap-planning');
    if (!AppData.epreuves.length || !AppData.surveillants.length) {
      zone.innerHTML = '<div class="placeholder-zone">Définissez des épreuves et des surveillants pour visualiser la réserve.</div>';
      return;
    }

    let html = `<div class="alerte alerte-info" style="margin-bottom:14px">ℹ La réserve regroupe, pour chaque épreuve,
      les surveillants <strong>disponibles mais non affectés</strong> : ce sont vos remplaçants immédiats en cas
      d\u2019absence le jour J. Les personnels ayant atteint leur quota sont signalés.</div>`;

    let jourCourant = '';
    AppData.epreuves.forEach(ep => {
      const jour = AppData.formatDate(ep.date);
      if (jour !== jourCourant) {
        jourCourant = jour;
        html += `<h4 class="sous-titre" style="margin-top:18px">${escHtml(jour)}</h4>`;
      }

      const reserve = AppData.surveillants
        .filter(s => s.dispos[ep.id] && !AppData.estAffecteEpreuve(ep.id, s.id))
        .map(s => {
          const c = AppData.chargeSurveillant(s.id);
          return { s, c, quotaAtteint: !!(s.quotaMax && c.creneaux >= s.quotaMax) };
        })
        .sort((a, b) => a.quotaAtteint - b.quotaAtteint ||
          a.c.minutes - b.c.minutes ||
          (a.s.nom + a.s.prenom).localeCompare(b.s.nom + b.s.prenom, 'fr'));

      const mobilisables = reserve.filter(r => !r.quotaAtteint).length;
      const badge = !reserve.length
        ? '<span class="badge badge-prio">Aucune réserve</span>'
        : mobilisables === 0
          ? '<span class="badge badge-warn">Réserve épuisée (quotas)</span>'
          : `<span class="badge badge-secr">${mobilisables} mobilisable(s)</span>`;

      html += `<div class="jury-card">
        <div class="jury-card-header">
          <strong>${escHtml(ep.matiere)}</strong>
          <span class="jury-card-meta">${ep.heureDebut}–${AppData.heureFin(ep)} ${badge}</span>
        </div>
        <div style="padding:12px 16px">`;

      if (!reserve.length) {
        html += `<span class="calc-attente">Tous les surveillants disponibles sont déjà affectés sur cette épreuve —
          aucun remplaçant possible sans modifier les disponibilités.</span>`;
      } else {
        html += reserve.map(({ s, c, quotaAtteint }) =>
          `<span class="surv-chip" ${quotaAtteint ? 'style="opacity:.5" title="Quota atteint"' : ''}>
            ${escHtml(s.nom)} ${escHtml(s.prenom)}
            <span class="dispo-count">${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)}${quotaAtteint ? ' · quota atteint' : ''}</span>
          </span>`).join(' ');
      }
      html += '</div></div>';
    });

    zone.innerHTML = html;
  },
};
window.Recap = Recap;
