import { type DocCommandBus, type DocQueryRegistry } from '@searsuite/sear-assembly-commands';
import {
  type DocPlugin,
  type DocPluginImplementation,
  type DocRuntimeCapabilityReader,
} from '@searsuite/sear-assembly-doc';
import { type SessionStateSnapshot } from '@searsuite/sear-assembly-plugin';
import { type RichDocNode } from '@searsuite/sear-domain-doc';
import { type Container } from '@searsuite/sear-foundation-di';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';

/** Persisted document content, independent of layout and local input sessions. */
export interface DocDocumentState {
  readonly document: RichDocNode[];
}

/** Detached committed document projection available to every host. */
export interface DocEditorChange {
  readonly document: RichDocNode[];
  readonly text: string;
}

/** Opaque local plugin state captured for in-memory remounts. */
export type DocSessionState = SessionStateSnapshot;

/** Host services required by document business state and plugin lifecycles. */
export interface DocRuntimeAdapters {
  readonly platform: new (...args: never[]) => Platform;
  registerEnvironment?(container: Container): void;
}

/** Inputs for a document runtime requiring no renderer, font measurement or input adapter. */
export interface DocKernelConfiguration {
  readonly adapters: DocRuntimeAdapters;
  readonly documentState: DocDocumentState;
  readonly sessionState?: DocSessionState;
  readonly defaultPlugins?: readonly DocPluginImplementation<DocPlugin<unknown>>[] | false;
  readonly plugins?: readonly DocPluginImplementation<DocPlugin<unknown>>[];
  onCreated?(editor: DocKernelEditor): void;
}

/** Host-neutral document facade shared by Headless and presentation composition. */
export interface DocKernelEditor {
  readonly commands: DocCommandBus;
  readonly queries: DocQueryRegistry;
  readonly observations: ObservationRegistry;
  readonly services: DocRuntimeCapabilityReader;
  getDocument(): RichDocNode[];
  getText(): string;
  loadDocument(document: RichDocNode[]): void;
  destroy(): void;
}
