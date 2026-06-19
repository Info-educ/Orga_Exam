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
    $('#opt-nb-reserves-tt').addEventListener('change', () => {
      AppData.params.nbReservesTT = Math.max(0, parseInt($('#opt-nb-reserves-tt').value, 10) || 0);
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
      Object.keys(AppData.reservesTT).forEach(epId => {
        AppData.reservesTT[epId] = AppData.reservesTT[epId].filter(survId => AppData.estVerrouille(epId, 'RT', survId));
      });
      Object.keys(AppData.affectationsCouloir).forEach(epId => {
        Object.keys(AppData.affectationsCouloir[epId]).forEach(cid => {
          Object.keys(AppData.affectationsCouloir[epId][cid]).forEach(deb => {
            AppData.affectationsCouloir[epId][cid][deb] =
              AppData.affectationsCouloir[epId][cid][deb].filter(sv => AppData.estVerrouille(epId, `C${cid}@${deb}`, sv));
          });
        });
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
     *
     * Départage ALÉATOIRE : à ratio et créneaux égaux (typiquement au début de
     * la passe, quand toutes les charges sont nulles), l'ordre est tiré au sort
     * à chaque lancement — jamais alphabétique. Relancer produit une autre
     * distribution, toujours équilibrée selon les quotités.
     */
    const poids = (s) => s.heuresHebdo > 0 ? s.heuresHebdo : 18;
    const ratio = (s) => charge[s.id].minutes / poids(s);
    const alea = {};   // ordre aléatoire propre à cette passe
    AppData.surveillants.forEach(s => { alea[s.id] = Math.random(); });
    /**
     * Salles & réserves : réservées aux ENSEIGNANTS ; les CPE ne sont
     * sollicités que s'il ne reste aucun enseignant disponible.
     * AED, AESH et administratifs ne sont jamais affectés en salle.
     */
    const choisir = (ep) => {
      const base = AppData.surveillants.filter(s =>
        s.dispos[ep.id] &&
        AppData.eligibleSalle(s) &&
        !AppData.estMobiliseEpreuve(ep.id, s.id) &&
        (!s.quotaMax || charge[s.id].creneaux < s.quotaMax));
      let candidats = base.filter(s => AppData.estEnseignant(s));
      if (!candidats.length) candidats = base;   // CPE en renfort
      if (!candidats.length) return null;
      candidats.sort((a, b) =>
        ratio(a) - ratio(b) ||
        charge[a.id].creneaux - charge[b.id].creneaux ||
        alea[a.id] - alea[b.id]);
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

      // 2) Couloirs : créneaux d'1 h, pourvus avec le même équilibrage.
      //    Un même surveillant peut tenir plusieurs créneaux (heures différentes)
      //    mais pas cumuler couloir + salle/réserve sur la même épreuve.
      const choisirCouloir = (slot) => {
        const candidats = AppData.surveillants.filter(s =>
          s.dispos[ep.id] &&
          AppData.eligibleCouloir(s) &&     // AED / administratifs uniquement
          !AppData.estAffecteEpreuve(ep.id, s.id) &&
          !AppData.estEnReserve(ep.id, s.id) &&
          !AppData.estEnReserveTT(ep.id, s.id) &&
          !AppData.creneauCouloirOccupe(ep.id, slot.debut, s.id) &&
          (!s.quotaMax || charge[s.id].creneaux < s.quotaMax));
        if (!candidats.length) return null;
        candidats.sort((a, b) =>
          ratio(a) - ratio(b) ||
          charge[a.id].creneaux - charge[b.id].creneaux ||
          alea[a.id] - alea[b.id]);
        return candidats[0];
      };
      AppData.couloirs.forEach(co => {
        AppData.creneauxCouloir(ep).forEach(slot => {
          let besoinC = co.nbSurveillants - AppData.getAffectesCouloir(ep.id, co.id, slot.debut).length;
          while (besoinC > 0) {
            const elu = choisirCouloir(slot);
            if (!elu) { manquants += besoinC; break; }
            AppData.affecterCouloir(ep.id, co.id, slot.debut, elu.id);
            charge[elu.id].minutes += slot.duree;
            charge[elu.id].creneaux++;
            pourvus++; besoinC--;
          }
        });
      });

      // 3) Réserve TIERS TEMPS : présente jusqu'à la fin du TT, pourvue en premier
      let besoinTT = (AppData.params.nbReservesTT || 0) - AppData.getReserveTT(ep.id).length;
      while (besoinTT > 0) {
        const elu = choisir(ep);
        if (!elu) { manquants += besoinTT; break; }
        AppData.mettreEnReserveTT(ep.id, elu.id);
        charge[elu.id].minutes += AppData.dureeTTEpreuve(ep);
        charge[elu.id].creneaux++;
        pourvus++; besoinTT--;
      }

      // 4) Réserve : pourvue comme les autres postes
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
    // « Tout effacer » respecte les affectations figées 📌 : seules les autres sautent.
    let nbFiges = 0;
    Object.keys(AppData.affectations).forEach(epId => {
      Object.keys(AppData.affectations[epId]).forEach(sid => {
        const gardes = AppData.affectations[epId][sid].filter(survId => AppData.estVerrouille(epId, sid, survId));
        nbFiges += gardes.length;
        AppData.affectations[epId][sid] = gardes;
      });
    });
    Object.keys(AppData.reserves).forEach(epId => {
      const gardes = AppData.reserves[epId].filter(survId => AppData.estVerrouille(epId, null, survId));
      nbFiges += gardes.length;
      AppData.reserves[epId] = gardes;
    });
    Object.keys(AppData.reservesTT).forEach(epId => {
      const gardes = AppData.reservesTT[epId].filter(survId => AppData.estVerrouille(epId, 'RT', survId));
      nbFiges += gardes.length;
      AppData.reservesTT[epId] = gardes;
    });
    Object.keys(AppData.affectationsCouloir).forEach(epId => {
      Object.keys(AppData.affectationsCouloir[epId]).forEach(cid => {
        Object.keys(AppData.affectationsCouloir[epId][cid]).forEach(deb => {
          const gardes = AppData.affectationsCouloir[epId][cid][deb].filter(sv => AppData.estVerrouille(epId, `C${cid}@${deb}`, sv));
          nbFiges += gardes.length;
          AppData.affectationsCouloir[epId][cid][deb] = gardes;
        });
      });
    });
    Unsaved.marquer();
    this.rendre();
    notifier(nbFiges
      ? `Affectations effacées — ${nbFiges} affectation(s) figée(s) 📌 conservée(s). Libérez-les (🔓) pour les effacer.`
      : 'Toutes les affectations ont été effacées.', 'info');
  },

  // ────────────────────────────────────────────────────────────
  // RENDU
  // ────────────────────────────────────────────────────────────

  rendre() {
    $('#opt-nb-reserves').value = AppData.params.nbReserves || 0;
    $('#opt-nb-reserves-tt').value = AppData.params.nbReservesTT || 0;
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
      total += AppData.params.nbReservesTT || 0;
      pourvus += Math.min(AppData.getReserveTT(ep.id).length, AppData.params.nbReservesTT || 0);
      AppData.couloirs.forEach(co => {
        AppData.creneauxCouloir(ep).forEach(slot => {
          total += co.nbSurveillants;
          pourvus += Math.min(AppData.getAffectesCouloir(ep.id, co.id, slot.debut).length, co.nbSurveillants);
        });
      });
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
          <td class="dnd-zone" data-drop='${attrJson({ ep: ep.id, salle: salle.id })}'>
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

      // Lignes couloirs : un créneau d'1 h par ligne
      AppData.couloirs.forEach(co => {
        AppData.creneauxCouloir(ep).forEach((slot, i) => {
          const affC = AppData.getAffectesCouloir(ep.id, co.id, slot.debut);
          lignes += `
            <tr class="row-couloir">
              <td>${i === 0 ? `<strong>🚶 ${escHtml(co.nom)}</strong>` : ''}
                <small style="display:block;color:var(--gray-500)">${slot.debut}–${slot.fin} (${AppData.formatDuree(slot.duree)}) · ${co.nbSurveillants} requis</small></td>
              <td class="dnd-zone" data-drop='${attrJson({ ep: ep.id, couloir: co.id, slot: slot.debut })}'>
                ${this._chipsCouloir(ep, co, slot)}
                ${this._badgeManque(co.nbSurveillants - affC.length)}
              </td>
              <td>${this._selectAjout(ep, { couloir: co.id, slot: slot.debut })}</td>
            </tr>`;
        });
      });

      // Ligne réserve TIERS TEMPS — bien identifiable
      const nbResTT = AppData.params.nbReservesTT || 0;
      const enReserveTT = AppData.getReserveTT(ep.id);
      if (nbResTT || enReserveTT.length) {
        lignes += `
          <tr class="row-reserve-tt">
            <td><strong>🛟⏳ Réserve tiers temps</strong>
              <small style="display:block;color:var(--gray-500)">${nbResTT} souhaité(s) · présence de ${AppData.heureDebutTT(ep)} à ${AppData.heureFinTT(ep)} (${AppData.formatDuree(AppData.dureeTTEpreuve(ep))})</small></td>
            <td class="dnd-zone" data-drop='${attrJson({ ep: ep.id, reserveTT: true })}'>
              ${this._chips(ep, 'RT', enReserveTT)}
              ${this._badgeManque(nbResTT - enReserveTT.length)}
            </td>
            <td>${this._selectAjout(ep, { reserveTT: true })}</td>
          </tr>`;
      }

      // Ligne réserve
      const enReserve = AppData.getReserve(ep.id);
      lignes += `
        <tr class="row-reserve">
          <td><strong>🛟 Réserve</strong>
            <small style="display:block;color:var(--gray-500)">${nbRes} souhaité(s) · ${AppData.formatDuree(ep.duree)}</small></td>
          <td class="dnd-zone" data-drop='${attrJson({ ep: ep.id, reserve: true })}'>
            ${this._chips(ep, null, enReserve)}
            ${this._badgeManque(nbRes - enReserve.length)}
          </td>
          <td>${this._selectAjout(ep, { reserve: true })}</td>
        </tr>`;

      let pourvusC = 0, totalC = 0;
      AppData.couloirs.forEach(co => AppData.creneauxCouloir(ep).forEach(slot => {
        totalC += co.nbSurveillants;
        pourvusC += AppData.getAffectesCouloir(ep.id, co.id, slot.debut).length;
      }));
      const pourvusEp = salles.reduce((a, s) => a + AppData.getAffectes(ep.id, s.id).length, 0) + enReserve.length + enReserveTT.length + pourvusC;
      const totalEp = salles.reduce((a, s) => a + s.nbSurveillants, 0) + nbRes + nbResTT + totalC;

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
        <td class="dnd-zone" data-drop='${attrJson({ ep: ep.id, salle: salle.id })}'>
          ${this._chips(ep, salle.id)}
          ${this._badgeManque(manque)}
        </td>
        <td>${this._selectAjout(ep, { salle: salle.id })}</td>
      </tr>`;
  },

  // ── Briques communes (chips draggables, selects, badges) ─────

  /** Infobulle d'un surveillant : charge totale (toutes missions confondues)
   *  + détail par type. Affichée au survol des chips dans la Répartition. */
  _tooltipCharge(survId) {
    const c = AppData.chargeSurveillant(survId);
    const total = `Charge totale : ${AppData.formatDuree(c.minutes)} · ${c.creneaux} créneau(x)`;
    // Ventilation par type de mission
    let mSalle = 0, mSecr = 0, mReserve = 0, mReserveTT = 0, mCouloir = 0;
    AppData.epreuves.forEach(ep => {
      const parEp = AppData.affectations[ep.id] || {};
      Object.keys(parEp).forEach(sid => {
        if (!parEp[sid].includes(survId)) return;
        const salle = AppData.getSalle(parseInt(sid, 10));
        const d = salle ? AppData.dureeCreneau(ep, salle) : ep.duree;
        if (salle && salle.type === 'secretariat') mSecr += d; else mSalle += d;
      });
      if (AppData.estEnReserve(ep.id, survId))   mReserve   += ep.duree;
      if (AppData.estEnReserveTT(ep.id, survId)) mReserveTT += AppData.dureeTTEpreuve(ep);
      AppData.creneauxCouloirDe(ep, survId).forEach(cc => { mCouloir += cc.duree; });
    });
    const parts = [];
    if (mSalle)     parts.push(`Surveillance ${AppData.formatDuree(mSalle)}`);
    if (mSecr)      parts.push(`Secrétariat ${AppData.formatDuree(mSecr)}`);
    if (mReserve)   parts.push(`Réserve ${AppData.formatDuree(mReserve)}`);
    if (mReserveTT) parts.push(`Réserve TT ${AppData.formatDuree(mReserveTT)}`);
    if (mCouloir)   parts.push(`Couloir ${AppData.formatDuree(mCouloir)}`);
    // Le title HTML accepte les retours à la ligne via \u000a (échappés à l'insertion)
    return escHtml(parts.length ? `${total}\u000a(${parts.join(' · ')})` : total);
  },

  _chips(ep, salleId, listeIds) {
    const enReserve = salleId === null || salleId === undefined;
    const enReserveTT = salleId === 'RT';
    const ids = listeIds || AppData.getAffectes(ep.id, salleId);
    return ids.map(id => {
      const s = AppData.getSurveillant(id);
      if (!s) return '';
      const verrou = AppData.estVerrouille(ep.id, enReserveTT ? 'RT' : (enReserve ? null : salleId), id);
      const dnd = attrJson(enReserveTT
        ? { ep: ep.id, reserveTT: true, surv: id }
        : enReserve
          ? { ep: ep.id, reserve: true, surv: id }
          : { ep: ep.id, salle: salleId, surv: id });
      return `<span class="surv-chip ${enReserveTT ? 'chip-tt' : ''} ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}"
        ${verrou ? '' : `data-dnd='${dnd}'`} title="${this._tooltipCharge(id)}\u000a— ${verrou ? 'Affectation figée — l\u2019algorithme la préserve' : 'Glisser pour déplacer ou échanger'}">
        ${verrou ? '📌 ' : ''}${enReserveTT ? '⏳ ' : ''}${escHtml(s.nom)} ${escHtml(s.prenom)}${enReserveTT ? ' <span class="chip-tt-label">jusqu\u2019à ' + AppData.heureFinTT(ep) + '</span>' : ''}
        <button class="chip-lock" data-lock='${dnd}' title="${verrou ? 'Libérer cette affectation' : 'Figer : préservée si vous relancez la répartition'}">${verrou ? '🔓' : '📌'}</button>
        <button data-remove='${dnd}' title="Retirer">✕</button></span>`;
    }).join('') || '<span class="calc-attente">Personne</span>';
  },

  _chipsCouloir(ep, co, slot) {
    return AppData.getAffectesCouloir(ep.id, co.id, slot.debut).map(id => {
      const s = AppData.getSurveillant(id);
      if (!s) return '';
      const verrou = AppData.estVerrouille(ep.id, `C${co.id}@${slot.debut}`, id);
      const dnd = attrJson({ ep: ep.id, couloir: co.id, slot: slot.debut, surv: id });
      return `<span class="surv-chip chip-couloir ${verrou ? 'locked' : ''}" draggable="${verrou ? 'false' : 'true'}"
        ${verrou ? '' : `data-dnd='${dnd}'`} title="${this._tooltipCharge(id)}\u000a— ${verrou ? 'Affectation figée' : 'Glisser pour déplacer ou échanger'}">
        ${verrou ? '📌 ' : ''}🚶 ${escHtml(s.nom)} ${escHtml(s.prenom)}
        <button class="chip-lock" data-lock='${dnd}' title="${verrou ? 'Libérer' : 'Figer'}">${verrou ? '🔓' : '📌'}</button>
        <button data-remove='${dnd}' title="Retirer">✕</button></span>`;
    }).join('') || '<span class="calc-attente">Personne</span>';
  },

  _badgeManque(n) {
    return n > 0 ? `<span class="badge badge-prio">${n} manquant(s)</span>` : '';
  },

  _selectAjout(ep, cible) {
    const disponibles = AppData.surveillants.filter(s => {
      if (!s.dispos[ep.id]) return false;
      if (cible.couloir !== undefined)
        return AppData.eligibleCouloir(s)
          && !AppData.estAffecteEpreuve(ep.id, s.id) && !AppData.estEnReserve(ep.id, s.id)
          && !AppData.estEnReserveTT(ep.id, s.id) && !AppData.creneauCouloirOccupe(ep.id, cible.slot, s.id);
      // Salles & réserves : enseignants puis CPE (le secrétariat reste libre de tout rôle)
      if (cible.salle !== undefined) {
        const salle = AppData.getSalle(cible.salle);
        if (salle && salle.type === 'secretariat') return !AppData.estMobiliseEpreuve(ep.id, s.id);
      }
      return AppData.eligibleSalle(s) && !AppData.estMobiliseEpreuve(ep.id, s.id);
    }).sort((a, b) => (AppData.estEnseignant(b) - AppData.estEnseignant(a)) || (a.nom + a.prenom).localeCompare(b.nom + b.prenom, 'fr'));
    const options = disponibles.length
      ? '<option value="">+ Affecter…</option>' + disponibles.map(s => {
          const c = AppData.chargeSurveillant(s.id);
          return `<option value="${s.id}">${escHtml(s.nom)} ${escHtml(s.prenom)} (${c.creneaux} cr. · ${AppData.formatDuree(c.minutes)})</option>`;
        }).join('')
      : '<option value="">Aucun surveillant disponible</option>';
    return `<select class="select-add" data-add='${attrJson({ ep: ep.id, ...cible })}' ${!disponibles.length ? 'disabled' : ''}>${options}</select>`;
  },

  _brancherActions(zone) {
    zone.querySelectorAll('[data-lock]').forEach(btn =>
      btn.addEventListener('click', () => {
        const d = JSON.parse(btn.dataset.lock);
        const fige = AppData.basculerVerrou(d.ep,
          d.couloir !== undefined ? `C${d.couloir}@${d.slot}` : (d.reserveTT ? 'RT' : (d.reserve ? null : d.salle)), d.surv);
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
        if (d.couloir !== undefined) AppData.desaffecterCouloir(d.ep, d.couloir, d.slot, d.surv);
        else if (d.reserveTT) AppData.retirerReserveTT(d.ep, d.surv);
        else if (d.reserve) AppData.retirerReserve(d.ep, d.surv);
        else AppData.desaffecter(d.ep, d.salle, d.surv);
        Unsaved.marquer();
        DnD.toutRafraichir();
      }));

    zone.querySelectorAll('select[data-add]').forEach(sel =>
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        const d = JSON.parse(sel.dataset.add);
        const survId = parseInt(sel.value, 10);
        if (d.couloir !== undefined) AppData.affecterCouloir(d.ep, d.couloir, d.slot, survId);
        else if (d.reserveTT) AppData.mettreEnReserveTT(d.ep, survId);
        else if (d.reserve) AppData.mettreEnReserve(d.ep, survId);
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

    const REF = 18;   // quotité de référence si non renseignée
    const charges = AppData.surveillants.map(s => {
      const c = AppData.chargeSurveillant(s.id);
      const poids = s.heuresHebdo > 0 ? s.heuresHebdo : REF;
      return { s, ...c, poids, pondere: c.minutes * REF / poids };  // surveillance ramenée à l'équivalent 18 h
    });

    // Échelles indépendantes pour les deux jauges
    const maxMin    = Math.max(1, ...charges.map(c => c.minutes));    // temps de surveillance réel
    const maxHebdo  = Math.max(1, ...charges.map(c => c.poids));      // quotité hebdomadaire

    // Statistiques (sur les surveillants effectivement mobilisés)
    const actifs  = charges.filter(c => c.creneaux > 0);
    const moyenne = actifs.length ? actifs.reduce((a, c) => a + c.minutes, 0) / actifs.length : 0;
    const moyPond = actifs.length ? actifs.reduce((a, c) => a + c.pondere, 0) / actifs.length : 0;
    const ecart   = actifs.length
      ? Math.sqrt(actifs.reduce((a, c) => a + Math.pow(c.pondere - moyPond, 2), 0) / actifs.length) : 0;

    /**
     * Détection d'incohérence : on compare la charge PONDÉRÉE (temps de surveillance
     * ramené à 18 h/sem) à la moyenne pondérée. Un écart important signale un déséquilibre
     * au regard de la quotité — typiquement un petit temps partiel très sollicité (surcharge)
     * ou un temps plein peu sollicité (sous-charge). Seuil : ±25 % de la moyenne.
     */
    const statut = (c) => {
      if (!c.creneaux) return { cls: 'vide', flag: '', txt: 'Aucun créneau' };
      if (!moyPond)    return { cls: 'ok', flag: '', txt: '' };
      const r = c.pondere / moyPond;
      if (r >= 1.25) return { cls: 'haut', flag: '▲', txt: 'Surcharge au regard de la quotité' };
      if (r <= 0.75) return { cls: 'bas',  flag: '▼', txt: 'Sous-charge au regard de la quotité' };
      return { cls: 'ok', flag: '', txt: 'Équilibré' };
    };

    const lignes = charges
      .sort((a, b) => b.minutes - a.minutes ||              // 1) temps de surveillance réel décroissant
        (a.s.nom + a.s.prenom).localeCompare(b.s.nom + b.s.prenom, 'fr'))
      .map(c => {
        const st = statut(c);
        const hebdoTxt = c.s.heuresHebdo ? `${c.s.heuresHebdo} h/sem` : `${REF} h/sem (déf.)`;
        const wSurv  = Math.round(c.minutes / maxMin * 100);
        const wHebdo = Math.round(c.poids   / maxHebdo * 100);
        return `
          <div class="equite-row2 equite-${st.cls}" title="${escHtml(this._tooltipCharge(c.s.id))}">
            <div class="equite-nom2">
              ${st.flag ? `<span class="equite-flag flag-${st.cls}">${st.flag}</span>` : ''}
              <span class="equite-nom-txt">${escHtml(c.s.nom)} ${escHtml(c.s.prenom)}</span>
              <span class="dispo-count">${escHtml(hebdoTxt)}</span>
            </div>
            <div class="equite-jauges">
              <div class="equite-jauge" title="Temps de surveillance : ${AppData.formatDuree(c.minutes)}">
                <span class="equite-jauge-lib">Surveillance</span>
                <span class="equite-bar-wrap"><span class="equite-bar bar-surv" style="width:${wSurv}%"></span></span>
                <span class="equite-jauge-val"><strong>${AppData.formatDuree(c.minutes)}</strong> · ${c.creneaux} cr.</span>
              </div>
              <div class="equite-jauge" title="Quotité hebdomadaire habituelle : ${escHtml(hebdoTxt)}">
                <span class="equite-jauge-lib">Quotité</span>
                <span class="equite-bar-wrap"><span class="equite-bar bar-hebdo" style="width:${wHebdo}%"></span></span>
                <span class="equite-jauge-val">${c.s.heuresHebdo ? c.s.heuresHebdo + ' h/sem' : '—'}</span>
              </div>
            </div>
            ${st.txt ? `<div class="equite-statut statut-${st.cls}">${st.flag} ${escHtml(st.txt)}</div>` : '<div class="equite-statut"></div>'}
          </div>`;
      }).join('');

    const nbSans = charges.filter(c => !c.creneaux).length;
    const nbAlerte = charges.filter(c => { const s = statut(c); return s.cls === 'haut' || s.cls === 'bas'; }).length;

    zone.innerHTML = `
      <div class="calc-panel">
        <div class="calc-titre">⚖ Équité de la répartition
          <small style="font-weight:400">(surveillance + secrétariat + réserve, triée par temps de surveillance décroissant)</small></div>
        <div class="calc-desc">
          Temps de surveillance moyen : <strong>${AppData.formatDuree(Math.round(moyenne))}</strong>
          · Écart-type pondéré : <strong>${Math.round(ecart)} min éq. 18 h</strong>
          · ${nbSans} surveillant(s) sans créneau
          ${nbAlerte ? `· <strong style="color:#b45309">${nbAlerte} incohérence(s) détectée(s)</strong>` : '· <strong style="color:#15803d">aucune incohérence</strong>'}
          <br><small>Pour chaque personne, deux jauges : <strong>Surveillance</strong> (temps réellement effectué) et
          <strong>Quotité</strong> (heures hebdomadaires habituelles). Si les deux jauges sont nettement différentes,
          c'est le signe d'un déséquilibre : <span class="flag-haut">▲</span> beaucoup de surveillance pour une faible quotité,
          <span class="flag-bas">▼</span> peu de surveillance pour une quotité élevée.</small>
        </div>
        <div class="equite-grid2">${lignes}</div>
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

  _retirer(p) {
    if (p.couloir !== undefined) { AppData.desaffecterCouloir(p.ep, p.couloir, p.slot, p.surv); return; }
    if (p.reserveTT) AppData.retirerReserveTT(p.ep, p.surv);
    else if (p.reserve) AppData.retirerReserve(p.ep, p.surv);
    else AppData.desaffecter(p.ep, p.salle, p.surv);
  },
  _placer(p, survId) {
    if (p.couloir !== undefined) { AppData.affecterCouloir(p.ep, p.couloir, p.slot, survId); return; }
    if (p.reserveTT) AppData.mettreEnReserveTT(p.ep, survId);
    else if (p.reserve) AppData.mettreEnReserve(p.ep, survId);
    else AppData.affecter(p.ep, p.salle, survId);
  },
  _nom(id) { const s = AppData.getSurveillant(id); return s ? `${s.nom} ${s.prenom}` : '?'; },

  /** Déplacement d'un surveillant vers une autre zone (salle ou réserve) */
  _deplacer(src, dst) {
    if (src.ep === dst.ep && !dst.reserve === !src.reserve && !dst.reserveTT === !src.reserveTT
      && dst.salle === src.salle && dst.couloir === src.couloir && dst.slot === src.slot) return; // même zone

    const s = AppData.getSurveillant(src.surv);
    if (!s) return;
    if (!s.dispos[dst.ep]) {
      notifier(`${escHtml(this._nom(src.surv))} n\u2019est pas disponible sur cette épreuve.`, 'error');
      return;
    }
    this._retirer(src);
    const conflit = dst.couloir !== undefined
      ? (AppData.estAffecteEpreuve(dst.ep, src.surv) || AppData.estEnReserve(dst.ep, src.surv)
         || AppData.estEnReserveTT(dst.ep, src.surv) || AppData.creneauCouloirOccupe(dst.ep, dst.slot, src.surv))
      : AppData.estMobiliseEpreuve(dst.ep, src.surv);
    if (conflit) {
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
