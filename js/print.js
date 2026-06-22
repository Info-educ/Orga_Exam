/**
 * print.js — Documents imprimables
 * Orga Examens — v1.0
 *
 * Principe hérité d'Oral_DNB : chaque document est généré en HTML dans une
 * fenêtre dédiée avec son CSS inline (la popup ne charge pas style.css).
 *
 * Documents :
 *   1. Note d'organisation (synthèse générale)
 *   2. Planning général de surveillance
 *   3. Plannings individuels des surveillants (1 page / personne)
 *   4. Feuilles d'émargement (1 page / épreuve)
 *   5. Affiches portes de salles (A4 paysage)
 *   6. Fiches de préparation des salles (besoins matériels)
 *   7. Récapitulatif aménagements / secrétariat d'examen
 */

'use strict';

// ══════════════════════════════════════════════════════════════
// CONFIGURATION D'IMPRESSION
// ══════════════════════════════════════════════════════════════

const PrintConfig = {
  get() {
    const p = AppData.params;
    if (!p.impression) p.impression = {};
    const d = p.impression;
    return {
      logoBase64      : d.logoBase64 || null,
      signatureBase64 : d.signatureBase64 || null,
      minutesAvant : d.minutesAvant !== undefined ? d.minutesAvant : 15,
      minutesAvantCand : d.minutesAvantCand !== undefined ? d.minutesAvantCand : 20,
      minutesAvantSecr : d.minutesAvantSecr !== undefined ? d.minutesAvantSecr : 30,
      consignesSecr : d.consignesSecr || [
        `Présence en salle ${d.minutesAvantSecr !== undefined ? d.minutesAvantSecr : 30} minutes avant le début de l\u2019épreuve : préparation des postes (ordinateurs, sujets adaptés, copies, brouillons) et accueil des candidats.`,
        `Présence requise jusqu\u2019à ${AppData.params.margeSecr || 0} minutes après la fin du tiers temps : retour des copies au secrétariat, vérification des émargements et du matériel.`,
        'Secrétaire lecteur : lecture strictement littérale des sujets, sans reformulation ni explication.',
        'Secrétaire scripteur : écrire sous la dictée exclusive du candidat, orthographe d\u2019usage assurée.',
        'Confidentialité absolue sur les aménagements et la situation des candidats (RGPD).',
        'Tout incident est consigné au procès-verbal et signalé immédiatement au chef de centre.',
      ],
      consignesCouloir : d.consignesCouloir || [
        'Présence sur le couloir dès le début du créneau : la surveillance commence quand les surveillants entrent en salle.',
        'Circuler régulièrement sur toute la longueur du couloir ; veiller au silence absolu aux abords des salles.',
        'Accompagner les candidats aux sanitaires un par un ; noter la salle, l\u2019heure de sortie et de retour.',
        'Interdire tout regroupement et tout usage du téléphone dans les couloirs.',
        'Vérifier les issues et l\u2019affichage ; signaler immédiatement tout incident au chef de centre.',
        'Attendre l\u2019arrivée du surveillant du créneau suivant avant de quitter le poste.',
      ],
      fonctionSign : d.fonctionSign || 'Principal adjoint',
      genreSign    : d.genreSign || 'M',
      nomSign      : d.nomSign || '',
      consignes    : d.consignes || [
        'Les surveillants se présentent en salle avant le début de l\u2019épreuve (délai indiqué sur la convocation).',
        'Vérification de l\u2019identité des candidats et émargement à l\u2019entrée.',
        'Téléphones portables éteints et déposés ; aucun document non autorisé.',
        'Aucune sortie définitive avant la fin de la première heure.',
        'Tout incident est consigné au procès-verbal et signalé immédiatement à la direction.',
      ],
    };
  },
  set(values) {
    if (!AppData.params.impression) AppData.params.impression = {};
    Object.assign(AppData.params.impression, values);
    Unsaved.marquer();
  },
};

// ══════════════════════════════════════════════════════════════
// MODULE IMPRESSIONS
// ══════════════════════════════════════════════════════════════

const Impressions = {

  init() {
    $$('#tab-impressions [data-doc]').forEach(btn =>
      btn.addEventListener('click', () => this.generer(btn.dataset.doc)));

    $('#btn-print-config').addEventListener('click', () => this.ouvrirConfig());
    $('#form-print-config').addEventListener('submit', (e) => { e.preventDefault(); this.enregistrerConfig(); });
    $('#pc-logo').addEventListener('change', (e) => this._chargerImage(e, 'logoBase64', '#pc-logo-apercu', 'Logo'));
    $('#pc-logo-suppr').addEventListener('click', () => {
      PrintConfig.set({ logoBase64: null });
      $('#pc-logo-apercu').innerHTML = '<span class="field-hint">Aucun logo</span>';
    });
    $('#pc-signature').addEventListener('change', (e) => this._chargerImage(e, 'signatureBase64', '#pc-signature-apercu', 'Signature'));
    $('#pc-signature-suppr').addEventListener('click', () => {
      PrintConfig.set({ signatureBase64: null });
      $('#pc-signature-apercu').innerHTML = '<span class="field-hint">Aucune signature</span>';
    });
  },

  // ── Config ───────────────────────────────────────────────────

  ouvrirConfig() {
    const c = PrintConfig.get();
    $('#pc-fonction').value = c.fonctionSign;
    $('#pc-minutes-avant').value = c.minutesAvant;
    $('#pc-minutes-avant-cand').value = c.minutesAvantCand;
    $('#pc-minutes-avant-secr').value = c.minutesAvantSecr;
    $('#pc-genre').value = c.genreSign;
    $('#pc-nom').value = c.nomSign;
    $('#pc-consignes').value = c.consignes.join('\n');
    $('#pc-consignes-couloir').value = c.consignesCouloir.join('\n');
    $('#pc-consignes-secr').value = c.consignesSecr.join('\n');
    $('#pc-logo-apercu').innerHTML = c.logoBase64
      ? `<img src="${c.logoBase64}" alt="Logo" style="max-height:50px">`
      : '<span class="field-hint">Aucun logo</span>';
    $('#pc-signature-apercu').innerHTML = c.signatureBase64
      ? `<img src="${c.signatureBase64}" alt="Signature" style="max-height:50px">`
      : '<span class="field-hint">Aucune signature</span>';
    ouvrirModal('modal-print-config');
  },

  enregistrerConfig() {
    const _ancienDelai = PrintConfig.get().minutesAvant;
    PrintConfig.set({
      fonctionSign: $('#pc-fonction').value.trim(),
      minutesAvant: Math.max(0, parseInt($('#pc-minutes-avant').value, 10) || 0),
      minutesAvantCand: Math.max(0, parseInt($('#pc-minutes-avant-cand').value, 10) || 0),
      minutesAvantSecr: Math.max(0, parseInt($('#pc-minutes-avant-secr').value, 10) || 0),
      genreSign: $('#pc-genre').value,
      nomSign: $('#pc-nom').value.trim(),
      consignes: $('#pc-consignes').value.split('\n').map(l => l.trim()).filter(Boolean),
      consignesCouloir: $('#pc-consignes-couloir').value.split('\n').map(l => l.trim()).filter(Boolean),
      consignesSecr: $('#pc-consignes-secr').value.split('\n').map(l => l.trim()).filter(Boolean),
    });
    // Le délai de convocation détermine l'heure du 1er créneau de couloir :
    // s'il change, on DÉCALE les clés des affectations (et leurs verrous) pour ne rien perdre.
    const _nouveauDelai = PrintConfig.get().minutesAvant;
    if (_nouveauDelai !== _ancienDelai) {
      const decal = _ancienDelai - _nouveauDelai;
      Object.keys(AppData.affectationsCouloir).forEach(epId => {
        Object.keys(AppData.affectationsCouloir[epId]).forEach(cid => {
          const ancien = AppData.affectationsCouloir[epId][cid];
          const nouveau = {};
          Object.keys(ancien).forEach(deb => {
            const nd = AppData.addMinutes(deb, decal);
            nouveau[nd] = ancien[deb];
            ancien[deb].forEach(sv => {
              if (AppData.estVerrouille(epId, `C${cid}@${deb}`, sv)) {
                AppData.retirerVerrou(epId, `C${cid}@${deb}`, sv);
                AppData.verrous[AppData._cleVerrou(epId, `C${cid}@${nd}`, sv)] = true;
              }
            });
          });
          AppData.affectationsCouloir[epId][cid] = nouveau;
        });
      });
      Unsaved.marquer();
      if (window.Repartition) Repartition.rendre();
    }
    fermerModal('modal-print-config');
    notifier('Paramètres d\u2019impression enregistrés.');
  },

  _chargerImage(e, cle, selApercu, alt) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      PrintConfig.set({ [cle]: ev.target.result });
      $(selApercu).innerHTML = `<img src="${ev.target.result}" alt="${alt}" style="max-height:50px">`;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  // ── Dispatcher ───────────────────────────────────────────────

  generer(doc) {
    if (!AppData.epreuves.length && doc !== 'preparation') {
      notifier('Définissez d\u2019abord les épreuves.', 'error');
      return;
    }
    const fns = {
      note         : () => this.noteOrganisation(),
      planning     : () => this.planningGeneral(),
      individuels  : () => this.planningsIndividuels(),
      emargement   : () => this.feuillesEmargement(),
      affiches     : () => this.affichesPortes(),
      preparation  : () => this.fichesPreparation(),
      amenagements : () => this.recapAmenagements(),
      accompagnants: () => this.fichesAccompagnants(),
      secretariat  : () => this.recapSecretariat(),
      couloirs     : () => this.convocationsCouloirs(),
      convoccand   : () => this.convocationsCandidatsAmenagement(),
      recapsalles  : () => this.recapSallesEpreuves(),
      survsalle    : () => this.feuillesSurveillanceSalle(),
    };
    if (fns[doc]) fns[doc]();
  },

  // ── Socle popup d'impression ─────────────────────────────────

  _imprimer(titre, corps, paysage = false) {
    const css = `
      @page { size: A4 ${paysage ? 'landscape' : 'portrait'}; margin: 14mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; color: #111827; font-size: 11pt; line-height: 1.5; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .entete { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #0d2240; padding-bottom: 8px; margin-bottom: 16px; }
      .entete img { max-height: 52px; }
      .entete-titres { flex: 1; }
      .entete h1 { font-size: 15pt; color: #0d2240; }
      .entete .sous { font-size: 9.5pt; color: #6b7280; }
      h2 { font-size: 12.5pt; color: #163566; margin: 14px 0 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8px 0; }
      th { background: #0d2240; color: #fff; padding: 5px 8px; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; }
      td { border: 1px solid #d1d5db; padding: 5px 8px; vertical-align: middle; }
      tr:nth-child(even) td { background: #f9fafb; }
      .badge { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 8pt; font-weight: 700; }
      .badge-tt { background: #fef3c7; color: #92400e; }
      .badge-warn { background: #fee2e2; color: #991b1b; }
      .bloc { border: 1.5px solid #d1d5db; border-radius: 8px; padding: 10px 14px; margin: 10px 0; }
      .bloc-bleu { border-color: #dbeafe; background: #eff6ff; }
      ul { padding-left: 20px; margin: 6px 0; }
      li { margin: 3px 0; }
      .signature { margin-top: 28px; display: flex; justify-content: flex-end; }
      .signature-bloc { text-align: center; min-width: 220px; }
      .signature-ligne { margin-top: 52px; border-top: 1px solid #6b7280; padding-top: 4px; font-size: 9pt; color: #6b7280; }
      .signature-img { margin-top: 10px; }
      .pied { margin-top: 14px; font-size: 8pt; color: #9ca3af; text-align: center; }
      .affiche { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 95vh; text-align: center; }
      .affiche .bandeau { background: #0d2240; color: #fff; width: 100%; padding: 16px; font-size: 18pt; font-weight: 700; }
      .affiche .salle { font-size: 64pt; font-weight: 800; color: #b91c1c; margin: 36px 0 12px; }
      .affiche .detail { font-size: 20pt; color: #163566; margin: 6px 0; }
      .affiche .sep { width: 60%; border-top: 3px solid #fbbf24; margin: 20px 0; }
      .emarge-cell { height: 34px; }
      .grand-nombre { font-size: 22pt; font-weight: 800; color: #163566; }
    `;
    const w = window.open('', '_blank');
    if (!w) { notifier('Autorisez les fenêtres pop-up pour imprimer.', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${escHtml(titre)}</title><style>${css}</style></head><body>${corps}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  },

  _entete(titreDoc) {
    const c = PrintConfig.get();
    const p = AppData.params;
    return `
      <div class="entete">
        ${c.logoBase64 ? `<img src="${c.logoBase64}" alt="">` : ''}
        <div class="entete-titres">
          <h1>${escHtml(titreDoc)}</h1>
          <div class="sous">${escHtml(AppData.libelleExamen())} — Session ${escHtml(p.session)} · ${escHtml(p.etablissement)} · ${escHtml(p.annee)}</div>
        </div>
      </div>`;
  },

  _signature() {
    const c = PrintConfig.get();
    const p = AppData.params;
    const civ = c.genreSign === 'F' ? 'Mme' : 'M.';
    const img = c.signatureBase64
      ? `<div class="signature-img"><img src="${c.signatureBase64}" alt="Signature" style="max-height:60px;max-width:200px"></div>`
      : '';
    return `
      <div class="signature"><div class="signature-bloc">
        Fait à ${escHtml(p.lieuSignature || '__________')}, le ${new Date().toLocaleDateString('fr-FR')}
        ${img}
        <div class="signature-ligne" ${c.signatureBase64 ? 'style="margin-top:6px"' : ''}>${civ} ${escHtml(c.nomSign || '__________')}<br>${escHtml(c.fonctionSign)}</div>
      </div></div>`;
  },

  _pied() {
    return `<div class="pied">Document généré par Orga Examens — traitement local, aucune donnée transmise (RGPD).</div>`;
  },

  // ══════════════════════════════════════════════════════════
  // 1. NOTE D'ORGANISATION
  // ══════════════════════════════════════════════════════════

  noteOrganisation() {
    const c = PrintConfig.get();
    let corps = `<div class="page">${this._entete('Note d\u2019organisation — surveillance des épreuves')}`;

    corps += `<h2>1. Calendrier des épreuves</h2><table>
      <tr><th>Date</th><th>Épreuve</th><th>Début</th><th>Fin</th><th>Fin tiers temps</th></tr>
      ${AppData.epreuves.map(ep => `<tr>
        <td>${escHtml(AppData.formatDate(ep.date))}</td><td><strong>${escHtml(ep.matiere)}</strong></td>
        <td>${ep.heureDebut}</td><td>${AppData.heureFin(ep)}</td><td>${AppData.heureFinTT(ep)}</td></tr>`).join('')}
    </table>`;

    corps += `<h2>2. Salles mobilisées</h2><table>
      <tr><th>Salle</th><th>Type</th><th>Candidats</th><th>Surveillants requis</th></tr>
      ${AppData.salles.map(s => `<tr><td><strong>${escHtml(s.nom)}</strong></td>
        <td>${escHtml(AppData.typeSalleLabel(s.type))}</td>
        <td>${s.type === 'secretariat' ? '—' : s.candidats}</td><td>${s.nbSurveillants}</td></tr>`).join('')}
    </table>`;

    corps += `<h2>3. Consignes générales</h2>
      <div class="bloc bloc-bleu"><ul>${c.consignes.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul></div>`;

    corps += this._signature() + this._pied() + '</div>';
    this._imprimer('Note d\u2019organisation', corps);
  },

  // ══════════════════════════════════════════════════════════
  // 2. PLANNING GÉNÉRAL
  // ══════════════════════════════════════════════════════════

  planningGeneral() {
    let corps = `<div class="page">${this._entete('Planning général de surveillance')}`;

    AppData.jours().forEach(jour => {
      corps += `<h2>📅 ${escHtml(AppData.formatDate(jour))}</h2><table>
        <tr><th>Épreuve</th><th>Horaires</th><th>Salle</th><th>Candidats</th><th>Surveillants</th></tr>`;
      AppData.epreuves.filter(e => e.date === jour).forEach(ep => {
        AppData.sallesPourEpreuve(ep.id).forEach(salle => {
          const debut = AppData.heureDebutSalle(ep, salle);
          const fin = AppData.heureFinSalle(ep, salle);
          const noms = AppData.getAffectes(ep.id, salle.id)
            .map(id => { const s = AppData.getSurveillant(id); return s ? `${escHtml(s.nom)} ${escHtml(s.prenom)}` : ''; })
            .filter(Boolean).join(', ') || '<span class="badge badge-warn">Non pourvu</span>';
          corps += `<tr><td><strong>${escHtml(ep.matiere)}</strong></td>
            <td>${debut}–${fin}${salle.type === 'amenagee' ? ' <span class="badge badge-tt">TT</span>' : ''}${salle.type === 'secretariat' ? ' <span class="badge badge-tt">Secrétariat</span>' : ''}</td>
            <td>${escHtml(salle.nom)}</td><td>${salle.type === 'secretariat' ? '—' : (salle.candidats || '—')}</td><td>${noms}</td></tr>`;
        });
      });
      corps += '</table>';
    });

    corps += this._signature() + this._pied() + '</div>';
    this._imprimer('Planning général', corps);
  },

  // ══════════════════════════════════════════════════════════
  // 3. PLANNINGS INDIVIDUELS (1 page / surveillant affecté)
  // ══════════════════════════════════════════════════════════

  planningsIndividuels() {
    const c = PrintConfig.get();
    const concernes = AppData.surveillants.filter(s => AppData.chargeSurveillant(s.id).creneaux > 0);
    if (!concernes.length) { notifier('Aucun surveillant affecté : lancez la répartition.', 'error'); return; }

    let corps = '';
    concernes.forEach(surv => {
      // TOUTES les missions : salles, secrétariat, réserves, réserve TT, couloirs
      const creneaux = [];
      AppData.epreuves.forEach(ep => {
        AppData.sallesPourEpreuve(ep.id).forEach(salle => {
          if (AppData.getAffectes(ep.id, salle.id).includes(surv.id)) {
            const delai = salle.type === 'secretariat' ? c.minutesAvantSecr : c.minutesAvant;
            creneaux.push({
              ep, tri: ep.date + ep.heureDebut,
              poste: salle.type === 'secretariat'
                ? `🗂 Secrétariat — ${escHtml(salle.nom)} <span class="badge badge-tt">jusqu\u2019à fin TT${AppData.params.margeSecr ? ' + ' + AppData.params.margeSecr + ' min' : ''}</span>`
                : `Salle ${escHtml(salle.nom)}${salle.type === 'amenagee' ? ' <span class="badge badge-tt">Tiers temps</span>' : ''}`,
              presence: `<strong>${AppData.addMinutes(ep.heureDebut, -delai)}</strong> <small>(${delai} min avant)</small>`,
              debut: AppData.heureDebutSalle(ep, salle),
              fin: AppData.heureFinSalle(ep, salle),
            });
          }
        });
        if (AppData.estEnReserve(ep.id, surv.id)) {
          creneaux.push({
            ep, tri: ep.date + ep.heureDebut,
            poste: '🛟 Réserve <span class="badge badge-tt">remplacement immédiat</span>',
            presence: `<strong>${AppData.addMinutes(ep.heureDebut, -c.minutesAvant)}</strong> <small>(${c.minutesAvant} min avant)</small>`,
            debut: ep.heureDebut,
            fin: AppData.heureFin(ep),
          });
        }
        if (AppData.estEnReserveTT(ep.id, surv.id)) {
          creneaux.push({
            ep, tri: ep.date + ep.heureDebut,
            poste: '🛟⏳ Réserve tiers temps <span class="badge badge-tt">présence jusqu\u2019à la fin du TT</span>',
            presence: `<strong>${AppData.addMinutes(ep.heureDebut, -c.minutesAvant)}</strong> <small>(${c.minutesAvant} min avant)</small>`,
            debut: AppData.heureDebutTT(ep),
            fin: AppData.heureFinTT(ep),
          });
        }
        AppData.creneauxCouloirDe(ep, surv.id).forEach(cc => {
          creneaux.push({
            ep, tri: ep.date + cc.debut,
            poste: `🚶 Couloir — ${escHtml(cc.couloir.nom)}`,
            presence: `<strong>${cc.debut}</strong> <small>(début du créneau)</small>`,
            debut: ep.heureDebut,
            fin: cc.fin,
          });
        });
      });
      creneaux.sort((a, b) => a.tri.localeCompare(b.tri));
      const charge = AppData.chargeSurveillant(surv.id);

      corps += `<div class="page">${this._entete('Convocation — surveillance d\u2019examen')}
        <div class="bloc bloc-bleu" style="font-size:12pt">
          <strong>${escHtml(surv.nom)} ${escHtml(surv.prenom)}</strong> — ${escHtml(surv.fonction)}<br>
          ${creneaux.length} créneau(x) (surveillance, secrétariat, réserve, couloirs) ·
          charge totale : <strong>${AppData.formatDuree(charge.minutes)}</strong>
        </div>
        <table>
          <tr><th>Date</th><th>Épreuve</th><th>Poste</th><th>Présence</th><th>Début de l\u2019épreuve</th><th>Fin</th></tr>
          ${creneaux.map(cr => `<tr>
            <td>${escHtml(AppData.formatDate(cr.ep.date))}</td>
            <td><strong>${escHtml(cr.ep.matiere)}</strong></td>
            <td>${cr.poste}</td>
            <td>${cr.presence}</td>
            <td>${cr.debut}</td>
            <td><strong>${cr.fin}</strong></td></tr>`).join('')}
        </table>
        <h2>Consignes</h2>
        <div class="bloc"><ul>${c.consignes.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul></div>
        ${this._signature()}${this._pied()}
      </div>`;
    });

    this._imprimer('Plannings individuels', corps);
  },

  // ══════════════════════════════════════════════════════════
  // 4. FEUILLES D'ÉMARGEMENT (1 page / épreuve)
  // ══════════════════════════════════════════════════════════

  feuillesEmargement() {
    let corps = '';
    AppData.epreuves.forEach(ep => {
      const lignes = [];
      AppData.sallesPourEpreuve(ep.id).forEach(salle => {
        AppData.getAffectes(ep.id, salle.id).forEach(id => {
          const s = AppData.getSurveillant(id);
          if (s) lignes.push({ s, salle });
        });
      });
      corps += `<div class="page">${this._entete('Feuille d\u2019émargement des surveillants')}
        <div class="bloc bloc-bleu"><strong>${escHtml(ep.matiere)}</strong> — ${escHtml(AppData.formatDate(ep.date))} · ${ep.heureDebut}–${AppData.heureFin(ep)}</div>
        <table>
          <tr><th style="width:34%">Surveillant</th><th style="width:16%">Salle</th><th style="width:25%">Signature arrivée</th><th style="width:25%">Signature départ</th></tr>
          ${lignes.length ? lignes.map(l => `<tr>
            <td><strong>${escHtml(l.s.nom)}</strong> ${escHtml(l.s.prenom)}</td>
            <td>${escHtml(l.salle.nom)}</td><td class="emarge-cell"></td><td class="emarge-cell"></td></tr>`).join('')
          : '<tr><td colspan="4">Aucun surveillant affecté.</td></tr>'}
        </table>
        ${this._signature()}${this._pied()}
      </div>`;
    });
    this._imprimer('Feuilles d\u2019émargement', corps);
  },

  // ══════════════════════════════════════════════════════════
  // 5. AFFICHES PORTES DE SALLES (A4 paysage)
  // ══════════════════════════════════════════════════════════

  affichesPortes() {
    const salles = AppData.salles.filter(s => s.type !== 'secretariat');
    if (!salles.length) { notifier('Aucune salle d\u2019examen définie.', 'error'); return; }

    let corps = '';
    salles.forEach(salle => {
      const eps = AppData.epreuves.filter(ep => AppData.sallesPourEpreuve(ep.id).some(s => s.id === salle.id));
      corps += `<div class="page"><div class="affiche">
        <div class="bandeau">${escHtml(AppData.libelleExamen())} — Session ${escHtml(AppData.params.session)}</div>
        <div class="salle">Salle ${escHtml(salle.nom)}</div>
        ${salle.type === 'amenagee' ? '<div class="detail">♿ Salle aménagée — temps majoré</div>' : ''}${salle.type === 'secretariat' ? '<div class="detail">🗂 Secrétariat d\\u2019examen — présence jusqu\\u2019à la fin du tiers temps</div>' : ''}
        <div class="sep"></div>
        ${eps.map(ep => `<div class="detail"><strong>${escHtml(ep.matiere)}</strong> — ${escHtml(AppData.formatDateCourt(ep.date))} · ${AppData.heureDebutSalle(ep, salle)}–${AppData.heureFinSalle(ep, salle)}</div>`).join('')}
        <div class="sep"></div>
        <div class="detail">Silence — Épreuve en cours</div>
      </div></div>`;
    });
    this._imprimer('Affiches portes', corps, true);
  },

  // ══════════════════════════════════════════════════════════
  // 6. FICHES DE PRÉPARATION DES SALLES
  // ══════════════════════════════════════════════════════════

  fichesPreparation() {
    const salles = AppData.salles.filter(s => s.type !== 'secretariat');
    if (!salles.length) { notifier('Aucune salle d\u2019examen définie.', 'error'); return; }

    let corps = `<div class="page">${this._entete('Fiches de préparation des salles')}
      <p>À destination des agents et de la vie scolaire — marge fournitures : ${AppData.params.margeMateriel} %.</p>`;

    salles.forEach(salle => {
      const b = AppData.besoinsSalle(salle);
      corps += `<div class="bloc">
        <strong style="font-size:12pt">Salle ${escHtml(salle.nom)}</strong>
        ${salle.type === 'amenagee' ? ' <span class="badge badge-tt">♿ Aménagée</span>' : ''}
        — ${salle.candidats} candidat(s)${salle.capacite ? ` / ${salle.capacite} places` : ''}
        <table style="margin-top:6px">
          <tr><th>Sujets</th><th>Copies doubles</th><th>Brouillons</th><th>Matériel spécifique</th></tr>
          <tr>
            <td class="grand-nombre" style="text-align:center">${b.sujets}</td>
            <td class="grand-nombre" style="text-align:center">${b.copies}</td>
            <td class="grand-nombre" style="text-align:center">${b.brouillons}</td>
            <td>${escHtml(salle.materiel || 'Horloge visible, affichage retiré des murs')}</td>
          </tr>
        </table>
        ${salle.notes ? `<small>${escHtml(salle.notes)}</small>` : ''}
      </div>`;
    });

    corps += this._signature() + this._pied() + '</div>';
    this._imprimer('Fiches de préparation', corps);
  },

  // ══════════════════════════════════════════════════════════
  // 7. RÉCAP AMÉNAGEMENTS / SECRÉTARIAT D'EXAMEN
  // ══════════════════════════════════════════════════════════

  recapAmenagements() {
    if (!AppData.amenagements.length) { notifier('Aucun aménagement recensé.', 'error'); return; }

    let corps = `<div class="page">${this._entete('Aménagements d\u2019épreuves & secrétariat d\u2019examen')}
      <div class="bloc bloc-bleu">Document confidentiel — diffusion restreinte aux personnels concernés (RGPD).</div>
      <table>
        <tr><th>Candidat</th><th>Classe</th><th>Aménagements</th><th>Salle</th><th>Accompagnant</th><th>Observations</th></tr>
        ${AppData.amenagements.map(a => {
          const salle = a.salleId ? AppData.getSalle(a.salleId) : null;
          return `<tr>
            <td><strong>${escHtml(a.candidat)}</strong></td>
            <td>${escHtml(a.classe || '—')}</td>
            <td>${AppData.amenagementBadges(a).map(b => escHtml(b)).join(' · ') || '—'}</td>
            <td>${salle ? escHtml(salle.nom) : '<span class="badge badge-warn">À définir</span>'}</td>
            <td>${escHtml(a.accompagnant || '—')}</td>
            <td>${escHtml(a.notes || '')}</td></tr>`;
        }).join('')}
      </table>
      ${this._signature()}${this._pied()}
    </div>`;
    this._imprimer('Récap aménagements', corps);
  },

  // ══════════════════════════════════════════════════════════
  // CONVOCATIONS CANDIDATS — priorité aux candidats à aménagement
  // Une page par candidat : épreuves, salle, horaires (tiers temps
  // pris en compte), liste des aménagements accordés.
  // ══════════════════════════════════════════════════════════

  convocationsCandidatsAmenagement() {
    const c = PrintConfig.get();
    if (!AppData.amenagements.length) { notifier('Aucun candidat à aménagement recensé.', 'error'); return; }

    // Pour un aménagement donné, déterminer les épreuves concernées et la salle de passage.
    // 1) Si un candidat nominatif y est rattaché : on s'appuie sur ses épreuves / salleParEpreuve.
    // 2) Sinon : on s'appuie sur la salle de l'aménagement et les épreuves de cette salle.
    const lignesPourAmenagement = (a) => {
      const cand = AppData.candidatPourAmenagement
        ? AppData.candidatPourAmenagement(a.id) : null;

      // a) Candidat nominatif avec affectation de salle par épreuve
      if (cand && cand.salleParEpreuve && Object.keys(cand.salleParEpreuve).length) {
        return Object.entries(cand.salleParEpreuve)
          .map(([epId, salleId]) => ({
            ep: AppData.getEpreuve(parseInt(epId, 10)),
            salle: AppData.getSalle(salleId),
          }))
          .filter(x => x.ep);
      }

      // b) Candidat nominatif avec liste d'épreuves mais sans salle précise → salle de l'aménagement
      const salleAm = a.salleId ? AppData.getSalle(a.salleId) : null;
      if (cand && Array.isArray(cand.epreuveIds) && cand.epreuveIds.length) {
        return cand.epreuveIds
          .map(epId => ({ ep: AppData.getEpreuve(epId), salle: salleAm }))
          .filter(x => x.ep);
      }

      // c) Repli : aménagement saisi à la main → épreuves desservies par sa salle,
      //    sinon (aucune salle) toutes les épreuves.
      const eps = salleAm
        ? AppData.epreuves.filter(ep => !salleAm.epreuveIds.length || salleAm.epreuveIds.includes(ep.id))
        : AppData.epreuves;
      return eps.map(ep => ({ ep, salle: salleAm }));
    };

    // Tri : par nom de candidat
    const liste = [...AppData.amenagements]
      .sort((a, b) => (a.candidat || '').localeCompare(b.candidat || '', 'fr'));

    let corps = '';
    liste.forEach(a => {
      const cand = AppData.candidatPourAmenagement
        ? AppData.candidatPourAmenagement(a.id) : null;
      const nom = cand
        ? `${escHtml(cand.nom)} ${escHtml(cand.prenom)}`.trim()
        : escHtml(a.candidat || '—');
      const classe = (cand && cand.classe) ? cand.classe : (a.classe || '');
      const badges = AppData.amenagementBadges(a);

      const rangs = lignesPourAmenagement(a)
        .sort((x, y) => ((x.ep.date + x.ep.heureDebut)
          .localeCompare(y.ep.date + y.ep.heureDebut)));

      // Numéro d'anonymat éventuel (identique sur toutes les épreuves dans la plupart
      // des cas ; on prend le premier renseigné).
      const numero = cand && cand.numerosAnonymat
        ? (Object.values(cand.numerosAnonymat).find(Boolean) || '')
        : '';

      corps += `<div class="page">${this._entete('Convocation individuelle du candidat')}
        <div class="bloc bloc-bleu" style="font-size:12pt">
          ${numero ? `N° ${escHtml(numero)} — ` : ''}<strong>${nom}</strong>${classe ? ` — classe ${escHtml(classe)}` : ''}<br>
          <span class="badge badge-tt">Aménagements d\u2019épreuves accordés</span>
          <div style="margin-top:6px">Vous devez vous présenter <strong>${c.minutesAvantCand} minutes avant</strong>
          le début de chaque épreuve, muni(e) d\u2019une pièce d\u2019identité et de votre convocation.</div>
        </div>

        <h2>Vos épreuves</h2>
        <table>
          <tr><th>Date</th><th>Épreuve</th><th>Salle</th><th>Début</th><th>Fin${'\u00A0'}(tiers temps inclus)</th></tr>
          ${rangs.length ? rangs.map(({ ep, salle }) => {
            const debut = salle ? AppData.heureDebutSalle(ep, salle) : ep.heureDebut;
            const fin   = salle ? AppData.heureFinSalle(ep, salle)   : AppData.heureFinTT(ep);
            const tt    = (!salle || AppData.estHoraireTT(salle)) ? ' <span class="badge badge-tt">TT</span>' : '';
            return `<tr>
              <td>${escHtml(AppData.formatDate(ep.date))}</td>
              <td><strong>${escHtml(ep.matiere)}</strong>${tt}</td>
              <td>${salle ? escHtml(salle.nom) : '<span class="badge badge-warn">À préciser</span>'}</td>
              <td><strong>${debut}</strong></td>
              <td><strong>${fin}</strong></td>
            </tr>`;
          }).join('') : '<tr><td colspan="5">Épreuves à préciser.</td></tr>'}
        </table>

        <h2>Aménagements accordés</h2>
        <div class="bloc">
          ${badges.length
            ? `<ul>${badges.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul>`
            : 'Aucun aménagement spécifique enregistré.'}
          ${a.notes ? `<p style="margin-top:6px"><em>${escHtml(a.notes)}</em></p>` : ''}
        </div>

        ${this._signature()}${this._pied()}
      </div>`;
    });

    this._imprimer('Convocations candidats — aménagements', corps);
  },

  // ══════════════════════════════════════════════════════════
  // RÉCAP SALLES × ÉPREUVES × HORAIRES — une page, vue synthétique
  // Une ligne par couple (salle, épreuve) ; la salle n'est écrite
  // que sur la première ligne de son groupe (rowspan).
  // ══════════════════════════════════════════════════════════

  recapSallesEpreuves() {
    if (!AppData.salles.length) { notifier('Aucune salle définie.', 'error'); return; }

    // Pour chaque salle, la liste des épreuves qui s'y déroulent, triées par date/heure.
    const groupes = AppData.salles.map(salle => {
      const eps = AppData.epreuves
        .filter(ep => AppData.sallesPourEpreuve(ep.id).some(s => s.id === salle.id))
        .sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));
      return { salle, eps };
    }).filter(g => g.eps.length);

    if (!groupes.length) { notifier('Aucune épreuve associée à une salle.', 'error'); return; }

    let lignes = '';
    groupes.forEach(({ salle, eps }) => {
      eps.forEach((ep, i) => {
        const debut = AppData.heureDebutSalle(ep, salle);
        const fin   = AppData.heureFinSalle(ep, salle);
        const tt    = AppData.estHoraireTT(salle) ? ' <span class="badge badge-tt">TT</span>' : '';
        lignes += `<tr>
          ${i === 0
            ? `<td rowspan="${eps.length}" style="vertical-align:top"><strong>${escHtml(salle.nom)}</strong>${salle.type === 'amenagee' ? '<br><span class="badge badge-tt">Aménagée</span>' : ''}${salle.type === 'secretariat' ? '<br><span class="badge badge-tt">Secrétariat</span>' : ''}</td>`
            : ''}
          <td><strong>${escHtml(ep.matiere)}</strong>${tt}</td>
          <td>${escHtml(AppData.formatDateCourt(ep.date))}</td>
          <td>${debut}</td>
          <td>${fin}</td>
        </tr>`;
      });
    });

    const corps = `<div class="page">${this._entete('Récapitulatif des salles et épreuves')}
      <table>
        <tr><th style="width:24%">Salle</th><th>Épreuve</th><th style="width:18%">Date</th><th style="width:12%">Début</th><th style="width:18%">Fin${'\u00A0'}(tiers temps inclus)</th></tr>
        ${lignes}
      </table>
      ${this._signature()}${this._pied()}
    </div>`;

    this._imprimer('Récap salles et épreuves', corps);
  },

  // ══════════════════════════════════════════════════════════
  // FEUILLES DE SURVEILLANCE PAR SALLE — une page par salle
  // Pour chaque salle : ses épreuves avec horaires et surveillants
  // affectés ; en bas, les personnels de réserve (réserve + réserve
  // tiers temps) mobilisables pour ces épreuves.
  // ══════════════════════════════════════════════════════════

  feuillesSurveillanceSalle() {
    if (!AppData.salles.length) { notifier('Aucune salle définie.', 'error'); return; }

    const nomSurv = id => { const s = AppData.getSurveillant(id);
      return s ? `${escHtml(s.nom)} ${escHtml(s.prenom)}${s.fonction ? ` <span style="color:#666">(${escHtml(s.fonction)})</span>` : ''}` : ''; };

    // Salles ayant au moins une épreuve
    const groupes = AppData.salles.map(salle => {
      const eps = AppData.epreuves
        .filter(ep => AppData.sallesPourEpreuve(ep.id).some(s => s.id === salle.id))
        .sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));
      return { salle, eps };
    }).filter(g => g.eps.length);

    if (!groupes.length) { notifier('Aucune épreuve associée à une salle.', 'error'); return; }

    let corps = '';
    groupes.forEach(({ salle, eps }) => {
      const typeBadge = salle.type === 'amenagee' ? ' <span class="badge badge-tt">Aménagée</span>'
        : salle.type === 'secretariat' ? ' <span class="badge badge-tt">Secrétariat</span>' : '';

      // Réserves agrégées sur les épreuves de la salle (dédoublonnées)
      const reserveIds = new Set();
      const reserveTTIds = new Set();
      eps.forEach(ep => {
        (AppData.reserves[ep.id] || []).forEach(id => reserveIds.add(id));
        (AppData.reservesTT[ep.id] || []).forEach(id => reserveTTIds.add(id));
      });

      const lignesEp = eps.map(ep => {
        const debut = AppData.heureDebutSalle(ep, salle);
        const fin   = AppData.heureFinSalle(ep, salle);
        const survs = AppData.getAffectes(ep.id, salle.id);
        const noms = survs.length
          ? `<ul style="margin:0;padding-left:18px">${survs.map(id => `<li>${nomSurv(id)}</li>`).join('')}</ul>`
          : '<em style="color:#999">Aucun surveillant affecté</em>';
        return `<tr>
          <td style="vertical-align:top"><strong>${escHtml(ep.matiere)}</strong><br>
            <span style="color:#666">${escHtml(AppData.formatDateCourt(ep.date))}</span></td>
          <td style="vertical-align:top">${debut}<br>→ ${fin}</td>
          <td style="vertical-align:top">${noms}</td>
        </tr>`;
      }).join('');

      const blocReserve = (reserveIds.size || reserveTTIds.size)
        ? `<h2>Personnels de réserve</h2>
           <div class="bloc">
             ${reserveIds.size ? `<strong>Réserve :</strong> ${[...reserveIds].map(nomSurv).filter(Boolean).join(', ')}<br>` : ''}
             ${reserveTTIds.size ? `<strong>Réserve tiers temps :</strong> ${[...reserveTTIds].map(nomSurv).filter(Boolean).join(', ')}` : ''}
           </div>`
        : `<h2>Personnels de réserve</h2><div class="bloc"><em style="color:#999">Aucune réserve définie pour ces épreuves.</em></div>`;

      corps += `<div class="page">${this._entete('Feuille de surveillance — salle')}
        <div class="bloc bloc-bleu" style="font-size:12pt">
          Salle <strong>${escHtml(salle.nom)}</strong>${typeBadge}
          ${salle.type !== 'secretariat' ? ` — capacité ${salle.candidats || '—'} candidat(s)` : ''}
        </div>

        <h2>Épreuves et surveillances</h2>
        <table>
          <tr><th style="width:30%">Épreuve</th><th style="width:18%">Horaires</th><th>Surveillant(s) affecté(s)</th></tr>
          ${lignesEp}
        </table>

        ${blocReserve}

        ${this._signature()}${this._pied()}
      </div>`;
    });

    this._imprimer('Feuilles de surveillance par salle', corps);
  },

  /** Convocations surveillants de couloirs — une page par personnel, consignes éditables */
  convocationsCouloirs() {
    const c = PrintConfig.get();
    if (!AppData.couloirs.length) { notifier('Aucun couloir défini (onglet Salles).', 'error'); return; }

    // survId → [{ ep, couloir, debut, fin, duree }]
    const parPers = new Map();
    AppData.epreuves.forEach(ep => {
      AppData.surveillants.forEach(sv => {
        AppData.creneauxCouloirDe(ep, sv.id).forEach(cc => {
          if (!parPers.has(sv.id)) parPers.set(sv.id, []);
          parPers.get(sv.id).push({ ep, ...cc });
        });
      });
    });
    if (!parPers.size) { notifier('Aucun surveillant affecté aux couloirs — lancez la répartition.', 'error'); return; }

    const blocConsignes = `
      <div class="bloc bloc-bleu"><strong>Consignes — surveillance des couloirs</strong>
        <ul>${c.consignesCouloir.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul>
      </div>`;

    let corps = '';
    [...parPers.entries()]
      .map(([id, crs]) => ({ sv: AppData.getSurveillant(id), crs }))
      .filter(x => x.sv)
      .sort((a, b) => (a.sv.nom + a.sv.prenom).localeCompare(b.sv.nom + b.sv.prenom, 'fr'))
      .forEach(({ sv, crs }) => {
        const totalMin = crs.reduce((a, x) => a + x.duree, 0);
        corps += `<div class="page">${this._entete(`Convocation surveillance de couloir — ${escHtml(sv.nom)} ${escHtml(sv.prenom)}`)}
          <div class="bloc bloc-bleu">${escHtml(sv.fonction || '')} —
            <strong>${crs.length} créneau(x), ${AppData.formatDuree(totalMin)}</strong> au total.
            La surveillance de couloir débute <strong>dès le début du créneau</strong> indiqué
            (au moment où les surveillants de salle prennent leur poste).</div>
          <table>
            <tr><th>Date</th><th>Épreuve</th><th>Couloir</th><th>Début du créneau</th><th>Fin du créneau</th><th>Durée</th></tr>
            ${crs.sort((x, y) => (x.ep.date + x.debut).localeCompare(y.ep.date + y.debut)).map(x => `<tr>
              <td>${escHtml(AppData.formatDate(x.ep.date))}</td>
              <td>${escHtml(x.ep.matiere)}</td>
              <td><strong>🚶 ${escHtml(x.couloir.nom)}</strong></td>
              <td><strong>${x.debut}</strong></td>
              <td>${x.fin}</td>
              <td>${AppData.formatDuree(x.duree)}</td>
            </tr>`).join('')}
          </table>
          ${blocConsignes}
          ${this._signature()}${this._pied()}
        </div>`;
      });

    this._imprimer('Convocations couloirs', corps);
  },

  /** Secrétariat d'examen — vue d'ensemble + convocation individuelle détaillée par personnel */
  recapSecretariat() {
    const c = PrintConfig.get();
    const sallesSecr = AppData.salles.filter(s => s.type === 'secretariat');
    if (!sallesSecr.length) { notifier('Aucune salle de type secrétariat d\u2019examen.', 'error'); return; }

    const creneauxSalle = [];   // { ep, salle, affectes }
    AppData.epreuves.forEach(ep => {
      sallesSecr
        .filter(salle => !salle.epreuveIds.length || salle.epreuveIds.includes(ep.id))
        .forEach(salle => creneauxSalle.push({ ep, salle, affectes: AppData.getAffectes(ep.id, salle.id) }));
    });
    if (!creneauxSalle.length) { notifier('Aucune épreuve associée aux salles de secrétariat.', 'error'); return; }

    const consignesSecr = `
      <div class="bloc bloc-bleu"><strong>Consignes — secrétariat d\u2019examen</strong>
        <ul>${c.consignesSecr.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul>
      </div>`;

    // ── Page 1 : vue d'ensemble ──
    let lignes = '';
    creneauxSalle.forEach(({ ep, salle, affectes }) => {
      const noms = affectes
        .map(id => { const sv = AppData.getSurveillant(id); return sv ? `${escHtml(sv.nom)} ${escHtml(sv.prenom)}` : ''; })
        .filter(Boolean).join('<br>') || '<span class="badge badge-warn">À pourvoir</span>';
      const candidats = AppData.amenagements.filter(a => a.salleId === salle.id)
        .map(a => `${escHtml(a.candidat)}${a.classe ? ' (' + escHtml(a.classe) + ')' : ''}`)
        .join(', ') || '—';
      lignes += `<tr>
        <td>${escHtml(AppData.formatDateCourt(ep.date))}</td>
        <td><strong>${escHtml(ep.matiere)}</strong></td>
        <td>${escHtml(salle.nom)}</td>
        <td><strong>${AppData.addMinutes(AppData.heureDebutSalle(ep, salle), -c.minutesAvantSecr)}</strong><br><small>(${c.minutesAvantSecr} min avant)</small></td>
        <td>${AppData.heureDebutSalle(ep, salle)}</td>
        <td><strong>${AppData.heureFinSalle(ep, salle)}</strong><br><span class="badge badge-tt">fin TT${AppData.params.margeSecr ? ' + ' + AppData.params.margeSecr + ' min' : ''}</span></td>
        <td>${AppData.formatDuree(AppData.dureeCreneau(ep, salle))}</td>
        <td>${noms}</td>
        <td>${candidats}</td>
      </tr>`;
    });

    let corps = `<div class="page">${this._entete('Secrétariat d\u2019examen — organisation générale')}
      <div class="bloc bloc-bleu">Document confidentiel — diffusion restreinte (RGPD).</div>
      <table>
        <tr><th>Date</th><th>Épreuve</th><th>Salle</th><th>Présence</th><th>Début</th><th>Fin</th><th>Durée</th><th>Personnels</th><th>Candidats accompagnés</th></tr>
        ${lignes}
      </table>
      ${consignesSecr}
      ${this._signature()}${this._pied()}
    </div>`;

    // ── Pages suivantes : convocation individuelle par personnel ──
    const parPers = new Map();   // survId → [{ ep, salle }]
    creneauxSalle.forEach(({ ep, salle, affectes }) =>
      affectes.forEach(id => {
        if (!parPers.has(id)) parPers.set(id, []);
        parPers.get(id).push({ ep, salle });
      }));

    [...parPers.entries()]
      .map(([id, crs]) => ({ sv: AppData.getSurveillant(id), crs }))
      .filter(x => x.sv)
      .sort((a, b) => (a.sv.nom + a.sv.prenom).localeCompare(b.sv.nom + b.sv.prenom, 'fr'))
      .forEach(({ sv, crs }) => {
        const totalMin = crs.reduce((a, x) => a + AppData.dureeCreneau(x.ep, x.salle), 0);

        corps += `<div class="page">${this._entete(`Convocation secrétariat d\u2019examen — ${escHtml(sv.nom)} ${escHtml(sv.prenom)}`)}
          <div class="bloc bloc-bleu">${escHtml(sv.fonction || '')} —
            <strong>${crs.length} créneau(x), ${AppData.formatDuree(totalMin)}</strong> au total.
            Présence requise <strong>${c.minutesAvantSecr} minutes avant</strong> chaque épreuve,
            et jusqu\u2019à <strong>${AppData.params.margeSecr || 0} min après la fin du tiers temps</strong> (vérifications).</div>
          <table>
            <tr><th>Date</th><th>Épreuve</th><th>Salle</th><th>Présence en salle</th><th>Début de l\u2019épreuve</th><th>Fin de présence</th><th>Durée</th></tr>
            ${crs.sort((x, y) => (x.ep.date + x.ep.heureDebut).localeCompare(y.ep.date + y.ep.heureDebut)).map(({ ep, salle }) => `<tr>
              <td>${escHtml(AppData.formatDate(ep.date))}</td>
              <td><strong>${escHtml(ep.matiere)}</strong></td>
              <td><strong>${escHtml(salle.nom)}</strong></td>
              <td><strong>${AppData.addMinutes(AppData.heureDebutSalle(ep, salle), -c.minutesAvantSecr)}</strong> <small>(${c.minutesAvantSecr} min avant)</small></td>
              <td>${AppData.heureDebutSalle(ep, salle)}</td>
              <td><strong>${AppData.heureFinSalle(ep, salle)}</strong></td>
              <td>${AppData.formatDuree(AppData.dureeCreneau(ep, salle))}</td>
            </tr>`).join('')}
          </table>
          ${crs.map(({ ep, salle }) => {
            const cands = AppData.amenagements.filter(a => a.salleId === salle.id);
            if (!cands.length) return '';
            return `<h2>${escHtml(ep.matiere)} (${escHtml(AppData.formatDateCourt(ep.date))}) — salle ${escHtml(salle.nom)} : candidats et aménagements</h2>
              <table>
                <tr><th>Candidat</th><th>Classe</th><th>Aménagements</th></tr>
                ${cands.map(a => `<tr>
                  <td><strong>${escHtml(a.candidat)}</strong></td>
                  <td>${escHtml(a.classe || '—')}</td>
                  <td>${AppData.amenagementBadges(a).map(b => escHtml(b)).join(' · ') || '—'}</td>
                </tr>`).join('')}
              </table>`;
          }).join('')}
          ${salleMateriel(crs)}
          ${consignesSecr}
          ${this._signature()}${this._pied()}
        </div>`;
      });

    function salleMateriel(crs) {
      const salles = [...new Map(crs.map(x => [x.salle.id, x.salle])).values()]
        .filter(sa => (sa.materiel || '').trim());
      if (!salles.length) return '';
      return `<h2>Matériel à prévoir</h2><ul>${salles.map(sa =>
        `<li><strong>${escHtml(sa.nom)}</strong> : ${escHtml(sa.materiel)}</li>`).join('')}</ul>`;
    }

    this._imprimer('Secrétariat d\u2019examen', corps);
  },

  /** 8. Fiches accompagnants — une page par accompagnant (lecteur/scripteur, AESH…) */
  fichesAccompagnants() {
    const heures = AppData.heuresAccompagnants();
    if (!heures.size) { notifier('Aucun accompagnant renseigné (fiche candidat ou épreuve).', 'error'); return; }

    // Regroupement candidat par accompagnant (les missions par épreuve viennent de heuresAccompagnants)
    const parAcc = new Map();
    [...heures.keys()].forEach(nom => parAcc.set(nom, []));
    AppData.amenagements.filter(a => (a.accompagnant || '').trim()).forEach(a => {
      const cle = a.accompagnant.trim();
      if (!parAcc.has(cle)) parAcc.set(cle, []);
      parAcc.get(cle).push(a);
    });

    let corps = '';
    parAcc.forEach((amens, nom) => {
      const h = heures.get(nom);
      const missionsEp = (h ? h.creneaux : []).filter(c => c.type === 'epreuve');
      corps += `<div class="page">${this._entete(`Fiche accompagnant — ${escHtml(nom)}`)}
        <div class="bloc bloc-bleu">Document confidentiel — diffusion restreinte (RGPD).
          Présence requise <strong>${PrintConfig.get().minutesAvant} minutes avant</strong> chaque épreuve.
          ${h ? `· Total : <strong>${h.creneaux.length} créneau(x) — ${AppData.formatDuree(h.minutes)}</strong>` : ''}</div>`;

      if (missionsEp.length) {
        corps += `<h2>Missions sur épreuve entière (plusieurs candidats)</h2>
          <table>
            <tr><th>Date</th><th>Épreuve</th><th>Début</th><th>Fin de présence</th><th>Durée</th></tr>
            ${missionsEp.map(c => `<tr>
              <td>${escHtml(AppData.formatDateCourt(c.ep.date))}</td>
              <td><strong>${escHtml(c.ep.matiere)}</strong></td>
              <td>${AppData.heureDebutTT(c.ep)}</td>
              <td>${AppData.heureFinTT(c.ep)}</td>
              <td>${AppData.formatDuree(c.duree)}</td>
            </tr>`).join('')}
          </table>`;
      }

      amens.forEach(a => {
        const salle = a.salleId ? AppData.getSalle(a.salleId) : null;
        const roles = AppData.amenagementBadges(a).join(' · ') || '—';
        const eps = salle
          ? AppData.epreuves.filter(ep => !salle.epreuveIds.length || salle.epreuveIds.includes(ep.id))
          : [];

        corps += `<div class="bloc">
          <strong>Candidat : ${escHtml(a.candidat)}</strong>${a.classe ? ` — classe ${escHtml(a.classe)}` : ''}<br>
          Mission : ${escHtml(roles)}<br>
          Salle : <strong>${salle ? escHtml(salle.nom) : 'à définir'}</strong>
          ${a.notes ? `<br>Observations : ${escHtml(a.notes)}` : ''}
        </div>`;

        if (eps.length) {
          corps += `<table>
            <tr><th>Date</th><th>Épreuve</th><th>Début</th><th>Fin${AppData.estHoraireTT(salle) ? ' (tiers temps)' : ''}</th></tr>
            ${eps.map(ep => `<tr>
              <td>${escHtml(AppData.formatDateCourt(ep.date))}</td>
              <td><strong>${escHtml(ep.matiere)}</strong></td>
              <td>${AppData.heureDebutSalle(ep, salle)}</td>
              <td>${AppData.heureFinSalle(ep, salle)}</td>
            </tr>`).join('')}
          </table>`;
        }
      });

      corps += `${this._signature()}${this._pied()}</div>`;
    });

    this._imprimer('Fiches accompagnants', corps);
  },
};
window.Impressions = Impressions;
window.PrintConfig = PrintConfig;
