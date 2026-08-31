/**
 * Version stamp embedded in every export and project file, so a number in a
 * spreadsheet can always be traced back to the build that produced it.
 */
export const TOOL_VERSION: string = __TOOL_VERSION__

/** e.g. "barnes-maze-pipeline 0.1.0" — for export headers and file metadata. */
export function toolIdentifier(): string {
  return `barnes-maze-pipeline ${TOOL_VERSION}`
}
