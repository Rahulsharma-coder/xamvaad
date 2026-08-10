/**
 * URL slug from a human name: "SSC CGL 2026" -> "ssc-cgl-2026".
 *
 * Shared by the board, exam and phase forms and by the exam API, which derives
 * its first phase's slug rather than trusting one from the client. Three copies
 * of this had already appeared; they only have to disagree once to produce a
 * slug that fails validation for reasons the admin cannot see.
 *
 * Leading and trailing hyphens are stripped because "PET / PST" would otherwise
 * yield "pet--pst" and " Tier 1" a leading dash, neither of which match the
 * `^[a-z0-9-]+$` the schemas enforce in a way anyone would expect.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
