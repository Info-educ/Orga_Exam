# Orga Examens — Pilotage des épreuves d'examen en EPLE

Application web destinée au personnel de direction pour organiser une session d'examen
(DNB, DNB blanc, baccalauréat blanc, CFG ou autre) : calendrier des épreuves, salles,
aménagements et tiers temps, secrétariat d'examen, répartition équilibrée des
surveillants et production de tous les documents imprimables.

---

## ✅ Conformité RGPD

L'application fonctionne **à 100 % dans le navigateur** :

- **Aucune donnée ne quitte le poste de travail** — pas de serveur, pas de cloud, pas de cookie, pas de compte.
- Les sauvegardes sont des **fichiers locaux** (JSON / Excel) que vous gérez vous-même.
- Une **autosauvegarde automatique** protège le travail en cours contre les fermetures accidentelles :
  elle est stockée dans le navigateur de ce poste uniquement (localStorage) et proposée à la
  réouverture. Sur un **poste partagé**, exportez votre session (JSON) puis videz les données de
  site du navigateur si nécessaire. L'export JSON reste la sauvegarde officielle.
- Pour les candidats à aménagement, il est recommandé de ne saisir que des **initiales** (le champ le rappelle).
- Le récapitulatif des aménagements imprimé porte la mention **« Document confidentiel »**.

> Une fois la page chargée, l'application fonctionne même sans connexion
> (la connexion n'est nécessaire qu'au premier chargement, pour la librairie Excel).

---

## 🚀 Démarrage

1. Décompressez le dossier où vous voulez (clé USB, réseau établissement, poste local).
2. Ouvrez **`index.html`** avec **Chrome** ou **Edge** (recommandés pour l'impression).
3. Au premier lancement, la fenêtre **Paramètres** s'ouvre : renseignez l'examen,
   l'établissement, la session — puis laissez-vous guider par les onglets, dans l'ordre.

---

## 🗂 Flux d'utilisation conseillé

| Étape | Onglet | Ce qu'on y fait |
|---|---|---|
| 1 | **Épreuves** | Calendrier : date, matière, heure, durée. Les fins d'épreuve **et fins tiers temps** (durée × 4/3) sont calculées automatiquement. |
| 2 | **Salles** | Salles ordinaires, salles aménagées (tiers temps), secrétariat d'examen. Capacité, candidats, nombre de surveillants, besoins matériels. Les quantités de **sujets / copies / brouillons** sont calculées avec la marge paramétrée. |
| 3 | **Aménagements** | Candidats à aménagement (initiales) : tiers temps, secrétaire lecteur/scripteur, ordinateur, salle à effectif réduit… et salle d'affectation. |
| 4 | **Surveillants** | Liste des personnels mobilisables, puis **grille des disponibilités** : une case par épreuve, boutons « tout cocher » par ligne ou par colonne. Quota maximal facultatif par personne. |
| 5 | **Répartition** | Bouton **Répartir automatiquement** : l'algorithme pourvoit chaque poste en choisissant à chaque fois le surveillant disponible le **moins chargé en minutes** (les créneaux en salle aménagée comptent en durée tiers temps). Ajustements manuels possibles (ajout/retrait par salle) et **panneau d'équité** (barres de charge, moyenne, écart-type). |
| 6 | **Récap** | Indicateurs clés, **points de vigilance** automatiques (postes non pourvus, capacités dépassées, aménagements sans salle, lecteur/scripteur sans accompagnant…), planning général. |
| 7 | **Impressions** | Les 7 documents de la session (voir ci-dessous), avec en-tête établissement, logo facultatif et signature. |

---

## 🖨 Documents produits

1. **Note d'organisation** — calendrier, salles et consignes (modifiables) à diffuser.
2. **Planning général** — toutes les épreuves, salles et surveillants, jour par jour.
3. **Plannings individuels** — une page par surveillant affecté (présence 15 min avant).
4. **Feuilles d'émargement** — une page par épreuve, signatures arrivée/départ.
5. **Affiches de portes** — format paysage, numéro de salle en très grand.
6. **Fiches de préparation de salle** — sujets, copies, brouillons et matériel par salle.
7. **Récapitulatif des aménagements** — document confidentiel pour le pilotage.

Chaque document s'ouvre dans une fenêtre dédiée : utilisez ensuite *Imprimer* ou
*Enregistrer en PDF* du navigateur.

---

## 💾 Sauvegarde et échanges

- **Session (JSON)** : sauvegarde/restauration complète de votre travail — à faire régulièrement
  (un indicateur signale les modifications non sauvegardées).
- **Modèle Excel** : générez le modèle (une colonne de disponibilité par épreuve), faites-le
  remplir, puis **importez-le** pour récupérer surveillants et disponibilités.
  > Astuce : créez d'abord les épreuves, le modèle s'adapte au calendrier.
- **Export Excel** : planning et charges par surveillant, pour diffusion ou archivage.

---

## 🧱 Structure technique

```
orga-examens/
├── index.html          Structure de la page (onglets, modales)
├── css/style.css       Charte graphique (héritée d'Oral DNB)
└── js/
    ├── data.js         Modèle de données, calculs, persistance, Excel
    ├── ui.js           Navigation, notifications, modales, indicateur de sauvegarde
    ├── parametres.js   Paramètres de session + CRUD épreuves
    ├── salles.js       CRUD salles + aménagements
    ├── surveillants.js CRUD surveillants + grille de disponibilités
    ├── repartition.js  Algorithme d'affectation équilibrée + équité
    ├── recap.js        Indicateurs, alertes de pilotage, planning
    ├── print.js        Génération des 7 documents imprimables
    └── app.js          Point d'entrée
```

Application **sans dépendance serveur** ; seule librairie externe :
[SheetJS](https://sheetjs.com/) (lecture/écriture Excel), chargée par CDN.

---

## 🔧 Évolutions envisageables

L'architecture en modules indépendants facilite les ajouts : convocations individuelles
des candidats, gestion multi-sessions, export PDF natif, plan de salle nominatif…
