/** Stable lifecycle phases emitted by Sheet, Doc, and Workbook command buses. */
export const CommandExecutionPhase = {
  Started: 'started',
  Completed: 'completed',
  Failed: 'failed',
} as const;

/** Public string union for command lifecycle event phases. */
export type CommandExecutionPhase = (typeof CommandExecutionPhase)[keyof typeof CommandExecutionPhase];
