import { type DocConfig } from '@searsuite/sear-assembly-config';
import { createFontDescriptor } from '@searsuite/sear-render-metrics';

/** Converts structured Doc typography configuration at the render boundary. */
export function createDocFontDescriptor(config: Pick<DocConfig, 'docFontSize' | 'docFontFamily'>): string {
  return createFontDescriptor({ fontSize: config.docFontSize, fontFamily: config.docFontFamily });
}
