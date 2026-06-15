import { promises as fs } from "fs";
import path from "path";
import { resolveAgentBlocs, type RagBlocId } from "./mapping";
import type { RagBloc, RagSection, ResolvedSections } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

// Cache en mémoire pour éviter de relire les fichiers à chaque requête
const blocCache = new Map<RagBlocId, RagBloc>();

// Charge un bloc RAG depuis knowledge/<blocId>.json
async function loadBloc(blocId: RagBlocId): Promise<RagBloc | null> {
  const cached = blocCache.get(blocId);
  if (cached) return cached;

  try {
    const filePath = path.join(KNOWLEDGE_DIR, `${blocId}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    const bloc: RagBloc = JSON.parse(raw);
    blocCache.set(blocId, bloc);
    return bloc;
  } catch {
    console.warn(`[RAG] Bloc "${blocId}" introuvable dans knowledge/`);
    return null;
  }
}

// Charge les overrides user depuis la table user_rag_data
async function loadUserOverrides(
  userId: string,
  supabase: SupabaseClient<Database>
): Promise<Map<string, RagBloc>> {
  const overrides = new Map<string, RagBloc>();

  try {
    const { data, error } = await supabase
      .from("user_rag_data")
      .select("data_type, content")
      .eq("user_id", userId);

    if (error || !data) return overrides;

    for (const row of data) {
      const content = row.content as Json;
      if (content && typeof content === "object" && !Array.isArray(content)) {
        overrides.set(row.data_type, content as unknown as RagBloc);
      }
    }
  } catch (err) {
    console.warn("[RAG] Erreur chargement overrides user:", err);
  }

  return overrides;
}

// Filtre les sections d'un bloc par section_ids
function filterBlocSections(bloc: RagBloc, sectionIds: string[]): RagSection[] {
  if (sectionIds.length === 0) return bloc.sections;
  return bloc.sections.filter(s => sectionIds.includes(s.section_id));
}

// Convertit des sections filtrées en texte markdown pour injection prompt
function formatSectionsAsText(blocTitle: string, sections: RagSection[]): string {
  const lines: string[] = [];
  lines.push(`### ${blocTitle}`);
  lines.push("");

  for (const section of sections) {
    if (section.heading) {
      lines.push(`**${section.heading}**`);
    }
    if (section.content.length > 0) {
      lines.push(section.content.join("\n"));
    }
  }

  return lines.join("\n");
}

// Résout un client Supabase pour charger les overrides utilisateur
async function resolveUserOverrides(
  userId?: string,
  supabaseOverride?: SupabaseClient<Database>
): Promise<Map<string, RagBloc>> {
  if (!userId) return new Map();

  if (supabaseOverride) {
    return loadUserOverrides(userId, supabaseOverride);
  }

  try {
    const { createServerClient } = await import("@/lib/supabase/server");
    const supabase = createServerClient();
    return loadUserOverrides(userId, supabase);
  } catch {
    return new Map();
  }
}

// Construit le contexte RAG à partir de ResolvedSections (filtrage par section_id)
export async function buildRagContext(
  resolvedSections: ResolvedSections,
  userId?: string,
  supabaseOverride?: SupabaseClient<Database>
): Promise<string>;

// Wrapper de compatibilité : ancienne signature par agentId (injecte tous les blocs)
export async function buildRagContext(
  agentId: string,
  userId?: string,
  supabaseOverride?: SupabaseClient<Database>,
  icpSegment?: string
): Promise<string>;

// Implémentation unifiée
export async function buildRagContext(
  agentIdOrSections: string | ResolvedSections,
  userId?: string,
  supabaseOverride?: SupabaseClient<Database>,
  icpSegment?: string
): Promise<string> {
  // Déterminer si on utilise la nouvelle ou l'ancienne signature
  let resolvedSections: ResolvedSections;

  if (typeof agentIdOrSections === "string") {
    // Ancienne signature : agentId → résoudre tous les blocs avec toutes les sections
    const blocIds = resolveAgentBlocs(agentIdOrSections);
    if (blocIds.length === 0) return "";
    resolvedSections = {};
    for (const blocId of blocIds) {
      resolvedSections[blocId] = []; // [] = toutes les sections
    }
  } else {
    resolvedSections = agentIdOrSections;
  }

  const blocIds = Object.keys(resolvedSections);
  if (blocIds.length === 0) return "";

  // Charger les overrides utilisateur
  const userOverrides = await resolveUserOverrides(userId, supabaseOverride);

  // Charger, filtrer et formater chaque bloc
  const formattedParts: string[] = [];

  for (const blocId of blocIds) {
    const sectionIds = resolvedSections[blocId];
    const override = userOverrides.get(blocId);
    const bloc = override ?? await loadBloc(blocId as RagBlocId);
    if (!bloc) continue;

    const sections = filterBlocSections(bloc, sectionIds);
    if (sections.length === 0) continue;

    formattedParts.push(formatSectionsAsText(bloc.title, sections));
  }

  if (formattedParts.length === 0) return "";

  return `---

## BASE DE CONNAISSANCES (RAG)

${formattedParts.join("\n\n---\n\n")}

---
Fin de la base de connaissances.`;
}

// Invalide le cache (utile après mise à jour des fichiers)
export function clearRagCache(): void {
  blocCache.clear();
}

// Charge tous les blocs et retourne leurs IDs + titres (utile pour l'UI admin)
export async function listAvailableBlocs(): Promise<
  Array<{ id: RagBlocId; title: string; sectionCount: number }>
> {
  const { RAG_BLOC_IDS } = await import("./mapping");
  const results: Array<{ id: RagBlocId; title: string; sectionCount: number }> = [];

  for (const blocId of RAG_BLOC_IDS) {
    const bloc = await loadBloc(blocId);
    if (bloc) {
      results.push({
        id: blocId,
        title: bloc.title,
        sectionCount: bloc.sections.length,
      });
    }
  }

  return results;
}
