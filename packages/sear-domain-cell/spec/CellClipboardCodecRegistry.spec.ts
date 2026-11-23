import { CellClipboardCodecRegistry, CellType } from '@searsuite/sear-domain-cell-types';
import { BooleanCellTypeDefinition } from '../src/BooleanCellTypeDefinition';
import { NumberCellTypeDefinition } from '../src/NumberCellTypeDefinition';
import { StringCellTypeDefinition } from '../src/StringCellTypeDefinition';

describe('CellClipboardCodecRegistry plain-text decoding', () => {
  it('uses a matching typed codec and falls back to text for ordinary TSV cells', () => {
    const registry = new CellClipboardCodecRegistry();
    registry.register(new StringCellTypeDefinition().createClipboardCodec());
    registry.register(new BooleanCellTypeDefinition().createClipboardCodec());

    expect(registry.decodePlainText('TRUE')).toEqual({ type: CellType.Boolean, value: true });
    expect(registry.decodePlainText('false')).toEqual({ type: CellType.Boolean, value: false });
    expect(registry.decodePlainText('TSV-A')).toEqual({ type: CellType.String, value: 'TSV-A' });
    expect(registry.decodePlainText('')).toBeNull();
  });

  it('decodes plain numeric TSV fields as numbers while preserving non-numeric text', () => {
    const registry = new CellClipboardCodecRegistry();
    registry.register(new StringCellTypeDefinition().createClipboardCodec());
    registry.register(new NumberCellTypeDefinition().createClipboardCodec());
    registry.register(new BooleanCellTypeDefinition().createClipboardCodec());

    expect(registry.decodePlainText('5')).toEqual({ type: CellType.Number, value: 5 });
    expect(registry.decodePlainText('-2.5')).toEqual({ type: CellType.Number, value: -2.5 });
    expect(registry.decodePlainText('1e3')).toEqual({ type: CellType.Number, value: 1000 });
    expect(registry.decodePlainText('5X')).toEqual({ type: CellType.String, value: '5X' });
    expect(registry.decodePlainText('')).toBeNull();
  });

  it('restores a replaced codec and preserves unrelated codecs on disposal', () => {
    const registry = new CellClipboardCodecRegistry();
    const disposeString = registry.register(new StringCellTypeDefinition().createClipboardCodec());
    const disposeBoolean = registry.register(new BooleanCellTypeDefinition().createClipboardCodec());
    const disposeReplacement = registry.register({
      cellType: CellType.Boolean,
      encode: () => null,
      decode: () => null,
      toPlainText: () => '',
      decodePlainText: (text) => text === 'YES' ? { type: CellType.Boolean, value: true } : null,
    });

    expect(registry.decodePlainText('YES')).toEqual({ type: CellType.Boolean, value: true });
    expect(registry.decodePlainText('TRUE')).toEqual({ type: CellType.String, value: 'TRUE' });
    disposeReplacement();
    expect(registry.decodePlainText('TRUE')).toEqual({ type: CellType.Boolean, value: true });
    disposeBoolean();
    expect(registry.decodePlainText('TRUE')).toEqual({ type: CellType.String, value: 'TRUE' });
    disposeString();
    expect(registry.decodePlainText('TRUE')).toBeNull();
  });
});
