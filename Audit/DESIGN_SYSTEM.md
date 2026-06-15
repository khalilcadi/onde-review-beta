# Design System — PROSPECTOR (Proposition cible)

> Système de design rationalisé, basé sur l'existant.
> Objectif : cohérence, accessibilité WCAG AA minimum, maintenabilité.
> Date : 2026-02-27

---

## 1. Tokens — Couleurs

### 1.1 Palette Neutral (Warm Stone)

Le projet utilise déjà une palette Stone chaude. On la conserve en rationalisant.

| Token | Light (HSL) | Light (Hex) | Dark (HSL) | Dark (Hex) | Usage |
|-------|------------|-------------|-----------|------------|-------|
| `--background` | `60 9% 96%` | `#F5F5F4` | `0 0% 9%` | `#171717` | Fond page |
| `--background-card` | `60 9% 98%` | `#FAFAF9` | `0 0% 15%` | `#262626` | Fond cartes |
| `--foreground` | `24 10% 10%` | `#1C1917` | `0 0% 96%` | `#F5F5F5` | Texte principal |
| `--muted` | `60 5% 90%` | `#E7E5E4` | `0 0% 16%` | `#2A2A2A` | Éléments atténués |
| `--muted-foreground` | `25 6% 45%` | `#78716C` | `0 0% 63%` | `#A1A1A1` | Texte secondaire |
| `--border` | `24 6% 83%` | `#D6D3D1` | `0 0% 25%` | `#404040` | Bordures |
| `--border-hover` | `24 6% 65%` | `#A8A29E` | `0 0% 33%` | `#555555` | Bordures hover |

> **Changement proposé** : `--muted-foreground` en dark mode passe de `0 0% 55%` (#8C8C8C) à `0 0% 63%` (#A1A1A1) pour garantir un ratio 4.5:1 sur `--card` (#262626). Ratio actuel : ~3.4:1 (fail AA).

### 1.2 Palette Primary & Accent

| Token | Valeur | Hex | Usage |
|-------|--------|-----|-------|
| `--primary` | = `--foreground` | `#1C1917` / `#F5F5F5` | Boutons principaux |
| `--primary-foreground` | = `--background-card` | Inverse de primary | Texte sur primary |
| `--accent` | `217 91% 60%` | `#2563EB` | CTA, liens, actions |
| `--accent-hover` | `217 91% 53%` (light) / `214 96% 68%` (dark) | — | Hover accent |
| `--accent-light` | `217 91% 97%` (light) / `217 50% 18%` (dark) | — | Fond léger accent |
| `--accent-foreground` | `0 0% 100%` | `#FFFFFF` | Texte sur accent |

### 1.3 Palette Sémantique

| Token | Valeur | Hex | Ratio sur fond blanc | Usage |
|-------|--------|-----|---------------------|-------|
| `--destructive` | `0 72% 51%` | `#DC2626` | 4.0:1 | Erreurs, suppression |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | — | Texte sur destructive |
| `--success` | `160 84% 39%` | `#059669` | 4.6:1 | Succès |
| `--success-light` | `160 84% 96%` | ~emerald-50 | — | Fond léger succès |
| `--warning` | `38 92% 50%` | `#D97706` | 3.3:1 | Avertissements |
| `--warning-light` | `38 92% 96%` | ~amber-50 | — | Fond léger warning |
| `--info` | = `--accent` | `#2563EB` | 4.6:1 | Information (nouveau) |
| `--info-light` | = `--accent-light` | — | — | Fond léger info |

> **Note** : `--warning` (#D97706) a un ratio de 3.3:1 sur blanc. Pour du texte normal, utiliser sur fond `--warning-light` uniquement. Pour un badge "warning", le fond coloré léger + texte `--warning` est suffisant (texte >18px ou bold = 3:1 OK).

### 1.4 Opacités standardisées

| Niveau | Token | Usage |
|--------|-------|-------|
| 10% | `{color}/10` | Fonds légers sémantiques |
| 50% | `opacity-50` | États disabled |
| 80% | `{color}/80` | Hover badges |
| 90% | `opacity-90` | Hover boutons |

Supprimer les usages isolés de `/20`, `/30`, `/60`, `/70`. Rationaliser vers 4 niveaux.

---

## 2. Tokens — Typographie

### 2.1 Échelle de tailles (7 niveaux)

| Token | Classe Tailwind | Taille | Line height | Usage |
|-------|----------------|--------|-------------|-------|
| `--text-xs` | `text-xs` | 12px | 16px | Labels, timestamps, metadata |
| `--text-sm` | `text-sm` | 14px | 20px | Corps UI, cellules, labels |
| `--text-base` | `text-base` | 16px | 24px | Titres cartes, contenu principal |
| `--text-lg` | `text-lg` | 18px | 28px | Titres sections |
| `--text-xl` | `text-xl` | 20px | 28px | Headers page |
| `--text-2xl` | `text-2xl` | 24px | 32px | Titres principaux |
| `--text-3xl` | `text-3xl` | 30px | 36px | Titres auth (usage rare) |

### Migration des tailles arbitraires

| Actuel | Cible | Justification |
|--------|-------|---------------|
| `text-[10px]` | `text-xs` (12px) | Plus lisible, conforme WCAG |
| `text-[11px]` | `text-xs` (12px) | Standardiser sur text-xs |
| `text-[13px]` | `text-sm` (14px) | Arrondi au palier supérieur |
| `text-[14px]` | `text-sm` (14px) | Identique — supprimer l'arbitraire |

### 2.2 Poids typographiques (3 niveaux)

| Token | Classe | Valeur | Usage |
|-------|--------|--------|-------|
| Normal | `font-normal` (default) | 400 | Corps de texte |
| Medium | `font-medium` | 500 | Labels, boutons, badges |
| Semibold | `font-semibold` | 600 | Titres, emphasis |

> **Simplification** : Remplacer les usages de `font-bold` (700) par `font-semibold` (600). La différence est subtile avec Geist Sans et `font-semibold` est déjà dominant. Un seul weight pour les titres = plus cohérent.

### 2.3 Line height par défaut

Ajouter `leading-normal` (1.5) globalement au body text. Ajouter `leading-tight` (1.25) aux headings.

### 2.4 Letter spacing

| Usage | Classe |
|-------|--------|
| Titres | `tracking-tight` (-0.025em) |
| Labels uppercase | `tracking-wider` (0.05em) |
| Tout le reste | default (0) |

---

## 3. Tokens — Spacing

### 3.1 Échelle (base 4px)

| Token | Valeur | Classe Tailwind | Usage |
|-------|--------|----------------|-------|
| `--space-0.5` | 2px | `0.5` | Micro-spacing (badge py) |
| `--space-1` | 4px | `1` | Tight spacing |
| `--space-1.5` | 6px | `1.5` | Compact spacing |
| `--space-2` | 8px | `2` | Standard spacing |
| `--space-3` | 12px | `3` | Medium spacing |
| `--space-4` | 16px | `4` | Section spacing |
| `--space-6` | 24px | `6` | Large spacing |
| `--space-8` | 32px | `8` | Extra large spacing |

### 3.2 Conventions par contexte

| Contexte | Padding | Gap interne |
|----------|---------|-------------|
| Page container | `p-6` (mobile) / `p-8` (desktop) | — |
| Card | `p-6` (CardHeader + CardContent) | `space-y-1.5` |
| Form group | `space-y-4` | — |
| Form field | `space-y-2` (label→input) | — |
| Button content | `px-4 py-2` (default) | `gap-2` |
| Badge | `px-2 py-0.5` | — |
| List items | `px-3 py-2.5` | `gap-3` |
| Table cells | `px-4 py-3` | — |
| Icon + texte | — | `gap-2` |
| Sections majeures | `space-y-6` | — |

### 3.3 Layouts

| Token | Valeur | Usage |
|-------|--------|-------|
| `--sidebar-width` | `240px` | Sidebar ouverte |
| `--sidebar-collapsed` | `72px` | Sidebar fermée |
| `--header-height` | `64px` | Hauteur header (h-16) |

---

## 4. Tokens — Border Radius

| Token | Classe | Valeur | Usage |
|-------|--------|--------|-------|
| `--radius-sm` | `rounded-sm` | 4px | Éléments subtils, tabs |
| `--radius-md` | `rounded-md` | 6px | Boutons, inputs, badges |
| `--radius-lg` | `rounded-lg` | 8px | Cartes, dialogs, containers |
| `--radius-full` | `rounded-full` | 9999px | Avatars, pills, indicateurs |

> **Nettoyage** : Supprimer `rounded-2xl` et `rounded-3xl` du config Tailwind (identiques à `rounded-lg`).

---

## 5. Tokens — Shadows

| Token | Classe | Light | Dark | Usage |
|-------|--------|-------|------|-------|
| `--shadow-sm` | `shadow-sm` | `0 1px 2px rgb(0 0 0/0.03)` | `0 0 0 1px rgb(255 255 255/0.05)` | Composants UI surélevés |
| `--shadow-md` | `shadow-md` | `0 4px 6px rgb(0 0 0/0.05)` | `0 0 0 1px rgb(255 255 255/0.08)` | Dropdowns, popovers |
| `--shadow-lg` | `shadow-lg` | `0 10px 15px rgb(0 0 0/0.05)` | `0 0 0 1px rgb(255 255 255/0.1)` | Modales, sheets |

---

## 6. Tokens — Transitions

| Token | Classe | Usage |
|-------|--------|-------|
| `--duration-fast` | `duration-150` | Interactions rapides (hover couleur) |
| `--duration-normal` | `duration-200` | **Standard** — tous les transitions |
| `--duration-slow` | `duration-500` | Ouverture/fermeture sheets |

### Easing

- Default : `ease-in-out` (Tailwind default)
- Aucun easing custom nécessaire

---

## 7. Composants — Spécifications

### 7.1 Button

| Propriété | Valeur |
|-----------|--------|
| Base | `inline-flex items-center justify-center rounded-md text-sm font-medium` |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| Disabled | `disabled:pointer-events-none disabled:opacity-50` |
| Transition | `transition-all duration-200` |

| Variant | Background | Text | Hover |
|---------|-----------|------|-------|
| `default` | `bg-primary` | `text-primary-foreground` | `hover:opacity-90` |
| `accent` | `bg-accent` | `text-accent-foreground` | `hover:bg-accent-hover` |
| `secondary` | `bg-secondary` | `text-secondary-foreground` | `hover:opacity-80` |
| `outline` | `bg-background` + border | `text-foreground` | `hover:bg-muted` |
| `ghost` | transparent | `text-foreground` | `hover:bg-muted` |
| `destructive` | `bg-destructive` | `text-destructive-foreground` | `hover:opacity-90` |
| `link` | transparent | `text-accent` | `hover:underline` |

| Size | Dimensions | Padding |
|------|-----------|---------|
| `sm` | `h-9` | `px-3` |
| `default` | `h-10` | `px-4 py-2` |
| `lg` | `h-11` | `px-8` |
| `icon` | `h-10 w-10` | — |

> **Changements proposés** :
> - `outline` hover : `hover:bg-muted` au lieu de `hover:bg-accent hover:text-accent-foreground` (trop agressif)
> - `ghost` hover : `hover:bg-muted` au lieu de `hover:bg-accent hover:text-accent-foreground` (idem)
> - `accent` hover : `hover:bg-accent-hover` (utiliser le token) au lieu de `hover:opacity-90`
> - `link` : utiliser `text-accent` au lieu de `text-primary` pour plus de clarté visuelle

### 7.2 Badge

| Propriété | Valeur |
|-----------|--------|
| Base | `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium` |
| Focus | `focus:ring-2 focus:ring-ring focus:ring-offset-2` |

> **Changements proposés** :
> - Taille texte : `text-xs` (12px) au lieu de `text-[11px]` — standardiser
> - Border radius : `rounded-md` (6px) au lieu de `rounded-sm` (4px) — plus cohérent avec le reste

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `default` | `bg-primary` | `text-primary-foreground` | transparent |
| `secondary` | `bg-secondary` | `text-secondary-foreground` | transparent |
| `outline` | transparent | `text-foreground` | `border-border` |
| `destructive` | `bg-destructive/10` | `text-destructive` | transparent |
| `success` | `bg-success-light` | `text-success` | transparent |
| `warning` | `bg-warning-light` | `text-warning` | transparent |
| `accent` | `bg-accent-light` | `text-accent` | transparent |

> **Changement** : `destructive` badge utilise fond léger + texte coloré (comme success/warning) au lieu de fond plein, pour cohérence.

### 7.3 Input

| Propriété | Valeur |
|-----------|--------|
| Base | `h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm` |
| Placeholder | `placeholder:text-muted-foreground` |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| Disabled | `disabled:cursor-not-allowed disabled:opacity-50` |

> Aucun changement. Composant bien défini. Les pages auth doivent migrer vers ce composant.

### 7.4 Card

| Sous-composant | Classes |
|---------------|---------|
| Card | `rounded-lg border border-border bg-card text-card-foreground` |
| CardHeader | `flex flex-col space-y-1.5 p-6` |
| CardTitle | `text-lg font-semibold leading-none tracking-tight` |
| CardDescription | `text-sm text-muted-foreground` |
| CardContent | `p-6 pt-0` |
| CardFooter | `flex items-center p-6 pt-0` |

### 7.5 Dialog

| Propriété | Valeur |
|-----------|--------|
| Overlay | `bg-black/50 backdrop-blur-sm` |
| Content | `max-w-lg rounded-lg border bg-background p-6 shadow-lg` |
| Close button | `absolute right-4 top-4` avec sr-only "Close" |
| Animation | `fade-in/out + zoom-in/out-95 + slide-in/out` |

### 7.6 Tabs

| Sous-composant | Classes |
|---------------|---------|
| TabsList | `bg-muted p-1 rounded-md` |
| TabsTrigger | `rounded-sm px-3 py-1.5 text-sm font-medium` |
| TabsTrigger (active) | `data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm` |

### 7.7 Composants manquants à créer

| Composant | Description |
|-----------|-------------|
| `EmptyState` | État vide standardisé (icône + titre + description + action optionnelle) |
| `StatusBadge` | Badge pré-mappé (status string → variant + label) |
| `IconButton` | Button variant=ghost size=icon + aria-label obligatoire |

---

## 8. Icônes — Système de tailles

| Token | Classe | Taille | Usage |
|-------|--------|--------|-------|
| `icon-xs` | `h-3.5 w-3.5` | 14px | Indicateurs, chevrons |
| `icon-sm` | `h-4 w-4` | 16px | **Standard** — icônes dans boutons, listes |
| `icon-md` | `h-5 w-5` | 20px | Icônes standalone, mobile nav |
| `icon-lg` | `h-6 w-6` | 24px | Logos, icônes de section |
| `icon-xl` | `h-8 w-8` | 32px | Avatars, icônes héros |

> **Migration** : Remplacer `h-[18px] w-[18px]` (sidebar) par `h-4 w-4` (16px standard).

---

## 9. États — Conventions

### 9.1 Hover

| Contexte | Pattern |
|----------|---------|
| Bouton filled | `hover:opacity-90` ou `hover:bg-{variant}-hover` |
| Bouton ghost/outline | `hover:bg-muted` |
| Lien | `hover:underline` ou `hover:text-foreground` |
| Ligne table | `hover:bg-muted/50` |
| Badge | `hover:bg-{color}/80` |
| Bordure | `hover:border-border-hover` |

### 9.2 Focus

| Pattern standard |
|-----------------|
| `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |

> Toujours utiliser `focus-visible:` (pas `focus:`). Le `focus-visible` ne s'active qu'au clavier, pas au clic.

### 9.3 Disabled

| Pattern | Usage |
|---------|-------|
| `disabled:pointer-events-none disabled:opacity-50` | Boutons, inputs |
| `peer-disabled:opacity-70` | Labels de formulaire |

### 9.4 Loading

| Pattern | Usage |
|---------|-------|
| `<Loader2 className="h-4 w-4 animate-spin" />` | Spinner dans boutons |
| Button `disabled` + spinner | Pendant chargement |

### 9.5 Active / Selected

| Pattern | Usage |
|---------|-------|
| `bg-muted text-accent font-medium` | Nav item actif (sidebar) |
| `data-[state=active]:bg-background data-[state=active]:shadow-sm` | Tab actif |

---

## 10. Accessibilité — Standards

### 10.1 Boutons icon-only

Toujours ajouter `aria-label` :
```tsx
<Button variant="ghost" size="icon" aria-label="Rechercher">
  <Search className="h-4 w-4" />
</Button>
```

### 10.2 Formulaires

- Tout `<input>` doit avoir un `<Label>` associé (via `htmlFor`)
- Les messages d'erreur doivent utiliser `aria-describedby`
- Les champs requis doivent avoir `aria-required="true"`

### 10.3 Images

- Toute `<img>` doit avoir un `alt` descriptif
- Les SVG décoratives : `aria-hidden="true"`
- Les SVG informatives : `role="img"` + `aria-label`

### 10.4 Contraste minimum

| Type de texte | Ratio minimum | Standard |
|---------------|--------------|----------|
| Texte normal (<18px) | 4.5:1 | WCAG AA |
| Texte large (>=18px ou >=14px bold) | 3:1 | WCAG AA |
| Éléments UI / graphiques | 3:1 | WCAG AA |

---

*Design System proposé le 2026-02-27 — PROSPECTOR*
