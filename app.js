import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/**
 * QG · DAEDALUS — suivre les agents et valider leurs demandes.
 * Données : tables qg_demandes, qg_activite, qg_agents (lisibles par l'administrateur seul) ;
 * décision : fonction qg_decider. Mises à jour en direct par Supabase Realtime.
 */
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const EQUIPES = {
  direction: { nom: "Direction", couleur: "#0b0d12" },
  marketing: { nom: "Marketing & communication", couleur: "#d6336c" },
  prospection: { nom: "Prospection", couleur: "#2f9e44" },
  developpement: { nom: "Développement produit", couleur: "#2f5bff" },
  production: { nom: "Production du site", couleur: "#e8590c" },
};
const VUES = {
  valider: { titre: "À valider", surtitre: "Tes décisions" },
  equipe: { titre: "L'équipe", surtitre: "Qui fait quoi" },
  activite: { titre: "Activité", surtitre: "Ce qui s'est passé" },
  sante: { titre: "Santé", surtitre: "Tout va bien ?" },
};

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icone = {
  ok: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  non: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  crayon: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  alerte: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3ZM12 10v4M12 17h.01"/></svg>',
  decision: '<svg viewBox="0 0 24 24"><path d="m9 11 3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
};
const ICONE_GENRE = { succes: icone.ok, panne: icone.non, attention: icone.alerte, decision: icone.decision, info: icone.info };

function ilya(d) {
  if (!d) return "jamais";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
const heure = (d) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const jourLibelle = (d) => {
  const j = new Date(d), auj = new Date();
  const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (j.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (j.toDateString() === hier.toDateString()) return "Hier";
  return j.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};
const etiquetteEquipe = (e) => {
  const q = EQUIPES[e] || { nom: e, couleur: "#9aa0ad" };
  return `<span class="etiquette"><i style="background:${q.couleur}"></i>${esc(q.nom)}</span>`;
};

let toastMinuteur;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastMinuteur); toastMinuteur = setTimeout(() => (t.hidden = true), 2800);
}

/* ─────────────────────────────── Données ─────────────────────────────── */

/* Mode démonstration (?demo=1) : données fictives, aucune connexion — pour juger l'interface. */
const DEMO = new URLSearchParams(location.search).has("demo");
const il = (min) => new Date(Date.now() - min * 60e3).toISOString();
const DONNEES_DEMO = {
  qg_demandes: [
    { id: "11111111-1111-4111-8111-111111111111", equipe: "marketing", agent: "Noémie · publications", titre: "Publier le post Instagram « La loi fin de vie adoptée »", resume: "Vote final au Sénat hier soir ; 3 visuels prêts, chiffres vérifiés dans la source.", apercu: { texte: "Le Sénat a adopté la loi sur la fin de vie par 175 voix contre 140. Ce qui change pour vous ↓", lien: "https://lapolitiquecestsimple.fr/lois/" }, statut: "a_valider", risque: "normal", urgence: false, societe: "lpcs", cree_le: il(12) },
    { id: "22222222-2222-4222-8222-222222222222", equipe: "developpement", agent: "Corentin · corrections", titre: "Fusionner la correction #142 : fiche sénateur sans groupe", resume: "Erreur trouvée par la vérification du soir ; 2 fichiers modifiés, tests passés.", apercu: { lien: "https://github.com/" }, statut: "a_valider", risque: "faible", urgence: false, societe: "lpcs", cree_le: il(48) },
    { id: "33333333-3333-4333-8333-333333333333", equipe: "prospection", agent: "Paul · e-mails", titre: "Envoyer la relance à la mairie de Sautron", resume: "Premier e-mail ouvert 3 fois, sans réponse depuis 6 jours.", apercu: { destinataire: "Service communication, mairie de Sautron", texte: "Bonjour, je me permets de revenir vers vous au sujet de…" }, statut: "a_valider", risque: "normal", urgence: true, societe: "daedalus", cree_le: il(5) },
    { id: "44444444-4444-4444-8444-444444444444", equipe: "marketing", agent: "Noémie · publications", titre: "Post LinkedIn : le budget 2027 en 5 chiffres", statut: "executee", decide_par: "whatsapp", decide_le: il(190), cree_le: il(260), apercu: {} },
  ],
  qg_agents: [
    { id: "a1", prenom: "Noémie", metier: "Community manager", equipe: "marketing", service: "reseaux", service_nom: "Réseaux sociaux", avatar: "icones/agents/noemie.svg", role: "Prépare et publie les posts Instagram et LinkedIn", rythme: "chaque jour à 8 h", outil: "Tâche GitHub", dernier_etat: "ok", dernier_passage: il(30) },
    { id: "a2", prenom: "Lucie", metier: "Dénicheuse d'idées de posts", equipe: "marketing", service: "reseaux", service_nom: "Réseaux sociaux", avatar: "icones/agents/lucie.svg", role: "Repère les idées de post du jour", rythme: "toutes les 15 min", outil: "Fonction Supabase", dernier_etat: "ok", dernier_passage: il(9) },
    { id: "a4", prenom: "Gaston", metier: "Déployeur du site", equipe: "developpement", service: "entretien", service_nom: "Données & entretien", avatar: "icones/agents/gaston.svg", role: "Reconstruit et met en ligne le site", rythme: "chaque jour à 5 h 30", outil: "Tâche GitHub", dernier_etat: "ok", dernier_passage: il(50) },
    { id: "a7", prenom: "Hélène", metier: "Inspectrice du site", equipe: "developpement", service: "entretien", service_nom: "Données & entretien", avatar: "icones/agents/helene.svg", role: "Relit le site en ligne et liste ce qui est faux", rythme: "chaque jour à 19 h 43", outil: "Claude (coffre Obsidian)", dernier_etat: "ok", dernier_passage: il(200) },
    { id: "a5", prenom: "Louis", metier: "Greffier des dossiers législatifs", equipe: "production", service: "parlement", service_nom: "Parlement & lois", avatar: "icones/agents/louis.svg", role: "Récupère les textes de loi de l'Assemblée", rythme: "chaque heure", outil: "Tâche GitHub", dernier_etat: "ok", dernier_passage: il(40) },
    { id: "a8", prenom: "Simone", metier: "Rédactrice des résumés", equipe: "production", service: "parlement", service_nom: "Parlement & lois", avatar: "icones/agents/simone.svg", role: "Résume les textes en langage clair", rythme: "chaque jour à 21 h", outil: "Tâche GitHub", dernier_etat: "ok", dernier_passage: il(90) },
    { id: "a9", prenom: "Ariane", metier: "Analyste approfondie", equipe: "production", service: "parlement", service_nom: "Parlement & lois", avatar: "icones/agents/ariane.svg", role: "Écrit l'analyse détaillée de chaque loi", rythme: "chaque heure", outil: "Tâche GitHub", dernier_etat: "attention", dernier_message: "2 échecs sur les 5 derniers passages", dernier_passage: il(70) },
    { id: "a6", prenom: "Victor", metier: "Compteur des votes", equipe: "production", service: "votes", service_nom: "Votes & amendements", avatar: "icones/agents/victor.svg", role: "Récupère les votes des députés", rythme: "chaque jour à 23 h", outil: "Tâche GitHub", dernier_etat: "panne", dernier_message: "Source AN indisponible (503)", dernier_passage: il(520) },
    { id: "a10", prenom: "Amélie", metier: "Veilleuse des amendements", equipe: "production", service: "votes", service_nom: "Votes & amendements", avatar: "icones/agents/amelie.svg", role: "Relève les amendements déposés", rythme: "chaque heure", outil: "Tâche GitHub", dernier_etat: "ok", dernier_passage: il(20) },
    { id: "a11", prenom: "Jules", metier: "Secrétaire du coffre", equipe: "direction", service: "coffre", service_nom: "Coffre Obsidian", avatar: "icones/agents/jules.svg", role: "Écrit la note du jour du coffre", rythme: "chaque jour à 6 h 47", outil: "Claude (coffre Obsidian)", dernier_etat: "ok", dernier_passage: il(900) },
  ],
  qg_activite: [
    { le: il(3), equipe: "prospection", agent: "Paul", genre: "info", message: "Demande de validation : relance mairie de Sautron" },
    { le: il(14), equipe: "marketing", agent: "Noémie", genre: "info", message: "3 visuels générés pour la loi fin de vie" },
    { le: il(52), equipe: "developpement", agent: "Hélène", genre: "succes", message: "Erreur trouvée : fiche sénateur sans groupe (#142)" },
    { le: il(190), equipe: "marketing", agent: "Noémie", genre: "decision", message: "Validé sur WhatsApp : post LinkedIn budget 2027" },
    { le: il(520), equipe: "production", agent: "Victor", genre: "panne", message: "Votes de la nuit non récupérés : source AN indisponible" },
  ],
};
function lireDemo(table, construire) {
  // Rejoue les filtres utiles du constructeur de requête sur les données fictives.
  let lignes = [...(DONNEES_DEMO[table] || [])];
  const q = { select: () => q, order: () => q, limit: () => q,
    in: (c, v) => { lignes = lignes.filter((l) => v.includes(l[c])); return q; },
    not: (c, _op, v) => { const ex = v.replace(/[()]/g, "").split(","); lignes = lignes.filter((l) => !ex.includes(l[c])); return q; },
    then: (ok) => ok({ data: lignes, error: null }) };
  return construire(q);
}

async function lire(table, construire) {
  if (DEMO) return (await lireDemo(table, construire)).data;
  const { data, error } = await construire(sb.from(table));
  if (error) { console.error(table, error); toast("Lecture impossible : " + error.message); return []; }
  return data ?? [];
}
const demandesOuvertes = () => lire("qg_demandes", (q) => q.select("*").in("statut", ["a_valider", "a_modifier"]).order("urgence", { ascending: false }).order("cree_le", { ascending: false }));
const demandesDecidees = () => lire("qg_demandes", (q) => q.select("*").not("statut", "in", "(a_valider,a_modifier)").order("decide_le", { ascending: false, nullsFirst: false }).limit(12));
const agents = () => lire("qg_agents", (q) => q.select("*").order("equipe").order("prenom"));
const activiteRecente = () => lire("qg_activite", (q) => q.select("*").order("le", { ascending: false }).limit(250));

async function majCompteur() {
  if (DEMO) { const b = $("#compte-valider"); b.hidden = false; b.textContent = "3"; return; }
  const { count } = await sb.from("qg_demandes").select("id", { count: "exact", head: true }).eq("statut", "a_valider");
  const b = $("#compte-valider");
  b.hidden = !count; b.textContent = count > 99 ? "99+" : String(count || "");
  document.title = count ? `(${count}) QG · DAEDALUS` : "QG · DAEDALUS";
}

/* ─────────────────────────────── Vues ─────────────────────────────── */

function carteDemande(d, ouverte = true) {
  const a = d.apercu || {};
  const risques = [
    d.urgence ? '<span class="etiquette risque-eleve">Urgent</span>' : "",
    d.risque === "eleve" ? '<span class="etiquette risque-eleve">Risque élevé</span>' : "",
    d.cout_estime ? `<span class="etiquette">Coût ${esc(d.cout_estime)} €</span>` : "",
    d.societe === "daedalus" ? '<span class="etiquette">DAEDALUS</span>' : "",
  ].join("");
  const apercu = (a.texte || a.image || a.lien || a.destinataire) ? `<div class="apercu">${[
    a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy">` : "",
    a.destinataire ? `<div><b>À :</b> ${esc(a.destinataire)}</div>` : "",
    a.texte ? `<div class="texte">${esc(a.texte)}</div>` : "",
    a.lien ? `<a class="lien" href="${esc(a.lien)}" target="_blank" rel="noopener">Ouvrir le lien ↗</a>` : "",
  ].join("")}</div>` : "";
  const enReprise = d.statut === "a_modifier"
    ? `<div class="decision">✏️ Renvoyée à l'agent avec ta consigne : « ${esc(d.commentaire || "")} »</div>` : "";
  const actions = ouverte && d.statut === "a_valider" ? `
    <div class="actions">
      <button class="bouton valider" data-decider="validee" data-id="${d.id}">${icone.ok}Valider</button>
      <button class="bouton refuser" data-decider="refusee" data-id="${d.id}">${icone.non}Refuser</button>
      <button class="bouton" data-modifier="${d.id}">${icone.crayon}Modifier</button>
    </div>
    <div class="modifier-zone" id="modif-${d.id}" hidden>
      <textarea placeholder="Ta consigne pour l'agent (ex. « ton plus neutre, retire le chiffre de 2019 »)"></textarea>
      <button class="bouton principal" data-decider="a_modifier" data-id="${d.id}">Renvoyer à l'agent</button>
    </div>` : "";
  const decision = !ouverte ? `<div class="decision">${({ validee: "✅ Validée", refusee: "❌ Refusée", executee: "✅ Exécutée", echec: "⚠️ Échec", expiree: "⌛ Expirée", annulee: "Annulée" })[d.statut] || d.statut}${d.decide_par ? ` · ${d.decide_par === "whatsapp" ? "sur WhatsApp" : "dans le QG"}` : ""} · ${ilya(d.decide_le || d.cree_le)}</div>` : "";
  return `
    <article class="carte" id="d-${d.id}">
      <div class="carte-corps">
        <div class="meta">${(() => { const ag = agentDe(d.agent); return ag ? avatar({ ...ag, dernier_etat: null }, 26) : ""; })()}${etiquetteEquipe(d.equipe)}<span>${esc(agentDe(d.agent)?.prenom || d.agent)} · ${ilya(d.cree_le)}</span></div>
        <h2>${esc(d.titre)}</h2>
        ${d.resume ? `<p class="resume">${esc(d.resume)}</p>` : ""}
        ${apercu}
        ${risques ? `<div class="risques">${risques}</div>` : ""}
      </div>
      ${actions}${enReprise}${decision}
    </article>`;
}

async function vueValider() {
  const [ouvertes, decidees] = await Promise.all([demandesOuvertes(), demandesDecidees()]);
  const aValider = ouvertes.filter((d) => d.statut === "a_valider");
  const enReprise = ouvertes.filter((d) => d.statut === "a_modifier");
  return `
    ${aValider.length ? `<div class="liste">${aValider.map((d) => carteDemande(d)).join("")}</div>` : `
      <div class="vide"><div class="rond">${icone.ok}</div><h2>Rien à valider</h2><p>Tes agents t'écriront sur WhatsApp dès qu'ils auront besoin de toi.</p></div>`}
    ${enReprise.length ? `<p class="section-titre">En reprise par les agents</p><div class="liste">${enReprise.map((d) => carteDemande(d)).join("")}</div>` : ""}
    ${decidees.length ? `<p class="section-titre">Décidées récemment</p><div class="liste">${decidees.map((d) => carteDemande(d, false)).join("")}</div>` : ""}`;
}

/* Portrait d'un agent (fichier local), sinon ses initiales sur la couleur de son équipe. */
let annuaire = [];
const agentDe = (cle) => annuaire.find((a) => a.id === cle || a.prenom === cle || (cle && String(cle).startsWith(a.prenom + " ")));
function avatar(a, taille = 44) {
  const etat = a?.dernier_etat ? `<i class="etat ${esc(a.dernier_etat)}"></i>` : "";
  const fond = (EQUIPES[a?.equipe] || {}).couleur || "#9aa0ad";
  const dedans = a?.avatar
    ? `<img src="${esc(a.avatar)}" alt="" loading="lazy" width="${taille}" height="${taille}">`
    : `<span style="background:${fond}">${esc((a?.prenom || "?").slice(0, 1))}</span>`;
  return `<span class="portrait" style="--t:${taille}px">${dedans}${etat}</span>`;
}

let equipeChoisie = "toutes", recherche = "";
const ETAT_TEXTE = { ok: "En forme", attention: "À surveiller", panne: "En panne" };

async function vueEquipe() {
  const liste = await agents();
  annuaire = liste;
  const q = recherche.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const correspond = (a) => !q || [a.prenom, a.metier, a.role, a.service_nom].join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q);
  const ordreEquipes = ["marketing", "prospection", "developpement", "production", "direction"];
  const compte = (e) => liste.filter((a) => a.equipe === e).length;
  const pannes = (e) => liste.filter((a) => a.equipe === e && a.dernier_etat === "panne").length;

  const carteAgent = (a) => `
    <button class="agent-carte" data-agent="${esc(a.id)}">
      ${avatar(a, 52)}
      <span class="agent-texte">
        <b>${esc(a.prenom)}</b>
        <small>${esc(a.metier || "")}</small>
        <em>${a.dernier_etat === "panne" ? `<span class="rouge">● ${esc(a.dernier_message || "En panne")}</span>` : esc(a.rythme || "")}</em>
      </span>
    </button>`;

  const sections = ordreEquipes.filter((e) => equipeChoisie === "toutes" || equipeChoisie === e).map((e) => {
    const membres = liste.filter((a) => a.equipe === e && correspond(a));
    if (!membres.length && (q || e === "direction")) return "";
    // Par service (Parlement & lois, Votes…), dans l'ordre du registre.
    const services = [...new Map(membres.map((a) => [a.service || "", a.service_nom || ""])).entries()];
    const corps = !membres.length
      ? `<div class="equipe-vide">${e === "prospection" ? "L'équipe prospection arrive bientôt : listes de prospects, e-mails en brouillon, tri des réponses, prise de rendez-vous." : "Pas encore d'agent dans cette équipe."}</div>`
      : services.map(([s, nom]) => `
          ${services.length > 1 ? `<p class="service-titre">${esc(nom || "Autres")}<span>${membres.filter((a) => (a.service || "") === s).length}</span></p>` : ""}
          <div class="grille-agents">${membres.filter((a) => (a.service || "") === s).map(carteAgent).join("")}</div>`).join("");
    return `
      <section class="equipe-bloc">
        <header class="equipe-entete" style="--c:${EQUIPES[e].couleur}">
          <h3>${esc(EQUIPES[e].nom)}</h3>
          <span>${compte(e)} agent${compte(e) > 1 ? "s" : ""}${pannes(e) ? ` · <b class="rouge">${pannes(e)} en panne</b>` : ""}</span>
        </header>
        ${corps}
      </section>`;
  }).join("");

  const coCeo = { prenom: "Co-CEO", avatar: "icones/agents/co-ceo.svg", equipe: "direction" };
  return `
    <div class="tete-orga">
      <div class="noeud"><span class="portrait" style="--t:44px"><span style="background:#0b0d12">H</span></span><div><b>Hippolyte</b><small>Décide de tout ce qui sort</small></div></div>
      <span class="fleche"></span>
      <div class="noeud">${avatar(coCeo, 44)}<div><b>Co-CEO</b><small>Regroupe les demandes et t'écrit sur WhatsApp</small></div></div>
    </div>
    <div class="outils-equipe">
      <label class="recherche">${'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'}<input id="recherche-agent" type="search" placeholder="Chercher un agent, un métier…" value="${esc(recherche)}"></label>
      <div class="filtres">
        <button class="filtre ${equipeChoisie === "toutes" ? "actif" : ""}" data-equipe="toutes">Toutes · ${liste.length}</button>
        ${ordreEquipes.map((e) => `<button class="filtre ${equipeChoisie === e ? "actif" : ""}" data-equipe="${e}"><i class="puce" style="background:${EQUIPES[e].couleur}"></i>${esc(EQUIPES[e].nom)} · ${compte(e)}</button>`).join("")}
      </div>
    </div>
    ${sections || '<div class="vide"><h2>Aucun agent trouvé</h2><p>Essaie un autre mot.</p></div>'}`;
}

/* Fiche d'un agent : panneau qui glisse (bas sur téléphone, côté sur ordinateur). */
async function ouvrirFiche(id) {
  const a = annuaire.find((x) => x.id === id);
  if (!a) return;
  const ev = DEMO ? [] : await lire("qg_activite", (q) => q.select("*").or(`agent.eq.${a.id},agent.ilike.${a.prenom}*`).order("le", { ascending: false }).limit(8));
  const fond = $("#fiche");
  fond.innerHTML = `
    <div class="fiche" role="dialog" aria-modal="true" aria-label="${esc(a.prenom)}">
      <button class="fermer" data-fermer aria-label="Fermer">${icone.non}</button>
      <div class="fiche-tete">
        ${avatar(a, 88)}
        <h2>${esc(a.prenom)}</h2>
        <p>${esc(a.metier || "")}</p>
        <div class="risques">${etiquetteEquipe(a.equipe)}${a.service_nom ? `<span class="etiquette">${esc(a.service_nom)}</span>` : ""}</div>
      </div>
      <dl class="fiche-infos">
        <div><dt>Son rôle</dt><dd>${esc(a.role)}</dd></div>
        <div><dt>Quand</dt><dd>${esc(a.rythme || "—")}</dd></div>
        <div><dt>État</dt><dd><span class="etat-texte ${esc(a.dernier_etat || "")}">${esc(ETAT_TEXTE[a.dernier_etat] || "Pas encore relevé")}</span>${a.dernier_passage ? ` · dernier passage ${ilya(a.dernier_passage)}` : ""}${a.dernier_message ? `<br><small>${esc(a.dernier_message)}</small>` : ""}</dd></div>
        <div><dt>Outil</dt><dd>${esc(a.outil || "—")}</dd></div>
      </dl>
      ${ev.length ? `<p class="section-titre">Ce qu'il a fait récemment</p>${ev.map((e) => `<div class="evenement"><span class="icone ${esc(e.genre)}">${ICONE_GENRE[e.genre] || icone.info}</span><div><p>${esc(e.message)}</p></div><time>${ilya(e.le)}</time></div>`).join("")}` : ""}
    </div>`;
  fond.hidden = false;
  requestAnimationFrame(() => fond.classList.add("ouvert"));
}
function fermerFiche() {
  const fond = $("#fiche");
  fond.classList.remove("ouvert");
  setTimeout(() => { fond.hidden = true; fond.innerHTML = ""; }, 200);
}

let filtreActivite = "tout";
async function vueActivite() {
  const ev = await activiteRecente();
  const visibles = filtreActivite === "tout" ? ev : ev.filter((a) => a.equipe === filtreActivite);
  let jourCourant = "";
  const lignes = visibles.map((a) => {
    const j = jourLibelle(a.le);
    const titre = j !== jourCourant ? `<p class="jour">${esc(j)}</p>` : "";
    jourCourant = j;
    const ag = agentDe(a.agent);
    return `${titre}
      <div class="evenement">
        ${ag ? `<span class="avec-badge">${avatar({ ...ag, dernier_etat: null }, 34)}<i class="badge g-${esc(a.genre)}">${ICONE_GENRE[a.genre] || icone.info}</i></span>` : `<span class="icone ${esc(a.genre)}">${ICONE_GENRE[a.genre] || icone.info}</span>`}
        <div><p>${a.lien ? `<a href="${esc(a.lien)}" target="_blank" rel="noopener">${esc(a.message)}</a>` : esc(a.message)}</p><small>${ag ? `<b>${esc(ag.prenom)}</b> · ` : ""}${esc((EQUIPES[a.equipe] || {}).nom || a.equipe || "")}${!ag && a.agent ? ` · ${esc(a.agent)}` : ""}</small></div>
        <time>${heure(a.le)}</time>
      </div>`;
  }).join("");
  return `
    <div class="filtres">
      ${[["tout", "Tout"], ...Object.entries(EQUIPES).map(([k, v]) => [k, v.nom])].map(([k, n]) => `<button class="filtre ${filtreActivite === k ? "actif" : ""}" data-filtre="${k}">${esc(n)}</button>`).join("")}
    </div>
    ${lignes || '<div class="vide"><h2>Pas encore d\'activité</h2><p>Chaque action des agents s\'affichera ici.</p></div>'}`;
}

async function vueSante() {
  const [liste, ouvertes, decidees] = await Promise.all([agents(), demandesOuvertes(), demandesDecidees()]);
  const n = (e) => liste.filter((a) => a.dernier_etat === e).length;
  const aSurveiller = liste.filter((a) => a.dernier_etat === "panne" || a.dernier_etat === "attention");
  return `
    <div class="tuiles">
      <div class="tuile vert"><small>Agents en forme</small><b>${n("ok")}</b></div>
      <div class="tuile orange"><small>À surveiller</small><b>${n("attention")}</b></div>
      <div class="tuile rouge"><small>En panne</small><b>${n("panne")}</b></div>
      <div class="tuile"><small>Décisions en attente</small><b>${ouvertes.filter((d) => d.statut === "a_valider").length}</b></div>
    </div>
    <p class="section-titre">À surveiller</p>
    ${aSurveiller.length ? `<div class="equipe-carte">${aSurveiller.sort((x, y) => (x.dernier_etat === "panne" ? -1 : 1) - (y.dernier_etat === "panne" ? -1 : 1)).map((a) => `
      <button class="agent agent-ligne" data-agent="${esc(a.id)}">${avatar(a, 40)}<div><b>${esc(a.prenom)}</b> <small class="metier">${esc(a.metier || "")}</small><p>${esc(a.dernier_message || ETAT_TEXTE[a.dernier_etat] || "")}</p></div><time>${ilya(a.dernier_passage)}</time></button>`).join("")}</div>`
      : '<div class="vide"><div class="rond">' + icone.ok + '</div><h2>Tout fonctionne</h2><p>Aucun agent en panne ni à surveiller.</p></div>'}
    <p class="section-titre">Dernières décisions</p>
    <div class="liste">${decidees.slice(0, 5).map((d) => carteDemande(d, false)).join("") || '<p class="resume">Aucune pour l\'instant.</p>'}</div>`;
}

const RENDU = { valider: vueValider, equipe: vueEquipe, activite: vueActivite, sante: vueSante };

/* ─────────────────────────────── Navigation ─────────────────────────────── */

let vueCourante = "valider";
async function afficher() {
  const h = location.hash.slice(1);
  const cible = /^[0-9a-f-]{36}$/.test(h) ? h : null;
  vueCourante = cible ? "valider" : (RENDU[h] ? h : "valider");
  document.querySelectorAll(".barre a").forEach((a) => a.classList.toggle("actif", a.dataset.vue === vueCourante));
  $("#titre-vue").textContent = VUES[vueCourante].titre;
  $("#surtitre").textContent = VUES[vueCourante].surtitre;
  if (!$("#vue").innerHTML) $("#vue").innerHTML = '<div class="liste"><div class="squelette"></div><div class="squelette"></div></div>';
  if (!annuaire.length) annuaire = await agents();   // portraits dans toutes les vues
  $("#vue").innerHTML = await RENDU[vueCourante]();
  if (cible) {
    const el = document.getElementById("d-" + cible);
    if (el) { el.classList.add("cible"); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  majCompteur();
}
window.addEventListener("hashchange", () => { $("#vue").innerHTML = ""; afficher(); });

// Fiche : un clic sur le fond ou Échap la ferme.
document.addEventListener("click", (e) => { if (e.target.id === "fiche") fermerFiche(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#fiche").hidden) fermerFiche(); });
// Recherche d'agent : on réaffiche en gardant le curseur dans le champ.
let minuteurRecherche;
document.addEventListener("input", (e) => {
  if (e.target.id !== "recherche-agent") return;
  recherche = e.target.value;
  clearTimeout(minuteurRecherche);
  minuteurRecherche = setTimeout(async () => {
    const pos = e.target.selectionStart;
    await afficher();
    const champ = $("#recherche-agent");
    if (champ) { champ.focus(); champ.setSelectionRange(pos, pos); }
  }, 180);
});

// Décisions, modification, filtres (délégation d'événements).
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.modifier) {
    const z = document.getElementById("modif-" + b.dataset.modifier);
    z.hidden = !z.hidden; if (!z.hidden) z.querySelector("textarea").focus();
    return;
  }
  if (b.dataset.filtre) { filtreActivite = b.dataset.filtre; afficher(); return; }
  if (b.dataset.equipe) { equipeChoisie = b.dataset.equipe; afficher(); return; }
  if (b.dataset.agent) { ouvrirFiche(b.dataset.agent); return; }
  if (b.hasAttribute("data-fermer")) { fermerFiche(); return; }
  if (b.dataset.decider) {
    const id = b.dataset.id, decision = b.dataset.decider;
    const commentaire = decision === "a_modifier" ? document.querySelector(`#modif-${id} textarea`)?.value?.trim() : null;
    if (decision === "a_modifier" && !commentaire) { toast("Écris d'abord ta consigne pour l'agent."); return; }
    b.disabled = true;
    if (DEMO) { toast("Mode démonstration : rien n'est enregistré."); b.disabled = false; return; }
    const { error } = await sb.rpc("qg_decider", { p_id: id, p_decision: decision, p_commentaire: commentaire });
    if (error) { toast(error.message); b.disabled = false; return; }
    toast(decision === "validee" ? "✅ Validé — l'agent s'en occupe." : decision === "refusee" ? "❌ Refusé." : "✏️ Renvoyé à l'agent avec ta consigne.");
    afficher();
  }
});

/* ─────────────────────────────── Direct ─────────────────────────────── */

let minuteurDirect;
function brancherDirect() {
  sb.channel("qg")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "qg_demandes" }, (p) => {
      toast(`Nouvelle demande : ${p.new?.titre ?? ""}`);
      rafraichir();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "qg_demandes" }, rafraichir)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "qg_activite" }, rafraichir)
    .subscribe((etat) => $("#direct").classList.toggle("on", etat === "SUBSCRIBED"));
}
function rafraichir() { clearTimeout(minuteurDirect); minuteurDirect = setTimeout(afficher, 400); }
// Retour sur l'appli (téléphone) : on relit tout de suite.
document.addEventListener("visibilitychange", () => { if (!document.hidden) afficher(); });

/* ─────────────────────────────── Connexion ─────────────────────────────── */

async function demarrer() {
  if (DEMO) { $("#connexion").hidden = true; $("#app").hidden = false; $("#direct").classList.add("on"); afficher(); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $("#connexion").hidden = false; $("#app").hidden = true; return; }
  const { data: admin } = await sb.rpc("est_administrateur");
  if (admin !== true) {
    await sb.auth.signOut();
    $("#connexion").hidden = false; $("#app").hidden = true;
    const err = $("#erreur-connexion"); err.textContent = "Ce compte n'a pas accès au QG."; err.hidden = false;
    return;
  }
  $("#connexion").hidden = true; $("#app").hidden = false;
  brancherDirect();
  afficher();
}

$("#form-connexion").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), err = $("#erreur-connexion");
  err.hidden = true;
  const { error } = await sb.auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("mdp")) });
  if (error) { err.textContent = "E-mail ou mot de passe incorrect."; err.hidden = false; return; }
  demarrer();
});
$("#deconnexion").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
demarrer();
