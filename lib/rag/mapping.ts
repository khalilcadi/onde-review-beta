import type {
  PromptType,
  IcpSegment,
  SignalTypeM1,
  M2Situation,
  ResolvedSections,
  RagBlocId,
} from './types';

// Re-export from types for backward compatibility
export { RAG_BLOC_IDS } from './types';
export type { RagBlocId } from './types';

// ---------------------------------------------------------------------------
// Agent mapping — used by scoring, enrichissement, conversational + prospection fallback
// Prospection uses resolveRagSections() for fine-grained M1/M2 resolution
// ---------------------------------------------------------------------------

export const RAG_AGENT_MAPPING: Record<string, readonly RagBlocId[] | readonly ['*']> = {
  prospection_m1: ['icp_segments', 'pain_points', 'messaging_angles', 'offre_produit'],
  prospection_m2: ['icp_segments', 'pain_points', 'messaging_angles', 'offre_produit', 'qualification'],
  dossier_attaque: ['icp_segments', 'offre_produit', 'pain_points', 'messaging_angles'],
  scoring: ['icp_segments', 'pain_points', 'qualification'],
  enrichissement: ['icp_segments'],
  conversational: ['*'],
} as const;

export function resolveAgentBlocs(agentId: string): readonly RagBlocId[] {
  const { RAG_BLOC_IDS } = require('./types');
  const mapping = RAG_AGENT_MAPPING[agentId];
  if (!mapping) return [];
  if ((mapping as readonly string[]).includes('*')) return RAG_BLOC_IDS;
  return mapping as readonly RagBlocId[];
}

// ---------------------------------------------------------------------------
// Gojiberry signal → M1 signal type mapping
// ---------------------------------------------------------------------------

const GOJIBERRY_SIGNAL_MAP: Record<string, SignalTypeM1> = {
  ENGAGEMENT_KEYWORD: 'A',
  ENGAGEMENT_EXPERT: 'A',
  COMPETITOR_ENGAGEMENT: 'A',
  NEW_ROLE: 'B',
  ICP_TOP_ACTIVE: 'C',
  // Vocabulaire post-enrichissement (produit par enrich_classify_signal)
  INBOUND: 'A',
  POST_DOULEUR: 'A',
  POST_SUJET: 'A',
  ACTUALITE: 'B',
  SIGNAL_FAIBLE: 'C',
  FROID: 'D',
};

export function mapGojiberrySignal(signalType: string | null): SignalTypeM1 {
  if (!signalType) return 'D';
  return GOJIBERRY_SIGNAL_MAP[signalType] ?? 'D';
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

function segmentSection(segment: IcpSegment): string {
  switch (segment) {
    case 'A': return 'segment_a';
    case 'B': return 'segment_b';
    case 'C': return 'segment_c';
    // D/E/F : pas de section RAG dédiée en Phase 1 → défaut général
    case 'D': return 'segment_b';
    case 'E': return 'segment_b';
    case 'F': return 'segment_b';
    case 'HORS_ICP': return '';
  }
}

function isEsn(_segment: IcpSegment): boolean {
  // Concept ESN supprimé en Phase 2 (ICP studios créa). Toujours false.
  return false;
}

function empty(): ResolvedSections {
  return {
    icp_segments: [],
    pain_points: [],
    messaging_angles: [],
    offre_produit: [],
    qualification: [],
  };
}

/** Strip keys with empty arrays so buildRagContext doesn't interpret [] as "all sections" */
function stripEmpty(r: ResolvedSections): ResolvedSections {
  const out: ResolvedSections = {};
  for (const [k, v] of Object.entries(r)) {
    if (v.length > 0) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// M1 resolution (premier message)
// ---------------------------------------------------------------------------

function resolveM1(_segment: IcpSegment, _signal: SignalTypeM1): ResolvedSections {
  // M1 = zéro RAG. Le LLM construit l'accroche uniquement à partir du prompt M1
  // (règles de style, structure, interdictions) et des données du lead injectées
  // dans le runtime context (headline, bio, posts, signal, entreprise, parcours).
  // Le RAG reste utile en M2 (pitch) et en conversational (objections), pas ici.
  return empty();
}

// ---------------------------------------------------------------------------
// M2 resolution (relances et réponses)
// ---------------------------------------------------------------------------

function resolveM2Relance(_segment: IcpSegment): ResolvedSections {
  // M2 relance = zéro RAG. Le prompt M2 V5.0 est autonome.
  // Injecter pain_points + icp_segments = réinjecter du langage pitch.
  // Même stratégie que le M1 post-refactor.
  return empty();
}

function resolveM2Reponse(segment: IcpSegment, responseType?: string): ResolvedSections {
  const r = empty();

  if (segment === 'HORS_ICP') {
    r.pain_points.push('pp_generiques_b2b');
    r.qualification.push('questions_diagnostic');
    return r;
  }

  const seg = segmentSection(segment);
  // isEsn() always returns false in Phase 2 (ICP studios créa) — pain stays generic
  const painSeg = isEsn(segment) ? 'pp_commerciaux' : 'pp_generiques_b2b';

  switch (responseType) {
    case 'question_produit':
      r.icp_segments.push(seg);
      r.pain_points.push(painSeg);
      r.offre_produit.push('vue_ensemble', 'composants');
      r.qualification.push('questions_diagnostic', 'closing');
      break;

    case 'objection_prix':
      r.icp_segments.push(seg);
      r.offre_produit.push('pricing');
      r.qualification.push('obj_prix', 'closing');
      break;

    case 'objection_confiance':
      r.icp_segments.push(seg);
      r.offre_produit.push('arc_framework');
      r.qualification.push('obj_confiance');
      break;

    case 'objection_resultats':
      r.icp_segments.push(seg);
      r.qualification.push('obj_resultats');
      break;

    case 'objection_esn':
      r.icp_segments.push(seg);
      r.pain_points.push('pp_esn_croyances');
      r.offre_produit.push('triple_pipeline_detail');
      r.qualification.push('obj_esn');
      break;

    case 'conformite':
      r.qualification.push('obj_conformite');
      break;

    case 'general':
    default:
      // Question générale — fallback safe
      r.icp_segments.push(seg);
      r.pain_points.push(painSeg);
      r.qualification.push('questions_diagnostic');
      break;
  }

  return r;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

export function resolveRagSections(
  promptType: PromptType,
  segment: IcpSegment,
  signalType: SignalTypeM1,
  m2Situation?: M2Situation,
  leadResponseType?: string
): ResolvedSections {
  let result: ResolvedSections;

  if (promptType === 'M1') {
    result = resolveM1(segment, signalType);
  } else {
    // M2
    switch (m2Situation) {
      case 'dernier_message':
        result = empty();
        break;

      case 'relance':
        result = resolveM2Relance(segment);
        break;

      case 'reponse':
        result = resolveM2Reponse(segment, leadResponseType);
        break;

      default:
        // Fallback — treat as relance
        result = resolveM2Relance(segment);
        break;
    }
  }

  return stripEmpty(result);
}
