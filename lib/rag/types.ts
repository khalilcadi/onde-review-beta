// Structure d'une section taggée dans un bloc RAG
export interface RagSection {
  section_id: string;
  tags: string[];
  heading: string;
  content: string[];
}

// Structure d'un bloc RAG chargé depuis knowledge/*.json
export interface RagBloc {
  bloc_id: string;
  title: string;
  sections: RagSection[];
  metadata: {
    version: string;
    source_docs: string[];
    total_sections: number;
  };
}

// IDs des blocs RAG v2
export type RagBlocId =
  | 'icp_segments'
  | 'pain_points'
  | 'messaging_angles'
  | 'offre_produit'
  | 'qualification';

export const RAG_BLOC_IDS: readonly RagBlocId[] = [
  'icp_segments',
  'pain_points',
  'messaging_angles',
  'offre_produit',
  'qualification',
];

// Types pour le resolver de sections
export type PromptType = 'M1' | 'M2';
export type M2Situation = 'reponse' | 'relance' | 'dernier_message';
export type SignalTypeM1 = 'A' | 'B' | 'C' | 'D';
export type IcpSegment = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'HORS_ICP';

export interface ResolvedSections {
  [blocId: string]: string[]; // blocId → array de section_ids à injecter
}

// Document RAG stocké en DB (user overrides — Phase F)
export interface RagDocument {
  id: string;
  userId: string;
  dataType: RagBlocId;
  content: Record<string, unknown>;
  updatedAt: Date;
}
