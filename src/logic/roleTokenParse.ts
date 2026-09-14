/**
 * Canonical parser for OCR role tokens.
 *
 * ML Kit may merge adjacent role labels:
 *   MLAMC -> ML + AMC
 *   AMLMLAMC -> AML + ML + AMC
 *
 * The entire token must be accounted for or [] is returned.
 */
export function splitRoleToken(
  token: string,
  knownRoles: readonly string[],
): string[] {
  const normalized = token.trim().toUpperCase();
  if (!normalized) return [];

  const roles = [...new Set(knownRoles.map(r => r.toUpperCase()))]
    .sort((a, b) => b.length - a.length);

  if (roles.includes(normalized)) return [normalized];

  const found: string[] = [];
  let pos = 0;

  while (pos < normalized.length) {
    const match = roles.find(role => normalized.startsWith(role, pos));
    if (!match) return [];
    found.push(match);
    pos += match.length;
  }

  return found;
}
