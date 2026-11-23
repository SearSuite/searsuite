import {
  createSheetTransaction, defineSheetCommand, defineSheetQuery, SheetCommandBus, SheetQueryRegistry,
  TransactionPipelineCommand,
} from '@searsuite/sear-assembly-commands';
import { SheetDataPlugin } from '@searsuite/sear-render-engine';
import { findSheetMatches } from './findSheetMatches';
import { findSheetMatchPage } from './findSheetMatchPage';
import { replaceSheetMatches } from './replaceSheetMatches';
import { type SheetFindReplaceSource } from './SheetFindReplaceSource';
import {
  type SheetFindInput, type SheetFindMatch, type SheetFindPage, type SheetFindPageInput,
  type SheetReplaceInput, type SheetReplaceOneInput,
} from './FindReplaceTypes';

/** Reads matching occurrences from current Sheet state. */
export const FindSheetMatchesQuery = defineSheetQuery<SheetFindInput, readonly SheetFindMatch[]>(
  'sheet.findReplace.find',
);
/** Reads a bounded window and total count without retaining all matches. */
export const FindSheetMatchPageQuery = defineSheetQuery<SheetFindPageInput, SheetFindPage>(
  'sheet.findReplace.page',
);
/** Reads the revision used to invalidate cached result windows. */
export const ReadSheetFindRevisionQuery = defineSheetQuery<void, number>('sheet.findReplace.revision');
/** Replaces one selected occurrence in a Sheet transaction. */
export const ReplaceSheetMatchCommand = defineSheetCommand<SheetReplaceOneInput>('sheet.findReplace.replace');
/** Replaces all matching occurrences in one Sheet transaction. */
export const ReplaceAllSheetMatchesCommand = defineSheetCommand<SheetReplaceInput>('sheet.findReplace.replaceAll');

/** Publishes the typed find query for a Sheet plugin. */
export function registerSheetFindReplaceQueries(queries: SheetQueryRegistry, source: SheetFindReplaceSource): void {
  queries.register(FindSheetMatchesQuery, (input) => findSheetMatches(input, source));
  queries.register(FindSheetMatchPageQuery, (input) => findSheetMatchPage(input, source));
  queries.register(ReadSheetFindRevisionQuery, () => source.getRevision?.() ?? 0);
}

/** Publishes single and bulk replace commands for a Sheet plugin. */
export function registerSheetFindReplaceCommands(commands: SheetCommandBus, source: SheetFindReplaceSource): void {
  commands.register(ReplaceSheetMatchCommand, (input) => new TransactionPipelineCommand(
    ReplaceSheetMatchCommand.id,
    createSheetTransaction(SheetDataPlugin.pluginKey, replaceSheetMatches(input, source, true)),
  ));
  commands.register(ReplaceAllSheetMatchesCommand, (input) => new TransactionPipelineCommand(
    ReplaceAllSheetMatchesCommand.id,
    createSheetTransaction(SheetDataPlugin.pluginKey, replaceSheetMatches(input, source, false)),
  ));
}

export { replaceSheetMatches } from './replaceSheetMatches';
export { type SheetFindReplaceSource } from './SheetFindReplaceSource';
