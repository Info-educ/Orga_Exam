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
    if (this.vue === 'salles')             this._rendreParSalle();
    else if (this.vue === 'surveillants')  this._rendreParSurveillant();
    else if (this.vue === 'demijournees')  this._rendreDemiJournees();
    else if (this.vue === 'reserve')       this._rendreReserve();
    else if (this.vue === 'accompagnants') this._rendreAccompagnants();
    else if (this.vue === 'secretariat')   this._rendreSecretariat();
    else                                   this._rendrePlanning();
  },

  // ── Indicateurs ──────────────────────────────────────────────

  _rendreCartes() {
    const { total, pourvus } = Repartition._postesTotaux();
    const taux = total ? Math.round(pourvus / total * 100) : 0;
    const totCand = AppData.salles.reduce((a, s) => a + (s.type !== 'secretariat' ? s.candidats : 0), 0);

    // Heures effectuées au secrétariat d'examen (durées tiers temps)
    let minSecr = 0;
    AppData.epreuves.forEach(ep => {
      AppData.salles.filter(sa => sa.type === 'secretariat').forEach(salle => {
        if (salle.epreuveIds.length && !salle.epreuveIds.includes(ep.id)) return;
        minSecr += AppData.getAffectes(ep.id, salle.id).length * AppData.dureeCreneau(ep, salle);
      });
    });

    $('#recap-cartes').innerHTML = `
      <div class="calc-card calc-card-primary"><div class="calc-value">${AppData.epreuves.length}</div><div class="calc-label">Épreuves</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.jours().length}</div><div class="calc-label">Jours d\u2019examen</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.salles.length}</div><div class="calc-label">Salles</div></div>
      <div class="calc-card"><div class="calc-value">${totCand}</div><div class="calc-label">Candidats répartis</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.amenagements.length}</div><div class="calc-label">Aménagements</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.surveillants.length}</div><div class="calc-label">Surveillants</div></div>
      <div class="calc-card"><div class="calc-value">${AppData.formatDuree(minSecr)}</div><div class="calc-label">Heures secrétariat (TT)</div></div>
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
      const avecReserve = !!(AppData.getReserve(ep.id).length || AppData.params.nbReserves);
      const avecReserveTT = !!(AppData.getReserveTT(ep.id).length || AppData.params.nbReservesTT);
      const span = salles.length + (avecReserve ? 1 : 0) + (avecReserveTT ? 1 : 0);
      salles.forEach((salle, i) => {
        const fin = AppData.heureFinSalle(ep, salle);
        const chips = AppData.getAffectes(ep.id, salle.id).map(id => {
          const s = AppData.getSurveillant(id);
          if (!s) return '';
          const verrou = AppData.estVerrouille(ep.id, salle.id, id);
          const dnd = attrJson({ ep: ep.id, salle: salle.id, surv: id });
          return `<span class="surv-chip ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}" ${verrou ? '' : `data-dnd='${dnd}'`} title="${verrou ? 'Affectation figée' : 'Glisser pour déplacer ou échanger'}">${verrou ? '📌 ' : ''}${escHtml(s.nom)} ${escHtml(s.prenom)}</span>`;
        }).filter(Boolean).join(' ') || '<span class="badge badge-prio">Non pourvu</span>';
        html += `<tr>
          ${i === 0 ? `<td rowspan="${span}">${escHtml(AppData.formatDateCourt(ep.date))}</td>
                       <td rowspan="${span}"><strong>${escHtml(ep.matiere)}</strong></td>` : ''}
          <td>${ep.heureDebut}–${fin}${salle.type === 'amenagee' ? ' <span class="badge badge-tt">TT</span>' : ''}${salle.type === 'secretariat' ? ' <span class="badge badge-secr">Secr.</span>' : ''}</td>
          <td>${escHtml(salle.nom)}</td>
          <td class="text-center">${salle.candidats || '—'}</td>
          <td class="dnd-zone" data-drop='${attrJson({ ep: ep.id, salle: salle.id })}'>${chips}</td>
        </tr>`;
      });
      if (avecReserveTT) {
        const resTTChips = AppData.getReserveTT(ep.id).map(id => {
          const s = AppData.getSurveillant(id);
          if (!s) return '';
          const verrou = AppData.estVerrouille(ep.id, 'RT', id);
          const dnd = attrJson({ ep: ep.id, reserveTT: true, surv: id });
          return `<span class="surv-chip chip-tt ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}" ${verrou ? '' : `data-dnd='${dnd}'`} title="${verrou ? 'Affectation figée' : 'Glisser pour déplacer ou échanger'}">${verrou ? '📌 ' : ''}⏳ ${escHtml(s.nom)} ${escHtml(s.prenom)}</span>`;
        }).filter(Boolean).join(' ');
        html += `<tr class="row-reserve-tt">
          <td>${ep.heureDebut}–${AppData.heureFinTT(ep)}</td>
          <td>🛟⏳ Réserve tiers temps</td>
          <td class="text-center">—</td>
          <td class="dnd-zone" data-drop='${attrJson({ ep: ep.id, reserveTT: true })}'>${resTTChips || '<span class="calc-attente">Personne</span>'}</td>
        </tr>`;
      }
      if (avecReserve) {
        const resChips = AppData.getReserve(ep.id).map(id => {
          const s = AppData.getSurveillant(id);
          if (!s) return '';
          const verrou = AppData.estVerrouille(ep.id, null, id);
          const dnd = attrJson({ ep: ep.id, reserve: true, surv: id });
          return `<span class="surv-chip ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}" ${verrou ? '' : `data-dnd='${dnd}'`} title="${verrou ? 'Affectation figée' : 'Glisser pour déplacer ou échanger'}">${verrou ? '📌 ' : ''}${escHtml(s.nom)} ${escHtml(s.prenom)}</span>`;
        }).filter(Boolean).join(' ');
        html += `<tr class="row-reserve">
          <td>${ep.heureDebut}–${AppData.heureFin(ep)}</td>
          <td>🛟 Réserve</td>
          <td class="text-center">—</td>
          <td class="dnd-zone" data-drop='${attrJson({ ep: ep.id, reserve: true })}'>${resChips || '<span class="calc-attente">Personne</span>'}</td>
        </tr>`;
      }
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
        const fin = AppData.heureFinSalle(ep, salle);
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

    // Détail des créneaux par surveillant (réserve incluse : heures travaillées)
    const lignes = AppData.surveillants.map(sv => {
      const creneaux = [];
      AppData.epreuves.forEach(ep => {
        AppData.sallesPourEpreuve(ep.id).forEach(salle => {
          if (AppData.getAffectes(ep.id, salle.id).includes(sv.id)) {
            creneaux.push({ ep, salle, duree: AppData.dureeCreneau(ep, salle) });
          }
        });
        if (AppData.estEnReserve(ep.id, sv.id)) {
          creneaux.push({ ep, salle: null, duree: ep.duree, reserve: true });
        }
        if (AppData.estEnReserveTT(ep.id, sv.id)) {
          creneaux.push({ ep, salle: null, duree: AppData.dureeTiersTemps(ep.duree), reserveTT: true });
        }
        AppData.creneauxCouloirDe(ep, sv.id).forEach(cc => {
          creneaux.push({ ep, salle: null, duree: cc.duree, couloir: cc });
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
      <th class="text-center">Heures</th><th class="text-center">dont secrétariat</th><th>Charge</th><th>Détail des affectations</th></tr></thead><tbody>`;

    lignes.forEach(({ sv, creneaux, minutes }) => {
      const detail = creneaux.map(c =>
        c.couloir
          ? `${escHtml(AppData.formatDateCourt(c.ep.date))} ${escHtml(c.ep.matiere)} — <span class="badge badge-secr">🚶 ${escHtml(c.couloir.couloir.nom)} ${c.couloir.debut}–${c.couloir.fin}</span> (${AppData.formatDuree(c.duree)})`
          : c.reserveTT
          ? `${escHtml(AppData.formatDateCourt(c.ep.date))} ${escHtml(c.ep.matiere)} — <span class="badge badge-tt">🛟⏳ Réserve TT jusqu\u2019à ${AppData.heureFinTT(c.ep)}</span> (${AppData.formatDuree(c.duree)})`
          : c.reserve
          ? `${escHtml(AppData.formatDateCourt(c.ep.date))} ${escHtml(c.ep.matiere)} — <span class="badge badge-tt">🛟 Réserve</span> (${AppData.formatDuree(c.duree)})`
          : `${escHtml(AppData.formatDateCourt(c.ep.date))} ${escHtml(c.ep.matiere)} — salle ${escHtml(c.salle.nom)}` +
            `${c.salle.type === 'amenagee' ? ' <span class="badge badge-tt">TT</span>' : ''}${c.salle.type === 'secretariat' ? ' <span class="badge badge-secr">Secr.</span>' : ''} (${AppData.formatDuree(c.duree)})`
      ).join('<br>') || '<span class="calc-attente">Aucune affectation</span>';
      const pct = Math.round(minutes / maxMin * 100);
      const ecart = moyenne ? minutes - moyenne : 0;
      const ecartTxt = creneaux.length && moyenne
        ? ` <span class="dispo-count">(${ecart >= 0 ? '+' : '−'}${AppData.formatDuree(Math.abs(ecart))} vs moy.)</span>` : '';

      html += `<tr ${creneaux.length ? '' : 'style="opacity:.55"'}>
        <td><strong>${escHtml(sv.nom)}</strong> ${escHtml(sv.prenom)}</td>
        <td>${escHtml(sv.fonction || '')}${sv.heuresHebdo ? ` <span class="dispo-count">${sv.heuresHebdo} h/sem</span>` : ''}</td>
        <td class="text-center">${creneaux.length}${sv.quotaMax ? ` / ${sv.quotaMax}` : ''}</td>
        <td class="text-center"><strong>${AppData.formatDuree(minutes)}</strong>${ecartTxt}</td>
        <td class="text-center">${(() => {
          const mSecr = creneaux.filter(c => c.salle && c.salle.type === 'secretariat').reduce((a, c) => a + c.duree, 0);
          return mSecr ? `<span class="badge badge-secr">${AppData.formatDuree(mSecr)}</span>` : '—';
        })()}</td>
        <td><div class="equite-bar-wrap" style="min-width:90px"><div class="equite-bar" style="width:${pct}%"></div></div></td>
        <td style="font-size:.82rem">${detail}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    zone.innerHTML = html;
  },

  // ── Vue par demi-journée : personnels mobilisés ──────────────

  _rendreDemiJournees() {
    const zone = $('#recap-planning');
    if (!AppData.epreuves.length) {
      zone.innerHTML = '<div class="placeholder-zone">Définissez des épreuves pour visualiser les demi-journées.</div>';
      return;
    }

    // Regroupement : date → { matin: [...eps], apresmidi: [...eps] }  (matin = début < 13:00)
    const parJour = new Map();
    AppData.epreuves.forEach(ep => {
      if (!parJour.has(ep.date)) parJour.set(ep.date, { matin: [], apresmidi: [] });
      parJour.get(ep.date)[ep.heureDebut < '13:00' ? 'matin' : 'apresmidi'].push(ep);
    });

    let html = '';
    parJour.forEach((dj, date) => {
      html += `<h4 class="sous-titre" style="margin-top:18px">${escHtml(AppData.formatDate(date))}</h4>`;

      [['matin', '🌅 Matin'], ['apresmidi', '🌇 Après-midi']].forEach(([cle, titre]) => {
        const eps = dj[cle];
        if (!eps.length) return;

        // Mobilisations de la demi-journée : survId → rôles
        const mob = new Map();   // survId → [{ role, detail }]
        eps.forEach(ep => {
          AppData.sallesPourEpreuve(ep.id).forEach(salle => {
            AppData.getAffectes(ep.id, salle.id).forEach(id => {
              if (!mob.has(id)) mob.set(id, []);
              mob.get(id).push({
                role: salle.type === 'secretariat' ? 'secr' : 'salle',
                detail: `${ep.matiere} · ${salle.nom}`,
              });
            });
          });
          AppData.getReserve(ep.id).forEach(id => {
            if (!mob.has(id)) mob.set(id, []);
            mob.get(id).push({ role: 'reserve', detail: `${ep.matiere}` });
          });
          AppData.getReserveTT(ep.id).forEach(id => {
            if (!mob.has(id)) mob.set(id, []);
            mob.get(id).push({ role: 'reserveTT', detail: `${ep.matiere} (jusqu\u2019à ${AppData.heureFinTT(ep)})` });
          });
          AppData.surveillants.forEach(sv => {
            AppData.creneauxCouloirDe(ep, sv.id).forEach(cc => {
              if (!mob.has(sv.id)) mob.set(sv.id, []);
              mob.get(sv.id).push({ role: 'couloir', detail: `${ep.matiere} — ${cc.couloir.nom} (${cc.debut}–${cc.fin})` });
            });
          });
        });

        const lignes = [...mob.entries()]
          .map(([id, roles]) => ({ s: AppData.getSurveillant(id), roles }))
          .filter(x => x.s)
          .sort((a, b) => (a.s.nom + a.s.prenom).localeCompare(b.s.nom + b.s.prenom, 'fr'));

        const plage = `${eps[0].heureDebut}–${eps.map(e => AppData.heureFinTT(e)).sort().pop()}`;

        html += `<div class="jury-card">
          <div class="jury-card-header">
            <strong>${titre}</strong>
            <span class="jury-card-meta">${eps.map(e => escHtml(e.matiere)).join(' · ')} (${plage} avec TT)
              <span class="badge badge-secr">${lignes.length} mobilisé(s)</span></span>
          </div>`;

        if (!lignes.length) {
          html += '<div style="padding:12px 16px"><span class="calc-attente">Aucun personnel mobilisé.</span></div></div>';
          return;
        }

        html += `<div class="table-wrapper"><table class="data-table">
          <thead><tr><th>Personnel</th><th>Fonction</th><th>Mobilisation(s)</th></tr></thead><tbody>`;
        lignes.forEach(({ s, roles }) => {
          const badges = { salle: '', secr: ' <span class="badge badge-secr">Secrétariat</span>', reserve: ' <span class="badge badge-tt">Réserve</span>', reserveTT: ' <span class="badge badge-tt">🛟⏳ Réserve TT</span>', couloir: ' <span class="badge badge-secr">🚶 Couloir</span>' };
          html += `<tr>
            <td><strong>${escHtml(s.nom)}</strong> ${escHtml(s.prenom)}</td>
            <td>${escHtml(s.fonction || '')}</td>
            <td>${roles.map(r => escHtml(r.detail) + badges[r.role]).join('<br>')}</td>
          </tr>`;
        });
        html += '</tbody></table></div></div>';
      });
    });

    zone.innerHTML = html;
  },

  // ── Vue réserve : disponibles non affectés, par épreuve ──────

  _rendreReserve() {
    const zone = $('#recap-planning');
    if (!AppData.epreuves.length || !AppData.surveillants.length) {
      zone.innerHTML = '<div class="placeholder-zone">Définissez des épreuves et des surveillants pour visualiser la réserve.</div>';
      return;
    }

    let html = `<div class="alerte alerte-info" style="margin-bottom:14px">ℹ Pour chaque épreuve :
      la <strong>réserve affectée</strong> (personnels désignés, mobilisés au même titre que la surveillance —
      déplaçables par glisser-déposer), puis le <strong>vivier restant</strong> des disponibles non mobilisés,
      du moins chargé au plus chargé.</div>`;

    let jourCourant = '';
    AppData.epreuves.forEach(ep => {
      const jour = AppData.formatDate(ep.date);
      if (jour !== jourCourant) {
        jourCourant = jour;
        html += `<h4 class="sous-titre" style="margin-top:18px">${escHtml(jour)}</h4>`;
      }

      const nbRes = AppData.params.nbReserves || 0;
      const enReserve = AppData.getReserve(ep.id);

      const vivier = AppData.surveillants
        .filter(s => s.dispos[ep.id] && !AppData.estMobiliseEpreuve(ep.id, s.id))
        .map(s => {
          const c = AppData.chargeSurveillant(s.id);
          return { s, c, quotaAtteint: !!(s.quotaMax && c.creneaux >= s.quotaMax) };
        })
        .sort((a, b) => a.quotaAtteint - b.quotaAtteint ||
          a.c.minutes - b.c.minutes ||
          (a.s.nom + a.s.prenom).localeCompare(b.s.nom + b.s.prenom, 'fr'));

      const manque = nbRes - enReserve.length;
      const badge = manque > 0
        ? `<span class="badge badge-prio">${manque} poste(s) de réserve à pourvoir</span>`
        : `<span class="badge badge-secr">${enReserve.length} en réserve</span>`;

      const chipsReserve = enReserve.map(id => {
        const s = AppData.getSurveillant(id);
        if (!s) return '';
        const c = AppData.chargeSurveillant(id);
        const verrou = AppData.estVerrouille(ep.id, null, id);
        const dnd = attrJson({ ep: ep.id, reserve: true, surv: id });
        return `<span class="surv-chip ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}" ${verrou ? '' : `data-dnd='${dnd}'`} title="${verrou ? 'Affectation figée' : 'Glisser pour déplacer ou échanger'}">
          ${verrou ? '📌 ' : ''}${escHtml(s.nom)} ${escHtml(s.prenom)}
          <span class="dispo-count">${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)}</span></span>`;
      }).filter(Boolean).join(' ');

      html += `<div class="jury-card">
        <div class="jury-card-header">
          <strong>${escHtml(ep.matiere)}</strong>
          <span class="jury-card-meta">${ep.heureDebut}–${AppData.heureFin(ep)} ${badge}</span>
        </div>
        <div style="padding:12px 16px">
          <div style="margin-bottom:8px"><strong>🛟⏳ Réserve tiers temps</strong> <span class="dispo-count">(présence jusqu\u2019à ${AppData.heureFinTT(ep)})</span></div>
          <div class="dnd-zone" data-drop='${attrJson({ ep: ep.id, reserveTT: true })}' style="min-height:34px;margin-bottom:10px">
            ${AppData.getReserveTT(ep.id).map(id => {
              const s = AppData.getSurveillant(id);
              if (!s) return '';
              const c = AppData.chargeSurveillant(id);
              const verrou = AppData.estVerrouille(ep.id, 'RT', id);
              const dnd = attrJson({ ep: ep.id, reserveTT: true, surv: id });
              return `<span class="surv-chip chip-tt ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}" ${verrou ? '' : `data-dnd='${dnd}'`}>${verrou ? '📌 ' : ''}⏳ ${escHtml(s.nom)} ${escHtml(s.prenom)} <span class="dispo-count">${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)}</span></span>`;
            }).filter(Boolean).join(' ') || '<span class="calc-attente">Personne.</span>'}
          </div>
          <div style="margin-bottom:8px"><strong>🛟 Réserve affectée</strong></div>
          <div class="dnd-zone" data-drop='${attrJson({ ep: ep.id, reserve: true })}' style="min-height:34px">
            ${chipsReserve || '<span class="calc-attente">Personne — lancez la répartition ou glissez un surveillant ici.</span>'}
          </div>
          <div style="margin:12px 0 8px"><strong>Vivier restant</strong> <span class="dispo-count">(disponibles non mobilisés)</span></div>
          ${vivier.length
            ? vivier.map(({ s, c, quotaAtteint }) =>
              `<span class="surv-chip" ${quotaAtteint ? 'style="opacity:.5" title="Quota atteint"' : ''}>
                ${escHtml(s.nom)} ${escHtml(s.prenom)}
                <span class="dispo-count">${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)}${quotaAtteint ? ' · quota atteint' : ''}</span>
              </span>`).join(' ')
            : '<span class="calc-attente">Aucun — tous les disponibles sont mobilisés sur cette épreuve.</span>'}
        </div></div>`;
    });

    zone.innerHTML = html;
  },

  // ── Vue secrétariat d'examen ─────────────────────────────────

  _rendreSecretariat() {
    const zone = $('#recap-planning');
    const sallesSecr = AppData.salles.filter(s => s.type === 'secretariat');

    if (!sallesSecr.length) {
      zone.innerHTML = '<div class="placeholder-zone">Aucune salle de type <strong>secrétariat d\u2019examen</strong> — créez-la dans l\u2019onglet Salles.</div>';
      return;
    }

    let html = `<div class="alerte alerte-info" style="margin-bottom:14px">ℹ Le secrétariat d\u2019examen accompagne les candidats
      à aménagement : ses horaires sont <strong>alignés sur la fin du tiers temps</strong> et ses heures comptent
      dans la charge au même titre que la surveillance. Affectation manuelle dans le module Répartition.</div>`;

    // Synthèse par personnel
    const parPers = new Map();   // survId → [{ ep, salle }]
    AppData.epreuves.forEach(ep => {
      sallesSecr.forEach(salle => {
        if (salle.epreuveIds.length && !salle.epreuveIds.includes(ep.id)) return;
        AppData.getAffectes(ep.id, salle.id).forEach(id => {
          if (!parPers.has(id)) parPers.set(id, []);
          parPers.get(id).push({ ep, salle });
        });
      });
    });

    if (parPers.size) {
      let totalSecr = 0;
      parPers.forEach((crs) => crs.forEach(c => { totalSecr += AppData.dureeCreneau(c.ep, c.salle); }));
      html += `<div class="equite-stats" style="margin:0 0 10px">
        <span>Personnels du secrétariat : <strong>${parPers.size}</strong></span>
        <span>Heures totales effectuées (TT) : <strong>${AppData.formatDuree(totalSecr)}</strong></span>
      </div>
      <h4 class="sous-titre">Personnels du secrétariat</h4>
        <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Personnel</th><th>Fonction</th><th class="text-center">Créneaux</th><th class="text-center">Heures (TT)</th><th>Détail</th></tr></thead><tbody>`;
      [...parPers.entries()]
        .map(([id, crs]) => ({ s: AppData.getSurveillant(id), crs }))
        .filter(x => x.s)
        .sort((a, b) => (a.s.nom + a.s.prenom).localeCompare(b.s.nom + b.s.prenom, 'fr'))
        .forEach(({ s, crs }) => {
          const minutes = crs.reduce((a, c) => a + AppData.dureeCreneau(c.ep, c.salle), 0);
          html += `<tr>
            <td><strong>${escHtml(s.nom)}</strong> ${escHtml(s.prenom)}</td>
            <td>${escHtml(s.fonction || '')}</td>
            <td class="text-center">${crs.length}</td>
            <td class="text-center"><strong>${AppData.formatDuree(minutes)}</strong></td>
            <td style="font-size:.82rem">${crs.map(c =>
              `${escHtml(AppData.formatDateCourt(c.ep.date))} ${escHtml(c.ep.matiere)} — ${escHtml(c.salle.nom)} (${c.ep.heureDebut}–${AppData.heureFinSalle(c.ep, c.salle)})`).join('<br>')}</td>
          </tr>`;
        });
      html += '</tbody></table></div>';
    }

    // Détail par épreuve
    html += '<h4 class="sous-titre">Détail par épreuve</h4>';
    AppData.epreuves.forEach(ep => {
      const salles = sallesSecr.filter(s => !s.epreuveIds.length || s.epreuveIds.includes(ep.id));
      if (!salles.length) return;

      salles.forEach(salle => {
        const affectes = AppData.getAffectes(ep.id, salle.id);
        const manque = salle.nbSurveillants - affectes.length;
        const candidats = AppData.amenagements.filter(a => a.salleId === salle.id);
        const chips = affectes.map(id => {
          const s = AppData.getSurveillant(id);
          if (!s) return '';
          const verrou = AppData.estVerrouille(ep.id, salle.id, id);
          const dnd = attrJson({ ep: ep.id, salle: salle.id, surv: id });
          return `<span class="surv-chip ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}" ${verrou ? '' : `data-dnd='${dnd}'`} title="${verrou ? 'Affectation figée' : 'Glisser pour déplacer ou échanger'}">${verrou ? '📌 ' : ''}${escHtml(s.nom)} ${escHtml(s.prenom)}</span>`;
        }).filter(Boolean).join(' ');

        html += `<div class="jury-card">
          <div class="jury-card-header">
            <strong>${escHtml(ep.matiere)} — ${escHtml(salle.nom)}</strong>
            <span class="jury-card-meta">${escHtml(AppData.formatDateCourt(ep.date))} ·
              ${ep.heureDebut}–${AppData.heureFinSalle(ep, salle)} <span class="badge badge-tt">fin TT${AppData.params.margeSecr ? ' + ' + AppData.params.margeSecr + ' min' : ''}</span>
              ${manque > 0 ? `<span class="badge badge-prio">${manque} manquant(s)</span>` : `<span class="badge badge-secr">${affectes.length}/${salle.nbSurveillants}</span>`}</span>
          </div>
          <div style="padding:12px 16px">
            <div style="margin-bottom:6px"><strong>Personnels</strong></div>
            <div class="dnd-zone" data-drop='${attrJson({ ep: ep.id, salle: salle.id })}' style="min-height:32px">
              ${chips || '<span class="calc-attente">Personne — à affecter dans le module Répartition.</span>'}
            </div>
            <div style="margin:10px 0 6px"><strong>Candidats accompagnés</strong> <span class="dispo-count">(rattachés à cette salle)</span></div>
            ${candidats.length
              ? candidats.map(a => `<span class="badge badge-secr">${escHtml(a.candidat)}${a.classe ? ' · ' + escHtml(a.classe) : ''}</span> `).join('')
              : '<span class="calc-attente">Aucun candidat rattaché à cette salle dans les aménagements.</span>'}
          </div>
        </div>`;
      });
    });

    zone.innerHTML = html;
  },

  // ── Vue accompagnants (lecteurs/scripteurs, AESH…) ───────────

  _rendreAccompagnants() {
    const zone = $('#recap-planning');
    const heures = AppData.heuresAccompagnants();
    const sansAcc = AppData.amenagements.filter(a => (a.lecteur || a.scripteur || a.avs) && !(a.accompagnant || '').trim());

    if (!AppData.amenagements.length && !heures.size) {
      zone.innerHTML = '<div class="placeholder-zone">Aucun aménagement ni accompagnant — renseignez l\u2019onglet <strong>Aménagements</strong> (fiche candidat ou panneau « Accompagnants par épreuve »).</div>';
      return;
    }

    let html = '';
    if (sansAcc.length)
      html += `<div class="alerte alerte-warning">⚠ ${sansAcc.length} candidat(s) avec besoin d\u2019accompagnement
        <strong>sans accompagnant désigné</strong> : ${sansAcc.map(a => escHtml(a.candidat)).join(', ')}.</div>`;

    if (!heures.size) {
      zone.innerHTML = html + '<div class="placeholder-zone">Aucun accompagnant renseigné pour le moment.</div>';
      return;
    }

    const totalMin = [...heures.values()].reduce((a, e) => a + e.minutes, 0);
    html += `<div class="equite-stats" style="margin:10px 0 14px">
      <span>Accompagnants : <strong>${heures.size}</strong></span>
      <span>Heures totales : <strong>${AppData.formatDuree(totalMin)}</strong></span>
    </div>`;

    [...heures.entries()]
      .sort((a, b) => b[1].minutes - a[1].minutes || a[0].localeCompare(b[0], 'fr'))
      .forEach(([nom, e]) => {
        html += `<div class="jury-card">
          <div class="jury-card-header">
            <strong>🤝 ${escHtml(nom)}</strong>
            <span class="jury-card-meta">
              <span class="badge badge-secr">${e.creneaux.length} créneau(x)</span>
              <span class="badge badge-tt">⏱ ${AppData.formatDuree(e.minutes)}</span>
            </span>
          </div>
          <div class="table-wrapper"><table class="data-table">
            <thead><tr><th>Date</th><th>Épreuve</th><th>Horaires</th><th>Mission</th><th class="text-center">Durée</th></tr></thead><tbody>
            ${e.creneaux
              .sort((x, y) => (x.ep.date + x.ep.heureDebut).localeCompare(y.ep.date + y.ep.heureDebut))
              .map(c => `<tr>
                <td>${escHtml(AppData.formatDateCourt(c.ep.date))}</td>
                <td><strong>${escHtml(c.ep.matiere)}</strong></td>
                <td>${c.ep.heureDebut}–${AppData.addMinutes(c.ep.heureDebut, c.duree)}</td>
                <td>${c.type === 'epreuve'
                  ? '<span class="badge badge-tt">Épreuve entière</span> ' + escHtml(c.detail)
                  : 'Candidat <strong>' + escHtml(c.detail) + '</strong>'}</td>
                <td class="text-center"><strong>${AppData.formatDuree(c.duree)}</strong></td>
              </tr>`).join('')}
          </tbody></table></div>
        </div>`;
      });

    zone.innerHTML = html;
  },
};
window.Recap = Recap;
