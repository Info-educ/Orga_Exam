/**
 * ui.js — Socle interface : helpers, notifications, modals, navigation, état "non sauvegardé"
 * Orga Examens — v1.0
 */

'use strict';

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
window.escHtml = escHtml;

// ════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

function notifier(message, type = 'success', duration = 4500) {
  const zone = $('#notif-zone');
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const n = document.createElement('div');
  n.className = `notif ${type}`;
  n.setAttribute('role', 'alert');
  n.innerHTML = `<span class="notif-icon">${icons[type] || 'ℹ'}</span><span class="notif-msg">${message}</span><button class="notif-close" aria-label="Fermer">✕</button>`;
  const close = () => { n.style.opacity = '0'; n.style.transition = 'opacity .2s'; setTimeout(() => n.remove(), 200); };
  n.querySelector('.notif-close').addEventListener('click', close);
  zone.appendChild(n);
  if (duration > 0) setTimeout(close, duration);
}
window.notifier = notifier;

// ════════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════════

function ouvrirModal(id) {
  $('#modal-backdrop').hidden = false;
  const m = $('#' + id);
  if (m) { m.hidden = false; const f = m.querySelector('input,select,textarea'); if (f) setTimeout(() => f.focus(), 60); }
}

function fermerModal(id) {
  if (id) { const m = $('#' + id); if (m) m.hidden = true; }
  else $$('.modal').forEach(m => m.hidden = true);
  if (!$$('.modal').some(m => !m.hidden)) $('#modal-backdrop').hidden = true;
}
window.ouvrirModal = ouvrirModal;
window.fermerModal = fermerModal;

// ════════════════════════════════════════════════════════════════
// PRÉSERVATION DU DÉFILEMENT
// Tout re-rendu (innerHTML) détruit le DOM et peut faire remonter
// la page. Ce helper mémorise la position de la fenêtre et de tous
// les conteneurs défilants, exécute le rendu, puis les restaure.
// ════════════════════════════════════════════════════════════════

function preserverScroll(fn) {
  const fen = { x: window.scrollX, y: window.scrollY };
  const conteneurs = $$('.dispo-wrapper, .table-wrapper, .app-main')
    .map((el, i) => ({ i, top: el.scrollTop, left: el.scrollLeft }))
    .filter(c => c.top || c.left);

  const r = fn();

  window.scrollTo(fen.x, fen.y);
  const apres = $$('.dispo-wrapper, .table-wrapper, .app-main');
  conteneurs.forEach(c => {
    if (apres[c.i]) { apres[c.i].scrollTop = c.top; apres[c.i].scrollLeft = c.left; }
  });
  return r;
}
window.preserverScroll = preserverScroll;

// ════════════════════════════════════════════════════════════════
// ÉTAT NON SAUVEGARDÉ
// ════════════════════════════════════════════════════════════════

const Unsaved = {
  _modified: false,
  marquer() {
    if (this._modified) return;
    this._modified = true;
    $('#save-indicator')?.classList.add('visible');
    $('#unsaved-banner')?.classList.add('visible');
    $('#btn-export-json')?.classList.add('sidebar-btn-unsaved');
  },
  reinitialiser() {
    this._modified = false;
    $('#save-indicator')?.classList.remove('visible');
    $('#unsaved-banner')?.classList.remove('visible');
    $('#btn-export-json')?.classList.remove('sidebar-btn-unsaved');
  },
};
window.Unsaved = Unsaved;

window.addEventListener('beforeunload', (e) => {
  if (Unsaved._modified) { e.preventDefault(); e.returnValue = ''; }
});

// ════════════════════════════════════════════════════════════════
// UI — navigation et rafraîchissement
// ════════════════════════════════════════════════════════════════

const UI = {

  ongletActif: 'epreuves',

  init() {
    this.initNav();
    this.initModals();
    this.initSidebar();
    this.rafraichirTout();
    this.majBandeauSession();
  },

  initNav() {
    $$('.nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => this.activerOnglet(btn.dataset.tab));
    });
  },

  activerOnglet(tab) {
    this.ongletActif = tab;
    $$('.nav-item[data-tab]').forEach(b => {
      const actif = b.dataset.tab === tab;
      b.classList.toggle('active', actif);
      b.setAttribute('aria-selected', actif);
    });
    $$('.tab-panel').forEach(p => p.hidden = p.id !== 'tab-' + tab);
    this.rafraichirOnglet(tab);
  },

  rafraichirOnglet(tab) {
    switch (tab) {
      case 'epreuves':     Parametres.rendreEpreuves(); break;
      case 'salles':       Salles.rendre(); break;
      case 'amenagements': Salles.rendreAmenagements(); break;
      case 'surveillants': Surveillants.rendre(); break;
      case 'repartition':  Repartition.rendre(); break;
      case 'recap':        Recap.rendre(); break;
      case 'impressions':  break;
    }
  },

  rafraichirTout() { this.rafraichirOnglet(this.ongletActif); this.majBandeauSession(); },

  /** Bandeau session affiché en haut du contenu */
  majBandeauSession() {
    const p = AppData.params;
    const el = $('#bandeau-session');
    if (!el) return;
    const dates = AppData.jours();
    const periode = dates.length
      ? (dates.length === 1 ? AppData.formatDate(dates[0])
        : `du ${AppData.formatDateCourt(dates[0])} au ${AppData.formatDateCourt(dates[dates.length - 1])}`)
      : 'dates à définir';
    el.innerHTML = `
      <strong>${escHtml(AppData.libelleExamen())}</strong> · ${escHtml(p.session)} ·
      ${escHtml(p.etablissement || 'Établissement à renseigner')} · ${escHtml(periode)}
      <button class="btn btn-outline btn-icon" id="btn-bandeau-params" title="Modifier les paramètres">⚙ Modifier</button>`;
    $('#btn-bandeau-params').addEventListener('click', () => Parametres.ouvrir());
  },

  initModals() {
    $('#modal-backdrop').addEventListener('click', () => fermerModal());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerModal(); });
    $$('.modal-close').forEach(b => b.addEventListener('click', () => fermerModal()));
    $$('[data-close-modal]').forEach(b => b.addEventListener('click', () => fermerModal()));
  },

  initSidebar() {
    $('#btn-open-params-nav').addEventListener('click', () => Parametres.ouvrir());

    // Excel
    $('#btn-dl-modele').addEventListener('click', () => {
      if (!AppData.epreuves.length)
        notifier('Définissez d\u2019abord les épreuves : le modèle génère une colonne de disponibilité par épreuve.', 'warning', 7000);
      AppData.telechargerModeleExcel();
    });

    $('#input-import-xlsx').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!AppData.epreuves.length)
        notifier('Astuce : définissez les épreuves avant l\u2019import pour récupérer les disponibilités.', 'info', 7000);
      AppData.importerExcel(file, (err, res) => {
        if (err) { notifier('Import impossible : ' + escHtml(err.message), 'error'); return; }
        notifier(`Import terminé : ${res.nbS} surveillant(s), ${res.nbSa} salle(s).`);
        Unsaved.marquer();
        UI.rafraichirTout();
      });
      e.target.value = '';
    });

    $('#btn-export-xlsx').addEventListener('click', () => AppData.exporterExcel());

    // Session JSON
    $('#btn-export-json').addEventListener('click', () => {
      AppData.exporterJSON();
      Unsaved.reinitialiser();
      notifier('Session sauvegardée. Conservez ce fichier pour la prochaine session.');
    });

    $('#input-import-json').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          AppData.fromJSON(JSON.parse(ev.target.result));
          Unsaved.reinitialiser();
          UI.rafraichirTout();
          notifier('Session restaurée.');
        } catch (err) { notifier('Restauration impossible : ' + escHtml(err.message), 'error'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  },
};
window.UI = UI;
