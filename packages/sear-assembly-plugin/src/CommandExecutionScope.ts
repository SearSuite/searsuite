type CommandExecutionCallback<T> = () => T;
type CommandExecutionWarningReporter = (message: string, ...details: unknown[]) => void;

let commandExecutionDepth = 0;
let activeCommandId: string | null = null;
let observerEpoch = 0;
let nextObserverEpoch = 1;
const warnedOperationNames = new Set<string>();
const warnedSyntheticCommandDefinitions = new Set<string>();

export function runInsideCommandExecution<T>(commandId: string, callback: CommandExecutionCallback<T>): T {
  const previousCommandId = activeCommandId;
  commandExecutionDepth += 1;
  activeCommandId = commandId;
  try {
    return callback();
  } finally {
    commandExecutionDepth -= 1;
    activeCommandId = previousCommandId;
  }
}

/** Runs observers without inheriting the enclosing command's mutation authority. */
export function runOutsideCommandExecution<T>(callback: CommandExecutionCallback<T>): T {
  const previousDepth = commandExecutionDepth;
  const previousCommandId = activeCommandId;
  const previousObserverEpoch = observerEpoch;
  commandExecutionDepth = 0;
  activeCommandId = null;
  observerEpoch = nextObserverEpoch++;
  try {
    return callback();
  } finally {
    commandExecutionDepth = previousDepth;
    activeCommandId = previousCommandId;
    observerEpoch = previousObserverEpoch;
  }
}

/** Identifies the active observer scope so an older command cannot lend it write authority. */
export function getCommandObserverEpoch(): number {
  return observerEpoch;
}

export function isInsideCommandExecution(): boolean {
  return commandExecutionDepth > 0;
}

export function getActiveCommandId(): string | null {
  return activeCommandId;
}

export function warnIfOutsideCommandExecution(operationName: string, warn?: CommandExecutionWarningReporter): void {
  if (isInsideCommandExecution() || warnedOperationNames.has(operationName)) return;
  warnedOperationNames.add(operationName);
  warn?.(
    `[SearSuite] ${operationName} was invoked outside the command bus. Route user and host operations through commands.run(...).`,
  );
}

export function warnIfSyntheticCommandDefinition(
  busName: string,
  commandId: string,
  warn?: CommandExecutionWarningReporter,
): void {
  const warningKey = `${busName}:${commandId}`;
  if (warnedSyntheticCommandDefinitions.has(warningKey)) return;
  warnedSyntheticCommandDefinitions.add(warningKey);
  warn?.(
    `[SearSuite] ${busName}.run("${commandId}") received a command definition object different from the registered definition. Import and pass the feature-owned exported definition instead of recreating one by id.`,
  );
}
