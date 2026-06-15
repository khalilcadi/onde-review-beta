# Plan d'investigation : messages générés non-envoyés visibles dans la fiche lead

## Symptôme rapporté

Sur la fiche d'un lead (`/pipeline/[id]`), Khalil voit apparaître un message comme s'il avait été envoyé,
alors qu'en réalité ce message a seulement été **généré par l'IA** et n'a **jamais été envoyé** au lead
(ni validé ni `actions.status='sent'`).

C'est trompeur : on a l'impression qu'une conversation a démarré alors qu'elle n'existe pas côté LinkedIn.

## Hypothèses à valider

### H1 — La fiche lead lit `actions.generated_message` au lieu de la table `messages`
La fiche lead pourrait afficher les actions générées (`actions.generated_message` ou `actions.final_message`)
dans son bloc « historique / timeline » en mélangeant pending, validated et sent. Si oui, il faut filtrer
sur `status='sent'` uniquement.

**Où chercher :**
- `app/(dashboard)/pipeline/[id]/lead-detail-client.tsx` — toute la timeline + le composant qui rend les messages
- Toute fonction du type `getLeadHistory`, `getLeadActions`, `getLeadTimeline` dans `lib/actions/leads.ts` ou `lib/actions/actions.ts`
- Server action appelée depuis `app/(dashboard)/pipeline/[id]/page.tsx`

### H2 — Une `conversation` est créée AU MOMENT de la génération du message, pas à l'envoi
Il est possible que l'app crée une `conversations` row (et un `messages` row direction='outbound') quand l'IA
*génère* le message, pour pouvoir l'afficher dans l'inbox preview, et l'envoi réel ne fait que mettre à jour.
Si la sync inverse (`status='cancelled'` → supprimer le message) n'existe pas, on garde un fantôme.

**Où chercher :**
- `app/api/ai/generate/route.ts` — vérifier qu'aucun INSERT dans `messages` ou `conversations` n'y a lieu
- `app/api/crons/generate-actions/route.ts` — idem
- `lib/actions/actions.ts` — fonctions `validate`, `regenerate`, `cancel`
- `lib/unipile/execute.ts` — vérifier que la création de `messages.direction='outbound'` n'a lieu QU'APRÈS un `sendMessage` réussi (status='sent')

### H3 — Confusion entre `actions.generated_message` et messages réels au niveau du rendu
Le composant React mélange peut-être les deux sources sans distinction visuelle.

**Où chercher :**
- Grep `generated_message` dans `app/(dashboard)/pipeline/[id]/`
- Grep `final_message` dans `app/(dashboard)/pipeline/[id]/`

## Étapes d'investigation

### Étape 1 — Reproduire avec un cas précis
Identifier 1 lead spécifique chez Khalil pour lequel on voit un message fantôme. Récupérer son `lead.id`
et exécuter ces 3 requêtes côté Supabase pour comprendre ce qu'il y a en DB :

```sql
-- 1. Actions du lead (toutes statuses)
SELECT id, action_type, status, generated_message, final_message,
       generated_at, validated_at, sent_at, scheduled_at
FROM actions
WHERE lead_id = '<LEAD_ID>'
ORDER BY created_at;

-- 2. Conversations rattachées
SELECT id, channel, unipile_chat_id, attendee_name, status, updated_at
FROM conversations
WHERE lead_id = '<LEAD_ID>';

-- 3. Messages dans ces conversations
SELECT m.id, m.conversation_id, m.direction, m.content, m.timestamp
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE c.lead_id = '<LEAD_ID>'
ORDER BY m.timestamp;
```

**Diagnostic :**
- Si étape 1 contient une action `pending`/`validated`/`cancelled` avec un `generated_message` ET que l'UI le montre comme « envoyé » → **H1 ou H3** confirmé : l'UI ne filtre pas correctement par `status`
- Si étape 3 contient un message `outbound` mais l'action correspondante n'a pas `status='sent'` → **H2** confirmé : la conversation/message est créé prématurément quelque part

### Étape 2 — Tracer le code de la fiche lead
1. Lire intégralement `app/(dashboard)/pipeline/[id]/page.tsx` (server component) — quelles server actions sont appelées et quelles props sont passées
2. Lire intégralement `app/(dashboard)/pipeline/[id]/lead-detail-client.tsx` — chercher tout rendu de `message`, `content`, `generated_message`, `final_message`
3. Lire la fonction de fetch derrière (probablement `getLead` ou `getLeadById` dans `lib/actions/leads.ts`)

### Étape 3 — Tracer le code de l'envoi
1. Lire `lib/unipile/execute.ts` — voir où et quand `messages` est inséré pour `direction='outbound'`
2. Vérifier que cette insertion est dans la branche success de `sendMessage` Unipile
3. Lire `app/api/ai/generate/route.ts` et `app/api/crons/generate-actions/route.ts` — confirmer qu'AUCUN INSERT n'y a lieu dans `messages` ou `conversations`

### Étape 4 — Si bug confirmé en H1 ou H3
**Fix probable :** dans le composant fiche lead, filtrer la liste de messages affichés sur `actions.status === 'sent'`,
ou clairement séparer visuellement « actions en attente » et « messages envoyés ».

### Étape 5 — Si bug confirmé en H2
**Fix probable :** retirer la création prématurée de `messages`/`conversations` et la déplacer dans la branche
success de `executeLinkedInAction` (`lib/unipile/execute.ts`), uniquement quand `sendMessage` Unipile a renvoyé
un ID de message.

## Fichiers critiques à lire en priorité

| Fichier | Pourquoi |
|---|---|
| `app/(dashboard)/pipeline/[id]/lead-detail-client.tsx` | Le rendu côté UI |
| `app/(dashboard)/pipeline/[id]/page.tsx` | La server action appelée pour fetch les données |
| `lib/actions/leads.ts` | Probable `getLeadById` qui fait les jointures |
| `lib/actions/actions.ts` | Pour comprendre cycle de vie d'une action (generate→validate→cancel→sent) |
| `lib/unipile/execute.ts` | Où les messages réellement envoyés sont insérés en DB |
| `app/api/ai/generate/route.ts` | Où les messages sont générés (ne doit RIEN insérer dans `messages`) |
| `app/api/crons/generate-actions/route.ts` | Idem |

## Données de contexte (utile pour la nouvelle session)

- Khalil (`user_id = 14a0eedc-b156-45ab-b2c0-47eb990f4c84`) a 62 leads dans son pipeline
- 8 leads ont une action `status='sent'` de type message (les vrais envois)
- 1 seul lead a réellement reçu une réponse (Maxime Crouzet)
- 7 conversations sur 15 dans la table `conversations` n'ont pas de `lead_id` (orphelines, sujet séparé)
- Les `actions` peuvent contenir `generated_message`, `final_message`, statuses pending/validated/processing/sent/failed/cancelled

## Out of scope pour cette investigation

- Le bug `FIRST_DEGREE` (déjà corrigé dans 4 fichiers le 2026-04-07)
- Le rattachement des conversations orphelines (sujet 2 séparé)
- La désynchronisation du `stage` DB vs vrai état Unipile (sujet du cleanup pipeline)
