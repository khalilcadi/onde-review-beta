# RAPPORT EXHAUSTIF : RAG + Prompt Prospection

> Document de reference pour brainstorm & redesign
> Date : 2026-04-01 | Projet : PROSPECTOR

---

## TABLE DES MATIERES

1. [Systeme RAG](#1-systeme-rag)
   - Architecture globale
   - Les 17 blocs knowledge/
   - Format JSON
   - Mapping agent -> blocs
   - Resolution dynamique
   - Overrides utilisateur
   - Cache
   - Injection dans le prompt
2. [Prompt Prospection](#2-prompt-prospection)
   - Prompt complet (v9.0)
   - Context builders
   - User prompt builder
3. [Appel API complet](#3-appel-api-complet)
   - Structure exacte de l'appel Claude
   - Prompt caching
   - Flow complet
4. [Exemples reels depuis la DB](#4-exemples-reels-depuis-la-db)
5. [Points cles pour le redesign](#5-points-cles-pour-le-redesign)

---

# 1. SYSTEME RAG

## Architecture globale

Le RAG est un **systeme deterministe base sur des fichiers JSON**, pas du vector search semantique.

```
knowledge/*.json (17 blocs)
    |
    v
blocCache (Map en memoire, key = blocId)
    |
    v
resolveAgentBlocs(agentId) ou resolveProspectionBlocs(icpSegment)
    |   selectionne les blocs pertinents pour l'agent
    v
loadBloc() + loadUserOverrides() (table user_rag_data)
    |   override DB > fichier JSON
    v
formatBlocAsText()  -->  markdown structure
    |
    v
buildRagContext()  -->  string finale
    |
    v
buildSystemPromptParts()  -->  { prompt, rag }
    |
    v
callAI()  -->  injecte en system block 2 (Claude) ou concatene (OpenAI)
```

**Fichiers sources :**
- `lib/rag/types.ts` — Interfaces RagBloc, RagSection, RagDocument
- `lib/rag/mapping.ts` — RAG_BLOC_IDS (17), RAG_AGENT_MAPPING (4 agents), resolveAgentBlocs(), resolveProspectionBlocs()
- `lib/rag/context.ts` — buildRagContext(), blocCache, clearRagCache(), listAvailableBlocs()
- `lib/ai/prompts/service.ts` — buildSystemPromptParts(), buildSystemPrompt()
- `lib/actions/rag.ts` — Server actions CRUD (getRagBlocs, getRagBlocContent, saveRagOverride, resetRagOverride)

---

## Les 17 blocs knowledge/

| # | Fichier | Titre | Sections | Paragraphes | Description |
|---|---------|-------|----------|-------------|-------------|
| 1 | `positionnement.json` | Positionnement Smart.AI | 7 | 29 | Vision, probleme, solution, framework A.R.C., Agency Revenue OS |
| 2 | `icp.json` | ICP - PME B2B | 4 | 20 | 3 segments (A: Early, B: Growth, C: Scale), criteres exclusion |
| 3 | `offres.json` | Offres Smart.AI | 5 | 29 | Setup 6000EUR + Platform 200-1000EUR/mois, Jarvis |
| 4 | `use_cases.json` | Use Cases | 4 | 24 | 4 scenarios agences (acquisition, pipeline, dependance, pilotage) |
| 5 | `objections.json` | Objections | 6 | 25 | 6 objections + reponses (budget, timing, DIY, CRM...) |
| 6 | `regles_decisionnelles.json` | Regles decisionnelles | 5 | 25 | Qualification ICP, temperature, priorite |
| 7 | `pain_points.json` | Pain Points | 5 | 20 | 5 douleurs (irregularite, dependance fondateur, pipeline invisible...) |
| 8 | `benchmark_marche.json` | Benchmark Marche | 9 | 46 | Analyse PESTEL marche agences B2B France |
| 9 | `benchmark_concurrents.json` | Benchmark Concurrents | 18 | 48 | Limova, Dust, SDR + framework ERAC |
| 10 | `pricing.json` | Pricing | 5 | 37 | Logique de valeur, ROI, objections prix |
| 11 | `messaging.json` | Messaging | 10 | 71 | 4 niveaux pitch, 5 angles commerciaux, vocabulaire |
| 12 | `operating_rules.json` | Regles operatoires | 11 | ~70 | 11 regles comportement agents |
| 13 | `onboarding.json` | Onboarding | 7 | ~80 | 5 etapes A.R.C. onboarding |
| 14 | `architecture_core.json` | Architecture Core | 9 | 53 | Jarvis + 4 agents, flux donnees |
| 15 | `framework_arc.json` | Framework A.R.C. | 6 | 57 | Audit Revenue, Revenue Engine, Control Tower |
| 16 | `manifesto.json` | Manifesto | 8 | ~100 | Territoire intellectuel, positions rupture, accroches LinkedIn |
| 17 | `profil_fondateur.json` | Profil Fondateur | 8 | 27 | Ludwig Graham, parcours, credibilite, angles message |

---

## Format JSON de chaque bloc

```json
{
  "source_file": "01-positionnement.md",
  "bloc_id": "positionnement",
  "title": "Positionnement Smart.AI",
  "sections": [
    {
      "heading": "Vision",
      "content": [
        "Paragraphe 1 du contenu...",
        "Paragraphe 2 du contenu..."
      ]
    },
    {
      "heading": "Probleme principal",
      "content": ["..."]
    }
  ],
  "metadata": {
    "converted_at": "2026-03-12T00:00:00Z",
    "total_sections": 7,
    "total_paragraphs": 29
  }
}
```

**Types TypeScript :**

```typescript
interface RagBloc {
  source_file: string;
  bloc_id: string;
  title: string;
  sections: RagSection[];
  metadata: {
    converted_at: string;
    total_sections: number;
    total_paragraphs: number;
  };
}

interface RagSection {
  heading: string;
  content: string[];  // Array de paragraphes
}

interface RagDocument {   // Override utilisateur en DB
  id: string;
  userId: string;
  dataType: RagBlocId;
  content: Record<string, unknown>;
  updatedAt: Date;
}
```

---

## Mapping agent -> blocs

### Mapping statique (lib/rag/mapping.ts)

```typescript
export const RAG_AGENT_MAPPING: Record<string, readonly RagBlocId[] | readonly ['*']> = {
  prospection: ['icp', 'pain_points'],                      // 2 blocs
  scoring: ['icp', 'pain_points', 'regles_decisionnelles'], // 3 blocs
  enrichissement: ['icp'],                                   // 1 bloc
  conversational: ['*'],                                     // TOUS (17 blocs)
};
```

### Resolution dynamique pour prospection

```typescript
export function resolveProspectionBlocs(icpSegment: string): readonly RagBlocId[] {
  const PROSPECTION_BASE: readonly RagBlocId[] = ['icp', 'pain_points'];

  switch (icpSegment) {
    case 'A': return [...PROSPECTION_BASE];                    // 2 blocs
    case 'B': return [...PROSPECTION_BASE, 'use_cases'];       // 3 blocs
    case 'C': return [...PROSPECTION_BASE, 'use_cases'];       // 3 blocs
    default: return [...PROSPECTION_BASE];                     // 2 blocs
  }
}

export function resolveAgentBlocs(agentId: string): readonly RagBlocId[] {
  const mapping = RAG_AGENT_MAPPING[agentId];
  if (!mapping) return [];
  if ((mapping as readonly string[]).includes('*')) return RAG_BLOC_IDS; // tous les 17
  return mapping as readonly RagBlocId[];
}
```

### Tokens approximatifs par agent

| Agent | Blocs injectes | Tokens RAG ~approx |
|-------|---------------|-------------------|
| `prospection` (segment A) | `icp`, `pain_points` | ~900 |
| `prospection` (segment B/C) | `icp`, `pain_points`, `use_cases` | ~1200 |
| `scoring` | `icp`, `pain_points`, `regles_decisionnelles` | ~1200 |
| `enrichissement` | `icp` | ~400 |
| `conversational` | TOUS (17 blocs) | ~4800 |

---

## Overrides utilisateur

Table `user_rag_data` :
- `user_id` (FK auth.users)
- `data_type` (= blocId)
- `content` (JSONB = RagBloc override)
- UNIQUE(user_id, data_type)

L'override remplace le fichier JSON. `clearRagCache()` est appele apres chaque save/reset.

```typescript
// Sauvegarde override
await supabase.from("user_rag_data").upsert({
  user_id: user.id,
  data_type: blocId,
  content,  // RagBloc complet en JSON
}, { onConflict: "user_id,data_type" });
clearRagCache();

// Reset vers defaut
await supabase.from("user_rag_data").delete()
  .eq("user_id", user.id)
  .eq("data_type", blocId);
clearRagCache();
```

---

## Cache en memoire

```typescript
const blocCache = new Map<RagBlocId, RagBloc>();

async function loadBloc(blocId: RagBlocId): Promise<RagBloc | null> {
  const cached = blocCache.get(blocId);
  if (cached) return cached;

  const filePath = path.join(process.cwd(), "knowledge", `${blocId}.json`);
  const raw = await fs.readFile(filePath, "utf-8");
  const bloc: RagBloc = JSON.parse(raw);
  blocCache.set(blocId, bloc);
  return bloc;
}

export function clearRagCache(): void {
  blocCache.clear();
}
```

**Limites :** Cache en memoire single-instance. Pas de Redis, pas de TTL. ~200KB total pour 17 blocs.

---

## Formatage en texte (injection dans le prompt)

```typescript
function formatBlocAsText(bloc: RagBloc): string {
  const lines: string[] = [];
  lines.push(`### ${bloc.title}`);    // h3 markdown
  lines.push("");
  for (const section of bloc.sections) {
    if (section.heading) lines.push(`**${section.heading}**`);  // gras
    if (section.content.length > 0) lines.push(section.content.join("\n"));
  }
  return lines.join("\n");
}
```

**Output final de buildRagContext() :**

```markdown
---

## BASE DE CONNAISSANCES (RAG)

### ICP - PME B2B

**Cible**
Entreprise B2B, 2-50 employes, 70k-500k EUR de CA...

**Segment A (Early)**
CA 70k-200k, 2-10 personnes...

---

### Pain Points PME B2B

**Pain point 1 - Acquisition irreguliere**
Pipeline imprevisible, mois creux...

---
Fin de la base de connaissances.
```

---

## Injection dans le prompt (buildSystemPromptParts)

```typescript
export const buildSystemPromptParts = async (
  agentId: AgentId,
  userId?: string,
  supabaseOverride?: SupabaseClient<Database>,
  icpSegment?: string
): Promise<{ prompt: string; rag: string }> => {
  const prompt = await getPrompt(agentId, userId, supabaseOverride);
  const rag = await buildRagContext(agentId, userId, supabaseOverride, icpSegment);
  return { prompt, rag };
};
```

**getPrompt()** : user_prompts DB (override) > PROMPTS_DEFAULTS[agentId] (code) > "" (fallback)

---

# 2. PROMPT PROSPECTION

## Prompt complet v9.0 (tel que stocke dans defaults.ts)

```
# AGENT PROSPECTION — System Prompt v9.0

Tu generes UN SEUL message LinkedIn pret a envoyer.
Sortie = texte brut uniquement. Rien d'autre.

---

## REGENERATION AVEC FEEDBACK (regle absolue)

Si le user message commence par "INSTRUCTION PRIORITAIRE — FEEDBACK UTILISATEUR", tu es en mode regeneration avec feedback explicite.
Dans ce cas : **applique le feedback a la lettre, sans exception**. Le feedback prime sur TOUTES les regles ci-dessous, y compris le style, le ton, le format, et les interdictions habituelles.
Exemples : "commence par bonjour" -> tu commences par "Bonjour". "mets un emoji" -> tu mets un emoji. "vouvoie" -> tu vouvoies.

---

## PRINCIPE

Tu ecris comme un fondateur qui parle a un autre fondateur sur LinkedIn un mardi matin.
Court. Direct. Specifique. Humain.

Le message sert a obtenir UNE reponse. Pas a impressionner, pas a pitcher, pas a montrer ce que tu sais.

---

## REGLES SOFT (etat d'esprit, pas des contraintes rigides)

- Ecris comme si tu envoyais un SMS a un pote — naturel, decontracte, direct
- Fais reference a quelque chose de specifique sur eux (signal, poste, entreprise, secteur)
- Pose une question simple — une seule, facile a repondre
- Zero langage commercial — pas de "solution", "accompagnement", "levier", "ROI"
- Pas de points d'exclamation — jamais

---

## FORMAT

- 2-3 phrases max. Ultra court. Pense SMS.
- MAX 300 caracteres
- Utilise le prenom naturellement (debut, milieu, ou pas du tout selon ce qui sonne le mieux)
- Tutoiement par defaut (LinkedIn entre fondateurs en France = tu)
- Vouvoiement uniquement si Notes l'imposent

---

## SCORE -> NIVEAU D'AMBITION

Le score pilote tout. Ne jamais compenser un manque de signal par plus de creativite.

### Score 0-49 (signal faible)
- Zero personnalisation visible
- Une tension ICP plausible liee au role/secteur
- Question simple avec off-ramp
- 2-3 phrases max

### Score 50-69 (signal partiel)
- Un element de contexte max, utilise implicitement
- Ne jamais nommer la source (post, actu, bio)
- Question situation ou probleme

### Score 70-100 (signal fort)
- Un element de contexte visible, utilise pour calibrer la question
- Reference explicite autorisee SI c'est un fait business concret (levee, recrutement, lancement, chiffre public)
- Reference interdite si c'est du commentaire de post ou du "beau profil"
- Question plus precise sur le systeme actuel

---

## STAGE

### connected (premier contact ou relance)
- Objectif : declencher une vraie reponse
- Contextuel, preuve sociale legere autorisee
- Si "Position dans la sequence" presente : suivre la strategie de relance

### replied (a repondu)
- Objectif : faire avancer la discussion
- Ton conversationnel, naturel
- Smart.AI mentionnable si besoin explicite
- Jamais rejouer un message de prospection froide

---

## STRATEGIE DE RELANCE (escalade progressive)

Quand "Position dans la sequence" est presente dans le contexte, adapte ton approche.

### Etape 1 (premier contact)
- Tu te presentes par le SUJET, pas par toi.
- Accroche basee sur le signal/contexte du lead.
- Question ouverte, legere, zero pression.

### Etape 2 (relance — pas de reponse)
- NE PAS repeter le message 1. Lire les messages precedents.
- Nouvel angle : si message 1 = douleur -> relance 2 = question sur leur process ou social proof leger.
- Plus court que le message 1.
- Ton : "je reviens vers toi" naturel, sans insistance.

### Etape 3 (2e relance — toujours rien)
- Angle completement different des 2 premiers.
- Ultra court : 2-3 phrases max.
- Plus direct et decontracte.

### Etape 4+ (dernier essai)
- Message de cloture. 1-2 phrases.
- "Je ne vais pas insister. Si le sujet revient, tu sais ou me trouver."
- Porte ouverte, zero pression.

### Regles absolues relances
- JAMAIS repeter un angle deja utilise (lire les messages precedents)
- JAMAIS "je me permets de relancer" ou "suite a mon precedent message"
- Chaque relance doit vivre seule (le prospect n'a peut-etre pas lu les precedents)

---

## ICP

### ICP A — Prudence
Valider si le probleme existe. Pas de discours complexe.

### ICP B — Coeur de cible
Angles : repetabilite, acquisition instable, outils testes sans resultat, manque de systeme.

### ICP C — Strategique
Angles : goulot fondateur, scalabilite, pilotage, delegation.
Ne jamais douter de la maturite du prospect. Partir du niveau atteint pour pointer le prochain palier.

### HORS_ICP
Minimalisme. Pas de surpersonnalisation.

---

## SIGNALS GOJIBERRY (quand source = "gojiberry" dans le contexte Signal)

Les leads Gojiberry ont un signal d'intent detecte automatiquement. Utilise le SUJET du signal, pas l'action elle-meme.

### ENGAGEMENT_KEYWORD
Le lead s'interesse activement au sujet du mot-cle declencheur.
JAMAIS dire "j'ai vu que tu as like un post sur X".
- "Cold Email" / "Outbound B2B" -> angle : son process actuel d'acquisition
- "CRM" / "Prospection" -> angle : pipeline, previsibilite, outils
- "Lead generation" / "Acquisition LinkedIn" / "Acquisition B2B" -> angle : canaux, dependance reseau
- "ICP" / "Multicanal" -> angle : structuration commerciale

### ENGAGEMENT_EXPERT
Le lead suit du contenu B2B growth (ecosysteme). Il est eduque sur ces sujets.
- Tu peux etre plus direct et technique
- Angle : structuration, infrastructure revenue, systemes
- Ne PAS mentionner l'expert ni ses posts

### NEW_ROLE
Le lead vient de prendre un nouveau poste (<90 jours). Fenetre d'opportunite.
- Angle : "quand on arrive, on herite souvent de..." ou "les premiers mois..."
- Timing fort : question plus directe autorisee

### COMPETITOR_ENGAGEMENT
Le lead engage avec du contenu concurrent. Il connait le marche.
- Tu peux etre plus direct sur le positionnement
- Angle : resultats, approche, structuration
- Ne JAMAIS mentionner le concurrent par nom

### ICP_TOP_ACTIVE
Tres actif LinkedIn mais pas de signal d'intent specifique.
- Traiter comme SIGNAL_FAIBLE : tension ICP plausible + question simple

---

## HIERARCHIE DES SOURCES (ordre absolu)

1. **Notes** — si contexte humain ou commercial -> ignore tout le reste, ecris depuis la relation
2. **Signal reel** (post, actu, inbound) — utilise l'enjeu revele, pas le signal lui-meme
3. **Bio / headline / parcours** — pour comprendre le niveau et adapter le ton, jamais citer
4. **RAG autorise** — en dernier recours seulement

Si une info n'est pas dans le contexte, tu ne la connais pas. Interdiction absolue d'inventer.

**FRAICHEUR** : La date du jour est en haut du contexte. Ne reference JAMAIS une news, un fait ou un evenement date de plus de 3 mois. Si une news dit "en mai" sans annee et que la date du jour est en mars 2026, c'est probablement mai 2025 = perime. En cas de doute sur la date, ne l'utilise pas — bascule sur une tension ICP generique.

---

## PERSONNALISATION — CE QUI EST AUTORISE vs INTERDIT

### Autorise
- Referencer un fait business public et concret : "Tu recrutes 3 commerciaux", "Vous venez de lever", "Tu lances [produit]"
- Mentionner le secteur / la taille pour ancrer : "En boite B2B a 10 personnes..."
- Preuve sociale legere (stage connected+) : "On bosse avec des agences dans le meme cas"
- Nommer l'entreprise : "chez [Entreprise]" >> "dans ta boite"

### Interdit
- Commenter un post ("ton post sur X m'a interpelle")
- Flatterie ("beau parcours", "contenu inspirant", "belle boite")
- Stalker ("j'ai regarde ton profil", "j'ai vu que tu as like")
- Formules creuses ("j'espere que tu vas bien", "je me permets de")
- Pitcher Smart.AI en premier contact (sauf Notes)
- Inventer un fait, un post, une actu, une douleur
- Referencer un fait PERIME (> 3 mois). La date du jour est dans le contexte — verifie TOUJOURS la fraicheur avant d'utiliser une news ou un fait date. Un fait vieux de 6+ mois rend le message ridicule.

---

## LA QUESTION

Une seule question par message. Trois types autorises, du plus soft au plus direct :

**Situation** (score bas) :
"Tu geres ca comment aujourd'hui ?"

**Probleme** (score moyen) :
"C'est structure ou ca repose encore beaucoup sur toi ?"

**CTA semi-direct** (score haut, stage connected+) :
"Ca vaut une discussion de 15 min ?"

Toujours un off-ramp naturel — le prospect peut dire non sans friction.

Questions interdites : demande de demo, question fermee agressive, question qui suppose le besoin.

---

## EXEMPLES

### BON — Premier contact, score haut, fait business concret

> Thomas,
>
> Tu recrutes un commercial pour l'agence. Question honnete : t'as un systeme d'acquisition a lui confier, ou il va devoir improviser ?

(score 75, fait concret = recrutement, question probleme, 197 chars)

### BON — Premier contact, score bas, lead froid

> Marie,
>
> Fondatrice agence growth B2B — le pipeline depend encore du reseau du fondateur chez toi, ou t'as reussi a structurer ca ?

(score 35, zero personnalisation, tension ICP plausible, off-ramp, 178 chars)

### BON — Premier contact, signal fort, preuve sociale

> Antoine,
>
> On bosse avec 3-4 boites B2B qui avaient le meme probleme : les mois creux entre deux recos. La plupart avaient essaye les ads sans resultat stable.
>
> Vous en etes ou la-dessus chez [Entreprise] ?

(score 80, preuve sociale, question situation, 247 chars)

### BON — Message connected, CTA semi-direct

> Sophie,
>
> Je bosse avec des boites B2B de ta taille sur un truc precis : rendre le pipe previsible sans dependre du reseau fondateur.
>
> Ca vaut 15 min pour voir si c'est un sujet chez toi ?

(score 70, positioning clair, CTA direct avec off-ramp, 219 chars)

### BON — Premier contact, signal Gojiberry ENGAGEMENT_KEYWORD ("Cold Email")

> Julie,
>
> CEO boite B2B, 6 personnes — t'as un process d'acquisition outbound structure ou c'est encore au feeling ?

(score 55, signal Gojiberry = keyword "Cold Email", utilise le theme sans mentionner la source, 149 chars)

### BON — InMail, profil ouvert, score moyen

> Marc,
>
> Fondateur boite B2B depuis 4 ans — je bosse avec des agences qui veulent rendre leur pipe moins dependant du bouche-a-oreille.
>
> C'est un sujet chez Agence360 ?

(score 50, InMail car profil ouvert, question situation, 199 chars)

### BON — Message replied, suite de conversation

> Paul,
>
> Merci pour le retour. Si tu veux on cale 15 min cette semaine — je te montre concretement comment on structure ca pour des agences de ta taille. Rien de commercial, juste un echange.

(stage replied, ton conversationnel, CTA soft avec off-ramp, Smart.AI mentionnable si besoin)

### MAUVAIS — Generique IA

> Thomas,
>
> En tant que fondateur d'agence, tu fais surement face a des defis d'acquisition client. On a developpe une approche innovante pour structurer le pipeline commercial. T'es ouvert a en discuter ?

(Pourquoi : "en tant que" = template, "approche innovante" = pitch, aucune specificite)

### MAUVAIS — Fausse personnalisation

> Thomas,
>
> Ton post sur le recrutement etait super pertinent. Je travaille avec des fondateurs d'agences comme toi pour les aider a structurer leur acquisition. C'est un sujet ?

(Pourquoi : commentaire de post + flatterie + pitch deguise)

### MAUVAIS — Copy-paste RAG

> Thomas,
>
> Le probleme des agences c'est pas les leads, c'est l'absence d'infrastructure revenue. Ton pipeline est previsible aujourd'hui ?

(Pourquoi : recopie du manifesto, sonne comme un slogan, pas personnalise)

---

## REGENERATION

Si feedback utilisateur -> priorite absolue, appliquer d'abord.
Sinon -> changer l'angle completement (pas une paraphrase).
Changer dans l'ordre : angle -> type de question -> niveau de personnalisation -> registre.

---

## CONTEXTE FAIBLE (pas d'enrichissement)

- N'essaie pas de personnaliser ce que tu ne connais pas
- Tension ICP plausible liee au titre/secteur
- Question simple avec off-ramp
- 2-3 phrases max
- Moins tu en sais, plus le message doit etre court

---

## RAPPEL

Relis ton message. Si tu remplaces le prenom par un autre et que ca marche toujours -> c'est trop generique, recommence.

Texte brut uniquement. Le message complet, rien d'autre.
```

---

## Context builders (lib/ai/lead-context.ts)

### buildLeadSections() — Fondation partagee

Construit 8 sections markdown a partir des donnees du lead :

```
## Date du jour
2026-04-01

## Lead
- Nom : Frederic Vennel
- Titre : CEO SENSORY GROUP
- Entreprise : SENSORY GROUP
- LinkedIn : https://...
- Score : 80 (hot)
- Stage : connected
- Tags : gojiberry, goji:new-role

## Entreprise
- Secteur : Real Estate
- Localisation : Toulouse, France

## Offre (analyse site web)
- Offre : Developpement d'actifs immobiliers hybrides premium...
- Cible : Investisseurs prives...
- Differenciateurs : Modele hybride...

## Profil
- Headline : J'ouvre des chemins la ou les autres voient des murs...
- Bio : Entrepreneur passionne par la performance humaine... (tronque 200 chars)
- Anciennete poste actuel : 3 mois
- Experience :
  - CEO — Sensory Group
  - Fondateur — EKI-Libre
- Competences : BtoB, Developpement de nouvelles affaires, RH
- Profil ouvert (InMail possible)
- Followers : 1 576
- 20 connexions en commun
- Interets : Performance humaine, Creation de valeur durable...
- Formation : Formation kinesiologue | Universite de Bretagne Occidentale

## Signal enrichissement
- Type : NEW_ROLE
- Detail : Prise de poste recente (<90 jours)
- Score Gojiberry : 1.9/3
- Date de detection : Mar 18, 2026 3:22 AM

## Posts recents
- Un projet commence toujours par une vision... (19r/0c — 2026-03-19)
- Et si le futur de l'hospitality n'etait... (105r/51c — 2026-03-08)
- Ce n'est pas toujours le plus competent qui decide... (1583r/86c — 2026-03-05)

## Resume enrichissement
Entrepreneur multi-projets base a Toulouse : CEO de Sensory Group...
```

### buildLeadContext() — Contexte runtime complet

Appelle `buildLeadSections()` puis ajoute :

```
## Action
- Type : message

## Position dans la sequence
- Etape : 2/5
- Messages precedents envoyes :
  1. "Premier message envoye..."

Message precedent (a regenerer) :     // si regeneration
<le message actuel>

Feedback utilisateur :                 // si feedback
<le feedback>
```

---

## User prompt builder (buildUserPrompt)

### 4 niveaux de context directive

| Niveau | Condition | Instruction envoyee |
|--------|-----------|---------------------|
| **RICH** | Lead a des notes | "CONTEXTE RICHE : Notes disponibles, ecris depuis la relation." |
| **STRONG** | Signal reel + enrichment | "CONTEXTE FORT : signal {type}, enrichissement dispo. Personnalise avec un fait concret." |
| **PARTIAL** | Un seul element | "CONTEXTE PARTIEL : un element de contexte max, utilise implicitement." |
| **WEAK** | Rien | "CONTEXTE FAIBLE : peu de donnees. Tension ICP plausible + question ouverte. 2-3 phrases max." |

### Hooks de personnalisation extraits

```typescript
const hooks: string[] = [];
if (lead.enrichmentData?.hook_recommande?.fait_concret)
  hooks.push(`Fait concret : ${fait_concret}`);
if (lead.enrichmentData?.signal?.intent_keyword)
  hooks.push(`Sujet d'interet : ${intent_keyword}`);
if (lead.enrichmentData?.company?.website_analysis?.offering)
  hooks.push(`Offre entreprise : ${offering}`);
```

### 3 modes de generation

**1. Initial :**
```
Ecris un message LinkedIn pour {leadIdentity}.

{contextDirective}
{stepLabel}

MAX 300 caracteres. Texte brut uniquement.

IMPORTANT : Reponds en JSON strict :
{"message": "...", "reasoning": "..."}
"reasoning" = 1-2 phrases : ta strategie, l'angle choisi, le hook utilise.
Pas de markdown, pas de backticks, juste le JSON.
```

**2. Regeneration sans feedback :**
```
Regenere un message LinkedIn pour {leadIdentity} en changeant completement d'angle.

{contextDirective}
{stepLabel}

Message actuel (ne pas reproduire le meme angle) : "{currentMessage}"

MAX 300 caracteres. Texte brut uniquement.
{reasoningSuffix}
```

**3. Regeneration avec feedback :**
```
INSTRUCTION PRIORITAIRE — FEEDBACK UTILISATEUR (prime sur toutes les regles) :
"{feedback}"

Applique ce feedback pour reecrire le message de {leadIdentity}.
Respecte absolument le feedback, meme si cela contredit les regles habituelles de style ou de personnalisation.

{contextDirective}
{stepLabel}

Message actuel (a ameliorer selon le feedback) : "{currentMessage}"

MAX 300 caracteres. Texte brut uniquement.
{reasoningSuffix}
```

---

# 3. APPEL API COMPLET

## Structure exacte de l'appel Claude

```
POST https://api.anthropic.com/v1/messages
```

```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 600,
  "temperature": 0.7,
  "system": [
    {
      "type": "text",
      "text": "# AGENT PROSPECTION — System Prompt v9.0\n\nTu generes UN SEUL message LinkedIn...\n[330 lignes du prompt complet]",
      "cache_control": { "type": "ephemeral" }
    },
    {
      "type": "text",
      "text": "---\n\n## BASE DE CONNAISSANCES (RAG)\n\n### ICP - PME B2B\n\n**Cible**\nEntreprise B2B...\n\n---\n\n### Pain Points PME B2B\n\n**Pain point 1**\n...\n\n---\nFin de la base de connaissances."
    },
    {
      "type": "text",
      "text": "## Date du jour\n2026-04-01\n\n## Lead\n- Nom : Frederic Vennel\n- Titre : CEO...\n[tout le runtime context]"
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Ecris un message LinkedIn pour Frederic Vennel (CEO SENSORY GROUP @ SENSORY GROUP).\n\nCONTEXTE FORT : signal NEW_ROLE, enrichissement dispo. Personnalise avec un fait concret.\n\nElements de personnalisation disponibles :\n- Fait concret : Lancement operationnel de Sensory Group...\n- Offre entreprise : Developpement d'actifs immobiliers hybrides premium...\nEtape 2/5 (relance).\n\nMAX 300 caracteres. Texte brut uniquement.\n\nIMPORTANT : Reponds en JSON strict :\n{\"message\": \"...\", \"reasoning\": \"...\"}\n..."
    }
  ]
}
```

## Decomposition des 3 system blocks

| Block | Contenu | Stabilite | Cache | Tokens ~approx |
|-------|---------|-----------|-------|----------------|
| 1 | Agent Prompt v9.0 (330 lignes) | Identique pour TOUS les leads | `cache_control: ephemeral` | ~2500 |
| 2 | RAG Context (2-3 blocs ICP/pain_points/use_cases) | Change par segment ICP (A/B/C) | Standard (persiste dans le segment) | ~900-1200 |
| 3 | Runtime Context (buildLeadContext output) | Unique par lead | Jamais cache | ~500-2000 |

+ User message (buildUserPrompt) : ~100-300 tokens

## Prompt caching Claude — Comment ca marche

```
Requete 1 (Lead A, Segment B) :
  Block 1 (agent prompt) → ecrit en cache (ephemeral)
  Block 2 (RAG segment B) → ecrit en cache
  Block 3 (lead A context) → pas cache
  → cache_creation_input_tokens = ~3500, input_tokens = ~1500

Requete 2 (Lead B, Segment B) :
  Block 1 (agent prompt) → CACHE HIT
  Block 2 (RAG segment B) → CACHE HIT
  Block 3 (lead B context) → pas cache (nouveau)
  → cache_read_input_tokens = ~3500, input_tokens = ~1000
  → Economie ~50% sur les input tokens

Requete 3 (Lead C, Segment A — different) :
  Block 1 (agent prompt) → CACHE HIT
  Block 2 (RAG segment A) → CACHE MISS (different segment, reecrit)
  Block 3 (lead C context) → pas cache
```

## Flow complet UI (POST /api/ai/generate)

```
1. Click "Generer" dans Daily Actions / Pipeline
   |
   v
2. POST /api/ai/generate { lead: {id}, actionType: "message" }
   |
   v
3. Auth check (getAuthUser)
   |
   v
4. Load lead complet depuis DB (enrichment_data inclus)
   |
   v
5. buildLeadContext(lead, actionType, currentMessage?, feedback?)
   → runtime context string (500-2000 tokens)
   |
   v
6. buildUserPrompt(lead, actionType, currentMessage?, feedback?, {withReasoning: true})
   → user prompt string (100-300 tokens)
   |
   v
7. Extract icpSegment depuis lead.enrichmentData.scoring_detail.segment_icp
   |
   v
8. callAI({
     userId, agentId: "prospection",
     runtimeContext, messages: [{role: "user", content: userPrompt}],
     maxTokens: 600, metadata: {leadId, actionType}, icpSegment
   })
   |
   v
9. getUserAIConfig() → provider, model, apiKey, temperature
   |
   v
10. buildSystemPromptParts("prospection", userId, supabaseOverride, icpSegment)
    → { prompt: agentPrompt, rag: ragContext }
    |
    v
11. callClaude(apiKey, model, agentPrompt, ragContext, runtimeContext, messages, 600, 0.7)
    → 3 system blocks + user message
    → anthropic.messages.create(...)
    |
    v
12. Reponse Claude : { text: '{"message":"...", "reasoning":"..."}', usage: {...} }
    |
    v
13. parseGenerationResponse(response.text) → { message, reasoning }
    |
    v
14. humanizeMessage(message, actionType) → fragmentation probabiliste 40%
    |
    v
15. Return { message, reasoning } au client
    |
    v
16. logUsage() (fire & forget) → table ai_usage
```

## Flow complet Cron (GET /api/crons/generate-actions)

```
1. 6h00 Paris (4-5h UTC, schedule Vercel)
   |
   v
2. Auth: CRON_SECRET header
   |
   v
3. Get all users avec linkedin_accounts actifs
   |
   v
4. Pour chaque user :
   |-- isActiveDay(activeDays, timezone) ?
   |-- Sync invitations acceptees (Unipile)
   |-- getTodayQuotaCounts() → quotas du jour
   |-- Get sequences actives
   |
   v
5. Pour chaque sequence :
   |-- Load steps (ordered)
   |-- Load sequence_leads (status=active)
   |-- Sort par priorite (message/inmail d'abord)
   |
   v
6. Pour chaque sequence_lead :
   |-- Check delay_days ecoule
   |-- Check condition step precedent (invitation_accepted, message_replied, if_no_response)
   |-- Check idempotence (action existe deja pour ce step ?)
   |-- Check quotas (invitations, messages, visites)
   |
   v
7. Si message/inmail step :
   |-- Auto-enrich si lead.enrichmentData.company = null (max 10/cron, timeout 30s)
   |-- Si generation_mode="template" && template : interpolateTemplate()
   |-- Sinon : meme flow AI que UI (steps 5-14 ci-dessus)
   |
   v
8. Insert action (status="pending", generated_message=...)
   |
   v
9. Increment quota counter
```

## Structure de l'appel OpenAI (alternative)

```json
{
  "model": "gpt-5.4",
  "max_completion_tokens": 600,
  "temperature": 0.7,
  "messages": [
    {
      "role": "developer",
      "content": "[agentPrompt]\n\n[ragContext]\n\n[runtimeContext]"
    },
    {
      "role": "user",
      "content": "[userPrompt]"
    }
  ]
}
```

Note: GPT-5.x utilise `"developer"` au lieu de `"system"`, et `max_completion_tokens` au lieu de `max_tokens`.

---

# 4. EXEMPLES REELS DEPUIS LA DB

## Exemple 1 : Lead enrichi complet (Frederic Vennel, score 80, signal NEW_ROLE)

**Metadata appel :**
- Date : 2026-03-30 04:01:22 UTC
- Agent : prospection
- Provider : claude
- Model : claude-opus-4-6
- Input tokens : 6368
- Output tokens : 191
- Cached tokens : 0
- Cout : $0.0366
- Source : cron generate-actions

**Runtime context + user prompt envoyes :**

```
[Context]
## Date du jour
2026-03-30

## Lead
- Nom : Frederic Vennel
- Titre : CEO SENSORY GROUP
- Entreprise : SENSORY GROUP
- LinkedIn : https://www.linkedin.com/in/ACwAAAPtiJ0BbIWbL1XEWMgFuG3jyPW3ogczSHM
- Score : 80 (hot)
- Stage : connected
- Tags : gojiberry, goji:new-role

## Entreprise
- Secteur : Real Estate / Immobilier strategique & Actifs hybrides premium
- Localisation : Toulouse, France

## Offre (analyse site web)
- Offre : Developpement d'actifs immobiliers hybrides premium combinant investissement immobilier strategique et modeles d'exploitation a revenus recurrents. Structuration de projets immobiliers avec dissociation entre vehicule immobilier, entites d'exploitation et holding consolidante.
- Cible : Investisseurs prives et holdings cherchant des projets immobiliers structures et lisibles; clientele premium a fort pouvoir d'achat a Toulouse Ouest.
- Differenciateurs : Modele hybride optimisant performance ajustee du risque; structuration holding/foncier claire; creation de valeur patrimoniale durable; marque SENSORY comme actif immateriel premium; vision long terme avec duplicabilite territoriale.

## Profil
- Headline : J'ouvre des chemins la ou les autres voient des murs. Fondateur - Sensory Group | Actifs hybrides premium & Immobilier strategique | Revenus recurrents | Real Estate|Fondateur EKI-Libre | Organisme de Formation QUALIOPI
- Bio : Entrepreneur passionne par la performance humaine et la creation de valeur durable, je developpe des projets a la croisee de l'humain et de l'actif structure. Fondateur d'EKI-Libre (www.eki-libre.eu)...
- Experience :
  - CEO — Sensory Group
  - Fondateur — EKI-Libre (organisme de formation QUALIOPI)
- Competences : Business-to-Business (BtoB), Developpement de nouvelles affaires, Ressources humaines (RH)
- Profil ouvert (InMail possible)
- Followers : 1 576
- 20 connexions en commun
- Interets : Performance humaine, Creation de valeur durable, Immobilier strategique, Revenus recurrents, Kinesiologie et accompagnement psychocorporel, Optimisation du potentiel individuel
- Formation : Formation kinesiologue — Kinesiologie et sciences de l'exercice | Universite de Bretagne Occidentale — Sauveteur Secouriste du Travail, asfo grand sud

## Signal enrichissement
- Type : NEW_ROLE
- Detail : Prise de poste recente (<90 jours)
- Score Gojiberry : 1.9/3
- Date de detection : Mar 18, 2026 3:22 AM

## Posts recents
- Un projet commence toujours par une vision. Mais il devient reel quand les bonnes personnes se reunissent autour de la table. Cette semaine, SENSORY... (19 reactions, 0 commentaires — 2026-03-19)
- Et si le futur de l'hospitality n'etait ni un hotel ni un coworking ni un club prive mais les trois a la fois ? C'est la vision derriere SENSORY ... (105 reactions, 51 commentaires — 2026-03-08)
- Ce n'est pas toujours le plus competent qui decide. C'est souvent le mieux paye. Et c'est un vrai probleme... (1583 reactions, 86 commentaires — 2026-03-05)
- [+ 7 autres posts]

## Resume enrichissement
Entrepreneur multi-projets base a Toulouse : CEO de Sensory Group (actifs hybrides immobiliers) et fondateur d'EKI-Libre (formation en kinesiologie). Aucune information publique verifiable trouvee sur la taille, le financement ou les actualites recentes de Sensory Group — enrichissement insuffisant pour evaluer le fit ICP.

## Action
- Type : message

## Position dans la sequence
- Etape : 2/5

---

[user]
Ecris un message LinkedIn pour Frederic Vennel (CEO SENSORY GROUP @ SENSORY GROUP).

CONTEXTE FORT : signal NEW_ROLE, enrichissement dispo. Personnalise avec un fait concret.

Elements de personnalisation disponibles :
- Fait concret : Lancement operationnel de Sensory Group a Toulouse avec structuration du partenariat M.O.S annonce publiquement sur LinkedIn (< 90 jours)
- Offre entreprise : Developpement d'actifs immobiliers hybrides premium combinant investissement immobilier strategique et modeles d'exploitation a revenus recurrents. Structuration de projets immobiliers avec dissociation entre vehicule immobilier, entites d'exploitation et holding consolidante.
Etape 2/5 (relance).

MAX 300 caracteres. Texte brut uniquement.

IMPORTANT : Reponds en JSON strict :
{"message": "...", "reasoning": "..."}
"reasoning" = 1-2 phrases : ta strategie, l'angle choisi, le hook utilise.
Pas de markdown, pas de backticks, juste le JSON.
```

**Reponse Claude :**

```json
{
  "message": "Frederic,\n\nVotre structuration avec M.O.S pour dissocier foncier et exploitation sur Sensory — c'est rare de voir ce niveau d'architecture des le lancement.\n\nComment vous gerez l'acquisition de vos investisseurs sur ce type de projet hybride ?",
  "reasoning": "Mode E/R hybride. Le fit ICP est incertain (immobilier != cible classique PME B2B services), mais le signal M.O.S est concret et public. J'utilise ce fait pour ancrer la credibilite, puis j'ouvre sur l'acquisition investisseurs — seul angle ou Smart.AI pourrait avoir une pertinence reelle. Question ouverte avec off-ramp naturel."
}
```

---

## Exemple 2 : Lead signal faible (Sezai Taskin, score 80, ICP_TOP_ACTIVE)

**Metadata appel :**
- Date : 2026-04-01 04:02:24 UTC
- Agent : prospection
- Provider : claude
- Model : claude-opus-4-6
- Input tokens : 5338
- Output tokens : 171
- Cached tokens : 0
- Cout : $0.0310
- Source : cron generate-actions

**Runtime context + user prompt envoyes :**

```
[Context]
## Date du jour
2026-04-01

## Lead
- Nom : Sezai Taskin
- Titre : Chief Executive Officer
- Entreprise : ViferaXS
- LinkedIn : https://www.linkedin.com/in/ACwAAABQPmsBgV375ZqM6rjydFbBgfxe0X6yWKk
- Score : 80 (hot)
- Stage : connected
- Tags : gojiberry, goji:top-active

## Entreprise
- Secteur : Biotechnology Research
- Localisation : Muttenz, Basel-Country, Switzerland

## Signal enrichissement
- Type : ICP_TOP_ACTIVE
- Detail : Top 5% des profils les plus actifs dans l'ICP
- Score Gojiberry : 2/3
- Date de detection : Mar 17, 2026 9:32 AM

## Action
- Type : message

## Position dans la sequence
- Etape : 2/5

---

[user]
Ecris un message LinkedIn pour Sezai Taskin (Chief Executive Officer @ ViferaXS).

CONTEXTE PARTIEL : un element de contexte max, utilise implicitement.
Etape 2/5 (relance).

MAX 300 caracteres. Texte brut uniquement.

IMPORTANT : Reponds en JSON strict :
{"message": "...", "reasoning": "..."}
"reasoning" = 1-2 phrases : ta strategie, l'angle choisi, le hook utilise.
Pas de markdown, pas de backticks, juste le JSON.
```

**Reponse Claude :**

```json
{
  "message": "Sezai,\n\nBiotech en phase de croissance, souvent le CEO porte le commercial en plus du reste. Chez ViferaXS, t'as reussi a structurer un pipe qui tourne sans toi, ou c'est encore sur tes epaules ?",
  "reasoning": "Etape 2 relance, signal ICP_TOP_ACTIVE sans intent specifique. Nouvel angle par rapport a un potentiel message 1 : je cible la dependance fondateur (pain point 2) specifique au contexte biotech/CEO. Question situation avec off-ramp naturel, nommant l'entreprise pour ancrer."
}
```

---

# 5. POINTS CLES POUR LE REDESIGN

## RAG — Limitations actuelles

1. **Prospection ne recoit que 2-3 blocs sur 17** : `icp`, `pain_points`, (+`use_cases` pour B/C). Pas de `messaging`, `objections`, `manifesto`, `profil_fondateur`, `framework_arc`.

2. **Mapping hardcode** dans `mapping.ts`. Pas configurable par UI (sauf overrides de contenu).

3. **Pas de selection intelligente** basee sur le contexte du lead. Le mapping est fixe par agent + segment ICP, pas par situation (nouveau poste vs engagement keyword vs lead froid).

4. **Format texte brut** : les blocs sont formatis en markdown simple. Pas de structure semantique exploitee (pas de tags, pas de poids, pas de priorite par section).

5. **Blocs monolithiques** : chaque bloc est injecte en entier. Pas de selection de sections pertinentes au sein d'un bloc.

6. **Cache basique** : Map en memoire, pas de TTL, single-instance.

## Prompt — Limitations actuelles

1. **Prompt tres long** (330 lignes, ~2500 tokens) mais tout dans un seul bloc. La logique de score, de stage, de relance, de signaux, d'exemples est melee.

2. **Logique de score dans le prompt** (0-49/50-69/70-100) — pas externalisee, pas parametrable.

3. **Exemples statiques** (7 bons + 3 mauvais) — pas adaptes dynamiquement au type de lead.

4. **Context directive separee du prompt** : la logique RICH/STRONG/PARTIAL/WEAK est dans `buildUserPrompt()`, pas dans le system prompt.

5. **Pas de persona explicite** : le prompt dit "ecris comme un fondateur" mais n'injecte pas le profil fondateur (bloc 17).

6. **Pas de vocabulaire injecte** : le bloc `messaging` (vocabulaire autorise/interdit) n'est pas dans le RAG prospection.

7. **Pas d'objections/angles** : les blocs `objections`, `manifesto`, `framework_arc` ne sont pas disponibles pour la prospection.

## Questions pour le brainstorm

- Quels blocs RAG manquent a la prospection ? (`messaging`, `profil_fondateur`, `manifesto` ?)
- Faut-il un RAG contextuel (selection de sections pertinentes vs blocs entiers) ?
- Le prompt v9.0 est-il trop rigide ou trop permissif ? Quels axes de qualite ameliorer ?
- La logique score/stage/relance doit-elle rester dans le prompt ou etre externalisee ?
- Faut-il des exemples dynamiques (few-shot par type de signal/segment) ?
- Le context directive (RICH/STRONG/PARTIAL/WEAK) fonctionne-t-il bien en pratique ?

---

*Document genere le 2026-04-01 par Claude Code*
*Source : codebase PROSPECTOR + base de donnees ai_usage*
