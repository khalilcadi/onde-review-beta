# Design System Audit — PROSPECTOR

> Extraction de l'état actuel du design system tel qu'implémenté dans le code.
> Date : 2026-02-27

---

## 1. Palette de couleurs

### 1.1 Couleurs via CSS Variables (`app/globals.css`)

Le projet utilise un système de couleurs centralisé via CSS variables HSL, consommées par Tailwind. **Zéro couleur hardcodée** dans les composants (hors SVG Google).

#### Light Mode (`:root`)

| Token | HSL | Hex approximatif | Usage |
|-------|-----|-------------------|-------|
| `--background` | `60 9% 96%` | `#F5F5F4` | Fond de page (stone-100) |
| `--background-card` | `60 9% 98%` | `#FAFAF9` | Fond de cartes (stone-50) |
| `--foreground` | `24 10% 10%` | `#1C1917` | Texte principal (stone-900) |
| `--card` | `60 9% 98%` | `#FAFAF9` | Composant Card |
| `--card-foreground` | `24 10% 10%` | `#1C1917` | Texte sur Card |
| `--popover` | `60 9% 98%` | `#FAFAF9` | Fond dropdown/popover |
| `--popover-foreground` | `24 10% 10%` | `#1C1917` | Texte sur popover |
| `--primary` | `24 10% 10%` | `#1C1917` | Boutons principaux (stone-900) |
| `--primary-foreground` | `60 9% 98%` | `#FAFAF9` | Texte sur bouton principal |
| `--secondary` | `60 5% 90%` | `#E7E5E4` | Boutons secondaires (stone-300) |
| `--secondary-foreground` | `24 10% 10%` | `#1C1917` | Texte sur bouton secondaire |
| `--muted` | `60 5% 90%` | `#E7E5E4` | Éléments atténués (stone-300) |
| `--muted-foreground` | `25 6% 45%` | `#78716C` | Texte atténué (stone-500) |
| `--accent` | `217 91% 60%` | `#2563EB` | Couleur d'action (blue-600) |
| `--accent-foreground` | `0 0% 100%` | `#FFFFFF` | Texte sur accent |
| `--accent-hover` | `217 91% 53%` | ~blue-700 | Hover accent |
| `--accent-light` | `217 91% 97%` | ~blue-50 | Fond léger accent |
| `--destructive` | `0 72% 51%` | `#DC2626` | Erreur/suppression (red-600) |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | Texte sur destructive |
| `--success` | `160 84% 39%` | `#059669` | Succès (emerald-600) |
| `--success-light` | `160 84% 96%` | ~emerald-50 | Fond léger succès |
| `--warning` | `38 92% 50%` | `#D97706` | Avertissement (amber-600) |
| `--warning-light` | `38 92% 96%` | ~amber-50 | Fond léger warning |
| `--border` | `24 6% 83%` | `#D6D3D1` | Bordures (stone-300) |
| `--border-hover` | `24 6% 65%` | `#A8A29E` | Bordures hover (stone-400) |
| `--input` | `24 6% 83%` | `#D6D3D1` | Bordures input |
| `--ring` | `217 91% 60%` | `#2563EB` | Focus ring (= accent) |

#### Dark Mode (`.dark`)

| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| `--background` | `0 0% 9%` | `#171717` | Fond sombre |
| `--background-card` | `0 0% 15%` | `#262626` | Carte sombre |
| `--foreground` | `0 0% 96%` | `#F5F5F5` | Texte clair |
| `--muted` | `0 0% 16%` | `#2A2A2A` | Muted sombre |
| `--muted-foreground` | `0 0% 55%` | `#8C8C8C` | Texte atténué sombre |
| `--accent` | `217 91% 60%` | `#2563EB` | Identique light |
| `--accent-hover` | `214 96% 68%` | ~blue-400 | Hover plus clair |
| `--border` | `0 0% 25%` | `#404040` | Bordure sombre |
| `--border-hover` | `0 0% 33%` | `#555555` | Bordure hover sombre |

#### Couleurs SVG (brand, intentionnel)

| Couleur | Hex | Usage | Fichier |
|---------|-----|-------|---------|
| Google Blue | `#4285F4` | Logo Google SVG | `app/(auth)/login/page.tsx:111` |
| Google Green | `#34A853` | Logo Google SVG | `app/(auth)/login/page.tsx:115` |
| Google Yellow | `#FBBC05` | Logo Google SVG | `app/(auth)/login/page.tsx:119` |
| Google Red | `#EA4335` | Logo Google SVG | `app/(auth)/login/page.tsx:123` |

### 1.2 Opacités utilisées

| Niveau | Pattern | Usage |
|--------|---------|-------|
| 10% | `bg-{color}/10` | Fonds légers (alertes, highlights) |
| 20% | `border-{color}/20` | Bordures légères |
| 30% | `bg-muted/30` | Barre de recherche |
| 50% | `opacity-50`, `bg-black/50` | Disabled, overlays modal |
| 60% | `opacity-60` | Shortcuts dropdown |
| 70% | `opacity-70` | Bouton close initial |
| 80% | `hover:bg-{color}/80` | Hover badges |
| 90% | `hover:opacity-90` | Hover boutons |

---

## 2. Typographie

### 2.1 Polices

| Usage | Font | Variable |
|-------|------|----------|
| Body | Geist Sans | `--font-geist-sans` |
| Code/données | Geist Mono | `--font-geist-mono` |

### 2.2 Tailles utilisées

| Classe | Taille CSS | Occurrences | Usage principal |
|--------|-----------|-------------|-----------------|
| `text-xs` | 12px | ~85 | Labels, badges, timestamps |
| `text-sm` | 14px | ~250 | Corps, cellules tables, labels formulaires |
| `text-base` | 16px | ~60 | Titres cartes, contenu principal |
| `text-lg` | 18px | ~80 | Titres sections, titres dialogs |
| `text-xl` | 20px | ~25 | Headers de page |
| `text-2xl` | 24px | ~15 | Titres principaux |
| `text-3xl` | 30px | ~2 | Titre login/signup uniquement |

#### Tailles arbitraires (anti-pattern — 71 occurrences)

| Valeur | Occurrences | Fichiers principaux |
|--------|-------------|---------------------|
| `text-[10px]` | ~30 | Raccourcis clavier (kbd), labels système |
| `text-[11px]` | ~15 | Badge (`badge.tsx:7`), status labels |
| `text-[13px]` | ~8 | Aperçus messages |
| `text-[14px]` | ~18 | Navigation sidebar (`sidebar.tsx:100,120,152`) |

### 2.3 Font weights

| Classe | Occurrences | Usage |
|--------|-------------|-------|
| `font-medium` (500) | ~95 | Labels, texte boutons, badges |
| `font-semibold` (600) | ~120 | Titres sections, emphasis |
| `font-bold` (700) | ~95 | Titres cartes, titres dialogs |
| Implicite (400) | ~200+ | Corps de texte |

### 2.4 Line heights

| Classe | Occurrences | Usage |
|--------|-------------|-------|
| `leading-none` | 3 | Titres avec `tracking-tight` |
| `leading-tight` | 3 | Layouts compacts |
| `leading-relaxed` | 4 | Contenu multi-lignes |

**Constat** : Seulement 9 fichiers sur 63 définissent un `leading-*`. Le body text n'a pas de `leading-*` explicite.

### 2.5 Letter spacing

| Classe | Occurrences | Usage |
|--------|-------------|-------|
| `tracking-tight` | ~13 | Titres de sections |
| `tracking-wider` | ~3 | Labels uppercase (vues système) |

---

## 3. Spacing

### 3.1 Padding

| Classe | Occurrences | Pattern |
|--------|-------------|---------|
| `p-1` | 71 | Tight (badges, inputs) |
| `p-2` | 133 | Compact (form groups) — **le plus utilisé** |
| `p-3` | 86 | Cellules tables, dialog content |
| `p-4` | 65 | Contenu cartes, sections |
| `p-6` | 54 | Padding page/container |
| `p-8` | 11 | Grandes cartes (auth) |
| `px-3` | 57 | Boutons compacts, badges |
| `px-4` | 74 | Inputs, boutons, nav items |
| `px-6` | 17 | Padding cartes |
| `py-0.5` | 16 | Padding badge/pill |
| `py-1.5` | 17 | Tight button padding |
| `py-2` | 45 | Boutons, sections compactes |
| `py-2.5` | 20 | Navigation items (sidebar) |
| `py-3` | 51 | List items, card headers |

### 3.2 Gap

| Classe | Occurrences | Usage |
|--------|-------------|-------|
| `gap-1` | 23 | Tight (breadcrumbs, pills) |
| `gap-1.5` | 27 | Layouts flex compacts |
| `gap-2` | 124 | **Le plus commun** — icon+text, flex items |
| `gap-3` | 61 | List items, card groups |
| `gap-4` | 44 | Colonnes grid, sections majeures |
| `gap-6` | 16 | Spacing large (2 colonnes) |

### 3.3 Space-y

| Classe | Occurrences | Usage |
|--------|-------------|-------|
| `space-y-1` | 11 | Listes tight |
| `space-y-2` | 28 | Listes compactes |
| `space-y-3` | 17 | Section spacing default |
| `space-y-4` | 36 | Form groups, sections cartes |
| `space-y-6` | 28 | Séparation sections majeures |

### 3.4 Valeurs arbitraires (38 occurrences)

| Valeur | Fichiers | Usage |
|--------|----------|-------|
| `w-[240px]` | `sidebar.tsx` | Largeur sidebar |
| `w-[72px]` | `sidebar.tsx` | Sidebar collapsed |
| `h-[calc(100vh-8rem)]` | cockpit, inbox | Full page height |
| `min-h-[80px]`, `min-h-[120px]` | actions, sequences | Hauteurs minimales |
| `w-60` | `sidebar.tsx:60` | Largeur sidebar (= 240px via Tailwind) |

---

## 4. Border Radius

| Classe | Occurrences | Valeur effective | Usage |
|--------|-------------|------------------|-------|
| `rounded-lg` | 208 | `8px` (var(--radius)) | **Dominant** — cartes, boutons, inputs |
| `rounded-full` | 78 | `9999px` | Badges, pills, avatars |
| `rounded-md` | 36 | `6px` (radius - 2px) | Composants secondaires |
| `rounded-sm` | 11 | `4px` (radius - 4px) | Éléments subtils |

### Config Tailwind (anomalie)

```typescript
// tailwind.config.ts:60-66
borderRadius: {
  "2xl": "0.5rem",  // = 8px — identique à lg !
  "3xl": "0.5rem",  // = 8px — identique à lg !
  lg: "var(--radius)",  // 8px
  md: "calc(var(--radius) - 2px)",  // 6px
  sm: "calc(var(--radius) - 4px)",  // 4px
}
```

**Anomalie** : `rounded-2xl` et `rounded-3xl` ont la même valeur que `rounded-lg`. Valeurs inutiles.

---

## 5. Shadows

| Classe | Occurrences | Usage |
|--------|-------------|-------|
| `shadow-sm` | 10 | Composants UI (dropdown, tooltip), active tabs |
| `shadow-md` | 3 | Dialog overlays, dropdowns |
| `shadow-lg` | 3 | Sheets, overlays majeurs |

### Valeurs CSS (light mode)

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.03);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.03);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.03);
```

### Dark mode — shadows = bordures subtiles

```css
--shadow-sm: 0 0 0 1px rgb(255 255 255 / 0.05);
--shadow-md: 0 0 0 1px rgb(255 255 255 / 0.08);
--shadow-lg: 0 0 0 1px rgb(255 255 255 / 0.1);
```

**Constat** : Seulement 16 utilisations de shadows au total. Les cartes de contenu n'utilisent pas de shadow.

---

## 6. Transitions & Animations

### Durées

| Classe | Occurrences | Usage |
|--------|-------------|-------|
| `duration-200` | 40 | **Standard** — transitions d'état |
| `duration-150` | 7 | Interactions rapides |
| `duration-300` | 1 | Timing moyen |
| `duration-500` | 2 | Ouverture sheet |

### Animations

| Classe | Occurrences | Usage |
|--------|-------------|-------|
| `animate-spin` | 37 | Loading spinners |
| `animate-in` | 8 | Entrée dialogs/menus |
| `animate-out` | 8 | Sortie dialogs/menus |
| `animate-bounce` | 3 | Attention |
| `animate-pulse` | 1 | Loading subtil |

### Transitions

- `transition-all` — Appliqué largement avec `duration-*`
- `transition-colors` — Changements couleur (hover, active)
- `transition-opacity` — Changements opacité (focus)

---

## 7. Composants UI (shadcn/ui)

### 7.1 Inventaire

| Composant | Fichier | Variants | Tailles | États |
|-----------|---------|----------|---------|-------|
| **Button** | `components/ui/button.tsx` | 7 (default, destructive, outline, secondary, ghost, link, accent) | 4 (default, sm, lg, icon) | hover, focus, disabled |
| **Badge** | `components/ui/badge.tsx` | 7 (default, secondary, destructive, outline, success, warning, accent) | — | hover, focus |
| **Card** | `components/ui/card.tsx` | Compound (Header, Title, Description, Content, Footer) | — | transition |
| **Input** | `components/ui/input.tsx` | 1 | — | focus, disabled, placeholder |
| **Label** | `components/ui/label.tsx` | 1 | — | disabled (peer-disabled) |
| **Textarea** | `components/ui/textarea.tsx` | 1 | — | focus, disabled, placeholder |
| **Select** | `components/ui/select.tsx` | Compound | — | focus, disabled |
| **Tabs** | `components/ui/tabs.tsx` | Compound (List, Trigger, Content) | — | active, disabled, focus |
| **Dialog** | `components/ui/dialog.tsx` | Compound | — | open/closed animations |
| **Sheet** | `components/ui/sheet.tsx` | Side (top, bottom, left, right) | — | animations, overlay |
| **Dropdown Menu** | `components/ui/dropdown-menu.tsx` | Compound | — | focus, disabled, checked |
| **Avatar** | `components/ui/avatar.tsx` | Compound (Image, Fallback) | — | — |
| **Progress** | `components/ui/progress.tsx` | 1 | — | indicatorClassName custom |
| **Separator** | `components/ui/separator.tsx` | orientation (h/v) | — | — |
| **Scroll Area** | `components/ui/scroll-area.tsx` | Custom scrollbar | — | — |
| **Tooltip** | `components/ui/tooltip.tsx` | Compound | — | open/closed |

### 7.2 Button — détails variants

```
default:     bg-primary text-primary-foreground hover:opacity-90
destructive: bg-destructive text-destructive-foreground hover:opacity-90
outline:     border border-input bg-background hover:bg-accent hover:text-accent-foreground
secondary:   bg-secondary text-secondary-foreground hover:opacity-80
ghost:       hover:bg-accent hover:text-accent-foreground
link:        text-primary underline-offset-4 hover:underline
accent:      bg-accent text-accent-foreground hover:opacity-90
```

### 7.3 Badge — détails variants

```
default:     bg-primary text-primary-foreground hover:bg-primary/80
secondary:   bg-secondary text-secondary-foreground hover:bg-secondary/80
destructive: bg-destructive text-destructive-foreground hover:bg-destructive/80
outline:     text-foreground (transparent bg)
success:     bg-success-light text-success
warning:     bg-warning-light text-warning
accent:      bg-accent-light text-accent
```

---

## 8. Ratios de contraste WCAG

### Light Mode

| Combinaison | Ratio | WCAG AA | WCAG AAA |
|-------------|-------|---------|----------|
| `foreground` (#1C1917) sur `background` (#F5F5F4) | ~13.2:1 | AA | AAA |
| `foreground` (#1C1917) sur `card` (#FAFAF9) | ~12.8:1 | AA | AAA |
| `muted-foreground` (#78716C) sur `background` (#F5F5F4) | ~4.5:1 | AA | — |
| `muted-foreground` (#78716C) sur `card` (#FAFAF9) | ~4.5:1 | AA (limite) | — |
| `accent-foreground` (#FFF) sur `accent` (#2563EB) | ~4.6:1 | AA | — |
| `destructive-foreground` (#FFF) sur `destructive` (#DC2626) | ~4.0:1 | AA (limite) | — |
| `primary-foreground` (#FAFAF9) sur `primary` (#1C1917) | ~13.2:1 | AA | AAA |

### Dark Mode

| Combinaison | Ratio | WCAG AA | WCAG AAA |
|-------------|-------|---------|----------|
| `foreground` (#F5F5F5) sur `background` (#171717) | ~15.9:1 | AA | AAA |
| `muted-foreground` (#8C8C8C) sur `background` (#171717) | ~4.5:1 | AA | — |
| `muted-foreground` (#8C8C8C) sur `card` (#262626) | ~3.4:1 | — | — |

### Points d'attention contraste

| Problème | Ratio | Niveau | Fichier |
|----------|-------|--------|---------|
| `muted-foreground` sur `card` (dark) | ~3.4:1 | **Fail AA** texte normal | `globals.css:74` |
| Blanc sur `destructive` (#DC2626) | ~4.0:1 | **Limite AA** | `globals.css:31` |
| `text-[10px]` labels (très petit texte) | variable | Problème de lisibilité, pas de contraste | Multiples fichiers |
| `opacity-50` disabled | réduit ratio de moitié | Acceptable (état disabled) | — |

---

## 9. Accessibilité — État des lieux

### sr-only

- **2 instances** trouvées sur 63 fichiers
  - `components/layout/mobile-nav.tsx:64` — Menu button
  - `components/ui/dialog.tsx:49` — Close button "Close"

### aria-label / aria-labelledby

- **0 instance** dans le code applicatif
- Pas d'`aria-label` sur les boutons icon-only (recherche, notifications, theme toggle, sidebar collapse)

### alt text images

- Header avatar : `alt={displayName}` (`header.tsx:217`)
- Logo Google SVG : pas d'alt
- Logos providers dans settings : pas d'alt

### Focus states

- Tous les composants shadcn/ui : `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Pages auth : `focus:ring-2 focus:ring-accent` (différent — pas `focus-visible`, pas `ring-offset`)
- Bouton collapse sidebar : pas de focus ring visible
- Bouton recherche header (raw `<button>`) : pas de focus ring

### Keyboard navigation

- Composants Radix (Select, Dropdown, Tabs, Dialog) : support clavier natif
- Éléments custom (sidebar, auth) : support clavier incertain

---

## 10. Incohérences identifiées

### 10.1 Pages Auth vs Dashboard

| Aspect | Dashboard | Auth pages |
|--------|-----------|-----------|
| Boutons | `<Button>` component | Raw `<button>` HTML |
| Inputs | `<Input>` component (h-10) | Raw `<input>` HTML (h-11) |
| Focus | `focus-visible:ring-ring` | `focus:ring-accent` |
| Ring offset | `ring-offset-2` | Absent |
| Border on focus | Absent | `focus:border-accent` |

**Fichiers** :
- `app/(auth)/login/page.tsx:100-129` (bouton Google raw)
- `app/(auth)/login/page.tsx:147-154` (input email raw)
- `app/(auth)/login/page.tsx:168-175` (input password raw)
- `app/(auth)/login/page.tsx:177-190` (bouton submit raw)

### 10.2 Tailles d'icônes incohérentes

| Taille | Pixels | Usage |
|--------|--------|-------|
| `h-3 w-3` | 12px | Composants très petits |
| `h-3.5 w-3.5` | 14px | Indicateurs select/dropdown |
| `h-4 w-4` | 16px | **Standard** — la plupart des icônes |
| `h-[18px] w-[18px]` | 18px | Sidebar nav (`sidebar.tsx:108,127,158`) |
| `h-5 w-5` | 20px | Mobile nav, login |
| `h-6 w-6` | 24px | Logos settings |
| `h-8 w-8` | 32px | Avatars |

### 10.3 Empty states non standardisés

Chaque page implémente son propre empty state — pas de composant réutilisable.

### 10.4 Badge status mapping non centralisé

Les mêmes statuts (pending, active, etc.) n'ont pas de mapping cohérent vers les variants de Badge.

---

## 11. Scrollbar personnalisé

```css
/* app/globals.css:111-125 */
.scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { @apply bg-border rounded-full; }
.scrollbar-thin::-webkit-scrollbar-thumb:hover { @apply bg-border-hover; }
```

Appliqué via la classe `.scrollbar-thin` dans la sidebar et les scroll areas.

---

*Audit réalisé le 2026-02-27 — PROSPECTOR v0.1.0*
