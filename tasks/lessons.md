# PROSPECTOR - Lessons Learned

> Patterns d'erreurs et solutions. Review au début de chaque session.

---

## 📚 Index des leçons

1. [2026-02-04] npm sur Windows - Utiliser chemin complet
2. [2026-02-04] ESLint JSX - Échapper apostrophes et guillemets
3. [2026-02-04] TypeScript Objects vs Arrays
4. [2026-02-04] TypeScript readonly arrays

---

## 🔴 Leçons Critiques

### 2026-02-04 - npm ne produit pas d'output → Utiliser npm.cmd explicitement

**Contexte :** Pendant l'audit, `npm install` et `npm run build` ne produisaient aucun output.

**Erreur :** Les commandes npm semblaient s'exécuter mais ne créaient pas node_modules.

**Root Cause :** Sur Windows avec Git Bash, le wrapper `npm` peut avoir des problèmes de buffering ou d'exécution silencieuse.

**Solution :** Utiliser le chemin complet : `"/c/Program Files/nodejs/npm.cmd" install`

**Règle :** Sur Windows, si npm ne produit pas d'output ou échoue silencieusement, utiliser le chemin complet vers npm.cmd.

---

### 2026-02-04 - Objets TypeScript traités comme tableaux → Vérifier la structure

**Contexte :** LEAD_STATUSES et LEAD_STAGES étaient utilisés avec `.map()` et `.find()`.

**Erreur :** `Property 'find' does not exist on type '{ to_invite: ...; invited: ...; }'`

**Root Cause :** Ces constantes sont des objets `{ key: { label, ... } }` et non des tableaux.

**Solution :**
- Pour accéder : `LEAD_STAGES[lead.stage as keyof typeof LEAD_STAGES]?.label`
- Pour itérer : `Object.entries(LEAD_STATUSES).map(([key, value]) => ...)`

**Règle :** Toujours vérifier si une constante est un objet ou un tableau avant d'utiliser des méthodes d'array.

---

## 🟡 Bonnes Pratiques

### 2026-02-04 - Échapper les caractères spéciaux en JSX

**Contexte :** ESLint `react/no-unescaped-entities` bloque le build.

**Pattern :** Dans le texte JSX, utiliser :
- `&apos;` pour `'` (apostrophe)
- `&quot;` pour `"` (guillemet)

**Exemple :**
```tsx
// ❌ Mauvais
<p>S'inscrire</p>
<p>Cliquez sur "Modifier"</p>

// ✅ Bon
<p>S&apos;inscrire</p>
<p>Cliquez sur &quot;Modifier&quot;</p>
```

---

### 2026-02-04 - Gérer readonly arrays de TypeScript

**Contexte :** `as const` crée des tuples readonly qui ne peuvent pas être assignés à `string[]`.

**Pattern :** Créer une copie mutable avec spread :
```typescript
// ❌ Mauvais - erreur de type
const [settings, setSettings] = useState<{active_days: string[]}>(
  DEFAULT_SETTINGS as Settings // active_days est readonly
);

// ✅ Bon - spread crée une copie mutable
const getDefaultSettings = () => ({
  ...DEFAULT_SETTINGS,
  active_days: [...DEFAULT_SETTINGS.active_days],
});
```

---

### 2026-02-04 - Audit systématique avant merge

**Pattern :** Toujours exécuter avant de considérer une feature comme terminée :
1. `npm run build` - Vérifie TypeScript et compilation
2. `npm run lint` - Vérifie ESLint
3. `npm run dev` - Vérifie que le serveur démarre
4. Tester manuellement chaque route modifiée

---

## [2026-06-01] Unipile recherche de personnes -> GET /users/search?q= est cassé

**Erreur** : Utiliser `GET /users/search?account_id=...&q={nom}` pour chercher un
profil LinkedIn par nom. Cet endpoint **ignore le paramètre `q`** et renvoie
toujours le même profil (`public_identifier: "search"`, "Phil G.") quelle que
soit la requête (vérifié sur plusieurs requêtes distinctes).

**Solution** : Utiliser `POST /linkedin/search` (api `classic`, category
`people`, `keywords`). Le champ `id` du résultat **est** le `provider_id`
(format `ACoAAA…`), + `public_identifier` + `profile_url`. URL profil :
`https://www.linkedin.com/in/{provider_id}` (ou `{public_identifier}`).
Pattern de recherche par nom : 2 passes — `{prénom} {nom} {entreprise}`
(match nom de famille accepté car l'entreprise restreint), puis fallback
`{prénom} {nom}` (exiger prénom ET nom). 10s entre appels.

## [2026-06-01] Dédup dirigeants Pappers -> premier prénom + nom

**Erreur** : Dédupliquer des dirigeants sur le prénom *complet* + nom. Pappers
liste la même personne sous plusieurs formes de prénom ("Philippe" vs
"Philippe Gilbert Jean-Pierre", même SIREN, 2 rôles au board) -> doublons.

**Solution** : Clé de dédup = `premierToken(prénom) + nom` (normalisés). Pour la
recherche LinkedIn, n'utiliser que le premier prénom dans la query.

---

## [2026-06-03] Hydration error : `<Badge>` jamais dans un `<p>`

**Erreur** : `In HTML, <div> cannot be a descendant of <p>` (hydration error)
sur le Dashboard. Cause : `components/ui/badge.tsx` rend un `<div>`, et il était
placé dans un `<p>` ([dashboard-client.tsx:187]). Idem pièges : `CardTitle` rend
un `<h3>`, `CardDescription`/`DialogDescription`/`SheetDescription` rendent un `<p>`
→ ne jamais y mettre de Badge/div.

**Détection** : la recherche statique (grep multiligne `<p>…<Badge`) peut rater
le cas. Méthode fiable = reproduire via Playwright et lire le **component stack**
de l'erreur console (il pointe le fichier + composant exact).

**Solution** : remplacer le `<p>` enveloppant par un `<div>` (ou mettre le Badge
dans un `<span>`).

---

*Dernière mise à jour : 2026-06-03*
