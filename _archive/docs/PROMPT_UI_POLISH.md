# SESSION UI - Refonte Design Complète

> À lancer après les sessions backend ou en parallèle si tu veux
> Durée estimée : 3-4h (peut être découpé en plusieurs passes)

---

## MISSION

Refonte complète de l'UI de PROSPECTOR pour atteindre un niveau de qualité "premium SaaS". L'objectif est un design moderne, aéré, professionnel — pas un template générique de vibe coding.

**Ajouter également un dark mode toggle.**

---

## RÉFÉRENCES VISUELLES (Style à suivre)

Le design doit s'inspirer de ces principes :
- **Spring Wallet** : Minimalisme, tables épurées, teintes subtiles
- **Selldash** : Structure claire, sidebar propre, KPIs bien organisés
- **SealsCRM** : Cards arrondies, couleurs d'accent maîtrisées

---

## DESIGN SYSTEM À IMPLÉMENTER

### Couleurs

```css
/* ===== LIGHT MODE ===== */
--background: #FAFAFA;           /* Fond principal - gris très clair, pas blanc pur */
--background-card: #FFFFFF;      /* Fond des cards */
--foreground: #0F172A;           /* Texte principal - slate-900 */
--foreground-muted: #64748B;     /* Texte secondaire - slate-500 */
--foreground-subtle: #94A3B8;    /* Texte tertiaire - slate-400 */

--border: #E2E8F0;               /* Bordures subtiles - slate-200 */
--border-hover: #CBD5E1;         /* Bordures hover - slate-300 */

--accent: #2563EB;               /* Couleur principale - blue-600 */
--accent-hover: #1D4ED8;         /* Accent hover - blue-700 */
--accent-light: #EFF6FF;         /* Accent background - blue-50 */

--success: #10B981;              /* Vert - emerald-500 */
--success-light: #ECFDF5;        /* Fond success - emerald-50 */
--warning: #F59E0B;              /* Orange - amber-500 */
--warning-light: #FFFBEB;        /* Fond warning - amber-50 */
--danger: #EF4444;               /* Rouge - red-500 */
--danger-light: #FEF2F2;         /* Fond danger - red-50 */

/* ===== DARK MODE ===== */
--background-dark: #0F172A;      /* Fond principal - slate-900 */
--background-card-dark: #1E293B; /* Fond cards - slate-800 */
--foreground-dark: #F8FAFC;      /* Texte principal - slate-50 */
--foreground-muted-dark: #94A3B8;/* Texte secondaire - slate-400 */
--foreground-subtle-dark: #64748B;/* Texte tertiaire - slate-500 */

--border-dark: #334155;          /* Bordures - slate-700 */
--border-hover-dark: #475569;    /* Bordures hover - slate-600 */

--accent-dark: #3B82F6;          /* Accent - blue-500 (plus clair en dark) */
--accent-hover-dark: #60A5FA;    /* Accent hover - blue-400 */
--accent-light-dark: #1E3A5F;    /* Accent background - custom dark blue */
```

### Spacing (8px Grid)

```
4px   → micro (entre icône et texte)
8px   → xs (padding interne dense)
12px  → sm (gaps entre éléments proches)
16px  → md (padding standard)
24px  → lg (gaps entre sections)
32px  → xl (padding de cards)
48px  → 2xl (gaps entre blocs majeurs)
64px  → 3xl (marges de page)
```

### Border Radius

```
4px   → Petits éléments (badges, chips)
8px   → Boutons, inputs
12px  → Cards moyennes
16px  → Cards principales
20px  → Cards larges, modales
```

### Shadows (Light mode)

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.03);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.03);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.03);
```

### Shadows (Dark mode)
```css
/* En dark mode, utiliser des bordures subtiles au lieu de shadows */
--shadow-sm-dark: 0 0 0 1px rgb(255 255 255 / 0.05);
--shadow-md-dark: 0 0 0 1px rgb(255 255 255 / 0.08);
```

### Typography

```css
/* Utiliser Geist (déjà installé) */
--font-sans: 'Geist', system-ui, sans-serif;
--font-mono: 'Geist Mono', monospace;

/* Tailles */
--text-xs: 0.75rem;    /* 12px - labels, badges */
--text-sm: 0.875rem;   /* 14px - body small, table cells */
--text-base: 1rem;     /* 16px - body */
--text-lg: 1.125rem;   /* 18px - subtitles */
--text-xl: 1.25rem;    /* 20px - card titles */
--text-2xl: 1.5rem;    /* 24px - page titles */
--text-3xl: 1.875rem;  /* 30px - big numbers (KPIs) */
--text-4xl: 2.25rem;   /* 36px - hero numbers */

/* Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

---

## COMPOSANTS À REFAIRE

### 1. Layout Global

**Sidebar (`components/layout/sidebar.tsx`)**
```
- Largeur : 240px (expanded), 72px (collapsed)
- Fond : background-card avec border-right subtile
- Logo en haut avec padding généreux (24px)
- Navigation : icônes (20px) + texte, gap de 12px
- Item actif : fond accent-light, texte accent, border-left 3px accent
- Hover : fond slate-100 (light) / slate-700 (dark)
- User info en bas avec avatar + nom + dropdown
- Transition smooth sur collapse (200ms ease)
```

**Header (`components/layout/header.tsx`)**
```
- Hauteur : 64px
- Fond : transparent ou background
- Titre de page : text-2xl font-semibold
- Breadcrumbs : text-sm text-muted avec / séparateurs
- Actions à droite : Search (cmd+K), Notifications, Dark mode toggle, User avatar
- Dark mode toggle : icône Sun/Moon avec transition
```

### 2. Cards

**Card de base**
```
- Padding : 24px (desktop), 16px (mobile)
- Border-radius : 16px
- Background : background-card
- Shadow : shadow-md (light), shadow-md-dark (dark)
- Pas de border visible, juste shadow
- Hover sur cards cliquables : shadow-lg + scale(1.01)
```

**Card KPI (Dashboard)**
```
- Layout : Icône (40x40, fond accent-light, radius 12px) | Contenu
- Contenu : Label (text-sm text-muted) + Valeur (text-3xl font-bold) + Trend
- Trend : Flèche + pourcentage (vert si positif, rouge si négatif)
- Grid : 4 colonnes desktop, 2 tablette, 1 mobile
```

### 3. Tables

**Table principale (Pipeline, Lists)**
```
- Pas de bordures de cellules
- Header : text-xs uppercase tracking-wide text-muted, fond transparent
- Rows : border-bottom subtle (border), hover:bg-slate-50 (light) / hover:bg-slate-800 (dark)
- Cells : padding 16px vertical, 12px horizontal
- Première colonne : font-medium
- Actions : icône "..." ou boutons discrets à droite
- Checkbox : ronde, accent color quand checked
```

**Badges de statut**
```
- Border-radius : 9999px (pill)
- Padding : 4px 12px
- Font : text-xs font-medium
- Hot/Active : bg-success-light text-success
- Warm/Pending : bg-warning-light text-warning  
- Cold/Inactive : bg-slate-100 text-slate-600 (light) / bg-slate-700 text-slate-300 (dark)
- Replied : bg-accent-light text-accent
```

### 4. Formulaires

**Inputs**
```
- Height : 44px (touch-friendly)
- Padding : 12px 16px
- Border-radius : 8px
- Border : 1px border, 2px accent on focus
- Placeholder : text-muted
- Focus : ring-2 ring-accent/20, border-accent
- Transition : all 150ms ease
```

**Buttons**
```
Primary:
- Background : accent
- Text : white
- Hover : accent-hover
- Padding : 12px 24px
- Border-radius : 8px
- Font : font-medium

Secondary:
- Background : transparent
- Border : 1px border
- Hover : bg-slate-100 (light) / bg-slate-800 (dark)

Ghost:
- Background : transparent
- Hover : bg-slate-100 (light) / bg-slate-800 (dark)

Danger:
- Background : danger
- Text : white
```

### 5. Navigation Tabs

```
- Style : underline (pas de background)
- Inactive : text-muted
- Active : text-foreground, border-bottom 2px accent
- Hover : text-foreground
- Gap entre tabs : 32px
- Padding bottom : 12px
```

### 6. Modals / Dialogs

```
- Overlay : bg-black/50 (light), bg-black/70 (dark)
- Card : max-width 480px, padding 32px, border-radius 20px
- Header : text-xl font-semibold, close button discret
- Footer : gap-12 entre boutons, boutons alignés à droite
- Animation : fade-in + scale from 95% to 100%
```

---

## PAGES À REFAIRE (par priorité)

### Priorité 1 - Core

1. **Dashboard (`/`)**
   - 4 KPI cards en haut (style reference image 5)
   - Graphique principal avec card wrapper
   - Section "Hot Leads" avec mini-table ou cards
   - Section "Team" avec avatars et stats

2. **Pipeline (`/pipeline`)**
   - Filtres en ligne (pas de sidebar filtre)
   - Table clean style reference image 2 & 7
   - Badges de statut style pill
   - Pagination élégante

3. **Daily Actions (`/actions`)**
   - Cards d'action avec preview message
   - Boutons d'action discrets mais clairs
   - Indicateur de quota (progress bar style)

### Priorité 2 - Features

4. **Lead Detail (`/pipeline/[id]`)**
   - Layout 2 colonnes : info principale | sidebar timeline
   - Sections collapsibles
   - Tags éditables style chips

5. **Sequences (`/sequences`)**
   - Liste en cards (pas table)
   - Stats inline sur chaque card
   - Status toggle élégant

6. **Inbox (`/inbox`)**
   - Layout style chat (liste à gauche, conversation à droite)
   - Bulles de message arrondies
   - Input de réponse sticky en bas

### Priorité 3 - Settings

7. **Settings** - Toutes les sous-pages
   - Layout formulaire clean
   - Sections avec headers
   - Save buttons sticky ou en haut

### Priorité 4 - Auth

8. **Login / Signup**
   - Centré verticalement
   - Card sobre, pas de décoration excessive
   - Social login buttons style Apple

---

## DARK MODE IMPLEMENTATION

### 1. Theme Provider

Créer `components/theme-provider.tsx` :
```tsx
// Utiliser next-themes (à installer si pas présent)
// npm install next-themes

import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  )
}
```

### 2. Toggle Component

Créer `components/theme-toggle.tsx` :
```tsx
// Bouton avec icône Sun/Moon
// Smooth transition entre les deux
// Placer dans le header à droite
```

### 3. CSS Setup

Dans `globals.css`, utiliser les classes Tailwind dark: pour chaque composant :
```css
.card {
  @apply bg-white dark:bg-slate-800;
}
```

Ou utiliser les CSS variables définies plus haut avec :
```css
:root { /* light mode variables */ }
.dark { /* dark mode variables */ }
```

---

## RÈGLES STRICTES

1. **Spacing** : Toujours utiliser la grille 8px. Jamais de valeurs arbitraires (13px, 17px, etc.)

2. **Couleurs** : Uniquement les couleurs du design system. Pas de hex random.

3. **Consistance** : Si un pattern est utilisé quelque part, le réutiliser partout (ex: tous les badges ont le même style)

4. **Mobile** : Tout doit être responsive. Sidebar collapse, tables scroll horizontal, cards stack vertical.

5. **Transitions** : Toujours 150-200ms ease. Jamais de changement brutal.

6. **Accessibilité** : Contraste suffisant, focus visible, touch targets 44px minimum.

---

## APRÈS MODIFICATIONS

1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session UI = ✅ avec date
2. Mets à jour tasks/todo.md
3. Mets à jour CLAUDE.md : documenter le design system
4. `npm run build` pour vérifier que tout compile
5. Teste le dark mode toggle
6. Screenshots avant/après si possible

---

## COMMANDE POUR LANCER

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md
2. PROMPT_UI_POLISH.md (ce fichier)
3. app/globals.css (état actuel)
4. components/ui/ (composants shadcn actuels)

Implémente la refonte UI complète selon les specs de PROMPT_UI_POLISH.md.

Commence par :
1. Mettre à jour globals.css avec le design system (couleurs, variables)
2. Installer next-themes et créer le theme provider
3. Créer le toggle dark mode
4. Refaire la sidebar
5. Refaire le header
6. Puis page par page selon les priorités

Montre-moi ta progression après chaque composant majeur.
```
