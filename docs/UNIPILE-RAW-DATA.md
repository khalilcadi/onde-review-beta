# Unipile - Données brutes reçues (tests réels)

> Résultats des tests effectués le 2026-02-28 avec le script `explore-unipile-profile.ts`.
> Deux profils testés : Khalil Cadi et Thomas Coquillet.

---

## 1. Profil basique (sans linkedin_sections)

Clés retournées :
```
id, object, provider, provider_id, member_urn,
first_name, last_name, headline, public_identifier,
profile_url, profile_picture_url, profile_picture_url_large,
background_picture_url, location, about, company,
connections_count, follower_count, followers_count,
shared_connections_count, network_distance,
is_open_profile, is_premium, is_influencer, is_creator,
is_relationship, is_self, primary_locale,
experience (array), education (array)
```

**NOTE** : En mode basique, `about` est présent et `experience` est le nom du champ.

---

## 2. Profil complet (avec linkedin_sections=*)

Clés SUPPLÉMENTAIRES débloquées :
```
summary (remplace about !),
work_experience (remplace experience !),
skills, languages, certifications,
volunteering_experience, projects, hashtags,
websites, recommendations, contact_info, creator_website
```

### Détail par champ — présence sur 2 profils testés

| Champ | Khalil Cadi | Thomas Coquillet |
|-------|-------------|------------------|
| `headline` | "Co-fondateur @ Smart.AI..." | "Coach de dirigeants..." |
| `about` | ABSENT (remplacé par summary) | ABSENT |
| `summary` | Présent (texte long) | Présent |
| `profile_picture_url` | Présent | Présent |
| `profile_picture_url_large` | Présent | Présent |
| `location` | "Paris, France" | "Lyon, France" |
| `connections_count` | ~500 | ~1200 |
| `follower_count` | Présent | Présent |
| `network_distance` | "FIRST" (self) | "FIRST" (connexion) |
| `is_premium` | true | false |
| `is_open_profile` | false | true |
| `is_creator` | false | false |
| `work_experience` | Présent (array) | Présent (array) |
| `experience` | ABSENT (remplacé par work_experience) | ABSENT |
| `education` | Présent | Présent |
| `skills` | Présent (~15 items) | Présent (~20 items) |
| `languages` | Présent (2-3 items) | Présent |
| `certifications` | Absent | Présent (2 items) |
| `websites` | Absent | Présent (1 item) |
| `contact_info` | `{emails: [], phones: []}` | `{emails: [], phones: []}` |
| `creator_website` | null | null |
| `recommendations` | Absent | Présent |
| `volunteering_experience` | Absent | Absent |
| `projects` | Absent | Absent |
| `hashtags` | Absent | Absent |

---

## 3. Structure détaillée des champs arrays

### work_experience (= experience avec sections=*)
```json
{
  "title": "Co-fondateur",
  "company_name": "Smart.AI",
  "start_date": "2024-06",
  "end_date": null,
  "description": "...",
  "location": "Paris, France"
}
```

### education
```json
{
  "school_name": "HEC Paris",
  "degree": "Master",
  "field_of_study": "Marketing Digital",
  "start_date": "2016",
  "end_date": "2018"
}
```

### skills
```json
{
  "name": "Marketing Digital",
  "endorsement_count": 15
}
```

### languages
```json
{
  "name": "French",
  "proficiency": "NATIVE_OR_BILINGUAL"
}
```

### certifications
```json
{
  "name": "Google Analytics",
  "authority": "Google",
  "start_date": "2023-01",
  "end_date": null
}
```

---

## 4. Posts — FONCTIONNE avec provider_id

> Mis à jour le 2026-02-28 (2e session de tests).

### Ce qui NE FONCTIONNE PAS (422 "Recipient cannot be reached")
```
GET /users/{linkedin-slug}/posts          → 422
GET /users/{member_urn}/posts             → 422
GET /users/{full-linkedin-url}/posts      → 422
GET /users/{slug}/posts (sans account_id) → 400
GET /linkedin/search?type=posts           → 404 (endpoint inexistant sur DSN api30)
GET /posts?author_id=...                  → 404 (endpoint inexistant sur DSN api30)
```

### Ce qui FONCTIONNE
```
GET /users/{provider_id}/posts?account_id={accountId}&limit=5
```
→ **Renvoie les 5 derniers posts avec status 200 OK !**

Le `provider_id` est obtenu d'abord via `GET /users/{slug}?account_id=...` (champ `provider_id` dans la réponse).

**Exemple provider_id** : `ACoAABb2WzcBPEsbLG0cHJ586yzsMtDI1n3lYdI` (pour ludwig-graham)

### Structure d'un post retourné
```json
{
  "object": "Post",
  "provider": "LINKEDIN",
  "social_id": "urn:li:activity:7368164485271851008",
  "share_url": "https://www.linkedin.com/posts/...",
  "text": "...",
  "timestamp": "...",
  "reactions_count": 42,
  "comments_count": 5,
  "author_name": "..."
}
```

### Implémentation
Le fix est dans `app/api/ai/enrich/route.ts` : on fetch d'abord le profil (déjà fait), puis on utilise `profile.provider_id` pour fetcher les posts.

Les posts bruts sont stockés dans `enrichment_data.linkedin_posts` pour l'affichage UI.

---

## 5. Valeurs de network_distance observées

| Valeur | Signification |
|--------|--------------|
| `"FIRST"` | Connexion 1er degré (ou soi-même) |
| `"SECOND"` | 2e degré |
| `"THIRD"` | 3e degré |

La fonction `isFirstDegreeConnection()` dans `enrich/route.ts` normalise aussi : `"DISTANCE_1"`, `"1"`, `"1ST"`.

---

## 6. Identifiant LinkedIn

L'identifiant envoyé à Unipile est extrait de l'URL LinkedIn :
```
https://www.linkedin.com/in/khalil-cadi-marketing-digital/
→ identifier = "khalil-cadi-marketing-digital"
```

Fonction : `extractLinkedInIdentifier(url)` dans `lib/unipile/client.ts`.

---

*Données brutes Unipile - Tests du 2026-02-28*
