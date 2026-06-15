# Diagnostic UI Enrichissement - lead-detail-client.tsx

> Audit complet des champs `enrichmentData` affiches dans la fiche lead.
> Source : `app/(dashboard)/pipeline/[id]/lead-detail-client.tsx`
> Date : 2026-03-07

---

## Tableau de correspondance

### company.*

| Champ | Affiche ? | Section / Label / Ligne |
|-------|-----------|-------------------------|
| `company.size` | OUI | Section "Entreprise", icone Users, fallback "Non renseigne" (L792) |
| `company.industry` | OUI | Section "Entreprise", card "Secteur", fallback "N/A" (L819) |
| `company.funding` | OUI | Section "Entreprise", card "Funding", fallback "N/A" (L828) |
| `company.revenue` | OUI | Section "Entreprise", card "Revenue estime", conditionnel (L832-841) |
| `company.location` | OUI | Section "Entreprise", icone MapPin, fallback "Non renseigne" (L796) |
| `company.website` | OUI | Section "Entreprise", icone Globe, lien cliquable, conditionnel (L798-809) |
| `company.description` | OUI | Section "Entreprise", texte italique entre guillemets, conditionnel (L843-846) |
| `company.news[]` | OUI | Section "Entreprise", sous-section "Actualites recentes", liste avec border-l accent (L848-864) |

### person.*

| Champ | Affiche ? | Section / Label / Ligne |
|-------|-----------|-------------------------|
| `person.experience[]` | OUI | Section "Parcours", timeline verticale (title, company, startDate-endDate) (L1009-1020) |
| `person.experience[].title` | OUI | Titre bold dans la timeline (L1012) |
| `person.experience[].company` | OUI | Sous-titre muted (L1013-1014) |
| `person.experience[].startDate` | OUI | Date debut (L1017) |
| `person.experience[].endDate` | OUI | Date fin ou "Present" (L1017) |
| `person.education[]` | OUI | Section "Parcours", timeline secondaire avec icone GraduationCap (L1021-1032) |
| `person.education[].school` | OUI | Nom ecole bold (L1026) |
| `person.education[].degree` | OUI | Texte xs muted (L1028-1029) |
| `person.education[].field` | OUI | Texte xs muted apres degree (L1029) |
| `person.interests[]` | OUI | Section "Centres d'interet", badges outline (L1047-1054) |
| `person.recentPosts[]` | OUI | Section "Centres d'interet", sous-section "Publications recentes", cards muted (L1056-1069) |
| `person.anciennete_poste_mois` | OUI | Section "Parcours", badge "En poste depuis X mois" (L1002-1006) |

### signal.*

| Champ | Affiche ? | Section / Label / Ligne |
|-------|-----------|-------------------------|
| `signal.type` | OUI | Section "Signal", Badge colore selon type (INBOUND=default, POST_DOULEUR=destructive, ACTUALITE=warning, etc.) (L876-889) |
| `signal.detail` | OUI | Section "Signal", paragraphe texte muted (L892-897) |
| `signal.smartai_interaction` | NON | Jamais lu ni affiche dans l'UI |

### linkedin_profile.*

| Champ | Affiche ? | Section / Label / Ligne |
|-------|-----------|-------------------------|
| `linkedin_profile.headline` | OUI | Header card, remplace "title chez company" si present (L408-415) |
| `linkedin_profile.about` | OUI | Section "Profil LinkedIn", texte whitespace-pre-line (L920-922). Note : la section entiere n'apparait QUE si `about` est truthy (L903) |
| `linkedin_profile.profile_picture_url` | OUI | Header card, Avatar image (L383-387) |
| `linkedin_profile.profile_picture_url_large` | NON | Jamais lu ni affiche |
| `linkedin_profile.location` | NON | Jamais lu (la location affichee vient de `company.location`) |
| `linkedin_profile.connections_count` | OUI | Section "Profil LinkedIn", header "X+ connexions" (L909-911) |
| `linkedin_profile.follower_count` | OUI | Section "Profil LinkedIn", header "X abonnes" apres connexions (L912-914) |
| `linkedin_profile.is_premium` | OUI | Header card, Badge dore "Premium" avec icone Crown (L399-404) |
| `linkedin_profile.is_open_profile` | NON | Jamais lu ni affiche |
| `linkedin_profile.network_distance` | OUI | Header card, Badge "1er/2e/3e degre" (L417-424) |
| `linkedin_profile.skills[]` | OUI | Section "Profil LinkedIn", sous-section "Competences", badges avec endorsement_count, max 12 affiches (L923-945) |
| `linkedin_profile.skills[].name` | OUI | Texte du badge (L934) |
| `linkedin_profile.skills[].endorsement_count` | OUI | Entre parentheses apres le nom (L935) |
| `linkedin_profile.languages[]` | OUI | Section "Profil LinkedIn", sous-section "Langues", badges (L947-963) |
| `linkedin_profile.languages[].name` | OUI | Texte du badge (L958) |
| `linkedin_profile.languages[].proficiency` | OUI | Entre parentheses apres le nom (L958) |
| `linkedin_profile.websites[]` | OUI | Section "Profil LinkedIn", sous-section "Sites web", liens cliquables (L965-988) |

### scoring_detail.*

| Champ | Affiche ? | Section / Label / Ligne |
|-------|-----------|-------------------------|
| `scoring_detail.fit_score` | OUI | Section "Detail du scoring", card "Fit" X/40 (L675-682) |
| `scoring_detail.intent_score` | OUI | Section "Detail du scoring", card "Intent" X/40 (L683-690) |
| `scoring_detail.timing_score` | OUI | Section "Detail du scoring", card "Timing" X/20 (L691-698) |
| `scoring_detail.categorie` | OUI | Section "Detail du scoring", Badge outline dans le header (L657-661) |
| `scoring_detail.confidence` | OUI | Section "Detail du scoring", texte xs entre parentheses dans le header (L662-666) |
| `scoring_detail.justification` | OUI | Section "Detail du scoring", texte italique muted (L700-703) |
| `scoring_detail.ajustement_ia` | OUI | Section "Detail du scoring", texte xs "Ajustement IA : ..." (L705-709) |
| `scoring_detail.cas_limite` | NON | Stocke dans le state (L289) mais jamais affiche dans l'UI |

### Champs racine enrichmentData

| Champ | Affiche ? | Section / Label / Ligne |
|-------|-----------|-------------------------|
| `summary` | NON | Jamais lu ni affiche |
| `confidence` (racine) | NON | Utilise uniquement dans le toast apres enrichissement (L349), jamais affiche de facon persistante |
| `linkedin_posts[]` (racine) | NON | Jamais lu ni affiche (les posts affiches viennent de `person.recentPosts`) |

---

## Resume des champs NON affiches

| Champ | Raison probable |
|-------|-----------------|
| `signal.smartai_interaction` | Boolean interne, pas de representation UI prevue |
| `linkedin_profile.profile_picture_url_large` | Seule la version standard est utilisee pour l'avatar |
| `linkedin_profile.location` | Doublon avec `company.location` qui est deja affiche |
| `linkedin_profile.is_open_profile` | Pas de badge/indicateur prevu dans le design |
| `scoring_detail.cas_limite` | Stocke en state mais aucun rendu conditionnel |
| `summary` (racine) | Champ potentiellement retourne par l'API enrich mais jamais exploite |
| `confidence` (racine) | Affiche en toast ephemere seulement, pas persiste dans l'UI |
| `linkedin_posts[]` (racine) | L'UI utilise `person.recentPosts` a la place |

---

## Note sur la visibilite conditionnelle

- La section "Profil LinkedIn" entiere (about, skills, langues, websites) n'apparait **que si `linkedin_profile.about` est truthy** (L903). Si un profil a des skills/langues mais pas de `about`, ces donnees sont invisibles.
- La section "Signal" n'apparait que si `signal` est truthy (L870).
- La section "Centres d'interet" n'apparait que si `person.interests` OU `person.recentPosts` existent (L1038).
- Le "Detail du scoring" n'apparait que si `scoringBreakdown` est non-null ET `showBreakdown` est true (L650).
