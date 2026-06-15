export interface Lead {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  /** Display name: "firstName lastName" or fallback from enrichment/URL */
  displayName: string;
  title?: string;
  company?: string;
  linkedinUrl: string;
  email?: string;
  phone?: string;
  score: number;
  status: LeadStatus;
  stage: LeadStage;
  tags: string[];
  notes?: string;
  enrichmentData?: LeadEnrichment;
  createdAt: Date;
  updatedAt: Date;
}

export type LeadStatus = "cold" | "warm" | "hot" | "converted" | "lost";

export type LeadStage =
  | "to_invite"
  | "invited"
  | "connected"
  | "in_sequence"
  | "responded"
  | "meeting"
  | "closed";

export type SignalType =
  | "INBOUND"
  | "POST_DOULEUR"
  | "POST_SUJET"
  | "ACTUALITE"
  | "SIGNAL_FAIBLE"
  | "FROID"
  // Gojiberry signal types
  | "ENGAGEMENT_KEYWORD"
  | "ENGAGEMENT_EXPERT"
  | "NEW_ROLE"
  | "ICP_TOP_ACTIVE"
  | "COMPETITOR_ENGAGEMENT";

export type { IcypeasEmailEnrichment } from "@/lib/icypeas/types";

export interface LeadEnrichment {
  company?: {
    size?: string;
    industry?: string;
    funding?: string;
    revenue?: string;
    location?: string;
    website?: string;
    description?: string;
    website_analysis?: {
      offering?: string;
      target_market?: string;
      differentiators?: string;
      team_visible?: string;
    };
    news?: string[];
  };
  person?: {
    experience?: WorkExperience[];
    education?: Education[];
    interests?: string[];
    recentPosts?: RecentPost[];
    anciennete_poste_mois?: number | null;
    publicSpeaking?: string[];
  };
  signal?: {
    type?: SignalType | null;
    detail?: string | null;
    smartai_interaction?: boolean | null;
    // Gojiberry-specific fields
    source?: "gojiberry" | "manual" | "enrichment" | null;
    gojiberry_score?: number | null;
    intent_keyword?: string | null;
    intent_post_url?: string | null;
    intent_expert_url?: string | null;
    intent_post_content?: string | null;
    import_date?: string | null;
  };
  scoring_detail?: {
    fit_score?: number;
    intent_score?: number;
    timing_score?: number;
    categorie?: string;
    segment_icp?: string;
    confidence?: string;
    justification?: string;
    cas_limite?: boolean;
    ajustement_ia?: string;
    [key: string]: unknown;
  };
  linkedin_posts?: LinkedInPost[];
  linkedin_profile?: {
    headline?: string | null;
    about?: string | null;
    profile_picture_url?: string | null;
    profile_picture_url_large?: string | null;
    location?: string | null;
    connections_count?: number | null;
    follower_count?: number | null;
    is_premium?: boolean | null;
    is_open_profile?: boolean | null;
    is_creator?: boolean | null;
    network_distance?: string | null;
    skills?: { name: string; endorsement_count?: number }[];
    languages?: { name: string; proficiency?: string }[];
    websites?: string[];
    education?: { school?: string; degree?: string; field?: string; start_date?: string; end_date?: string }[];
    shared_connections_count?: number | null;
  };
  email_enrichment?: import("@/lib/icypeas/types").IcypeasEmailEnrichment;
  summary?: string | null;
  web_research?: {
    societe?: {
      effectif?: string;
      ca?: string;
      structure_capitalistique?: string;
      code_naf?: string;
      date_creation?: string;
      source: string;
    };
    presse: Array<{
      titre: string;
      resume: string;
      date?: string;
      source: string;
    }>;
    signaux: Array<{
      type: string;
      description: string;
      date?: string;
      fraicheur?: "FRAIS" | "RECENT" | "VIEUX";
      source: string;
    }>;
    searched_at: string;
  };
  dossier?: {
    destinataire_profil_lecture: string;
    mecanisme: string;
    accroche_pivot: string | null;
    corps_message: string | null;
    question_ouverte: string;
    signal_declencheur: string;
    voix: "je" | "nous";
    formalite: "vouvoiement" | "tutoiement";
    formalite_justification: string;
    canal_recommande: string;
    canal_justification: string;
    ton: string[];
    longueur_max: string;
    a_eviter: string[];
    a_integrer: string[];
    preuves: string[];
    objectif_reponse: string;
    angle_qualite: "SOLIDE" | "DÉGRADÉ" | "FAIBLE";
    hypothese_assumee?: string | null;
    reserves: string | null;
    generated_at: string;
  };
}

export interface RecentPost {
  summary: string;
  /** Thème principal du post en 5 mots max */
  sujet?: string;
  /** Douleur/enjeu business révélé, null si contenu informatif */
  tension?: string | null;
  /** Registre du prospect */
  ton?: "corporate" | "decontracte" | "expert" | "vulnerable" | string;
  reactions: number;
  comments: number;
  date: string;
}

export interface LinkedInPost {
  social_id?: string;
  text?: string;
  share_url?: string | null;
  timestamp?: string;
  reactions_count?: number;
  comments_count?: number;
  author_name?: string | null;
}

export interface WorkExperience {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
}

export interface Education {
  school: string;
  degree?: string;
  field?: string;
}

export interface LeadFilters {
  status?: LeadStatus[];
  stage?: LeadStage[];
  scoreMin?: number;
  scoreMax?: number;
  sequenceId?: string;
  tags?: string[];
  search?: string;
  signalType?: SignalType[];
}
