/**
 * data.js — Modèle de données, persistance JSON, import/export Excel
 * Orga Examens — v1.0
 *
 * Architecture héritée d'Oral_DNB : application 100 % navigateur.
 * RGPD : aucune donnée ne quitte le poste. Pas de serveur, pas de cookie.
 *
 * Entités :
 *   params        — session d'examen (type, année, établissement, coefficients)
 *   epreuves[]    — calendrier des épreuves (date, matière, horaires)
 *   salles[]      — salles utilisées (type, capacité, besoins, nb surveillants)
 *   amenagements[]— candidats à aménagement + secrétariat d'examen
 *   surveillants[]— personnels mobilisables + disponibilités par épreuve
 *   affectations  — { epreuveId: { salleId: [surveillantIds] } }
 */

'use strict';

const AppData = {

  params: {
    etablissement : '',
    annee         : '2025-2026',
    lieuSignature : '',
    examen        : 'DNB',          // DNB | DNB_BLANC | BAC_BLANC | CFG | AUTRE
    examenAutre   : '',
    session       : 'Juin 2026',
    coefCopies    : 2,              // copies doubles par candidat
    coefBrouillons: 2,              // feuilles de brouillon par candidat
    margeMateriel : 10,             // % de marge sur les fournitures
    nbReserves    : 2,              // surveillants de réserve souhaités par épreuve
    nbReservesTT  : 1,              // réserve tiers temps : présente jusqu'à la fin du TT
  },

  epreuves     : [],
  salles       : [],
  amenagements : [],
  surveillants : [],
  affectations : {},   // { [epreuveId]: { [salleId]: [survId, ...] } }
  reserves     : {},   // { [epreuveId]: [survId, ...] } — personnels de réserve
  accompagnantsEp : {},  // { [epreuveId]: [nom, ...] } — accompagnants affectés à l'épreuve entière
  reservesTT   : {},   // { [epreuveId]: [survId, ...] } — réserve TIERS TEMPS (présente jusqu'à la fin du TT)
  verrous      : {},   // { "epId:salleId|R|RT:survId": true } — affectations figées (préservées par l'algorithme)

  _nextId : { epreuve: 1, salle: 1, amenagement: 1, surveillant: 1 },

  // ────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────

  libelleExamen() {
    const map = {
      DNB: 'Diplôme National du Brevet',
      DNB_BLANC: 'DNB blanc',
      BAC_BLANC: 'Baccalauréat blanc',
      CFG: 'Certificat de Formation Générale',
      AUTRE: this.params.examenAutre || 'Examen',
    };
    return map[this.params.examen] || 'Examen';
  },

  /** "2026-06-26" → "vendredi 26 juin 2026" */
  formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  },

  formatDateCourt(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  },

  /** '09:00' + 180 min → '12:00' */
  addMinutes(heure, minutes) {
    if (!heure) return '';
    const [h, m] = heure.split(':').map(Number);
    const total = h * 60 + m + Math.round(minutes);
    const hh = Math.floor(total / 60) % 24, mm = total % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  },

  /** Durée tiers temps : ×4/3, arrondie au multiple de 5 min supérieur */
  dureeTiersTemps(duree) {
    return Math.ceil((duree * 4 / 3) / 5) * 5;
  },

  /** Durée en min → "2h30" */
  formatDuree(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  },

  // ────────────────────────────────────────────────────────────
  // ÉPREUVES — CRUD
  // ────────────────────────────────────────────────────────────

  addEpreuve(f) {
    const e = {
      id         : this._nextId.epreuve++,
      date       : f.date || '',
      matiere    : (f.matiere || '').trim(),
      heureDebut : f.heureDebut || '09:00',
      duree      : parseInt(f.duree, 10) || 60,
      notes      : (f.notes || '').trim(),
    };
    this.epreuves.push(e);
    this._sortEpreuves();
    return e;
  },

  updateEpreuve(id, f) {
    const e = this.epreuves.find(x => x.id === id);
    if (!e) return null;
    e.date = f.date || e.date;
    e.matiere = (f.matiere || '').trim();
    e.heureDebut = f.heureDebut || e.heureDebut;
    e.duree = parseInt(f.duree, 10) || e.duree;
    e.notes = (f.notes || '').trim();
    this._sortEpreuves();
    return e;
  },

  deleteEpreuve(id) {
    const i = this.epreuves.findIndex(x => x.id === id);
    if (i === -1) return false;
    this.epreuves.splice(i, 1);
    delete this.affectations[id];                              // nettoyage créneaux fantômes
    delete this.reserves[id];                                  // nettoyage réserve
    delete this.reservesTT[id];
    delete this.accompagnantsEp[id];
    this._purgerVerrous(([ep]) => ep === String(id));          // nettoyage verrous
    this.surveillants.forEach(s => delete s.dispos[id]);       // nettoyage dispos
    return true;
  },

  getEpreuve(id) { return this.epreuves.find(x => x.id === id) || null; },

  _sortEpreuves() {
    this.epreuves.sort((a, b) =>
      (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));
  },

  heureFin(ep)   { return this.addMinutes(ep.heureDebut, ep.duree); },
  heureFinTT(ep) { return this.addMinutes(ep.heureDebut, this.dureeTiersTemps(ep.duree)); },

  /** Jours distincts triés */
  jours() { return [...new Set(this.epreuves.map(e => e.date))].sort(); },

  // ────────────────────────────────────────────────────────────
  // SALLES — CRUD
  // ────────────────────────────────────────────────────────────

  addSalle(f) {
    const s = {
      id            : this._nextId.salle++,
      nom           : (f.nom || '').trim(),
      type          : f.type || 'ordinaire',     // ordinaire | amenagee | secretariat
      capacite      : parseInt(f.capacite, 10) || 0,
      candidats     : parseInt(f.candidats, 10) || 0,
      nbSurveillants: parseInt(f.nbSurveillants, 10) || 2,
      epreuveIds    : Array.isArray(f.epreuveIds) ? f.epreuveIds.slice() : [],  // [] = toutes
      materiel      : (f.materiel || '').trim(),
      notes         : (f.notes || '').trim(),
    };
    this.salles.push(s);
    return s;
  },

  updateSalle(id, f) {
    const s = this.salles.find(x => x.id === id);
    if (!s) return null;
    s.nom = (f.nom || '').trim();
    s.type = f.type || s.type;
    s.capacite = parseInt(f.capacite, 10) || 0;
    s.candidats = parseInt(f.candidats, 10) || 0;
    s.nbSurveillants = parseInt(f.nbSurveillants, 10) || s.nbSurveillants;
    if (Array.isArray(f.epreuveIds)) s.epreuveIds = f.epreuveIds.slice();
    s.materiel = (f.materiel || '').trim();
    s.notes = (f.notes || '').trim();
    return s;
  },

  deleteSalle(id) {
    const i = this.salles.findIndex(x => x.id === id);
    if (i === -1) return false;
    this.salles.splice(i, 1);
    Object.values(this.affectations).forEach(parEp => delete parEp[id]);
    this.amenagements.forEach(a => { if (a.salleId === id) a.salleId = null; });
    this._purgerVerrous(([, sa]) => sa === String(id));
    return true;
  },

  getSalle(id) { return this.salles.find(x => x.id === id) || null; },

  /** Salles concernées par une épreuve (epreuveIds vide = toutes) */
  sallesPourEpreuve(epId) {
    return this.salles.filter(s =>
      s.type !== 'secretariat' &&
      (!s.epreuveIds.length || s.epreuveIds.includes(epId)));
  },

  /** Besoins fournitures calculés pour une salle */
  besoinsSalle(s) {
    const marge = 1 + (this.params.margeMateriel || 0) / 100;
    return {
      sujets     : Math.ceil(s.candidats * marge),
      copies     : Math.ceil(s.candidats * this.params.coefCopies * marge),
      brouillons : Math.ceil(s.candidats * this.params.coefBrouillons * marge),
    };
  },

  typeSalleLabel(t) {
    return { ordinaire: 'Ordinaire', amenagee: 'Aménagée (tiers temps)', secretariat: 'Secrétariat d\u2019examen' }[t] || t;
  },

  // ────────────────────────────────────────────────────────────
  // AMÉNAGEMENTS / SECRÉTARIAT D'EXAMEN — CRUD
  // RGPD : privilégier les initiales du candidat.
  // ────────────────────────────────────────────────────────────

  addAmenagement(f) {
    const a = {
      id          : this._nextId.amenagement++,
      candidat    : (f.candidat || '').trim(),
      classe      : (f.classe || '').trim(),
      tiersTemps  : !!f.tiersTemps,
      lecteur     : !!f.lecteur,
      scripteur   : !!f.scripteur,
      isolement   : !!f.isolement,
      ordinateur  : !!f.ordinateur,
      qualiteRedac: !!f.qualiteRedac,
      avs         : !!f.avs,
      dictee      : !!f.dictee,
      calculatrice: !!f.calculatrice,
      autre       : (f.autre || '').trim(),
      salleId     : f.salleId ? parseInt(f.salleId, 10) : null,
      accompagnant: (f.accompagnant || '').trim(),
      notes       : (f.notes || '').trim(),
    };
    this.amenagements.push(a);
    return a;
  },

  updateAmenagement(id, f) {
    const a = this.amenagements.find(x => x.id === id);
    if (!a) return null;
    Object.assign(a, {
      candidat: (f.candidat || '').trim(),
      classe: (f.classe || '').trim(),
      tiersTemps: !!f.tiersTemps, lecteur: !!f.lecteur, scripteur: !!f.scripteur,
      isolement: !!f.isolement, ordinateur: !!f.ordinateur,
      autre: (f.autre || '').trim(),
      salleId: f.salleId ? parseInt(f.salleId, 10) : null,
      accompagnant: (f.accompagnant || '').trim(),
      notes: (f.notes || '').trim(),
    });
    return a;
  },

  deleteAmenagement(id) {
    const i = this.amenagements.findIndex(x => x.id === id);
    if (i === -1) return false;
    this.amenagements.splice(i, 1);
    return true;
  },

  getAmenagement(id) { return this.amenagements.find(x => x.id === id) || null; },

  amenagementBadges(a) {
    const b = [];
    if (a.tiersTemps) b.push('Tiers temps');
    if (a.lecteur)    b.push('Secrétaire lecteur');
    if (a.scripteur)  b.push('Secrétaire scripteur');
    if (a.isolement)  b.push('Salle à effectif réduit');
    if (a.ordinateur) b.push('Ordinateur');
    if (a.qualiteRedac) b.push('Non prise en compte de la qualité rédactionnelle dont l\u2019orthographe');
    if (a.avs)        b.push('Assistance d\u2019un AVS ou AESH');
    if (a.dictee)     b.push('Dictée aménagée');
    if (a.calculatrice) b.push('Calculatrice autorisée (simple, non programmable, sans mémoire)');
    if (a.autre)      b.push(a.autre);
    return b;
  },

  // ────────────────────────────────────────────────────────────
  // SURVEILLANTS — CRUD
  // ────────────────────────────────────────────────────────────

  addSurveillant(f) {
    const s = {
      id       : this._nextId.surveillant++,
      nom      : (f.nom || '').trim().toUpperCase(),
      prenom   : (f.prenom || '').trim(),
      fonction : (f.fonction || '').trim(),
      heuresHebdo : parseFloat(String(f.heuresHebdo).replace(',', '.')) || 0,  // 0 = non renseigné (réf. 18 h)
      quotaMax : parseInt(f.quotaMax, 10) || 0,   // 0 = pas de plafond
      dispos   : f.dispos && typeof f.dispos === 'object' ? { ...f.dispos } : {},
      notes    : (f.notes || '').trim(),
    };
    this.surveillants.push(s);
    this._sortSurveillants();
    return s;
  },

  updateSurveillant(id, f) {
    const s = this.surveillants.find(x => x.id === id);
    if (!s) return null;
    s.nom = (f.nom || '').trim().toUpperCase();
    s.prenom = (f.prenom || '').trim();
    s.fonction = (f.fonction || '').trim();
    s.heuresHebdo = parseFloat(String(f.heuresHebdo).replace(',', '.')) || 0;
    s.quotaMax = parseInt(f.quotaMax, 10) || 0;
    s.notes = (f.notes || '').trim();
    this._sortSurveillants();
    return s;
  },

  deleteSurveillant(id) {
    const i = this.surveillants.findIndex(x => x.id === id);
    if (i === -1) return false;
    this.surveillants.splice(i, 1);
    Object.values(this.affectations).forEach(parEp =>
      Object.keys(parEp).forEach(sid => {
        parEp[sid] = parEp[sid].filter(x => x !== id);
      }));
    Object.keys(this.reserves).forEach(epId => {
      this.reserves[epId] = this.reserves[epId].filter(x => x !== id);
    });
    Object.keys(this.reservesTT).forEach(epId => {
      this.reservesTT[epId] = this.reservesTT[epId].filter(x => x !== id);
    });
    this._purgerVerrous(([, , sv]) => sv === String(id));
    return true;
  },

  getSurveillant(id) { return this.surveillants.find(x => x.id === id) || null; },

  _sortSurveillants() {
    this.surveillants.sort((a, b) =>
      (a.nom + a.prenom).localeCompare(b.nom + b.prenom, 'fr'));
  },

  setDispo(survId, epId, val) {
    const s = this.getSurveillant(survId);
    if (!s) return;
    if (val) s.dispos[epId] = true;
    else {
      delete s.dispos[epId];
      // Retirer aussi une éventuelle affectation devenue invalide
      const parEp = this.affectations[epId];
      if (parEp) Object.keys(parEp).forEach(sid => {
        parEp[sid] = parEp[sid].filter(x => x !== survId);
      });
    }
  },

  estDispo(survId, epId) {
    const s = this.getSurveillant(survId);
    return !!(s && s.dispos[epId]);
  },

  // ────────────────────────────────────────────────────────────
  // AFFECTATIONS — accès
  // ────────────────────────────────────────────────────────────

  getAffectes(epId, salleId) {
    return (this.affectations[epId] && this.affectations[epId][salleId]) || [];
  },

  affecter(epId, salleId, survId) {
    if (!this.affectations[epId]) this.affectations[epId] = {};
    if (!this.affectations[epId][salleId]) this.affectations[epId][salleId] = [];
    const liste = this.affectations[epId][salleId];
    if (!liste.includes(survId)) liste.push(survId);
  },

  desaffecter(epId, salleId, survId) {
    const liste = this.getAffectes(epId, salleId);
    const i = liste.indexOf(survId);
    if (i !== -1) liste.splice(i, 1);
    this.retirerVerrou(epId, salleId, survId);   // une affectation retirée perd son verrou
  },

  // ── Accompagnants ────────────────────────────────────────────

  getAccompagnantsEp(epId) { return this.accompagnantsEp[epId] || []; },

  ajouterAccompagnantEp(epId, nom) {
    nom = (nom || '').trim();
    if (!nom) return false;
    if (!this.accompagnantsEp[epId]) this.accompagnantsEp[epId] = [];
    if (this.accompagnantsEp[epId].some(n => n.toLowerCase() === nom.toLowerCase())) return false;
    this.accompagnantsEp[epId].push(nom);
    return true;
  },

  retirerAccompagnantEp(epId, nom) {
    const l = this.accompagnantsEp[epId] || [];
    const i = l.findIndex(n => n === nom);
    if (i !== -1) l.splice(i, 1);
  },

  /** Tous les noms d'accompagnants connus (candidats + épreuves), dédupliqués */
  nomsAccompagnants() {
    const set = new Map();
    this.amenagements.forEach(a => { const n = (a.accompagnant || '').trim(); if (n) set.set(n.toLowerCase(), n); });
    Object.values(this.accompagnantsEp).forEach(l => l.forEach(n => set.set(n.toLowerCase(), n)));
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  },

  /**
   * Heures effectuées par accompagnant :
   * - auprès d'un candidat : durée de présence de la salle du candidat (TT si aménagée/secrétariat) ;
   * - sur une épreuve entière : durée tiers temps (les candidats accompagnés composent jusqu'à la fin du TT).
   * Retourne Map nom → { creneaux: [{ep, duree, type, detail}], minutes }
   */
  heuresAccompagnants() {
    const map = new Map();
    const entree = (nom) => {
      const cle = nom.trim();
      if (!map.has(cle)) map.set(cle, { creneaux: [], minutes: 0 });
      return map.get(cle);
    };

    this.amenagements.forEach(a => {
      const nom = (a.accompagnant || '').trim();
      if (!nom || !a.salleId) return;
      const salle = this.getSalle(a.salleId);
      if (!salle) return;
      this.epreuves
        .filter(ep => !salle.epreuveIds.length || salle.epreuveIds.includes(ep.id))
        .forEach(ep => {
          const duree = this.dureeCreneau(ep, salle);
          const e = entree(nom);
          e.creneaux.push({ ep, duree, type: 'candidat', detail: `${a.candidat} — salle ${salle.nom}` });
          e.minutes += duree;
        });
    });

    this.epreuves.forEach(ep => {
      this.getAccompagnantsEp(ep.id).forEach(nom => {
        const duree = this.dureeTiersTemps(ep.duree);
        const e = entree(nom);
        e.creneaux.push({ ep, duree, type: 'epreuve', detail: 'Épreuve entière (plusieurs candidats)' });
        e.minutes += duree;
      });
    });

    return map;
  },

  // ── Verrous (affectations figées) ────────────────────────────

  _cleVerrou(epId, salleId, survId) {
    return `${epId}:${salleId === null || salleId === undefined ? 'R' : salleId}:${survId}`;
  },

  estVerrouille(epId, salleId, survId) {
    return !!this.verrous[this._cleVerrou(epId, salleId, survId)];
  },

  basculerVerrou(epId, salleId, survId) {
    const cle = this._cleVerrou(epId, salleId, survId);
    if (this.verrous[cle]) delete this.verrous[cle];
    else this.verrous[cle] = true;
    return !!this.verrous[cle];
  },

  retirerVerrou(epId, salleId, survId) {
    delete this.verrous[this._cleVerrou(epId, salleId, survId)];
  },

  _purgerVerrous(test) {
    Object.keys(this.verrous).forEach(cle => { if (test(cle.split(':'))) delete this.verrous[cle]; });
  },

  /** Surveillant déjà mobilisé sur cette épreuve (toutes salles) ? */
  estAffecteEpreuve(epId, survId) {
    const parEp = this.affectations[epId] || {};
    return Object.values(parEp).some(liste => liste.includes(survId));
  },

  // ── Réserve par épreuve ──────────────────────────────────────

  getReserve(epId)        { return this.reserves[epId] || []; },
  estEnReserve(epId, survId) { return this.getReserve(epId).includes(survId); },

  /** Mobilisé = affecté en salle OU placé en réserve sur l'épreuve */
  estMobiliseEpreuve(epId, survId) {
    return this.estAffecteEpreuve(epId, survId) || this.estEnReserve(epId, survId) || this.estEnReserveTT(epId, survId);
  },

  getReserveTT(epId)           { return this.reservesTT[epId] || []; },
  estEnReserveTT(epId, survId) { return this.getReserveTT(epId).includes(survId); },

  mettreEnReserveTT(epId, survId) {
    if (!this.reservesTT[epId]) this.reservesTT[epId] = [];
    if (!this.reservesTT[epId].includes(survId)) this.reservesTT[epId].push(survId);
  },

  retirerReserveTT(epId, survId) {
    const l = this.reservesTT[epId] || [];
    const i = l.indexOf(survId);
    if (i !== -1) l.splice(i, 1);
    this.retirerVerrou(epId, 'RT', survId);
  },

  mettreEnReserve(epId, survId) {
    if (!this.reserves[epId]) this.reserves[epId] = [];
    if (!this.reserves[epId].includes(survId)) this.reserves[epId].push(survId);
  },

  retirerReserve(epId, survId) {
    const l = this.reserves[epId] || [];
    const i = l.indexOf(survId);
    if (i !== -1) l.splice(i, 1);
    this.retirerVerrou(epId, null, survId);
  },

  /** Salle dont l'équipe reste jusqu'à la fin du tiers temps :
   *  salles aménagées ET secrétariat d'examen (qui accompagne les candidats à aménagement). */
  estHoraireTT(salle) {
    return !!salle && (salle.type === 'amenagee' || salle.type === 'secretariat');
  },

  /** Heure de fin effective pour l'équipe d'une salle */
  heureFinSalle(ep, salle) {
    return this.estHoraireTT(salle) ? this.heureFinTT(ep) : this.heureFin(ep);
  },

  /** Durée de présence d'un créneau (aménagée et secrétariat = tiers temps) */
  dureeCreneau(ep, salle) {
    return this.estHoraireTT(salle) ? this.dureeTiersTemps(ep.duree) : ep.duree;
  },

  /** Charge cumulée d'un surveillant : { creneaux, minutes } — réserve incluse */
  chargeSurveillant(survId) {
    let creneaux = 0, minutes = 0;
    this.epreuves.forEach(ep => {
      const parEp = this.affectations[ep.id] || {};
      Object.keys(parEp).forEach(sid => {
        if (parEp[sid].includes(survId)) {
          const salle = this.getSalle(parseInt(sid, 10));
          creneaux++;
          minutes += salle ? this.dureeCreneau(ep, salle) : ep.duree;
        }
      });
      if (this.estEnReserve(ep.id, survId)) {   // la réserve mobilise au même titre
        creneaux++;
        minutes += ep.duree;
      }
      if (this.estEnReserveTT(ep.id, survId)) { // réserve tiers temps : jusqu'à la fin du TT
        creneaux++;
        minutes += this.dureeTiersTemps(ep.duree);
      }
    });
    return { creneaux, minutes };
  },

  // ────────────────────────────────────────────────────────────
  // SESSION JSON — sauvegarde / restauration
  // ────────────────────────────────────────────────────────────

  toJSON() {
    return {
      app: 'orga-examens', version: 1,
      exportedAt: new Date().toISOString(),
      params: this.params,
      epreuves: this.epreuves,
      salles: this.salles,
      amenagements: this.amenagements,
      surveillants: this.surveillants,
      affectations: this.affectations,
      reserves: this.reserves,
      reservesTT: this.reservesTT,
      accompagnantsEp: this.accompagnantsEp,
      verrous: this.verrous,
      _nextId: this._nextId,
    };
  },

  fromJSON(obj) {
    if (!obj || obj.app !== 'orga-examens') throw new Error('Fichier de session non reconnu.');
    this.params = { ...this.params, ...(obj.params || {}) };
    this.epreuves = obj.epreuves || [];
    this.salles = obj.salles || [];
    this.amenagements = obj.amenagements || [];
    this.surveillants = obj.surveillants || [];
    this.affectations = obj.affectations || {};
    this.reserves = obj.reserves || {};
    this.reservesTT = obj.reservesTT || {};
    this.accompagnantsEp = obj.accompagnantsEp || {};
    this.verrous = obj.verrous || {};
    this._nextId = { ...this._nextId, ...(obj._nextId || {}) };
    this._sortEpreuves();
    this._sortSurveillants();
  },

  exporterJSON() {
    const blob = new Blob([JSON.stringify(this.toJSON(), null, 2)], { type: 'application/json' });
    const nom = `orga-examens_${this.params.examen}_${this.params.session.replace(/\s+/g, '-')}.json`;
    this._telecharger(blob, nom);
  },

  _telecharger(blob, nom) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },

  // ────────────────────────────────────────────────────────────
  // EXCEL — modèle vierge, import, export (SheetJS)
  // ────────────────────────────────────────────────────────────

  /** Colonne dispo Excel pour une épreuve : "ven 26/06 Français" */
  _colDispo(ep) {
    return `${this.formatDateCourt(ep.date)} ${ep.matiere}`.trim();
  },

  telechargerModeleExcel() {
    if (typeof XLSX === 'undefined') { window.notifier('Bibliothèque Excel non chargée (connexion requise au premier lancement).', 'error'); return; }
    const wb = XLSX.utils.book_new();

    // Feuille Surveillants : 1 colonne par épreuve définie
    const colsDispos = this.epreuves.map(ep => this._colDispo(ep));
    const entetes = ['NOM', 'Prénom', 'Fonction', 'Heures hebdo', ...colsDispos];
    const exemple = ['DUPONT', 'Marie', 'Professeur', 18, ...colsDispos.map(() => 'O')];
    const wsS = XLSX.utils.aoa_to_sheet([entetes, exemple]);
    XLSX.utils.book_append_sheet(wb, wsS, 'Surveillants');

    // Feuille Salles
    const wsSa = XLSX.utils.aoa_to_sheet([
      ['Salle', 'Type (ordinaire/amenagee/secretariat)', 'Capacité', 'Candidats', 'Surveillants requis', 'Matériel'],
      ['101', 'ordinaire', 30, 28, 2, ''],
    ]);
    XLSX.utils.book_append_sheet(wb, wsSa, 'Salles');

    XLSX.writeFile(wb, 'OrgaExamens_modele.xlsx');
  },

  importerExcel(file, onDone) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        let nbS = 0, nbSa = 0;

        // ── Surveillants ──
        const wsS = wb.Sheets['Surveillants'];
        if (wsS) {
          const rows = XLSX.utils.sheet_to_json(wsS, { defval: '' });
          const mapCol = {};   // libellé colonne → epreuveId
          this.epreuves.forEach(ep => { mapCol[this._colDispo(ep)] = ep.id; });
          rows.forEach(r => {
            const nom = String(r['NOM'] || r['Nom'] || '').trim();
            if (!nom) return;
            const dispos = {};
            Object.keys(r).forEach(col => {
              if (mapCol[col] !== undefined) {
                const v = String(r[col]).trim().toUpperCase();
                if (v === 'O' || v === 'OUI' || v === 'X' || v === '1') dispos[mapCol[col]] = true;
              }
            });
            this.addSurveillant({
              nom, prenom: String(r['Prénom'] || r['Prenom'] || '').trim(),
              fonction: String(r['Fonction'] || '').trim(),
              heuresHebdo: r['Heures hebdo'] || r['Heures'] || 0,
              dispos,
            });
            nbS++;
          });
        }

        // ── Salles ──
        const wsSa = wb.Sheets['Salles'];
        if (wsSa) {
          const rows = XLSX.utils.sheet_to_json(wsSa, { defval: '' });
          rows.forEach(r => {
            const nom = String(r['Salle'] || '').trim();
            if (!nom) return;
            const typeBrut = String(r['Type (ordinaire/amenagee/secretariat)'] || r['Type'] || 'ordinaire').trim().toLowerCase();
            this.addSalle({
              nom,
              type: ['amenagee', 'secretariat'].includes(typeBrut) ? typeBrut : 'ordinaire',
              capacite: r['Capacité'] || r['Capacite'] || 0,
              candidats: r['Candidats'] || 0,
              nbSurveillants: r['Surveillants requis'] || 2,
              materiel: String(r['Matériel'] || r['Materiel'] || '').trim(),
            });
            nbSa++;
          });
        }

        onDone(null, { nbS, nbSa });
      } catch (err) { onDone(err); }
    };
    reader.readAsArrayBuffer(file);
  },

  exporterExcel() {
    if (typeof XLSX === 'undefined') { window.notifier('Bibliothèque Excel non chargée.', 'error'); return; }
    const wb = XLSX.utils.book_new();

    // Planning général
    const lignes = [['Date', 'Matière', 'Horaires', 'Salle', 'Type', 'Surveillants']];
    this.epreuves.forEach(ep => {
      this.sallesPourEpreuve(ep.id).forEach(salle => {
        const noms = this.getAffectes(ep.id, salle.id)
          .map(id => { const s = this.getSurveillant(id); return s ? `${s.nom} ${s.prenom}` : ''; })
          .filter(Boolean).join(', ');
        const fin = this.heureFinSalle(ep, salle);
        lignes.push([this.formatDateCourt(ep.date), ep.matiere, `${ep.heureDebut}–${fin}`, salle.nom, this.typeSalleLabel(salle.type), noms]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lignes), 'Planning');

    // Charges surveillants
    const charges = [['NOM', 'Prénom', 'Fonction', 'Créneaux', 'Heures']];
    this.surveillants.forEach(s => {
      const c = this.chargeSurveillant(s.id);
      charges.push([s.nom, s.prenom, s.fonction, c.creneaux, this.formatDuree(c.minutes)]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(charges), 'Charges');

    XLSX.writeFile(wb, `OrgaExamens_${this.params.examen}_planning.xlsx`);
  },
};
