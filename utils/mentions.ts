// @mentions in comments. Usernames are 3-20 letters, numbers or underscores
// (same rule as sign-up, app/login.tsx). A mention is "@name" at the start of
// the text or after a character that can't be part of a username, so emails
// like a@b.com don't count.

const NAME = '[A-Za-z0-9_]{3,20}';
const MENTION_RE = new RegExp(`(^|[^A-Za-z0-9_@])@(${NAME})(?![A-Za-z0-9_])`, 'g');
export const MAX_MENTIONS = 10;

// Unique usernames mentioned in a comment, lowercased, in order
export function extractMentions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const u = m[2].toLowerCase();
    if (!seen.has(u)) { seen.add(u); out.push(u); }
    if (out.length >= MAX_MENTIONS) break;
  }
  return out;
}

// Splits a comment into plain text and @mention pieces, for highlighting
export function splitMentions(text: string): { text: string; username?: string }[] {
  const parts: { text: string; username?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const at = (m.index ?? 0) + m[1].length; // where "@" is
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: `@${m[2]}`, username: m[2] });
    last = at + 1 + m[2].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// The "@partial" being typed right before the cursor, or null. Used to show
// name suggestions while writing a comment.
export function mentionQueryAt(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.slice(0, cursor);
  const m = before.match(/(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{0,20})$/);
  if (!m) return null;
  return { query: m[2], start: before.length - m[2].length - 1 };
}
