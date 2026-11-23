import { createDefaultRichTextLineBoxContribution, type RichTextLineBoxRegistry } from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { DocPlugin } from '../../plugin/DocPluginContracts';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';

/** Registers rich-text line box resolution for document layout. */
@Injectable()
export class RichTextLineBoxPlugin extends DocPlugin<null> {
  /** DI token for resolving RichTextLineBoxPlugin. */
  public static readonly symbol = Symbol.for('RichTextLineBoxPlugin');

  public constructor() {
    super({ key: new PluginKey('DocRichTextLineBox'), state: null });
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(): Node<NodeProperties>[] | null {
    return null;
  }

  public registerLineBoxes(registry: RichTextLineBoxRegistry): void {
    registry.register(createDefaultRichTextLineBoxContribution());
  }
}
