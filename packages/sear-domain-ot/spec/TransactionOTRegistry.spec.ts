import {
  MatrixOTActionName,
  MatrixTransactionOT,
  OTTransformPriority,
  TransactionOTErrorCode,
  TransactionOTRegistry,
  MatrixTransactionOTRelation,
  createBuiltinTransactionOTRegistry,
} from '../src';

describe('TransactionOTRegistry', () => {
  it('transforms registered matrix families without operation-name branching in consumers', () => {
    const registry = createBuiltinTransactionOTRegistry();
    const pair = registry.transformPair(
      MatrixTransactionOT,
      [{ p: [1, 0], [MatrixOTActionName.UpdateCell]: { value: 'x', prev: null } }],
      MatrixTransactionOT,
      [{ p: [0], [MatrixOTActionName.RowInsert]: [null] }],
      OTTransformPriority.RIGHT,
    );

    expect(pair.left[0]?.p).toEqual([2, 0]);
  });

  it('requires an explicit relation instead of silently treating unknown families as independent', () => {
    const registry = createBuiltinTransactionOTRegistry();
    expect(() =>
      registry.transformPair(
        MatrixTransactionOT,
        [],
        { ...MatrixTransactionOT, id: 'third-party.matrix' },
        [],
        OTTransformPriority.RIGHT,
      ),
    ).toThrow(expect.objectContaining({ code: TransactionOTErrorCode.RelationNotRegistered }));
  });

  it('keeps shared definitions and relations alive until every registration is disposed', () => {
    const registry = new TransactionOTRegistry();
    const disposeFirst = registry.registerRelation(MatrixTransactionOTRelation);
    const disposeSecond = registry.registerRelation(MatrixTransactionOTRelation);

    disposeFirst();
    expect(() =>
      registry.transformPair(MatrixTransactionOT, [], MatrixTransactionOT, [], OTTransformPriority.RIGHT),
    ).not.toThrow();

    disposeSecond();
    expect(() =>
      registry.transformPair(MatrixTransactionOT, [], MatrixTransactionOT, [], OTTransformPriority.RIGHT),
    ).toThrow(expect.objectContaining({ code: TransactionOTErrorCode.RelationNotRegistered }));
    expect(() => registry.requireType(MatrixTransactionOT.id, MatrixTransactionOT.version)).toThrow(
      expect.objectContaining({ code: TransactionOTErrorCode.TypeNotRegistered }),
    );
  });

  it('flips tie-break priority when resolving a registered relation in reverse order', () => {
    const transformPair = jest.fn((left, right) => ({ left: [...left], right: [...right] }));
    const registry = new TransactionOTRegistry();
    const thirdPartyMatrix = { ...MatrixTransactionOT, id: 'third-party.matrix' };
    registry.registerRelation({
      left: MatrixTransactionOT,
      right: thirdPartyMatrix,
      transformPair,
    });

    registry.transformPair(thirdPartyMatrix, [], MatrixTransactionOT, [], OTTransformPriority.LEFT);

    expect(transformPair).toHaveBeenCalledWith([], [], OTTransformPriority.RIGHT);
  });

  it('locks retained OT callbacks after registration', () => {
    const registry = new TransactionOTRegistry();
    const definition = { ...MatrixTransactionOT, id: 'test.retained-ot' };
    const relation = {
      left: definition,
      right: MatrixTransactionOT,
      transformPair: MatrixTransactionOTRelation.transformPair,
    };
    registry.registerRelation(relation);

    expect(() => { (definition as { encode: unknown }).encode = () => 'forged'; }).toThrow();
    expect(() => { (relation as { transformPair: unknown }).transformPair = () => ({ left: [], right: [] }); })
      .toThrow();
    expect(registry.requireType(definition.id, definition.version).encode([])).toEqual(
      MatrixTransactionOT.encode([]),
    );
  });
});
