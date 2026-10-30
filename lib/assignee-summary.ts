/**
 * One-line assignee label shared by every task list.
 *
 * Tasks can carry a team, so rows need a compact summary rather than a single
 * name: the first assignee plus `+N`, or `Unassigned` when nobody is on it.
 */

/** The minimal shape the summary needs; every task payload satisfies it. */
export type AssigneeLike = { name: string };

/** First word of a display name ("Asha Kumari" → "Asha"). */
function givenName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/**
 * "Asha" for one assignee, "Asha +2" for three, "Unassigned" for none.
 * `emptyLabel` lets a caller opt into a different empty marker (e.g. "—").
 */
export function assigneeSummary(
  assignees: ReadonlyArray<AssigneeLike> | null | undefined,
  emptyLabel = "Unassigned",
): string {
  if (!assignees || assignees.length === 0) return emptyLabel;
  const name = assignees[0]?.name?.trim() ?? "";
  if (!name) return emptyLabel;
  if (assignees.length === 1) return name;
  return `${givenName(name)} +${assignees.length - 1}`;
}
