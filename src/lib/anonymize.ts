export interface NameMapping {
  real: string;
  code: string;
}

/**
 * Build a name mapping for anonymization.
 * Sorted by longest name first to avoid partial replacements
 * (e.g., "Mike Goldman" must be replaced before "Mike").
 */
export function buildNameMapping(
  memberName?: string | null,
  teamName?: string | null,
  userName?: string | null,
  actionOwners?: string[]
): NameMapping[] {
  const seen = new Set<string>();
  const mappings: NameMapping[] = [];
  let personCounter = 1;
  let teamCounter = 1;

  function addPerson(name: string | null | undefined, preferredCode?: string) {
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    mappings.push({ real: name, code: preferredCode ?? `Person-${personCounter++}` });
  }

  function addTeam(name: string | null | undefined) {
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    mappings.push({ real: name, code: `Team-${teamCounter++}` });
  }

  // Add known names
  addPerson(memberName, "Team-Member");
  addPerson(userName, "Current-User");
  if (actionOwners) {
    for (const owner of actionOwners) {
      if (owner) addPerson(owner);
    }
  }
  addTeam(teamName);

  // Sort by longest name first to prevent partial matches
  mappings.sort((a, b) => b.real.length - a.real.length);

  return mappings;
}

/**
 * Replace all real names with codes in the given text.
 * Case-insensitive replacement.
 */
export function anonymize(text: string, mapping: NameMapping[]): string {
  if (!mapping.length) return text;
  let result = text;
  for (const { real, code } of mapping) {
    // Use a global case-insensitive regex to replace all occurrences
    const escaped = real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), code);
  }
  return result;
}

/**
 * Replace all codes with real names in the given text.
 */
export function deanonymize(text: string, mapping: NameMapping[]): string {
  if (!mapping.length) return text;
  let result = text;
  // Replace codes with real names — process longest codes first
  const sorted = [...mapping].sort((a, b) => b.code.length - a.code.length);
  for (const { real, code } of sorted) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), real);
  }
  return result;
}
