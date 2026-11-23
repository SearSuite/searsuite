import { OTOperation, OTOperationPath } from './BaseOT';
import type { NodeSchema, TextSchema } from '@searsuite/sear-domain-doc-schema';

export type { NodeSchema, TextSchema } from '@searsuite/sear-domain-doc-schema';

/** Compact operation keys persisted in rich-document OT payloads. */
export enum RichDocOTActionName {
  NodeInsert = 'ni',
  NodeDelete = 'nd',
  NodeMove = 'nm',
  StringInsert = 'si',
  StringDelete = 'sd',
  UpdateAttrs = 'ua',
}

/** Path into a rich-document tree; numeric segments address content arrays and string segments address attrs. */
export type RichDocOTOperationPath = OTOperationPath;

/** Inserts a node into a parent content array. */
export interface InsertNodeOTOperation extends OTOperation {
  /** Target insertion path. */
  p: RichDocOTOperationPath;
  /** Node payload inserted at the target path. */
  [RichDocOTActionName.NodeInsert]: NodeSchema;
}

/** Deletes a node and carries the removed payload for inversion. */
export interface DeleteNodeOTOperation extends OTOperation {
  /** Target node path. */
  p: RichDocOTOperationPath;
  /** Deleted node payload. */
  [RichDocOTActionName.NodeDelete]: NodeSchema;
}

/** Replaces one node in a content array while retaining both sides for OT inversion. */
export interface ReplaceNodeOTOperation extends OTOperation {
  /** Target node path. */
  p: RichDocOTOperationPath;
  /** Node payload removed from the target path. */
  [RichDocOTActionName.NodeDelete]: NodeSchema;
  /** Node payload inserted at the target path. */
  [RichDocOTActionName.NodeInsert]: NodeSchema;
}

/** Moves a node within its parent content array. */
export interface MoveNodeOTOperation extends OTOperation {
  /** Source node path. */
  p: RichDocOTOperationPath;
  /** Destination sibling index. */
  [RichDocOTActionName.NodeMove]: [number];
}

/** Inserts text into a leaf text node. */
export interface InsertStringOTOperation extends OTOperation {
  /** Path ending in the string offset. */
  p: RichDocOTOperationPath;
  /** String inserted at the offset. */
  [RichDocOTActionName.StringInsert]: string;
}

/** Deletes text from a leaf text node and carries the removed string. */
export interface DeleteStringOTOperation extends OTOperation {
  /** Path ending in the string offset. */
  p: RichDocOTOperationPath;
  /** Deleted string payload. */
  [RichDocOTActionName.StringDelete]: string;
}

/** Updates one node attribute and carries both previous and next values. */
export interface UpdateAttrsOTOperation extends OTOperation {
  /** Path ending in the attribute key. */
  p: RichDocOTOperationPath;
  /** New attribute value and previous attribute value. */
  [RichDocOTActionName.UpdateAttrs]: { value: unknown; prev: unknown };
}

/** Every operation understood by RichDocOT. */
export type RichDocOTOperation =
  | InsertNodeOTOperation
  | DeleteNodeOTOperation
  | ReplaceNodeOTOperation
  | MoveNodeOTOperation
  | InsertStringOTOperation
  | DeleteStringOTOperation
  | UpdateAttrsOTOperation;
