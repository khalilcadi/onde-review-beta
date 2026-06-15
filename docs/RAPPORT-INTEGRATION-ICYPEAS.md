# Rapport : Integration Icypeas dans PROSPECTOR

> Document de brainstorm pour planifier l'integration d'Icypeas (enrichissement email) dans la plateforme PROSPECTOR.
> Date : 2026-04-01

---

## Table des matieres

1. [Contexte actuel - Systeme d'enrichissement PROSPECTOR](#1-contexte-actuel)
2. [Icypeas - Documentation API complete](#2-icypeas---documentation-api)
3. [Analyse de compatibilite avec PROSPECTOR](#3-analyse-de-compatibilite)
4. [Scenarios d'integration possibles](#4-scenarios-dintegration)
5. [Questions cles pour le brainstorm](#5-questions-cles)
6. [Estimation des fichiers impactes](#6-fichiers-impactes)

---

## 1. Contexte actuel

### 1.1 Pipeline d'enrichissement existant (4 etapes)

| Etape | Source | Donnees recuperees |
|-------|--------|--------------------|
| 1. Unipile | LinkedIn Profile + Posts | headline, about, experience, skills, connections, posts 30j |
| 2. Perplexity | Web (Google) | company news, funding, CA, contexte sectoriel |
| 3. Signal Classification | Claude Sonnet | type signal (INBOUND, POST_DOULEUR, ACTUALITE, FROID...) |
| 4. Hook Recommande | Claude Sonnet | angle, fait_concret, tension_icp |

### 1.2 Ce qui manque aujourd'hui

- **Email professionnel** : le champ `leads.email` existe en DB mais **n'est jamais enrichi automatiquement**
- **Validation email** : aucune verification de delivrabilite
- **Telephone pro** : le champ `leads.phone` existe mais n'est pas enrichi non plus
- Unipile peut avoir un `contact_info` avec email mais **le code actuel ne l'extrait pas**

### 1.3 Point d'entree technique

| Element | Detail |
|---------|--------|
| Route API | `POST /api/ai/enrich` (single + batch) |
| Stockage | `leads.enrichment_data` (JSONB) + `leads.email` (TEXT) |
| Types | `LeadEnrichment` dans `types/leads.ts` |
| Affichage | `lead-detail-client.tsx` (section Contact + Company card) |

### 1.4 Donnees d'entree disponibles pour un enrichissement email

```
Depuis le lead PROSPECTOR :
+-- firstName   (backfille par Unipile)
+-- lastName    (backfille par Unipile)
+-- company     (backfille par Unipile)
+-- linkedinUrl
+-- enrichmentData.company.website  (via Perplexity -> meilleur que company name pour domain)
```

### 1.5 Schema DB pertinent

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  linkedin_url TEXT NOT NULL,
  email TEXT,              -- EXISTE mais jamais enrichi auto
  phone TEXT,              -- EXISTE mais jamais enrichi auto
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'cold',
  stage TEXT DEFAULT 'to_invite',
  tags TEXT[],
  notes TEXT,
  enrichment_data JSONB,   -- TOUT l'enrichissement stocke ici
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### 1.6 Structure actuelle de `enrichment_data` (JSONB)

```typescript
interface LeadEnrichment {
  company?: {
    size?: string;
    industry?: string;
    funding?: string;
    revenue?: string;
    location?: string;
    website?: string;           // <-- utile pour Icypeas (domain)
    description?: string;
    news?: string[];
    website_analysis?: {
      offering?: string;
      target_market?: string;
      differentiators?: string;
      team_visible?: string;
    };
  };
  person?: {
    experience?: WorkExperience[];
    education?: Education[];
    interests?: string[];
    recentPosts?: RecentPost[];
    anciennete_poste_mois?: number | null;
  };
  signal?: {
    type?: SignalType;
    detail?: string;
    smartai_interaction?: boolean;
    source?: "gojiberry" | "manual" | "enrichment" | null;
    gojiberry_score?: number;
    intent_keyword?: string;
    intent_post_url?: string;
    intent_post_content?: string;
    import_date?: string;
  };
  linkedin_profile?: {
    headline?: string;
    about?: string;
    profile_picture_url?: string;
    location?: string;
    connections_count?: number;
    follower_count?: number;
    is_premium?: boolean;
    is_open_profile?: boolean;
    network_distance?: string;
    skills?: { name: string; endorsement_count?: number }[];
    languages?: { name: string; proficiency?: string }[];
    websites?: string[];
    education?: { school?; degree?; field?; start_date?; end_date? }[];
    shared_connections_count?: number;
  };
  linkedin_posts?: LinkedInPost[];
  scoring_detail?: { ... };
  hook_recommande?: {
    angle: string;
    fait_concret: string | null;
    tension_icp: string;
    niveau_contexte: "fort" | "partiel" | "faible";
  } | null;
  summary?: string;
  // >>> NOUVEAU CHAMP A AJOUTER <<<
  // email_enrichment?: IcypeasEmailResult;
}
```

---

## 2. Icypeas - Documentation API

### 2.1 Vue d'ensemble

Icypeas est une plateforme d'enrichissement email B2B qui permet de :
- **Trouver** des emails professionnels (firstname + lastname + domain/company)
- **Verifier** la delivrabilite d'emails existants
- **Scanner** des domaines pour trouver des emails role-based (contact@, info@)
- **Chercher** des personnes dans leur base de donnees (par titre, entreprise, localisation)
- **Reverse lookup** : transformer un email en profil professionnel

Certifications : ISO 27001, GDPR & CCPA compliant.

### 2.2 Authentification

```
Header: Authorization: <API_KEY>
Header: Content-Type: application/json
Base URL: https://app.icypeas.com/api/
Rate limit: 30 requetes/minute
```

L'API key se recupere dans les parametres du compte Icypeas : https://app.icypeas.com/

### 2.3 Endpoints

#### A. Email Finder (Single) -- 1 credit/email trouve

Trouve l'email professionnel d'une personne a partir de son nom et entreprise/domaine.

```
POST https://app.icypeas.com/api/email-search

Headers:
  Authorization: <API_KEY>
  Content-Type: application/json

Body:
{
  "firstname": "John",
  "lastname": "Doe",
  "domainOrCompany": "icypeas.com",
  "custom": {
    "webhookUrl": "https://mon-app.com/webhook/icypeas",  // optionnel
    "externalId": "lead_123"                               // optionnel
  }
}

Response (200):
{
  "success": true,
  "item": {
    "status": "NONE",
    "_id": "p_gfS5EB4liCGm90KDFC"
  }
}
```

**Important** : La reponse ne contient PAS l'email directement. C'est un systeme asynchrone :
1. Lancer la recherche (retourne un `_id`)
2. Poll le resultat via `/bulk-single-searchs/read` OU recevoir via webhook

#### B. Email Verification (Single) -- 0.1 credit

Verifie si un email existe et est delivrable. Technologie unique pour les catchall Google/Microsoft.

```
POST https://app.icypeas.com/api/email-verification

Body:
{
  "email": "john.doe@example.com",
  "custom": {
    "webhookUrl": "https://...",
    "externalId": "..."
  }
}

Response (200): { "success": true, "item": { "status": "NONE", "_id": "..." } }
```

#### C. Domain Scan (Single) -- 1 credit

Scanne un domaine pour trouver les emails role-based (contact@, info@, support@...).

```
POST https://app.icypeas.com/api/domain-search

Body:
{
  "domainOrCompany": "icypeas.com",
  "custom": { "webhookUrl": "...", "externalId": "..." }
}

Response (200): { "success": true, "item": { "status": "NONE", "_id": "..." } }
```

#### D. Bulk Search -- max 5000 items

Permet de lancer des recherches en masse (email-search, email-verification, ou domain-search).

```
POST https://app.icypeas.com/api/bulk-search

Body:
{
  "name": "Prospector batch 2026-04-01",
  "task": "email-search",    // "email-search" | "email-verification" | "domain-search"
  "data": [
    ["John", "Doe", "icypeas.com"],
    ["Jane", "", "example.com"],
    ["", "Smith", "Acme Corp"]
  ],
  "custom": {
    "externalIds": ["lead_1", "lead_2", "lead_3"],
    "webhookUrlItem": "https://mon-app.com/webhook/icypeas-item",
    "webhookUrlBulkDone": "https://mon-app.com/webhook/icypeas-done",
    "includeResultsInWebhook": true
  }
}
```

**Structure `data` selon le `task`** :

| Task | Format par row |
|------|---------------|
| `email-search` | `["firstname", "lastname", "domain_ou_company"]` (au moins firstname ou lastname requis) |
| `email-verification` | `["email@example.com"]` |
| `domain-search` | `["domain_ou_company"]` |

**Webhooks disponibles** :
- `webhookUrlItem` : appele a chaque row traitee (resultat individuel)
- `webhookUrlBulkDone` : appele quand tout le bulk est termine (statistiques)
- `includeResultsInWebhook` : inclut les resultats dans le webhook final (attention si > 1000 items)

#### E. Recuperer les resultats (Polling)

```
POST https://app.icypeas.com/api/bulk-single-searchs/read

Body:
{
  "mode": "single",          // "single" | "bulk"
  "id": "p_xxx",             // ID d'un resultat specifique
  "file": "bulk_id",         // filtrer par ID de bulk search
  "type": "email-search",    // filtrer par type (mode single uniquement)
  "limit": 100,              // max 100 resultats par requete
  "next": true,              // pagination : true = page suivante
  "sorts": [...]             // cursor de pagination (retourne par la reponse precedente)
}
```

#### F. Find People (Base de donnees Icypeas) -- 0.02 credit/resultat

Cherche des personnes dans la base Icypeas par criteres professionnels.

```
POST https://app.icypeas.com/api/find-people

Body:
{
  "query": {
    "currentJobTitle": {
      "include": ["Directeur Marketing", "CMO", "Head of Marketing"],
      "exclude": ["Stagiaire", "Junior"]
    },
    "currentCompanyWebsite": {
      "include": ["example.com"]
    },
    "location": {
      "include": ["FR"]
    },
    "skills": {
      "include": ["Marketing Digital"]
    }
  },
  "pagination": {
    "size": 100     // 1 a 200 resultats par page
  }
}
```

**Filtres disponibles** :

| Filtre | Type | Exemple |
|--------|------|---------|
| `firstname` | Texte libre | "John", "Jane" |
| `lastname` | Texte libre | "Doe", "Smith" |
| `currentJobTitle` | Texte libre | "CTO", "CEO" |
| `pastJobTitle` | Texte libre | "Developer" |
| `currentCompanyName` | Texte libre | "Google" |
| `pastCompanyName` | Texte libre | "Amazon" |
| `currentCompanyWebsite` | Domaine/URL | "microsoft.com" |
| `pastCompanyWebsite` | Domaine/URL | "google.com" |
| `currentCompanyId` | Texte | Domain, URN, LinkedIn URL, vanity name |
| `pastCompanyId` | Texte | Domain, URN, LinkedIn URL, vanity name |
| `school` | Texte libre | "Stanford", "HEC" |
| `languages` | Codes langue | "EN", "FR" |
| `skills` | Noms de competence | "JavaScript", "Marketing" |
| `location` | Geographique | "FR", "Paris" (codes alpha-2 recommandes) |
| `keyword` | Texte libre | Cherche dans tout le profil |

**Chaque filtre supporte include/exclude avec max 200 valeurs par array.**

**Endpoint de comptage** (gratuit, avant de lancer) :
```
POST https://app.icypeas.com/api/find-people/count
Body: { "query": { ... } }    // meme format
Response: { "success": true, "total": 1234 }
```

### 2.4 Statuts de recherche

Flux de statut pour chaque item de recherche :

```
NONE ---------> SCHEDULED ---------> IN_PROGRESS ---------> FOUND / DEBITED
(en queue)     (prochain batch)     (en cours)              (trouve, credite)
                                                       +--> NOT_FOUND / DEBITED_NOT_FOUND
                                                       |    (rien trouve)
                                                       +--> BAD_INPUT
                                                       |    (donnees manquantes)
                                                       +--> INSUFFICIENT_FUNDS
                                                       |    (plus de credits)
                                                       +--> ABORTED
                                                            (annule par user)
```

| Statut | Signification |
|--------|---------------|
| `NONE` | En queue, pas encore demarre |
| `SCHEDULED` | Sera traite dans le prochain batch |
| `IN_PROGRESS` | Recherche en cours |
| `FOUND` / `DEBITED` | Email trouve, credits debites |
| `NOT_FOUND` / `DEBITED_NOT_FOUND` | Traitement termine, rien trouve |
| `BAD_INPUT` | Donnees insuffisantes pour lancer la recherche |
| `INSUFFICIENT_FUNDS` | Plus assez de credits |
| `ABORTED` | Recherche annulee par l'utilisateur |

### 2.5 Niveaux de certitude

Quand un email est trouve, Icypeas indique son niveau de confiance :

| Certitude | Confiance | Bounce attendu | Quand |
|-----------|-----------|----------------|-------|
| `ultra_sure` / `very_sure` | 99% | < 1% | Email finder, Domain scan |
| `probable` | 95% | < 5% | Email finder, Domain scan |
| `not_found` | - | - | Aucun email trouve (Email finder, Domain scan) |
| `undeliverable` | - | 100% | Email invalide (Email verification uniquement) |
| `not_found` (verif) | - | - | Impossible de determiner (Email verification) |

### 2.6 Format de reponse (resultat email-search)

Quand on recupere un resultat via `/bulk-single-searchs/read` :

```json
{
  "success": true,
  "items": [
    {
      "_id": "p_gfS5EB4liCGm90KDFC",
      "name": "...",
      "user": "...",
      "status": "DEBITED",
      "order": 0,
      "results": {
        "firstname": "John",
        "lastname": "Doe",
        "gender": "male",
        "fullname": "John Doe",
        "emails": [
          {
            "email": "john.doe@example.com",
            "certainty": "ULTRA_SURE",
            "mxProvider": "Google",
            "mxRecords": ["aspmx.l.google.com", "..."]
          }
        ],
        "phones": ["+33612345678"],
        "saasServices": ["Slack", "HubSpot"]
      },
      "userData": { "externalId": "lead_123" },
      "system": {
        "createdAt": "2026-04-01T10:00:00Z",
        "modifiedAt": "2026-04-01T10:00:15Z"
      }
    }
  ]
}
```

**Donnees retournees** :
- `emails[]` : liste d'emails trouves avec certitude + MX provider + MX records
- `phones[]` : numeros de telephone (si trouves)
- `saasServices[]` : services SaaS utilises par la personne (Slack, HubSpot, etc.)
- `gender` : genre detecte
- `userData.externalId` : l'ID custom qu'on a passe (pour matcher avec notre lead)

### 2.7 Pricing

| Plan | Prix/mois | Credits | Cout/email |
|------|-----------|---------|------------|
| Basic | $19 | 1 000 | $0.019 |
| Premium | $39 | 4 000 | $0.009 |
| Advanced | $89 | 10 000 | $0.008 |
| Hypergrowth | $499 | 100 000 | $0.005 |

**Plans annuels** : -20% (ex: Basic $190/an = 12 000 credits)

| Operation | Cout en credits |
|-----------|----------------|
| Email Finder | 1 credit |
| Email Verifier | 0.1 credit |
| Domain Scan | 1 credit |
| Profile Scraper | 1.5 credits |
| Company Scraper | 0.5 credit |
| Find People | 0.02 credit/resultat |
| Reverse Email Lookup | 10 credits |

**Credits non-expires**, rollover mensuel, accumulation illimitee.
50 credits gratuits a l'inscription.

---

## 3. Analyse de compatibilite

### 3.1 Ce qui s'integre bien

| Aspect | Detail |
|--------|--------|
| **Architecture async** | Icypeas est async (lance recherche -> poll/webhook). Compatible avec notre pattern cron existant |
| **Webhooks** | Icypeas supporte les webhooks par item et par bulk. On a deja un pattern webhook (Unipile dans `app/api/webhooks/unipile/`) |
| **Bulk** | Jusqu'a 5000 items par batch. Notre enrichissement batch existe deja dans `/api/ai/enrich` |
| **Donnees complementaires** | Email + phone + SaaS services = donnees qu'on n'a PAS actuellement |
| **Certitude** | Le systeme de certitude permet de filtrer (n'utiliser que ultra_sure/probable) |
| **externalId** | Permet de passer notre `lead.id` pour matcher facilement les resultats |
| **Find People** | Potentielle source de leads alternative a LinkedIn Search (0.02 credit/resultat = tres peu cher) |

### 3.2 Points d'attention

| Point | Impact | Mitigation |
|-------|--------|------------|
| **API asynchrone** | Contrairement a Perplexity (sync), Icypeas necessite polling ou webhook. Delai typique : quelques secondes a quelques minutes | Webhook preferred, polling en fallback |
| **Rate limit 30/min** | Pour un batch de 50 leads, le bulk endpoint est obligatoire | Utiliser `/bulk-search` systematiquement pour > 5 leads |
| **Besoin de domaine** | Email Finder necessite `firstname + lastname + domain/company`. Le domaine n'est pas toujours dispo | Extraire du `enrichmentData.company.website` (Perplexity) ou utiliser `company` en fallback |
| **Ordre des etapes** | Icypeas a besoin du website/domain -> doit tourner APRES Perplexity (etape 2) | Ajouter comme etape 5, apres le hook recommande |
| **Cout** | Plan Basic ($19/mois, 1000 credits) = ~1000 emails/mois. 3 users x ~50 leads/semaine = ~600/mois | Basic suffit pour commencer |
| **Stockage cle API** | Pattern existant : cle par user chiffree AES-256-GCM en DB. Mais Icypeas pourrait etre partage | Env var partagee (comme Unipile) semble plus logique pour 3 users internes |
| **Webhook URL publique** | Les webhooks necessitent une URL accessible depuis Internet | Vercel URLs publiques, meme pattern que Unipile |

### 3.3 Comparaison avec l'enrichissement actuel

| Donnee | Source actuelle | Avec Icypeas |
|--------|----------------|-------------|
| Email pro | Manuel / Import CSV | **Automatique** via Email Finder |
| Telephone | Manuel / Import CSV | **Automatique** (retourne par Icypeas) |
| Validation email | Aucune | **Automatique** via Email Verifier |
| SaaS utilises | Non disponible | **Nouveau** (Slack, HubSpot, etc.) |
| Profil LinkedIn | Unipile | Inchange |
| Company info | Perplexity | Inchange |
| Signal/Hook | Claude | Inchange |

---

## 4. Scenarios d'integration

### Scenario A : Etape 5 dans le pipeline existant (RECOMMANDE)

```
Pipeline actuel :
  1. Unipile (profil + posts)
  2. Perplexity (company research)
  3. Signal Classification (Claude)
  4. Hook Recommande (Claude)
  5. [NOUVEAU] Icypeas Email Finder

Declenchement : automatique a chaque enrichissement lead
Endpoint : /email-search (single)
Resultat : webhook -> stocke dans leads.email + enrichment_data.email_enrichment
```

**Avantages** : transparent pour l'utilisateur, donnees completes en une seule action
**Inconvenients** : ajoute du delai (async), consomme 1 credit par lead enrichi

### Scenario B : Enrichissement bulk separe

```
Action manuelle ou cron :
  1. Selectionner leads sans email + avec company/domain
  2. Appeler /bulk-search avec task "email-search"
  3. Webhook callback stocke les resultats au fur et a mesure
```

**Avantages** : controle fin sur quand/quoi enrichir, economise des credits
**Inconvenients** : action separee, leads pas enrichis immediatement

### Scenario C : Integration dans l'import CSV

```
A l'import d'une liste CSV :
  1. Creer les leads normalement
  2. Lancer un bulk email-search pour tous les leads sans email
  3. Webhook met a jour les leads au fur et a mesure
```

**Avantages** : enrichissement automatique des imports
**Inconvenients** : delai avant que les emails soient dispos

### Scenario D : Find People comme source de leads

```
Nouvelle fonctionnalite "Sourcing" :
  1. User definit des criteres (titre, localisation, entreprise...)
  2. /find-people/count -> preview du nombre de resultats
  3. /find-people -> recupere les profils
  4. Creer les leads dans le pipeline
  5. Enrichir normalement
```

**Avantages** : sourcing pas cher (0.02 credit/lead), complementaire a LinkedIn Search
**Inconvenients** : scope plus large, nouvelle feature complete a developper

### Scenario E : Verification des emails existants

```
Action batch sur le pipeline :
  1. Selectionner leads avec email non-verifie
  2. /bulk-search task "email-verification"
  3. Stocker le resultat de verification (certitude, delivrable/non)
```

**Avantages** : tres peu cher (0.1 credit), protege la reputation d'envoi
**Inconvenients** : pertinent seulement quand on aura de l'outreach email

---

## 5. Questions cles pour le brainstorm

### Architecture

1. **Quand declencher l'enrichissement email ?**
   - Automatique dans le pipeline d'enrichissement (scenario A) ?
   - Action separee declenchable manuellement (scenario B) ?
   - Les deux (auto + possibilite de relancer) ?

2. **Sync vs Async ?**
   - **Webhook** (comme Unipile) : plus elegant, pas de polling, mais necessite un nouvel endpoint
   - **Polling** avec retry : plus simple, pas de nouvel endpoint, mais consomme du rate limit
   - **Hybride** : lancer la recherche dans le pipeline, webhook pour stocker le resultat plus tard

3. **Cle API partagee ou par user ?**
   - Env var partagee (comme Unipile) : simple, 1 compte pour 3 users
   - Par user chiffree en DB : plus flexible mais over-engineered pour 3 users internes

### Donnees

4. **Seuil de certitude pour stocker l'email ?**
   - Uniquement `ultra_sure` + `probable` (>= 95% confiance) ?
   - Tout sauf `not_found` ?
   - Stocker tout mais afficher la certitude dans l'UI ?

5. **Que faire des donnees bonus ?**
   - `phones[]` : stocker dans `leads.phone` ?
   - `saasServices[]` : stocker dans `enrichment_data` ? Utile pour la prospection ?
   - `gender` : utile pour la personnalisation des messages ?

6. **Verification post-enrichissement ?**
   - Enchainer Email Finder -> Email Verifier automatiquement (1 + 0.1 = 1.1 credit) ?
   - Verifier seulement les emails `probable` (pas les `ultra_sure`) ?

### Produit

7. **Find People : opportunite ou hors-scope ?**
   - Source de leads complementaire a LinkedIn Search ?
   - Integration dans la page Listes ?
   - A developper plus tard comme V2 ?

8. **Affichage UI ?**
   - Ou montrer l'email enrichi + certitude + provider MX dans la fiche lead ?
   - Badge de certitude (vert ultra_sure, jaune probable, rouge not_found) ?
   - Icone MX provider (Google, Microsoft, OVH...) ?

### Budget

9. **Quel plan Icypeas pour demarrer ?**
   - Basic ($19/mois, 1000 credits) semble suffisant
   - Estimation : 3 users x 50 leads/semaine x 4 semaines = 600 emails/mois
   - + verifications eventuelles (0.1 credit) = ~660 credits/mois -> Basic OK

10. **Monitoring des credits ?**
    - Afficher les credits restants dans Settings ?
    - Alerte quand credits < seuil ?

---

## 6. Fichiers impactes (estimation)

### Nouveaux fichiers

| Fichier | Description |
|---------|-------------|
| `lib/icypeas/client.ts` | Client HTTP Icypeas (email-search, email-verification, bulk-search, read results, find-people) |
| `lib/icypeas/types.ts` | Types TypeScript pour les requetes/reponses Icypeas |
| `app/api/webhooks/icypeas/route.ts` | Webhook receiver pour resultats async (item + bulk done) |

### Fichiers a modifier

| Fichier | Modification |
|---------|-------------|
| `app/api/ai/enrich/route.ts` | Ajouter etape 5 Icypeas apres Perplexity/Signal/Hook |
| `types/leads.ts` | Etendre `LeadEnrichment` avec `email_enrichment: { email, certainty, mxProvider, phones, saasServices, searchId, status }` |
| `app/(dashboard)/pipeline/[id]/lead-detail-client.tsx` | Afficher certitude email, provider MX, badge, phone enrichi |
| `lib/constants.ts` | Ajouter config Icypeas (seuils de certitude, defaults) |
| `lib/actions/leads.ts` | Mettre a jour `leads.email` et `leads.phone` depuis les resultats Icypeas |
| `.env.local` | Ajouter `ICYPEAS_API_KEY` |
| `vercel.json` | Ajouter env var (si env var partagee) |

### Fichiers potentiellement impactes (selon les decisions)

| Fichier | Si... |
|---------|-------|
| `lib/actions/settings.ts` | Si cle par user : ajouter encrypt/decrypt pour `icypeas_key_encrypted` |
| `types/database.ts` | Si cle par user : ajouter colonne dans `user_api_keys` |
| `supabase/migrations/008_icypeas.sql` | Si cle par user : migration DB |
| `app/(dashboard)/settings/api-keys/api-keys-client.tsx` | Si cle par user : ajouter champ Icypeas |
| `app/(dashboard)/pipeline/pipeline-client.tsx` | Si bulk enrichissement email : bouton d'action |
| `lib/actions/import.ts` | Si scenario C (enrichir a l'import) |

---

## 7. Reference : Documentation API officielle

- **Doc API** : https://api-doc.icypeas.com/
- **Getting started** : https://api-doc.icypeas.com/getting-started/
- **Email Finder** : https://api-doc.icypeas.com/find-emails/email-discovery/
- **Email Verification** : https://api-doc.icypeas.com/find-emails/email-verification/
- **Domain Scan** : https://api-doc.icypeas.com/find-emails/domain-scan/
- **Bulk Search** : https://api-doc.icypeas.com/find-emails/bulk-search/
- **Retrieve Results** : https://api-doc.icypeas.com/fetch-results/search-item/
- **Check Progress** : https://api-doc.icypeas.com/check-progress/
- **Find People** : https://api-doc.icypeas.com/leads-db/find-people/
- **Certainties** : https://api-doc.icypeas.com/how-works/certainties/
- **Search Statuses** : https://api-doc.icypeas.com/how-works/search_statuses/
- **Pricing** : https://www.icypeas.com/pricing

---

*Document genere le 2026-04-01 -- Projet PROSPECTOR*
*A utiliser comme base de brainstorm avec Claude.ai pour planifier l'implementation*
