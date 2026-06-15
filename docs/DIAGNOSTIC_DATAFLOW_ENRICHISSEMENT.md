# Diagnostic Dataflow : Enrichissement -> Agent Prospection

> Analyse complete du flux de donnees depuis Unipile/Perplexity jusqu'au prompt de l'Agent Prospection.
> Date : 2026-03-07

---

## ETAPE 1 : Ce qu'Unipile renvoie et ce qui est extrait

### 1.1 Appels Unipile dans `enrich/route.ts`

Deux appels sont effectues (lignes 49-66) :

```typescript
// 1. Profil complet avec toutes les sections LinkedIn
const profile = await client.getUserProfile(identifier, accountId, {
  linkedinSections: "*",  // Demande TOUTES les sections
});

// 2. Posts recents (max 5) via provider_id
const postsResponse = await client.getUserPostsByIdentifier(
  providerId, accountId, 5
);
```

### 1.2 Extraction depuis le profil Unipile

Le type `UnipileUserProfile` (lib/unipile/types.ts:199-242) definit tous les champs disponibles.
Voici ce qui est extrait vs ignore :

| Champ Unipile disponible | Stocke dans enrichment_data ? | Ou exactement ? |
|---|---|---|
| `headline` | OUI | `enrichment_data.linkedin_profile.headline` |
| `about` / `summary` | OUI | `enrichment_data.linkedin_profile.about` (normalise via `summary \|\| about`) |
| `profile_picture_url` | OUI | `enrichment_data.linkedin_profile.profile_picture_url` |
| `profile_picture_url_large` | OUI | `enrichment_data.linkedin_profile.profile_picture_url_large` |
| `location` | OUI | `enrichment_data.linkedin_profile.location` |
| `connections_count` | OUI | `enrichment_data.linkedin_profile.connections_count` |
| `follower_count` / `followers_count` | OUI | `enrichment_data.linkedin_profile.follower_count` |
| `network_distance` | OUI | `enrichment_data.linkedin_profile.network_distance` (utilise aussi pour auto-correct stage) |
| `is_premium` | OUI | `enrichment_data.linkedin_profile.is_premium` |
| `is_open_profile` | OUI | `enrichment_data.linkedin_profile.is_open_profile` |
| `is_creator` | OUI | `enrichment_data.linkedin_profile.is_creator` |
| `skills[]` | OUI | `enrichment_data.linkedin_profile.skills` |
| `languages[]` | OUI | `enrichment_data.linkedin_profile.languages` |
| `websites[]` | OUI | `enrichment_data.linkedin_profile.websites` |
| `contact_info` | OUI | `enrichment_data.linkedin_profile.contact_info` |
| `creator_website` | OUI | `enrichment_data.linkedin_profile.creator_website` |
| `work_experience[]` / `experience[]` | INDIRECT | Passe a Perplexity via `unipileData.experience`, mais PAS stocke directement dans `linkedin_profile` |
| `education[]` | NON | Disponible dans `UnipileUserProfile` mais JAMAIS extrait |
| `certifications[]` | NON | Disponible dans `UnipileUserProfile` mais JAMAIS extrait |
| `first_name` / `last_name` | NON | Deja dans la table `leads` |
| `provider_id` | NON (utilise) | Utilise pour fetcher les posts, pas stocke |
| `member_urn` | NON | Jamais extrait |
| `public_identifier` | NON | Jamais extrait |
| `profile_url` | NON | Deja dans `leads.linkedin_url` |
| `background_picture_url` | NON | Jamais extrait |
| `shared_connections_count` | NON | Jamais extrait |
| `is_influencer` | NON | Jamais extrait |
| `is_relationship` | NON | Jamais extrait |
| `is_self` | NON | Jamais extrait |
| `primary_locale` | NON | Jamais extrait |
| `company` | NON | Deja dans `leads.company` |
| `hashtags[]` | NON | Jamais extrait |
| `volunteering_experience[]` | NON | Jamais extrait |
| `projects[]` | NON | Jamais extrait |
| `recommendations` | NON | Jamais extrait |

### 1.3 Extraction depuis les posts Unipile

Les posts sont stockes dans `enrichment_data.linkedin_posts` (route.ts lignes 136-146) :

| Champ post Unipile | Stocke ? | Ou ? |
|---|---|---|
| `social_id` / `id` | OUI | `linkedin_posts[].social_id` |
| `text` | OUI | `linkedin_posts[].text` |
| `share_url` | OUI | `linkedin_posts[].share_url` |
| `timestamp` / `created_at` | OUI | `linkedin_posts[].timestamp` |
| `reactions_count` | OUI | `linkedin_posts[].reactions_count` |
| `comments_count` | OUI | `linkedin_posts[].comments_count` |
| `author_name` | OUI | `linkedin_posts[].author_name` |
| `author_id` | NON | Disponible dans `UnipilePost` mais pas extrait |

### 1.4 Construction de `unipileData` (objet intermediaire)

L'objet `unipileData` (route.ts lignes 72-79) est construit avant l'appel Perplexity :

```typescript
unipileData = {
  profile: profile,           // Objet complet JSON.stringify() dans le prompt Perplexity
  recentPosts: postsResponse?.items || [],  // Posts bruts
  experience: profile?.work_experience || profile?.experience || [],
  currentJobStartDate: experience[0]?.start_date || null,
  smartAIInteractions: [],    // Toujours vide (non implemente V1)
  companyPage: null,          // Toujours null (non implemente)
};
```

---

## ETAPE 2 : Ce que Perplexity ajoute

### 2.1 Contexte envoye a Perplexity

Le system prompt de l'agent `enrichissement` (defaults.ts:482-651) recoit :

**Via `buildEnrichmentContext()` (lead-context.ts:172-196) :**

```
## Lead a enrichir
- Nom : {firstName} {lastName}
- Titre : {title}
- Entreprise : {company}
- LinkedIn : {linkedinUrl}

## Donnees Unipile (LinkedIn)
Profil complet : {JSON.stringify(profile)}          // TOUT le profil brut en JSON
Posts recents (30 derniers jours) : {JSON.stringify(recentPosts)}
Experiences professionnelles : {JSON.stringify(experience)}
Date prise de poste actuel : {currentJobStartDate}
Interactions avec contenu Smart.AI : aucune (non disponible en V1)
Page entreprise LinkedIn : null
```

**Via `buildEnrichmentUserPrompt()` (lead-context.ts:198-215) :**

```
Recherche web pour : {firstName} {lastName}, {title} chez {company}
Profil LinkedIn : {linkedinUrl}

Trouve uniquement les informations PUBLIQUES verifiables :
- Actualites de l'entreprise (3 derniers mois)
- CA / revenus estimes si donnees publiques disponibles
- Financement : montant + date si public
- Contexte sectoriel ou reglementaire impactant leur activite
```

### 2.2 Format de sortie attendu de Perplexity

Le prompt enrichissement (defaults.ts:607-648) demande ce JSON :

```json
{
  "data_sources_available": { "unipile": true, "perplexity": true },
  "company": {
    "size": "fourchette ou null",
    "industry": "secteur ou null",
    "funding": "description levee ou null",
    "revenue": "estimation ou null",
    "location": "ville, pays ou null",
    "news": ["actualite en une phrase"]
  },
  "person": {
    "anciennete_poste_mois": null,
    "interests": ["theme"],
    "recentPosts": ["resume post 1", "resume post 2", "resume post 3"],
    "experience": ["intitule -- entreprise (annees)"],
    "education": ["diplome -- ecole (annee)"],
    "publicSpeaking": ["description ou null"]
  },
  "signal": {
    "type": "INBOUND | POST_DOULEUR | POST_SUJET | ACTUALITE | SIGNAL_FAIBLE | FROID",
    "detail": "description precise",
    "smartai_interaction": false
  },
  "confidence": "high | medium | low",
  "sources": { "unipile_fields": [...], "perplexity_fields": [...] },
  "summary": "Deux phrases"
}
```

### 2.3 Ce que Perplexity ajoute par rapport a Unipile

Perplexity est cense apporter :
- **Actualites entreprise** (levees de fonds, recrutements, lancements produit, partenariats)
- **CA / revenus estimes** (si publics)
- **Contexte sectoriel / reglementaire**
- **Classification du signal** (analyse semantique des posts + actualites)
- **Resume des posts** (condenses en une phrase, max 3)
- **Calcul anciennete** (depuis currentJobStartDate)

---

## ETAPE 3 : Ce qui est stocke dans enrichment_data

Apres l'enrichissement reussi, `enrichment_data` JSONB en base contient le **merge** de :
1. L'ancien `enrichment_data` (preserve `scoring_detail` si existant)
2. Le JSON retourne par Perplexity (`enrichmentResult`)
3. `linkedin_profile` (ajoute par le code route.ts:131-133)
4. `linkedin_posts` (ajoute par le code route.ts:136-146)

### Structure complete reconstituee :

```json
{
  // --- PERPLEXITY (retourne par l'IA) ---
  "data_sources_available": { "unipile": true, "perplexity": true },
  "company": {
    "size": "5-10 employes",
    "industry": "Consulting B2B",
    "funding": null,
    "revenue": "~500k EUR/an",
    "location": "Paris, France",
    "news": ["Lancement d'une offre IA en janvier 2026"]
  },
  "person": {
    "anciennete_poste_mois": 18,
    "interests": ["IA generative", "productivite", "scaling ops"],
    "recentPosts": [
      "Post sur la difficulte de scaler sans process structures",
      "Partage sur l'automatisation des taches repetitives",
      "Reflexion sur le plafonnement de croissance des solopreneurs"
    ],
    "experience": ["Fondateur -- ConsultCo (2024-present)", "Head of Growth -- StartupX (2021-2024)"],
    "education": ["MBA -- HEC Paris (2020)"],
    "publicSpeaking": null
  },
  "signal": {
    "type": "POST_DOULEUR",
    "detail": "Post du 15/02 sur la difficulte de scaler sans process",
    "smartai_interaction": false
  },
  "confidence": "high",
  "sources": {
    "unipile_fields": ["headline", "about", "experience", "posts"],
    "perplexity_fields": ["company.news", "company.revenue"]
  },
  "summary": "Fondateur consultant B2B en phase de scaling. Signal fort : post recent exprimant difficulte a scaler, angle douleur process.",

  // --- LINKEDIN PROFILE (ajoute par le code, pas par Perplexity) ---
  "linkedin_profile": {
    "headline": "Fondateur @ ConsultCo | Conseil en strategie B2B",
    "about": "J'aide les entreprises B2B a structurer leur croissance...",
    "profile_picture_url": "https://media.licdn.com/...",
    "profile_picture_url_large": "https://media.licdn.com/...",
    "location": "Paris, Ile-de-France, France",
    "connections_count": 1247,
    "follower_count": 3200,
    "is_premium": true,
    "is_open_profile": false,
    "is_creator": false,
    "network_distance": "DISTANCE_2",
    "skills": [
      { "name": "Strategy", "endorsement_count": 45 },
      { "name": "B2B Sales", "endorsement_count": 32 }
    ],
    "languages": [
      { "name": "French", "proficiency": "native" },
      { "name": "English", "proficiency": "professional" }
    ],
    "websites": ["https://consultco.fr"],
    "contact_info": { "emails": ["contact@consultco.fr"], "phones": [] },
    "creator_website": null
  },

  // --- LINKEDIN POSTS BRUTS (ajoute par le code) ---
  "linkedin_posts": [
    {
      "social_id": "urn:li:activity:7123456789",
      "text": "Quand on est solo et qu'on gere 15 clients en meme temps...",
      "share_url": "https://www.linkedin.com/feed/update/urn:li:activity:7123456789",
      "timestamp": "2026-02-15T10:30:00.000Z",
      "reactions_count": 47,
      "comments_count": 12,
      "author_name": "Jean Dupont"
    }
  ],

  // --- SCORING (si scoring IA effectue separement) ---
  "scoring_detail": {
    "fit_score": 30,
    "intent_score": 25,
    "timing_score": 15,
    "categorie": "HOT",
    "confidence": "high"
  }
}
```

---

## ETAPE 4 : Ce qui arrive dans le prompt de l'Agent Prospection

### 4.1 Code complet de `buildLeadSections()` (lead-context.ts:70-123)

```typescript
function buildLeadSections(lead: LeadForGeneration): string {
  let ctx = `## Lead
- Nom : ${lead.firstName} ${lead.lastName}
- Titre : ${lead.title || "N/A"}
- Entreprise : ${lead.company || "N/A"}
- LinkedIn : ${lead.linkedinUrl}
- Score : ${lead.score ?? "N/A"} (${lead.status || "N/A"})
- Stage : ${lead.stage || "N/A"}
- Tags : ${lead.tags?.join(", ") || "N/A"}
- Notes : ${lead.notes || "Aucune"}`;

  if (lead.enrichmentData?.company) {
    const c = lead.enrichmentData.company;
    ctx += `\n\n## Entreprise
- Taille : ${c.size || "N/A"}
- Secteur : ${c.industry || "N/A"}
- CA estime : ${c.revenue || "N/A"}
- Financement : ${c.funding || "N/A"}
- Localisation : ${c.location || "N/A"}`;
    if (c.news?.length > 0) {
      ctx += `\n- News recentes :`;
      for (const n of c.news) ctx += `\n  - ${n}`;
    } else {
      ctx += `\n- News recentes : N/A`;
    }
  }

  if (lead.enrichmentData?.person) {
    const p = lead.enrichmentData.person;
    ctx += `\n\n## Personne
- Anciennete poste (mois) : ${p.anciennete_poste_mois ?? "N/A"}
- Interets : ${p.interests?.join(", ") || "N/A"}`;
    if (p.recentPosts?.length > 0) {
      ctx += `\n- Posts recents :`;
      for (const post of p.recentPosts) ctx += `\n  - ${post}`;
    } else {
      ctx += `\n- Posts recents : N/A`;
    }
  }

  if (lead.enrichmentData?.signal) {
    const s = lead.enrichmentData.signal;
    ctx += `\n\n## Signal enrichissement
- Type : ${s.type || "N/A"}
- Detail : ${s.detail || "N/A"}
- Interaction Smart.AI : ${s.smartai_interaction ?? false}`;
  }

  return ctx;
}
```

### 4.2 Interface `LeadForGeneration` (lead-context.ts:15-47)

Cette interface definit ce que `buildLeadSections()` PEUT lire :

```typescript
export interface LeadForGeneration {
  enrichmentData?: {
    company?: { size?, industry?, funding?, revenue?, location?, news?[] };
    person?: { interests?[], recentPosts?[], anciennete_poste_mois? };
    signal?: { type?, detail?, smartai_interaction? };
  } | null;
}
```

### 4.3 Tableau : enrichment_data vs injection dans le prompt Agent Prospection

| Champ enrichment_data | Injecte dans prompt Agent 3 ? | Comment ? |
|---|---|---|
| `company.size` | OUI | `- Taille : {size}` |
| `company.industry` | OUI | `- Secteur : {industry}` |
| `company.revenue` | OUI | `- CA estime : {revenue}` |
| `company.funding` | OUI | `- Financement : {funding}` |
| `company.location` | OUI | `- Localisation : {location}` |
| `company.news[]` | OUI | `- News recentes : \n  - {news[0]}\n  - {news[1]}` |
| `company.website` | NON | Stocke en base (type `LeadEnrichment`) mais `LeadForGeneration` ne le lit pas |
| `company.description` | NON | Stocke en base (type `LeadEnrichment`) mais `LeadForGeneration` ne le lit pas |
| `person.anciennete_poste_mois` | OUI | `- Anciennete poste (mois) : {value}` |
| `person.interests[]` | OUI | `- Interets : {interests.join(", ")}` |
| `person.recentPosts[]` | OUI | `- Posts recents : \n  - {post[0]}\n  - {post[1]}` |
| `person.experience[]` | NON | Stocke par Perplexity mais `LeadForGeneration` ne le lit pas |
| `person.education[]` | NON | Stocke par Perplexity mais `LeadForGeneration` ne le lit pas |
| `person.publicSpeaking[]` | NON | Stocke par Perplexity mais `LeadForGeneration` ne le lit pas |
| `signal.type` | OUI | `- Type : {type}` |
| `signal.detail` | OUI | `- Detail : {detail}` |
| `signal.smartai_interaction` | OUI | `- Interaction Smart.AI : {value}` |
| `linkedin_profile.headline` | NON | Stocke en base, jamais lu par `buildLeadSections()` |
| `linkedin_profile.about` | NON | Stocke en base, jamais lu par `buildLeadSections()` |
| `linkedin_profile.location` | NON | Stocke en base (doublon avec `company.location`) |
| `linkedin_profile.connections_count` | NON | Stocke en base, jamais lu |
| `linkedin_profile.follower_count` | NON | Stocke en base, jamais lu |
| `linkedin_profile.is_premium` | NON | Stocke en base, jamais lu |
| `linkedin_profile.is_open_profile` | NON | Stocke en base, jamais lu |
| `linkedin_profile.is_creator` | NON | Stocke en base, jamais lu |
| `linkedin_profile.network_distance` | NON | Utilise pour auto-correct stage, jamais dans prompt |
| `linkedin_profile.skills[]` | NON | Stocke en base, jamais lu |
| `linkedin_profile.languages[]` | NON | Stocke en base, jamais lu |
| `linkedin_profile.websites[]` | NON | Stocke en base, jamais lu |
| `linkedin_profile.contact_info` | NON | Stocke en base, jamais lu |
| `linkedin_posts[]` | NON | Posts BRUTS stockes, mais `person.recentPosts` (resumes par Perplexity) est utilise |
| `data_sources_available` | NON | Metadata, pas pertinent pour le prompt |
| `confidence` | NON | Metadata enrichissement, pas injecte |
| `sources` | NON | Metadata, pas pertinent |
| `summary` | NON | Resume par Perplexity, JAMAIS injecte dans le prompt Agent 3 |
| `scoring_detail.*` | NON | Utilise par l'UI, jamais dans le prompt prospection |

---

## ETAPE 5 : Gap Analysis

### 5.1 Tableau de synthese

| Donnee | Disponible Unipile | Stockee en base | Injectee prompt Agent 3 | Impact potentiel |
|---|---|---|---|---|
| **headline** | OUI | OUI (`linkedin_profile`) | NON | ELEVE - Le headline LinkedIn est souvent plus precis que `lead.title`, contient des mots-cles sur l'activite |
| **about / summary** | OUI | OUI (`linkedin_profile`) | NON | ELEVE - Bio complete du prospect, contient souvent ses valeurs, sa mission, ses centres d'interet |
| **skills[]** | OUI | OUI (`linkedin_profile`) | NON | MOYEN - Permet de mieux comprendre les competences et le profil |
| **education[]** | OUI | NON (pas extrait) | NON | MOYEN - Permet de trouver des accroches alumni |
| **certifications[]** | OUI | NON (pas extrait) | NON | FAIBLE - Rarement exploitable pour la prospection |
| **connections_count** | OUI | OUI (`linkedin_profile`) | NON | FAIBLE - Indicateur d'activite reseau |
| **follower_count** | OUI | OUI (`linkedin_profile`) | NON | MOYEN - Un creator avec 10k+ followers != un profil discret |
| **is_premium** | OUI | OUI (`linkedin_profile`) | NON | FAIBLE - Signal indirect de maturite |
| **is_open_profile** | OUI | OUI (`linkedin_profile`) | NON | MOYEN - Determine si InMail possible sans credits |
| **is_creator** | OUI | OUI (`linkedin_profile`) | NON | MOYEN - Contexte pour adapter le ton (creator = public, engageant) |
| **network_distance** | OUI | OUI (`linkedin_profile`) | NON | MOYEN - 1st vs 2nd vs 3rd change la strategie d'approche |
| **languages[]** | OUI | OUI (`linkedin_profile`) | NON | FAIBLE - Langue du message deja fixee par settings |
| **websites[]** | OUI | OUI (`linkedin_profile`) | NON | MOYEN - URL du site perso/entreprise, info supplementaire |
| **shared_connections_count** | OUI | NON | NON | MOYEN - Connexions communes = levier de confiance |
| **is_influencer** | OUI | NON | NON | FAIBLE - Tres rare, marginal |
| **hashtags[]** | OUI | NON | NON | MOYEN - Sujets suivis = interets actifs |
| **recommendations** | OUI | NON | NON | FAIBLE - Rarement exploitable directement |
| **volunteering** | OUI | NON | NON | FAIBLE - Rarement exploitable |
| **projects[]** | OUI | NON | NON | FAIBLE - Rarement exploitable |
| **background_picture_url** | OUI | NON | NON | AUCUN - Pas exploitable en texte |
| **person.experience[]** | via Perplexity | OUI (Perplexity output) | NON | ELEVE - Parcours pro = contexte majeur pour personnaliser |
| **person.education[]** | via Perplexity | OUI (Perplexity output) | NON | MOYEN - Ecole commune = accroche puissante |
| **person.publicSpeaking[]** | via Perplexity | OUI (Perplexity output) | NON | MOYEN - Speaker = profil public, adapter l'approche |
| **summary** (Perplexity) | N/A | OUI | NON | ELEVE - Resume + angle d'attaque recommande, directement exploitable |
| **linkedin_posts[]** (bruts) | OUI | OUI | NON (via recentPosts resumes) | Le texte brut des posts est stocke mais seuls les resumes Perplexity sont injectes |

### 5.2 Donnees Unipile disponibles mais JAMAIS stockees

| Donnee | Impact si exploitee |
|---|---|
| `education[]` | MOYEN - Accroches alumni, references academiques |
| `certifications[]` | FAIBLE |
| `shared_connections_count` | MOYEN - "Nous avons X connexions en commun" |
| `hashtags[]` | MOYEN - Sujets suivis = interets implicites |
| `is_influencer` | FAIBLE |
| `recommendations` | FAIBLE |
| `volunteering_experience[]` | FAIBLE |
| `projects[]` | FAIBLE |
| `background_picture_url` | AUCUN |

### 5.3 Donnees stockees mais JAMAIS injectees dans le prompt Agent 3

C'est le gap le plus important. Ces donnees existent en base mais sont invisibles pour l'agent de prospection :

| Donnee stockee | Pourquoi c'est un probleme |
|---|---|
| **`linkedin_profile.headline`** | Le headline est souvent plus riche que `lead.title`. Exemple : title = "CEO" vs headline = "CEO @ ConsultCo \| J'aide les solopreneurs B2B a scaler sans recruter" |
| **`linkedin_profile.about`** | La bio complete est la source la plus riche pour comprendre le prospect. Contient ses valeurs, sa mission, son positionnement. L'agent de prospection ne la voit JAMAIS. |
| **`person.experience[]`** | Le parcours professionnel (postes precedents) donne du contexte sur la trajectoire. Non injecte. |
| **`person.education[]`** | Non injecte. Potentiel pour accroches alumni. |
| **`summary`** (Perplexity) | Le resume + angle d'attaque recommande par l'agent d'enrichissement est stocke mais JAMAIS transmis a l'agent de prospection. C'est le champ le plus directement actionnable. |
| **`linkedin_profile.skills[]`** | Competences cles du prospect, non injectees. |
| **`linkedin_profile.is_creator`** | Un creator LinkedIn necessite une approche differente (plus peer-to-peer). Non transmis. |
| **`linkedin_profile.is_open_profile`** | Determine si on peut envoyer un InMail sans credits. Non transmis. |
| **`linkedin_posts[]` (texte brut)** | Les posts bruts avec engagement (reactions, commentaires) sont stockes mais seuls les resumes Perplexity arrivent dans le prompt. Le texte original pourrait permettre des references plus precises. |

### 5.4 Bug critique : Regeneration client-side perd TOUTES les donnees enrichissement

**Flux initial (cron generate-actions)** : charge `enrichment_data` complet depuis la DB -> `buildLeadContext()` recoit tout -> prompt riche.

**Flux regeneration (actions-client.tsx -> /api/ai/generate)** : envoie `action.lead` qui ne contient que `{ id, firstName, lastName, title, company, linkedinUrl, score, hasEnrichment }`. Le champ `enrichmentData` n'est PAS inclus.

**Consequence** : quand un utilisateur clique "Regenerer" depuis Daily Actions, l'Agent Prospection recoit un prompt SANS aucune donnee d'enrichissement (pas d'entreprise, pas de personne, pas de signal). Le message regenere est systematiquement un message "FROID" meme si le lead est enrichi.

**Root cause** : `mapDbActionWithLead()` (mappers.ts:93-108) ne mappe que `hasEnrichment: boolean` au lieu de passer l'objet `enrichment_data` complet. Le type `ActionWithLead.lead` (types/actions.ts) ne contient pas `enrichmentData`.

---

## RESUME DES ACTIONS PRIORITAIRES

### P0 - Bug critique
1. **Regeneration sans enrichment** : `actions-client.tsx` envoie le lead sans `enrichmentData`. La route `/api/ai/generate` devrait recharger le lead complet depuis la DB quand `lead.id` est present, au lieu de se fier aux donnees envoyees par le client.

### P1 - Donnees stockees mais pas injectees
2. **`summary`** (Perplexity) : Le champ le plus directement actionnable. L'agent d'enrichissement produit un resume + angle d'attaque recommande que l'agent de prospection ne voit jamais.
3. **`linkedin_profile.about`** : La bio LinkedIn est la source la plus riche pour personnaliser un message. Non injectee.
4. **`linkedin_profile.headline`** : Plus precis que `lead.title`, souvent contient le positionnement du prospect.
5. **`person.experience[]`** : Le parcours pro donne du contexte sur la trajectoire et les references.

### P2 - Donnees Unipile non stockees
6. **`education[]`** : Stocker dans `linkedin_profile` pour permettre les accroches alumni.
7. **`shared_connections_count`** : Stocker pour l'utiliser dans la strategie d'approche.

### P3 - Ameliorations prompt
8. **`linkedin_profile.is_creator`** et **`is_open_profile`** : Transmettre pour adapter la strategie (ton, canal InMail).
9. **`linkedin_profile.skills[]`** : Transmettre un sous-ensemble pertinent pour enrichir le contexte.

---

*Document genere le 2026-03-07 -- Analyse du code source PROSPECTOR*
