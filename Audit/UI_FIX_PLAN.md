# UI Fix Plan — PROSPECTOR

> Plan de remédiation priorisé issu de l'audit UI/UX du 2026-02-27.
> Classé par impact : P0 (critique), P1 (important), P2 (cleanup).

---

## P0 — Accessibilité critique

### P0-1. Dark mode : `muted-foreground` sur `card` fail WCAG AA

**Problème** : Texte `--muted-foreground` (`0 0% 55%` = #8C8C8C) sur fond `--card` (`0 0% 15%` = #262626) → ratio ~3.4:1. Fail WCAG AA pour texte normal (minimum 4.5:1).

**Impact** : Tout texte secondaire sur carte en dark mode est potentiellement illisible.

**Fichier** : `app/globals.css:74`

**Fix** :
```css
/* Avant */
--muted-foreground: 0 0% 55%;      /* #8C8C8C — ratio 3.4:1 sur #262626 */

/* Après */
--muted-foreground: 0 0% 63%;      /* #A1A1A1 — ratio 4.6:1 sur #262626, 4.5:1 sur #2A2A2A */
```

**Vérification** : Ratio #A1A1A1 sur #262626 = 4.6:1 (AA). Sur #171717 = 7.2:1 (AAA).

---

### P0-2. Blanc sur `destructive` (#DC2626) — ratio limite

**Problème** : `--destructive-foreground` (#FFFFFF) sur `--destructive` (#DC2626) → ratio ~4.0:1. En dessous de WCAG AA (4.5:1) pour texte `text-sm` (14px normal).

**Impact** : Texte sur boutons destructive peut être difficile à lire.

**Fichier** : `app/globals.css:31-32`

**Fix** :
```css
/* Avant */
--destructive: 0 72% 51%;          /* #DC2626 — ratio 4.0:1 avec blanc */

/* Après */
--destructive: 0 72% 45%;          /* #C81E1E — ratio 5.1:1 avec blanc */
```

**Alternative** : Garder #DC2626 mais utiliser le pattern badge (fond léger + texte coloré) partout sauf sur les boutons larges (texte >14px bold = ratio 3:1 suffisant).

---

### P0-3. Boutons icon-only sans `aria-label`

**Problème** : 0 instance de `aria-label` dans le code applicatif. Les boutons avec uniquement une icône ne sont pas accessibles aux lecteurs d'écran.

**Impact** : Inaccessible pour les utilisateurs de lecteurs d'écran.

**Fichiers et fixes** :

| Fichier | Ligne | Élément | Fix |
|---------|-------|---------|-----|
| `components/layout/header.tsx` | 181-188 | Bouton recherche mobile | Ajouter `aria-label="Rechercher"` |
| `components/layout/header.tsx` | 193 | Bouton notifications | Ajouter `aria-label="Notifications"` |
| `components/layout/header.tsx` | 215 | Bouton profil | Ajouter `aria-label="Menu utilisateur"` |
| `components/layout/sidebar.tsx` | 73-82 | Bouton collapse sidebar | Ajouter `aria-label={collapsed ? "Ouvrir le menu" : "Réduire le menu"}` |
| `components/theme-toggle.tsx` | — | Toggle dark mode | Ajouter `aria-label="Changer le thème"` |

---

### P0-4. Pages auth : inputs et boutons raw sans focus-visible

**Problème** : Les pages login/signup utilisent des éléments HTML raw (`<button>`, `<input>`) au lieu des composants shadcn/ui. Les inputs utilisent `focus:` au lieu de `focus-visible:`, et n'ont pas de `ring-offset`.

**Impact** : Expérience clavier dégradée, incohérence visuelle avec le dashboard.

**Fichiers** :

#### `app/(auth)/login/page.tsx`

| Ligne | Élément | Problème | Fix |
|-------|---------|----------|-----|
| 100-129 | Bouton Google | Raw `<button>` | Remplacer par `<Button variant="outline" className="h-11 w-full">` |
| 147-154 | Input email | Raw `<input>`, `focus:` | Remplacer par `<Input>` component, ajouter `<Label htmlFor="email">` |
| 168-175 | Input password | Raw `<input>`, `focus:` | Remplacer par `<Input>` component, ajouter `<Label htmlFor="password">` |
| 177-190 | Bouton submit | Raw `<button>` | Remplacer par `<Button variant="accent" className="h-11 w-full">` |

#### `app/(auth)/signup/page.tsx`

| Ligne | Élément | Fix |
|-------|---------|-----|
| 134-163 | Bouton Google | Remplacer par `<Button variant="outline">` |
| 181-188 | Input full name | Remplacer par `<Input>` + `<Label>` |
| 195-202 | Input email | Remplacer par `<Input>` + `<Label>` |
| 209-216 | Input password | Remplacer par `<Input>` + `<Label>` |
| 245-256 | Input confirm password | Remplacer par `<Input>` + `<Label>` |
| 271-284 | Bouton submit | Remplacer par `<Button variant="accent">` |

**Différences actuelles** :

| Aspect | Auth (actuel) | Input component (cible) |
|--------|---------------|------------------------|
| Hauteur | `h-11` (44px) | `h-10` (40px) |
| Focus | `focus:ring-2 focus:ring-accent` | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| Border focus | `focus:border-accent` | Absent (ring suffit) |
| Transition | `transition-shadow` | Absent |

**Note** : Garder `h-11` sur les pages auth en passant `className="h-11"` au composant `<Input>`.

---

### P0-5. Label `<label>` non associé avec `htmlFor`

**Problème** : Les labels dans les pages auth utilisent `<label>` sans `htmlFor`, donc ne sont pas associés programmatiquement à leurs inputs.

**Fichiers** :
- `app/(auth)/login/page.tsx:144` — `<label>Email</label>` sans `htmlFor`
- `app/(auth)/login/page.tsx:158` — `<label>Mot de passe</label>` sans `htmlFor`
- `app/(auth)/signup/page.tsx` — Idem pour tous les champs

**Fix** : Ajouter `htmlFor="email"` / `htmlFor="password"` sur les labels ET `id="email"` / `id="password"` sur les inputs correspondants. Ou mieux : utiliser `<Label>` component de shadcn/ui.

---

## P1 — Incohérences visuelles

### P1-1. Tailles typographiques arbitraires (71 occurrences)

**Problème** : `text-[10px]`, `text-[11px]`, `text-[13px]`, `text-[14px]` cassent l'échelle typographique.

**Fix par remplacement global** :

| Rechercher | Remplacer par | Fichiers impactés |
|------------|--------------|-------------------|
| `text-[10px]` | `text-xs` (12px) | header.tsx:173,274,306 + system-client.tsx + multiples |
| `text-[11px]` | `text-xs` (12px) | badge.tsx:7 + system-client.tsx |
| `text-[13px]` | `text-sm` (14px) | inbox-client.tsx, system-client.tsx |
| `text-[14px]` | `text-sm` (14px) | sidebar.tsx:100,120,152 |

**Badge.tsx spécifiquement** (`components/ui/badge.tsx:7`) :
```
Avant: text-[11px]
Après: text-xs
```

**Sidebar.tsx** (`components/layout/sidebar.tsx:100,120,152`) :
```
Avant: text-[14px]
Après: text-sm
```

---

### P1-2. Taille d'icônes sidebar non-standard

**Problème** : `h-[18px] w-[18px]` (18px) dans la sidebar au lieu de l'échelle standard.

**Fichier** : `components/layout/sidebar.tsx`

| Ligne | Actuel | Cible |
|-------|--------|-------|
| 108 | `h-[18px] w-[18px]` | `h-4 w-4` (16px) |
| 127 | `h-[18px] w-[18px]` | `h-4 w-4` (16px) |
| 158 | Déjà `h-4 w-4` | OK |

---

### P1-3. `font-bold` vs `font-semibold` — incohérence poids titres

**Problème** : ~95 usages de `font-bold` et ~120 de `font-semibold` pour des titres similaires.

**Règle proposée** :
- Titres principaux (h1, page headers) : `font-semibold`
- Titres secondaires (cards, sections) : `font-semibold`
- Labels / boutons : `font-medium`
- Corps : `font-normal`

**Fix** : Rechercher `font-bold` dans les fichiers dashboard et remplacer par `font-semibold` sauf dans les cas où le bold est intentionnel (ex: logo "P").

**Fichiers principaux** :
- `app/(dashboard)/dashboard-client.tsx` — Titres KPI
- `app/(dashboard)/pipeline/pipeline-client.tsx` — Headers table
- `app/(dashboard)/actions/actions-client.tsx` — Titres actions
- `app/(dashboard)/pipeline/[id]/lead-detail-client.tsx` — Titres sections

---

### P1-4. Ghost/Outline Button hover trop agressif

**Problème** : `ghost` et `outline` buttons utilisent `hover:bg-accent hover:text-accent-foreground`, ce qui les transforme visuellement en boutons accent au hover. C'est visuellement choquant pour un ghost button.

**Fichier** : `components/ui/button.tsx:16,19`

**Fix** :
```typescript
// Avant
outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
ghost: "hover:bg-accent hover:text-accent-foreground",

// Après
outline: "border border-input bg-background hover:bg-muted hover:text-foreground",
ghost: "hover:bg-muted hover:text-foreground",
```

---

### P1-5. `rounded-sm` sur Badge — trop petit

**Problème** : Les badges utilisent `rounded-sm` (4px) alors que tout le reste utilise `rounded-md` (6px) ou `rounded-lg` (8px). Visuellement incohérent.

**Fichier** : `components/ui/badge.tsx:7`

**Fix** :
```
Avant: "inline-flex items-center rounded-sm border ..."
Après: "inline-flex items-center rounded-md border ..."
```

---

### P1-6. Empty State — pas de composant standardisé

**Problème** : Chaque page implémente son propre empty state avec des textes et styles variés.

**Fix** : Créer `components/ui/empty-state.tsx` :

```tsx
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}
```

Pattern visuel : icône (h-10 w-10, text-muted-foreground/50), titre (text-sm font-medium), description (text-sm text-muted-foreground), action optionnelle.

---

### P1-7. Mapping status → Badge variant non centralisé

**Problème** : Le même statut (ex: "pending") peut avoir des variants de badge différentes selon les pages.

**Fix** : Créer un mapping dans `lib/constants.ts` :

```typescript
export const STATUS_BADGE_MAP: Record<string, BadgeVariant> = {
  pending: "warning",
  validated: "accent",
  sent: "success",
  failed: "destructive",
  cancelled: "secondary",
  active: "success",
  paused: "secondary",
  cold: "secondary",
  warm: "warning",
  hot: "destructive",
};
```

---

## P2 — Design System cleanup

### P2-1. Supprimer `rounded-2xl` et `rounded-3xl` du config

**Problème** : Définis identiquement à `rounded-lg` (0.5rem), jamais utilisés distinctement.

**Fichier** : `tailwind.config.ts:61-62`

**Fix** : Supprimer les lignes :
```typescript
// Supprimer ces 2 lignes
"2xl": "0.5rem",
"3xl": "0.5rem",
```

---

### P2-2. Standardiser les opacités

**Problème** : 7 niveaux d'opacité utilisés (/10, /20, /30, /50, /60, /70, /80, /90). Trop fragmenté.

**Cible** : 4 niveaux standardisés

| Niveau | Remplacement |
|--------|-------------|
| `/10` | Garder — fonds sémantiques légers |
| `/20` | Remplacer par `/10` — bordures légères |
| `/30` | Remplacer par `/50` — barre recherche |
| `/50` | Garder — disabled, overlays |
| `/60` | Remplacer par `/50` — shortcuts |
| `/70` | Remplacer par `/50` — close button initial |
| `/80` | Garder — hover badges |
| `/90` | Garder — hover boutons |

**Fichiers impactés** :
- `components/layout/header.tsx:169` — `bg-muted/30` → `bg-muted/50`
- `components/layout/header.tsx:148` — `text-muted-foreground/50` → OK (gardé, séparateur breadcrumb)
- `components/ui/dropdown-menu.tsx` — `opacity-60` → `opacity-50`
- `components/ui/dialog.tsx:47` — `opacity-70` → OK (gardé, close button)
- `components/ui/sheet.tsx` — `opacity-70` → OK (gardé, close button)

---

### P2-3. Ajouter `leading-normal` au body

**Problème** : Pas de `leading-*` explicite sur le body text (seulement 9 fichiers sur 63 utilisent leading-*).

**Fichier** : `app/globals.css:105-107`

**Fix** :
```css
/* Avant */
body {
  @apply bg-background text-foreground antialiased;
}

/* Après */
body {
  @apply bg-background text-foreground antialiased leading-normal;
}
```

---

### P2-4. Variables CSS sidebar déjà définies mais pas utilisées partout

**Problème** : `--sidebar-width: 240px` et `--sidebar-collapsed: 72px` sont définis dans globals.css mais la sidebar utilise `w-60` et `w-[72px]` en Tailwind.

**Fichier** : `components/layout/sidebar.tsx:60`

**Fix** :
```tsx
// Avant
collapsed ? "w-[72px]" : "w-60"

// Après — utiliser les variables CSS
collapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-width)]"
```

---

### P2-5. SVG Google sans accessibilité

**Problème** : Logo Google en SVG inline sans `aria-hidden` ni alt text.

**Fichier** : `app/(auth)/login/page.tsx:109-126`

**Fix** : Ajouter `aria-hidden="true"` sur le `<svg>` (l'icône est décorative, le texte "Continuer avec Google" suffit).

```tsx
<svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
```

---

### P2-6. Dialog close button "Close" en anglais

**Problème** : Le sr-only text du bouton close dans Dialog dit "Close" au lieu de "Fermer".

**Fichier** : `components/ui/dialog.tsx:49`

**Fix** :
```tsx
<span className="sr-only">Fermer</span>
```

---

### P2-7. Créer un composant `IconButton` wrapper

**Objectif** : S'assurer que tous les boutons icon-only ont un `aria-label`.

**Fichier à créer** : `components/ui/icon-button.tsx`

```tsx
interface IconButtonProps extends ButtonProps {
  "aria-label": string; // Rendu obligatoire
}
```

---

## Résumé — Ordre d'implémentation recommandé

### Sprint 1 — Accessibilité (P0)

1. P0-1 — Fix `muted-foreground` dark mode (`globals.css`)
2. P0-2 — Fix `destructive` contrast (`globals.css`)
3. P0-3 — Ajouter `aria-label` aux boutons icon-only (header, sidebar, theme-toggle)
4. P0-4 — Migrer auth pages vers composants shadcn/ui (Button, Input, Label)
5. P0-5 — Associer labels/inputs avec htmlFor/id

### Sprint 2 — Cohérence typographique (P1)

6. P1-1 — Remplacer tailles arbitraires (`text-[Npx]` → `text-xs`/`text-sm`)
7. P1-2 — Icônes sidebar → `h-4 w-4`
8. P1-3 — Standardiser `font-bold` → `font-semibold`
9. P1-5 — Badge `rounded-sm` → `rounded-md`

### Sprint 3 — Composants & patterns (P1)

10. P1-4 — Fix ghost/outline hover
11. P1-6 — Créer composant EmptyState
12. P1-7 — Créer mapping status→badge

### Sprint 4 — Cleanup (P2)

13. P2-1 — Supprimer rounded-2xl/3xl config
14. P2-2 — Rationaliser opacités
15. P2-3 — Ajouter `leading-normal` au body
16. P2-4 — Utiliser variables CSS sidebar
17. P2-5 — SVG Google `aria-hidden`
18. P2-6 — Dialog close "Fermer"
19. P2-7 — Composant IconButton

---

*Plan de remédiation — 2026-02-27 — PROSPECTOR*
