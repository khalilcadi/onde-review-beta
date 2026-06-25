/**
 * Message humanization — anti-détection LinkedIn
 *
 * Probabilistically splits messages into fragments (phrase by phrase)
 * and applies subtle text transforms to reduce bot-pattern detection.
 *
 * Applied at generation time (generate route + generate cron).
 * Stored in generated_message with FRAGMENT_SEPARATOR between fragments.
 * Parsed at render time (UI) and send time (execute.ts).
 */

/** Delimiter used to store fragments in the DB */
export const FRAGMENT_SEPARATOR = "|||";

/**
 * Parse a stored message into fragments array.
 * Returns a single-element array if no separator found.
 */
export function parseFragments(text: string): string[] {
  if (!text.includes(FRAGMENT_SEPARATOR)) return [text];
  return text
    .split(FRAGMENT_SEPARATOR)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/**
 * Random delay between fragments at send time: 12–25 seconds.
 */
export function getFragmentDelay(): number {
  return Math.floor(Math.random() * 13_000) + 12_000;
}

/**
 * Split text on sentence-ending punctuation into individual sentences.
 * Filters out very short results (e.g. "M." abbreviations).
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

/**
 * Proper nouns that must NEVER be lowercased at a fragment boundary.
 * The M1/M2 prompts assume casing is authored directly ("aucun transform
 * externe ne la rejoue") — but humanize lowercases the first letter of
 * non-first fragments for a casual feel. When a fragment happens to start
 * with one of these, lowercasing corrupts it ("Onde Review" → "onde Review",
 * "Drive" → "drive"). Detected on the first token, accent/case-insensitive.
 */
const PROPER_NOUNS = new Set([
  "onde",
  "drive",
  "frame",
  "loom",
  "google",
  "wetransfer",
  "linkedin",
  "yann",
]);

/** First alphabetic token of a fragment, lowercased (leading punctuation stripped). */
function firstToken(text: string): string {
  // Latin letters incl. French accents (À-ÿ); avoids \p{L} which needs the `u` flag / es6 target.
  const m = text.trim().match(/[a-zA-ZÀ-ÿ]+/);
  return m ? m[0].toLowerCase() : "";
}

/**
 * Apply subtle text transforms to a single fragment:
 * - ~25% chance: lowercase first letter on non-first fragments (casual typing),
 *   UNLESS the fragment starts with a proper noun (preserve capitalization)
 * - ~50% chance: remove trailing period on the last fragment
 */
function transformFragment(
  fragment: string,
  isFirst: boolean,
  isLast: boolean
): string {
  let f = fragment.trim();

  if (
    !isFirst &&
    Math.random() < 0.25 &&
    f.length > 0 &&
    !PROPER_NOUNS.has(firstToken(f))
  ) {
    f = f[0].toLowerCase() + f.slice(1);
  }

  if (isLast && Math.random() < 0.5 && f.endsWith(".")) {
    f = f.slice(0, -1);
  }

  return f;
}

/**
 * Probabilistically split a message into 2–3 fragments and apply text transforms.
 *
 * Conditions for splitting:
 * - actionType is "message" or "inmail" (invitations are too short, visits have no text)
 * - Message has 3+ sentences
 * - ~40% random chance (so most messages are NOT split)
 *
 * Returns the original text unchanged if conditions are not met.
 * Returns transformed text with FRAGMENT_SEPARATOR between fragments otherwise.
 */
export function humanizeMessage(text: string, actionType: string): string {
  if (actionType !== "message" && actionType !== "inmail") return text;

  const sentences = splitSentences(text);
  if (sentences.length < 3) return text;

  // ~40% chance to actually split
  if (Math.random() > 0.4) return text;

  // 3 fragments only if 5+ sentences and coin flip
  const fragmentCount =
    sentences.length >= 5 && Math.random() > 0.5 ? 3 : 2;

  let fragments: string[];
  if (fragmentCount === 2) {
    const mid = Math.ceil(sentences.length / 2);
    fragments = [
      sentences.slice(0, mid).join(" "),
      sentences.slice(mid).join(" "),
    ];
  } else {
    const a = Math.floor(sentences.length / 3);
    const b = Math.floor((sentences.length * 2) / 3);
    fragments = [
      sentences.slice(0, a).join(" "),
      sentences.slice(a, b).join(" "),
      sentences.slice(b).join(" "),
    ];
  }

  // Guard: if any fragment ended up empty/too short, fallback
  const valid = fragments.filter((f) => f.trim().length >= 10);
  if (valid.length < 2) return text;

  const transformed = valid.map((f, i) =>
    transformFragment(f, i === 0, i === valid.length - 1)
  );

  return transformed.join(FRAGMENT_SEPARATOR);
}

/**
 * Aerate a message into up to 3 visual blocks separated by a blank line:
 *
 *   Salut [Prénom] !
 *
 *   <corps>
 *
 *   <dernière phrase>
 *
 * MUST run AFTER humanizeMessage — humanize splits on sentences and rejoins
 * with join(" "), which would flatten the "\n\n" block separators if it ran
 * last. So anti-bloc is always the final transform in the pipeline.
 *
 * If the message was fragmented by humanizeMessage (contains FRAGMENT_SEPARATOR),
 * the fragmentation already breaks it into separate sends — anti-bloc is skipped
 * to avoid stacking two break mechanisms on one short message.
 *
 * Falls back to fewer blocks (or the original text) when there aren't enough
 * sentences to form three.
 */
export function applyAntiBloc(text: string): string {
  if (!text) return text;
  // Fragmentation already breaks the message — don't stack anti-bloc on top.
  if (text.includes(FRAGMENT_SEPARATOR)) return text;

  const trimmed = text.trim();

  // Block 1: the greeting — "Salut [Prénom] !" or "Salut [Prénom]," (case-insensitive).
  const greetMatch = trimmed.match(/^(salut\b[^!?.\n]*?[!,])/i);
  const greeting = greetMatch ? greetMatch[1].trim() : "";
  const rest = greetMatch ? trimmed.slice(greetMatch[0].length).trim() : trimmed;

  const sentences = rest
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let blocks: string[];
  if (greeting) {
    // greeting + body + last sentence
    if (sentences.length >= 2) {
      const last = sentences[sentences.length - 1];
      const body = sentences.slice(0, -1).join(" ");
      blocks = [greeting, body, last];
    } else if (sentences.length === 1) {
      blocks = [greeting, sentences[0]];
    } else {
      blocks = [greeting];
    }
  } else {
    // no greeting detected: first / middle / last
    if (sentences.length >= 3) {
      const last = sentences[sentences.length - 1];
      const middle = sentences.slice(1, -1).join(" ");
      blocks = [sentences[0], middle, last];
    } else {
      // not enough structure to aerate — leave untouched
      return trimmed;
    }
  }

  return blocks.filter(Boolean).join("\n\n");
}
