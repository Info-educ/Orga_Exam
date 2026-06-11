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
      logoBase64   : d.logoBase64 || null,
      fonctionSign : d.fonctionSign || 'Principal adjoint',
      genreSign    : d.genreSign || 'M',
      nomSign      : d.nomSign || '',
      consignes    : d.consignes || [
        'Les surveillants se présentent en salle 15 minutes avant le début de l\u2019épreuve.',
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
    $('#pc-logo').addEventListener('change', (e) => this._chargerLogo(e));
    $('#pc-logo-suppr').addEventListener('click', () => {
      PrintConfig.set({ logoBase64: null });
      $('#pc-logo-apercu').innerHTML = '<span class="field-hint">Aucun logo</span>';
    });
  },

  // ── Config ───────────────────────────────────────────────────

  ouvrirConfig() {
    const c = PrintConfig.get();
    $('#pc-fonction').value = c.fonctionSign;
    $('#pc-genre').value = c.genreSign;
    $('#pc-nom').value = c.nomSign;
    $('#pc-consignes').value = c.consignes.join('\n');
    $('#pc-logo-apercu').innerHTML = c.logoBase64
      ? `<img src="${c.logoBase64}" alt="Logo" style="max-height:50px">`
      : '<span class="field-hint">Aucun logo</span>';
    ouvrirModal('modal-print-config');
  },

  enregistrerConfig() {
    PrintConfig.set({
      fonctionSign: $('#pc-fonction').value.trim(),
      genreSign: $('#pc-genre').value,
      nomSign: $('#pc-nom').value.trim(),
      consignes: $('#pc-consignes').value.split('\n').map(l => l.trim()).filter(Boolean),
    });
    fermerModal('modal-print-config');
    notifier('Paramètres d\u2019impression enregistrés.');
  },

  _chargerLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      PrintConfig.set({ logoBase64: ev.target.result });
      $('#pc-logo-apercu').innerHTML = `<img src="${ev.target.result}" alt="Logo" style="max-height:50px">`;
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
    return `
      <div class="signature"><div class="signature-bloc">
        Fait à ${escHtml(p.lieuSignature || '__________')}, le ${new Date().toLocaleDateString('fr-FR')}
        <div class="signature-ligne">${civ} ${escHtml(c.nomSign || '__________')}<br>${escHtml(c.fonctionSign)}</div>
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
          const fin = salle.type === 'amenagee' ? AppData.heureFinTT(ep) : AppData.heureFin(ep);
          const noms = AppData.getAffectes(ep.id, salle.id)
            .map(id => { const s = AppData.getSurveillant(id); return s ? `${escHtml(s.nom)} ${escHtml(s.prenom)}` : ''; })
            .filter(Boolean).join(', ') || '<span class="badge badge-warn">Non pourvu</span>';
          corps += `<tr><td><strong>${escHtml(ep.matiere)}</strong></td>
            <td>${ep.heureDebut}–${fin}${salle.type === 'amenagee' ? ' <span class="badge badge-tt">TT</span>' : ''}</td>
            <td>${escHtml(salle.nom)}</td><td>${salle.candidats || '—'}</td><td>${noms}</td></tr>`;
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
      const creneaux = [];
      AppData.epreuves.forEach(ep => {
        AppData.sallesPourEpreuve(ep.id).forEach(salle => {
          if (AppData.getAffectes(ep.id, salle.id).includes(surv.id)) {
            const fin = salle.type === 'amenagee' ? AppData.heureFinTT(ep) : AppData.heureFin(ep);
            creneaux.push({ ep, salle, fin });
          }
        });
      });
      const charge = AppData.chargeSurveillant(surv.id);

      corps += `<div class="page">${this._entete('Convocation — surveillance d\u2019examen')}
        <div class="bloc bloc-bleu" style="font-size:12pt">
          <strong>${escHtml(surv.nom)} ${escHtml(surv.prenom)}</strong> — ${escHtml(surv.fonction)}<br>
          ${creneaux.length} créneau(x) de surveillance · charge totale : <strong>${AppData.formatDuree(charge.minutes)}</strong>
        </div>
        <table>
          <tr><th>Date</th><th>Épreuve</th><th>Salle</th><th>Présence en salle</th><th>Fin</th></tr>
          ${creneaux.map(cr => `<tr>
            <td>${escHtml(AppData.formatDate(cr.ep.date))}</td>
            <td><strong>${escHtml(cr.ep.matiere)}</strong></td>
            <td>${escHtml(cr.salle.nom)}${cr.salle.type === 'amenagee' ? ' <span class="badge badge-tt">Tiers temps</span>' : ''}</td>
            <td>${AppData.addMinutes(cr.ep.heureDebut, -15)} <small>(15 min avant)</small></td>
            <td>${cr.fin}</td></tr>`).join('')}
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
        ${salle.type === 'amenagee' ? '<div class="detail">♿ Salle aménagée — temps majoré</div>' : ''}
        <div class="sep"></div>
        ${eps.map(ep => `<div class="detail"><strong>${escHtml(ep.matiere)}</strong> — ${escHtml(AppData.formatDateCourt(ep.date))} · ${ep.heureDebut}–${salle.type === 'amenagee' ? AppData.heureFinTT(ep) : AppData.heureFin(ep)}</div>`).join('')}
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
};
window.Impressions = Impressions;
window.PrintConfig = PrintConfig;
