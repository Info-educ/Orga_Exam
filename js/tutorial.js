/* =============================================================================
 * tutorial.js — Aide contextuelle embarquée d'Orga Examens
 * -----------------------------------------------------------------------------
 * Système d'accompagnement 100 % local, sans serveur, sans CDN, vanilla JS.
 * Pilote la section CSS dédiée « .tuto-* » déjà présente dans style.css.
 *
 * Couvre :
 *   • écran de bienvenue au 1er lancement
 *   • bandeau contextuel + pop-up détaillée à la 1re visite de chaque onglet
 *   • visite guidée pas à pas avec spotlight
 *   • aide situationnelle déclenchée par les blocages (greffée sur notifier)
 *   • bouton « ? » flottant permanent + menu
 *   • persistance des préférences en localStorage (vu / activé)
 *
 * RGPD : ne stocke QUE des indicateurs techniques (vu/pas-vu, activé/désactivé).
 *        Aucune donnée personnelle, aucun nom, aucune saisie utilisateur.
 *
 * Intégration dans l'existant : 1 seule ligne (la balise <script> de ce fichier).
 *        Tout le reste s'auto-câble (injection DOM + enrobage de UI.activerOnglet
 *        et de window.notifier). Pour retirer l'aide : supprimer cette ligne.
 * ========================================================================== */
(function () {
  'use strict';

  /* ── Persistance : indicateurs techniques uniquement ────────────────────── */
  var NS = 'orga-tuto:';
  var store = {
    get: function (k) { try { return localStorage.getItem(NS + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(NS + k, v); } catch (e) {} },
    is:  function (k) { return this.get(k) === '1'; },
    flag: function (k) { this.set(k, '1'); },
    // Réactive tous les conseils sans toucher au réglage global.
    resetVus: function () {
      try {
        Object.keys(localStorage)
          .filter(function (x) { return x.indexOf(NS) === 0 && x !== NS + 'enabled'; })
          .forEach(function (x) { localStorage.removeItem(x); });
      } catch (e) {}
    }
  };
  function aideActive() { return store.get('enabled') !== '0'; }

  /* ── Petits utilitaires DOM ─────────────────────────────────────────────── */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function $(sel) { return document.querySelector(sel); }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────────────────────────────────────────────────────────────────────
   * CONTENU — ton direct, non technique, phrases courtes, ≤ 5 lignes.
   * Chaque aide d'onglet : Quoi faire · Pourquoi · Ce que ça ne fait pas ·
   * Que faire si ça bloque.
   * ───────────────────────────────────────────────────────────────────────── */
  var WELCOME = {
    titre: 'Bienvenue dans Orga&nbsp;Examens',
    intro: 'Préparez la surveillance d\u2019un examen, étape par étape. Comptez quelques minutes.',
    etapes: [
      'Réglez la session, puis remplissez les onglets de gauche dans l\u2019ordre, de haut en bas.',
      'Lancez la répartition automatique des surveillants quand les bases sont saisies.',
      'Imprimez plannings, feuilles d\u2019émargement et affiches en un clic.'
    ],
    rgpd: '🔒 Tout reste sur cet ordinateur. Rien n\u2019est envoyé sur internet.'
  };

  // bref = texte du bandeau 1re visite (court). detail = les 4 blocs de la pop-up.
  var TABS = {
    epreuves: {
      titre: '📅 Calendrier des épreuves',
      bref: 'Créez une ligne par épreuve. La fin en tiers temps se calcule toute seule.',
      faire: 'Ajoutez chaque épreuve : matière, date, heure de début et durée.',
      pourquoi: 'C\u2019est la base de tout : salles, surveillants et plannings en découlent.',
      pasfait: 'Ne crée pas les convocations : ça se fait plus tard dans « Impressions ».',
      bloque: 'La fin en ×4/3 se calcule seule : ne la saisissez pas à la main.'
    },
    salles: {
      titre: '🚪 Salles & besoins',
      bref: 'Déclarez les salles ordinaires, aménagées et le secrétariat d\u2019examen.',
      faire: 'Ajoutez vos salles et leur capacité. Marquez celles en tiers temps.',
      pourquoi: 'Sujets, copies et brouillons sont calculés selon le nombre de candidats.',
      pasfait: 'Ne place pas les candidats nominativement : l\u2019outil gère des effectifs.',
      bloque: 'Capacité totale trop juste ? Ajoutez une salle ou augmentez une capacité.'
    },
    amenagements: {
      titre: '♿ Aménagements & secrétariat',
      bref: 'Ajoutez chaque candidat à besoins (tiers temps, secrétaire, matériel).',
      faire: 'Ajoutez chaque candidat concerné et cochez son aménagement par épreuve.',
      pourquoi: 'Cela déclenche les salles aménagées et la fin d\u2019épreuve en ×4/3.',
      pasfait: 'L\u2019outil ne décide pas du droit : vous saisissez ce qui a été notifié.',
      bloque: 'Candidat introuvable ? Vérifiez d\u2019abord que l\u2019épreuve existe.'
    },
    surveillants: {
      titre: '👥 Surveillants & disponibilités',
      bref: 'Saisissez vos surveillants, puis cochez leurs disponibilités par épreuve.',
      faire: 'Ajoutez les surveillants, puis cochez leurs créneaux dans la grille.',
      pourquoi: 'Sans disponibilités cochées, la répartition n\u2019a personne à placer.',
      pasfait: 'Ne fige pas les affectations ici : ça se fait dans « Répartition ».',
      bloque: 'Grille vide ? Cliquez les cases ou utilisez « tout cocher » d\u2019une ligne.'
    },
    repartition: {
      titre: '⚖ Répartition des surveillants',
      bref: 'Cliquez « Lancer la répartition » pour une affectation équilibrée.',
      faire: 'Cliquez « ⚡ Lancer la répartition » pour affecter automatiquement.',
      pourquoi: 'L\u2019outil équilibre équitablement les heures de surveillance entre tous.',
      pasfait: 'N\u2019efface ni le secrétariat ni vos affectations figées 📌. Ajustez après.',
      bloque: '« Postes non pourvus » = il manque des disponibilités côté surveillants.'
    },
    recap: {
      titre: '📋 Récapitulatif',
      bref: 'Vérifiez le planning et les points de vigilance avant d\u2019imprimer.',
      faire: 'Parcourez le récap et lisez les « Points de vigilance ».',
      pourquoi: 'C\u2019est votre relecture finale avant de tout imprimer.',
      pasfait: 'Ne modifie rien : c\u2019est une vue. Corrigez dans les onglets concernés.',
      bloque: 'Une alerte rouge ? Cliquez l\u2019onglet indiqué pour corriger la donnée.'
    },
    impressions: {
      titre: '🖨 Impressions',
      bref: 'Imprimez plannings, émargements, affiches et convocations en un clic.',
      faire: 'Choisissez un document et cliquez « Imprimer ».',
      pourquoi: 'Vos documents officiels sont mis en page automatiquement.',
      pasfait: 'N\u2019envoie aucun document par mail : tout passe par votre imprimante.',
      bloque: 'Document vide ? La donnée source manque : revenez à l\u2019onglet concerné.'
    }
  };

  // Visite guidée : on cible la barre latérale, toujours présente → zéro blocage.
  var TOUR = [
    { sel: '#btn-open-params-nav', titre: 'Commencez ici',
      texte: 'Réglez d\u2019abord la session : examen, établissement, fournitures.' },
    { sel: '.nav-item[data-tab="epreuves"]', titre: '1 · Épreuves',
      texte: 'Listez les épreuves. Le tiers temps (×4/3) se calcule tout seul.' },
    { sel: '.nav-item[data-tab="salles"]', titre: '2 · Salles',
      texte: 'Déclarez salles ordinaires, aménagées et secrétariat d\u2019examen.' },
    { sel: '.nav-item[data-tab="amenagements"]', titre: '3 · Aménagements',
      texte: 'Saisissez les candidats à besoins. Zone à fort enjeu réglementaire.' },
    { sel: '.nav-item[data-tab="surveillants"]', titre: '4 · Surveillants',
      texte: 'Ajoutez les surveillants et cochez leurs disponibilités.' },
    { sel: '.nav-item[data-tab="repartition"]', titre: '5 · Répartition',
      texte: 'Le moteur : affectation automatique et équilibrée, ajustable ensuite.' },
    { sel: '.nav-item[data-tab="recap"]', titre: '6 · Récap',
      texte: 'Relisez le planning et les points de vigilance.' },
    { sel: '.nav-item[data-tab="impressions"]', titre: '7 · Impressions',
      texte: 'Imprimez tous vos documents officiels en un clic.' },
    { sel: '#tuto-fab', titre: 'Toujours dispo',
      texte: 'Besoin d\u2019aide ? Ce bouton « ? » est là à tout moment.' }
  ];

  // Aide situationnelle : si un blocage connu survient, on guide sans bloquer.
  var SITUATIONS = [
    { re: /au moins une épreuve/i, onglet: 'epreuves',
      titre: 'Il manque des données',
      texte: 'Créez au moins une épreuve, une salle et un surveillant, puis relancez.' },
    { re: /non pourvu/i, onglet: 'surveillants',
      titre: 'Des postes restent vides',
      texte: 'Complétez les disponibilités des surveillants, ou ajoutez du monde.' },
    { re: /n\u2019est pas disponible|pas disponible/i, onglet: 'surveillants',
      titre: 'Surveillant non disponible',
      texte: 'Cochez sa disponibilité sur cette épreuve, ou choisissez quelqu\u2019un d\u2019autre.' },
    { re: /déjà mobilisé/i, onglet: 'repartition',
      titre: 'Déjà mobilisé(e)',
      texte: 'Cette personne surveille déjà cette épreuve. Choisissez un autre créneau.' },
    { re: /Excel|Bibliothèque/i, onglet: null,
      titre: 'Module Excel indisponible',
      texte: 'L\u2019import/export Excel demande internet au 1er chargement. La saisie manuelle reste possible.' }
  ];

  /* ─────────────────────────────────────────────────────────────────────────
   * RENDU DES BLOCS D'AIDE (réutilise les classes .tuto-* du style.css)
   * ───────────────────────────────────────────────────────────────────────── */
  function blocsAide(c) {
    return '' +
      '<div class="tuto-section"><span class="tuto-step-num">✓</span>' +
        '<div><strong>À faire&nbsp;:</strong> ' + c.faire + '</div></div>' +
      '<div class="tuto-info"><span class="tuto-info-icon">💡</span>' +
        '<div><strong>Pourquoi&nbsp;:</strong> ' + c.pourquoi + '</div></div>' +
      '<div class="tuto-section"><span class="tuto-step-num">≠</span>' +
        '<div><strong>Ce que ça ne fait pas&nbsp;:</strong> ' + c.pasfait + '</div></div>' +
      '<div class="tuto-warning"><span class="tuto-warning-icon">🆘</span>' +
        '<div><strong>Si ça bloque&nbsp;:</strong> ' + c.bloque + '</div></div>';
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * POP-UP DÉTAILLÉE (modal)  —  #tuto-modal-overlay / .tuto-modal
   * ───────────────────────────────────────────────────────────────────────── */
  var lastFocus = null;
  function fermerModal() {
    var ov = $('#tuto-modal-overlay');
    if (ov) ov.classList.remove('visible');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function ouvrirAide(tab) {
    var c = TABS[tab];
    if (!c) return;
    store.flag('tab-seen:' + tab);            // vue → plus de relance auto
    retirerBandeau();
    lastFocus = document.activeElement;

    var ov = $('#tuto-modal-overlay') || (function () {
      var o = el('div'); o.id = 'tuto-modal-overlay';
      o.addEventListener('click', function (e) { if (e.target === o) fermerModal(); });
      document.body.appendChild(o); return o;
    })();

    var offId = 'popup-off:' + tab;
    ov.innerHTML =
      '<div class="tuto-modal" role="dialog" aria-modal="true" aria-label="' + c.titre.replace(/<[^>]+>/g, '') + '">' +
        '<div class="tuto-modal-header">' +
          '<h3 class="tuto-modal-title">' + c.titre + '</h3>' +
          '<button class="tuto-modal-close" type="button" aria-label="Fermer">✕</button>' +
        '</div>' +
        '<div class="tuto-modal-body">' + blocsAide(c) + '</div>' +
        '<div class="tuto-modal-footer">' +
          '<label class="tuto-toggle-label"><input type="checkbox" id="tuto-popup-off"' +
            (store.is(offId) ? ' checked' : '') + '> Ne plus afficher ce conseil</label>' +
          '<button class="tuto-btn-primary" type="button" id="tuto-modal-ok">J\u2019ai compris</button>' +
        '</div>' +
      '</div>';
    ov.classList.add('visible');

    ov.querySelector('.tuto-modal-close').onclick = fermerModal;
    ov.querySelector('#tuto-modal-ok').onclick = fermerModal;
    ov.querySelector('#tuto-popup-off').onchange = function () {
      store.set(offId, this.checked ? '1' : '0');
    };
    var ok = ov.querySelector('#tuto-modal-ok'); if (ok) ok.focus();
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * BANDEAU CONTEXTUEL (1re visite, léger)  —  .tuto-bandeau
   * ───────────────────────────────────────────────────────────────────────── */
  function retirerBandeau() {
    var b = $('#tuto-bandeau-actif'); if (b) b.remove();
  }
  function afficherBandeau(tab, opts) {
    opts = opts || {};
    var c = TABS[tab]; if (!c) return;
    var panel = $('#tab-' + tab); if (!panel) return;
    retirerBandeau();

    var b = el('div', 'tuto-bandeau'); b.id = 'tuto-bandeau-actif';
    b.innerHTML =
      '<div class="tuto-bandeau-inner">' +
        '<span class="tuto-bandeau-icon">' + (opts.icon || '👋') + '</span>' +
        '<span class="tuto-bandeau-text">' + (opts.texte || c.bref) + '</span>' +
        '<button class="tuto-bandeau-link" type="button">' + (opts.lien || 'En savoir plus') + '</button>' +
        '<button class="tuto-bandeau-close" type="button" aria-label="Fermer ce conseil">✕</button>' +
      '</div>';
    panel.insertBefore(b, panel.firstChild);

    b.querySelector('.tuto-bandeau-link').onclick = function () {
      if (opts.action) opts.action(); else ouvrirAide(tab);
    };
    b.querySelector('.tuto-bandeau-close').onclick = function () {
      store.flag('tab-seen:' + tab); b.remove();
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * AIDE SITUATIONNELLE — bandeau de secours sur un blocage connu
   * ───────────────────────────────────────────────────────────────────────── */
  var dernierSecours = 0;
  function aideSecours(message) {
    if (!aideActive()) return;
    if (Date.now() - dernierSecours < 1200) return;     // anti-doublon
    for (var i = 0; i < SITUATIONS.length; i++) {
      var s = SITUATIONS[i];
      if (s.re.test(message)) {
        dernierSecours = Date.now();
        var tab = s.onglet || (window.UI && window.UI.ongletActif) || 'epreuves';
        var panel = $('#tab-' + tab);
        if (!panel || panel.hidden) {                    // amener l'utilisateur au bon endroit
          if (s.onglet && window.UI) window.UI.activerOnglet(s.onglet);
          panel = $('#tab-' + tab);
        }
        if (!panel) return;
        afficherBandeau(tab, {
          icon: '🆘', texte: '<strong>' + s.titre + '.</strong> ' + s.texte,
          lien: 'Voir comment faire', action: function () { ouvrirAide(tab); }
        });
        return;
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * VISITE GUIDÉE  —  #tuto-tour-overlay / #tuto-tour-bubble / .tuto-spotlight-target
   * ───────────────────────────────────────────────────────────────────────── */
  var tour = { i: 0, cible: null, onResize: null };

  function tourArreter() {
    var ov = $('#tuto-tour-overlay'); if (ov) ov.remove();
    var bb = $('#tuto-tour-bubble'); if (bb) bb.style.display = 'none';
    if (tour.cible) tour.cible.classList.remove('tuto-spotlight-target');
    if (tour.onResize) {
      window.removeEventListener('resize', tour.onResize);
      window.removeEventListener('scroll', tour.onResize, true);
      tour.onResize = null;
    }
    store.flag('tour-done');
  }

  function tourBulle() {
    var bb = $('#tuto-tour-bubble');
    if (bb) return bb;
    bb = el('div'); bb.id = 'tuto-tour-bubble';
    bb.setAttribute('role', 'dialog');
    document.body.appendChild(bb);
    return bb;
  }

  function placerBulle(cible, bb) {
    var r = cible.getBoundingClientRect();
    var bw = bb.offsetWidth || 320, bh = bb.offsetHeight || 160;
    var marge = 14, x, y;
    // À droite de la cible si la place existe (sidebar à gauche), sinon dessous.
    if (r.right + marge + bw <= window.innerWidth) {
      x = r.right + marge; y = r.top;
    } else if (r.bottom + marge + bh <= window.innerHeight) {
      x = Math.max(marge, r.left); y = r.bottom + marge;
    } else {
      x = Math.max(marge, (window.innerWidth - bw) / 2);
      y = Math.max(marge, (window.innerHeight - bh) / 2);
    }
    x = Math.min(x, window.innerWidth - bw - marge);
    y = Math.min(Math.max(marge, y), window.innerHeight - bh - marge);
    bb.style.left = x + 'px'; bb.style.top = y + 'px';
  }

  function tourEtape(i) {
    if (i < 0 || i >= TOUR.length) { tourArreter(); return; }
    tour.i = i;
    var step = TOUR[i];
    var cible = $(step.sel);
    if (!cible) { tourEtape(i + 1); return; }            // jamais bloqué : on saute

    if (tour.cible) tour.cible.classList.remove('tuto-spotlight-target');
    tour.cible = cible;
    cible.classList.add('tuto-spotlight-target');
    try { cible.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); } catch (e) {}

    var bb = tourBulle();
    bb.innerHTML =
      '<div class="tuto-tour-bubble-header">' +
        '<span class="tuto-tour-counter">' + (i + 1) + ' / ' + TOUR.length + '</span>' +
        '<button class="tuto-tour-close" type="button">Quitter</button>' +
      '</div>' +
      '<h4 class="tuto-tour-title">' + step.titre + '</h4>' +
      '<p class="tuto-tour-text">' + step.texte + '</p>' +
      '<div class="tuto-tour-nav">' +
        '<button class="tuto-btn-secondary" type="button" id="tuto-tour-prev"' + (i === 0 ? ' disabled' : '') + '>Précédent</button>' +
        '<button class="tuto-btn-primary" type="button" id="tuto-tour-next">' +
          (i === TOUR.length - 1 ? 'Terminer' : 'Suivant') + '</button>' +
      '</div>';
    bb.style.display = 'block';
    placerBulle(cible, bb);

    bb.querySelector('.tuto-tour-close').onclick = tourArreter;
    bb.querySelector('#tuto-tour-prev').onclick = function () { tourEtape(i - 1); };
    bb.querySelector('#tuto-tour-next').onclick = function () { tourEtape(i + 1); };
  }

  function lancerVisite() {
    fermerModal(); retirerBandeau(); fermerMenuFab();
    if (!$('#tuto-tour-overlay')) {
      var ov = el('div'); ov.id = 'tuto-tour-overlay';
      ov.addEventListener('click', tourArreter);
      document.body.appendChild(ov);
    }
    tour.onResize = function () { if (tour.cible) placerBulle(tour.cible, tourBulle()); };
    window.addEventListener('resize', tour.onResize);
    window.addEventListener('scroll', tour.onResize, true);
    tourEtape(0);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * ÉCRAN DE BIENVENUE  —  #tuto-welcome-overlay
   * ───────────────────────────────────────────────────────────────────────── */
  function fermerBienvenue() {
    var ov = $('#tuto-welcome-overlay'); if (ov) ov.classList.remove('visible');
    store.flag('welcome-seen');
  }
  function afficherBienvenue() {
    var ov = $('#tuto-welcome-overlay') || (function () {
      var o = el('div'); o.id = 'tuto-welcome-overlay'; document.body.appendChild(o); return o;
    })();
    var etapes = WELCOME.etapes.map(function (t, k) {
      return '<div class="tuto-welcome-step">' +
        '<span class="tuto-welcome-step-num">' + (k + 1) + '</span>' +
        '<span class="tuto-welcome-step-text">' + t + '</span></div>';
    }).join('');
    ov.innerHTML =
      '<div class="tuto-welcome-box" role="dialog" aria-modal="true" aria-label="Bienvenue">' +
        '<div class="tuto-welcome-logo">🎓</div>' +
        '<h2 class="tuto-welcome-title">' + WELCOME.titre + '</h2>' +
        '<p class="tuto-welcome-intro">' + WELCOME.intro + '</p>' +
        '<div class="tuto-welcome-steps">' + etapes + '</div>' +
        '<div class="tuto-welcome-rgpd">' + WELCOME.rgpd + '</div>' +
        '<div class="tuto-welcome-actions">' +
          '<button class="tuto-btn-primary" type="button" id="tuto-w-tour">Visite guidée (1 min)</button>' +
          '<button class="tuto-btn-secondary" type="button" id="tuto-w-solo">Explorer seul</button>' +
        '</div>' +
        '<div class="tuto-welcome-toggle-row">' +
          '<label class="tuto-toggle-label"><input type="checkbox" id="tuto-w-off"> Ne plus afficher l\u2019aide</label>' +
        '</div>' +
      '</div>';
    ov.classList.add('visible');

    ov.querySelector('#tuto-w-tour').onclick = function () { fermerBienvenue(); lancerVisite(); };
    ov.querySelector('#tuto-w-solo').onclick = fermerBienvenue;
    ov.querySelector('#tuto-w-off').onchange = function () {
      reglerAide(!this.checked);
    };
    var t = ov.querySelector('#tuto-w-tour'); if (t) t.focus();
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * BOUTON « ? » FLOTTANT PERMANENT + menu
   * ───────────────────────────────────────────────────────────────────────── */
  function fermerMenuFab() { var m = $('#tuto-fab-menu'); if (m) m.classList.remove('open'); }
  function injecterFab() {
    if ($('#tuto-fab')) return;
    var fab = el('button', null, '?'); fab.id = 'tuto-fab'; fab.type = 'button';
    fab.setAttribute('aria-label', 'Aide');
    fab.title = 'Aide';
    document.body.appendChild(fab);

    var menu = el('div'); menu.id = 'tuto-fab-menu';
    menu.innerHTML =
      '<button type="button" data-act="onglet">📖 Aide de cet onglet</button>' +
      '<button type="button" data-act="visite">🧭 Visite guidée</button>' +
      '<button type="button" data-act="revoir">🔄 Revoir tous les conseils</button>';
    document.body.appendChild(menu);

    fab.onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
    menu.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      menu.classList.remove('open');
      var act = b.getAttribute('data-act');
      if (act === 'onglet') ouvrirAide((window.UI && window.UI.ongletActif) || 'epreuves');
      else if (act === 'visite') lancerVisite();
      else if (act === 'revoir') {
        store.resetVus();
        reglerAide(true);
        if (window.notifier) window.notifier('Conseils réactivés. Ils réapparaîtront au fil de votre navigation.', 'info', 4000);
      }
    };
    document.addEventListener('click', fermerMenuFab);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * BOUTONS « ❓ Aide » par onglet (dans chaque .section-header)
   * ───────────────────────────────────────────────────────────────────────── */
  function injecterBoutonsOnglet() {
    Object.keys(TABS).forEach(function (tab) {
      var panel = $('#tab-' + tab); if (!panel) return;
      var head = panel.querySelector('.section-header');
      if (!head || head.querySelector('.btn-tab-help')) return;
      var b = el('button', 'btn-tab-help', '❓ Aide'); b.type = 'button';
      b.setAttribute('aria-label', 'Aide sur cet onglet');
      b.onclick = function () { ouvrirAide(tab); };
      head.appendChild(b);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * TOGGLE GLOBAL dans les Paramètres (injecté, zéro édition du HTML)
   * ───────────────────────────────────────────────────────────────────────── */
  function reglerAide(on) {
    store.set('enabled', on ? '1' : '0');
    var fab = $('#tuto-fab'); if (fab) fab.style.display = on ? '' : 'none';
    if (!on) { retirerBandeau(); fermerModal(); }
    var chk = $('#tuto-param-toggle'); if (chk) chk.checked = on;
  }
  function injecterToggleParams() {
    var form = $('#form-params'); if (!form || $('#tuto-param-toggle')) return;
    var fs = el('fieldset', 'form-fieldset');
    fs.innerHTML =
      '<legend>Aide à l\u2019utilisation</legend>' +
      '<label class="tuto-toggle-label" style="font-size:.9rem">' +
        '<input type="checkbox" id="tuto-param-toggle"' + (aideActive() ? ' checked' : '') + '> ' +
        'Afficher les conseils et bandeaux d\u2019aide</label>';
    // Insère le réglage en bas du formulaire, mais avant le pied (Annuler/Enregistrer).
    var footer = form.querySelector('.modal-footer');
    if (footer) form.insertBefore(fs, footer); else form.appendChild(fs);
    fs.querySelector('#tuto-param-toggle').onchange = function () { reglerAide(this.checked); };
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * CÂBLAGE : enrobage de UI.activerOnglet et de window.notifier
   * ───────────────────────────────────────────────────────────────────────── */
  function surChangementOnglet(tab) {
    retirerBandeau();
    if (!aideActive()) return;
    if (!TABS[tab]) return;
    if (store.is('tab-seen:' + tab)) return;             // déjà vu → silence
    if (store.is('popup-off:' + tab)) { store.flag('tab-seen:' + tab); return; }
    setTimeout(function () { afficherBandeau(tab); }, 120);
  }

  function brancherHooks() {
    // 1) Changement d'onglet
    if (window.UI && typeof window.UI.activerOnglet === 'function' && !window.UI.__tutoWrap) {
      var orig = window.UI.activerOnglet.bind(window.UI);
      window.UI.activerOnglet = function (tab) {
        var r = orig(tab);
        try { surChangementOnglet(tab); } catch (e) {}
        return r;
      };
      window.UI.__tutoWrap = true;
    }
    // 2) Notifications → aide de secours sur blocage
    if (window.notifier && !window.notifier.__tutoWrap) {
      var on = window.notifier;
      var wrapped = function (message, type, duration) {
        var r = on(message, type, duration);
        try { if (type === 'error' || type === 'warning') aideSecours(String(message)); } catch (e) {}
        return r;
      };
      wrapped.__tutoWrap = true;
      window.notifier = wrapped;
    }
  }

  /* ── ESC ferme tout ─────────────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if ($('#tuto-tour-overlay')) tourArreter();
    else if ($('#tuto-modal-overlay.visible')) fermerModal();
    else fermerMenuFab();
  });

  /* ─────────────────────────────────────────────────────────────────────────
   * DÉMARRAGE
   * ───────────────────────────────────────────────────────────────────────── */
  function attendreParamsPuisBienvenue() {
    // Au 1er lancement vierge, l'appli ouvre les Paramètres : on attend sa fermeture.
    var pm = $('#modal-params');
    if (pm && !pm.hidden) {
      var obs = new MutationObserver(function () {
        if (pm.hidden) { obs.disconnect(); if (!store.is('welcome-seen')) afficherBienvenue(); }
      });
      obs.observe(pm, { attributes: true, attributeFilter: ['hidden'] });
    } else {
      afficherBienvenue();
    }
  }

  function init() {
    brancherHooks();
    injecterFab();
    injecterBoutonsOnglet();
    injecterToggleParams();
    if (!aideActive()) { var f = $('#tuto-fab'); if (f) f.style.display = 'none'; return; }
    if (!store.is('welcome-seen')) setTimeout(attendreParamsPuisBienvenue, 500);
  }

  // L'appli s'initialise sur DOMContentLoaded ; on passe juste après.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }

  // Exposé minimal (utile pour debug / déclenchement manuel).
  window.Tuto = { ouvrir: ouvrirAide, visite: lancerVisite, bienvenue: afficherBienvenue, reset: store.resetVus };
})();
