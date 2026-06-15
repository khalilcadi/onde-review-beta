/**
 * One-shot script: force-generate follow-up messages for specific leads
 * whose invitations were accepted but delay_days hasn't elapsed yet.
 *
 * Usage: npx tsx scripts/force-generate-messages.ts
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Leads to force-generate messages for
const TARGETS = [
  {
    leadId: "00978e13-416c-46e4-8ef7-50b8775dc9c5",
    name: "Ahmet Akyurek",
    userId: "14a0eedc-b156-45ab-b2c0-47eb990f4c84",
    sequenceId: "b128382c-abdd-4750-b8aa-161fd0371760",
  },
  {
    leadId: "cca1e1ce-7b90-447b-a21a-c1910de5db81",
    name: "Valerio Laghi",
    userId: "14a0eedc-b156-45ab-b2c0-47eb990f4c84",
    sequenceId: "b128382c-abdd-4750-b8aa-161fd0371760",
  },
  {
    leadId: "64b2bed7-4680-48e9-934d-9bb4e4e5be69",
    name: "Hugo Guiochet",
    userId: "14a0eedc-b156-45ab-b2c0-47eb990f4c84",
    sequenceId: "b128382c-abdd-4750-b8aa-161fd0371760",
  },
  {
    leadId: "48db4d92-528d-487b-85ca-bffe71e4dc16",
    name: "Athmane MEFTAHI",
    userId: "ce3c55fd-8ccb-4330-b9d5-e21857b6ffdb",
    sequenceId: "ae30f4ca-1165-455f-8baf-56e149e13be4",
  },
  {
    leadId: "850b9628-c75b-4311-bd4f-4ef0697053a6",
    name: "Jean-Baptiste MUNOZ",
    userId: "ce3c55fd-8ccb-4330-b9d5-e21857b6ffdb",
    sequenceId: "ae30f4ca-1165-455f-8baf-56e149e13be4",
  },
];

async function getApiKey(userId: string): Promise<string> {
  // Try user's encrypted key first, fallback to env var
  const fallback = process.env.ANTHROPIC_API_KEY;
  if (fallback) return fallback;
  throw new Error(`No ANTHROPIC_API_KEY in env for user ${userId}`);
}

async function generateMessage(
  lead: Record<string, unknown>,
  userId: string
): Promise<string> {
  const apiKey = await getApiKey(userId);
  const anthropic = new Anthropic({ apiKey });

  const firstName = lead.first_name as string;
  const lastName = lead.last_name as string;
  const title = lead.title as string;
  const company = lead.company as string;
  const enrichment = lead.enrichment_data as Record<string, unknown> | null;

  // Build a concise context for the message generation
  let context = `Nouveau contact LinkedIn accepté. Premier message de prise de contact après connexion.\n`;
  context += `Lead: ${firstName} ${lastName}\n`;
  if (title) context += `Poste: ${title}\n`;
  if (company) context += `Entreprise: ${company}\n`;

  if (enrichment) {
    if (enrichment.company)
      context += `Info entreprise: ${JSON.stringify(enrichment.company).substring(0, 300)}\n`;
    if (enrichment.person)
      context += `Info personne: ${JSON.stringify(enrichment.person).substring(0, 300)}\n`;
  }

  const systemPrompt = `Tu es un expert en prospection LinkedIn B2B pour Smart.AI (infrastructure d'IA revenue pour agences B2B).

RÈGLES STRICTES:
- Message court (2-4 phrases max), conversationnel, PAS de pitch commercial
- Commence par remercier la connexion de façon naturelle
- Pose UNE question ouverte liée à leur activité/rôle pour engager la conversation
- Ton: professionnel mais décontracté, comme un pair du secteur
- PAS de "j'ai vu que", PAS de flatterie exagérée
- PAS de lien, PAS de CTA commercial
- Écris en français
- Ne mets PAS de guillemets autour du message`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 256,
    temperature: 0.7,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Génère un premier message LinkedIn pour ${firstName} ${lastName}.\n\nContexte:\n${context}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return text.trim();
}

async function main() {
  console.log("Force-generating messages for 5 accepted leads...\n");

  for (const target of TARGETS) {
    try {
      // Load lead from DB
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", target.leadId)
        .single();

      if (!lead) {
        console.log(`[SKIP] ${target.name} — lead not found`);
        continue;
      }

      // Find the message step (step_order=2)
      const { data: step } = await supabase
        .from("sequence_steps")
        .select("id, step_type, step_order")
        .eq("sequence_id", target.sequenceId)
        .eq("step_order", 2)
        .single();

      if (!step) {
        console.log(`[SKIP] ${target.name} — step 2 not found`);
        continue;
      }

      // Check idempotency
      const { data: existing } = await supabase
        .from("actions")
        .select("id")
        .eq("lead_id", target.leadId)
        .eq("step_id", step.id)
        .in("status", ["pending", "validated", "processing", "sent"])
        .maybeSingle();

      if (existing) {
        console.log(`[SKIP] ${target.name} — action already exists`);
        continue;
      }

      // Generate message via Claude
      console.log(`[GEN] ${target.name} — generating message...`);
      const message = await generateMessage(lead, target.userId);
      console.log(`  Message: ${message.substring(0, 120)}...`);

      // Insert action as pending
      const { error: insertError } = await supabase.from("actions").insert({
        user_id: target.userId,
        lead_id: target.leadId,
        sequence_id: target.sequenceId,
        step_id: step.id,
        action_type: "message",
        status: "pending",
        generated_message: message,
      });

      if (insertError) {
        console.log(`[ERROR] ${target.name} — ${insertError.message}`);
      } else {
        console.log(`[OK] ${target.name} — action pending créée\n`);
      }
    } catch (err) {
      console.error(
        `[ERROR] ${target.name}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log("\nDone! Les messages sont en attente de validation dans Daily Actions.");
}

main().catch(console.error);
