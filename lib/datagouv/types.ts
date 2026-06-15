/**
 * types.ts — Types de l'API Recherche d'entreprises (data.gouv) + types normalisés.
 *
 * SCHÉMA RÉEL (vérifié par curl, 2026-06-02) :
 * GET https://recherche-entreprises.api.gouv.fr/search
 *   Réponse : { results[], total_results, page, per_page, total_pages }
 *   results[] : { siren, nom_complet, nom_raison_sociale, activite_principale (NAF),
 *     section_activite_principale, tranche_effectif_salarie (code INSEE),
 *     categorie_entreprise, nature_juridique, date_creation, statut_diffusion,
 *     dirigeants[], siege{ adresse, code_postal, libelle_commune, departement, ... } }
 *
 * PARAMÈTRES DE FILTRE (noms réels confirmés — ATTENTION le doc interne disait
 * "code_naf", c'est FAUX, le bon nom est `activite_principale`) :
 *   - activite_principale   : code(s) NAF sous-classe, CSV multi (ex "62.01Z,62.02A")
 *   - section_activite_principale : lettre A–U
 *   - tranche_effectif_salarie    : code(s) INSEE, CSV multi
 *   - departement / code_postal   : CSV multi — MATCHENT N'IMPORTE QUEL établissement,
 *                                   pas uniquement le siège → post-filtrage siège requis
 *   - categorie_entreprise        : PME | ETI | GE
 *   - nature_juridique            : code
 *   - page, per_page (MAX 25)
 *
 * CONFORMITÉ (obligatoire — usage prospection) :
 *   - EXCLURE statut_diffusion !== "O" (les "P" = diffusion partielle, interdits).
 *   - Ne garder que les dirigeants `type_dirigeant === "personne physique"` (nom + prénoms).
 */

// ---------------------------------------------------------------------------
// Brut (API)
// ---------------------------------------------------------------------------

export interface RawSiege {
  adresse?: string | null;
  code_postal?: string | null;
  libelle_commune?: string | null;
  commune?: string | null;
  departement?: string | null;
  region?: string | null;
}

export interface RawDirigeant {
  type_dirigeant?: string | null;
  // personne physique
  nom?: string | null;
  prenoms?: string | null;
  qualite?: string | null;
  annee_de_naissance?: string | null;
  // personne morale
  denomination?: string | null;
  siren?: string | null;
}

export interface RawCompany {
  siren: string;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  activite_principale?: string | null;
  section_activite_principale?: string | null;
  tranche_effectif_salarie?: string | null;
  categorie_entreprise?: string | null;
  nature_juridique?: string | null;
  date_creation?: string | null;
  statut_diffusion?: string | null;
  dirigeants?: RawDirigeant[] | null;
  siege?: RawSiege | null;
  [key: string]: unknown; // payload complet → stocké dans companies.unite_legale
}

export interface RawSearchResponse {
  results?: RawCompany[];
  total_results?: number;
  page?: number;
  per_page?: number;
  total_pages?: number;
}

// ---------------------------------------------------------------------------
// Normalisé (app)
// ---------------------------------------------------------------------------

export interface Company {
  siren: string;
  nom: string;
  naf: string | null;
  section: string | null;
  ville: string | null;
  codePostal: string | null;
  departement: string | null;
  dateCreation: string | null;
  effectif: string | null; // code INSEE de tranche
  categorie: string | null;
  /** payload brut complet → companies.unite_legale (JSONB) */
  uniteLegale: RawCompany;
}

export interface Dirigeant {
  siren: string; // SIREN de l'entreprise
  companyNom: string;
  nom: string; // nom de famille (titlecasé)
  prenom: string; // prénom usuel (titlecasé)
  qualite: string | null;
  /** entreprise rattachée (pour affichage + import) */
  company: Company;
}

/** Entonnoir de transparence — AUCUN filtre silencieux. */
export interface SearchFunnel {
  scanned: number; // entreprises récupérées de l'API
  conformes: number; // statut_diffusion === "O"
  personnesPhysiques: number; // conformes avec ≥1 dirigeant personne physique nommé
  siegeDansZone: number; // + siège dans la zone demandée (si filtre géo)
  leadsCandidats: number; // dirigeants (personnes) finalement produits
}

export interface SearchResult {
  companies: Company[];
  people: Dirigeant[];
  funnel: SearchFunnel;
}

/** Filtres d'entrée (structurellement compatible avec ParsedFilters du query-parser). */
export interface SearchFilters {
  naf_codes: string[];
  section: string | null;
  effectif_codes: string[];
  departements: string[];
  categorie: string | null;
  limit: number;
  require_named_dirigeant: boolean;
}

export interface SirenResolution {
  siren: string;
  nom: string;
  score_confiance: number; // 0..1
}
