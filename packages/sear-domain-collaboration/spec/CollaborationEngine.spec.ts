import {
  OTTransformPriority,
  TransactionOTRegistry,
  type OTEncodedValue,
  type OTOperation,
  type OTTransformRelation,
  type TransactionOTDefinition,
} from '@searsuite/sear-domain-ot';
import {
  CollaborationAuthority,
  CollaborationContributorRegistry,
  CollaborationEngine,
  CollaborationErrorCode,
  type CollaborationAcceptedBatch,
  type CollaborationEngineEffect,
  type CollaborationSubmission,
} from '../src';

interface CounterOperation extends OTOperation {
  readonly delta: number;
}

const CounterOT: TransactionOTDefinition<CounterOperation> = {
  id: 'third-party.counter',
  version: 1,
  isOperation(operation): operation is CounterOperation {
    return 'delta' in operation && typeof operation['delta'] === 'number';
  },
  encode(operations): OTEncodedValue {
    return operations.map((operation) => ({ p: [...operation.p], delta: operation.delta }));
  },
  decode(payload): CounterOperation[] {
    if (!Array.isArray(payload)) throw new Error('counter payload must be an array');
    return payload.map((operation) => {
      if (typeof operation !== 'object' || operation === null || !('delta' in operation)) {
        throw new Error('invalid counter operation');
      }
      return { p: [], delta: Number(operation.delta) };
    });
  },
  invert(operations): CounterOperation[] {
    return [...operations].reverse().map((operation) => ({ p: [...operation.p], delta: -operation.delta }));
  },
};

const CounterRelation: OTTransformRelation<CounterOperation, CounterOperation> = {
  left: CounterOT,
  right: CounterOT,
  transformPair(left, right, _priority: OTTransformPriority) {
    return { left: left.map(cloneCounter), right: right.map(cloneCounter) };
  },
};

function cloneCounter(operation: CounterOperation): CounterOperation {
  return { p: [...operation.p], delta: operation.delta };
}

function createContributors(): CollaborationContributorRegistry {
  const operations = new TransactionOTRegistry();
  operations.registerRelation(CounterRelation);
  const contributors = new CollaborationContributorRegistry(operations);
  contributors.register('counter.value', CounterOT);
  return contributors;
}

function sendEffect(effects: readonly CollaborationEngineEffect[]): CollaborationSubmission {
  const effect = effects.find((candidate) => candidate.kind === 'send');
  if (!effect || effect.kind !== 'send') throw new Error('expected send effect');
  return effect.submission;
}

function applyEffects(value: number, effects: readonly CollaborationEngineEffect[]): number {
  return effects.reduce((current, effect) => {
    if (effect.kind !== 'applyRemote') return current;
    return (
      current + (effect.operations as readonly CounterOperation[]).reduce((sum, operation) => sum + operation.delta, 0)
    );
  }, value);
}

describe('CollaborationEngine', () => {
  it('runs one generic algorithm for a registered third-party OT family and converges two clients', () => {
    const authority = new CollaborationAuthority(createContributors());
    const left = new CollaborationEngine(createContributors());
    const right = new CollaborationEngine(createContributors());
    left.connect('counter-1', 'left');
    right.connect('counter-1', 'right');
    let leftValue = 1;
    let rightValue = 2;

    const leftSubmission = sendEffect(left.submitLocal('counter.value', [{ p: [], delta: 1 }]));
    const rightSubmission = sendEffect(right.submitLocal('counter.value', [{ p: [], delta: 2 }]));
    const acceptedLeft = authority.accept(leftSubmission);
    const acceptedRight = authority.accept(rightSubmission);

    leftValue = applyEffects(leftValue, left.receive(acceptedLeft));
    rightValue = applyEffects(rightValue, right.receive(acceptedLeft));
    leftValue = applyEffects(leftValue, left.receive(acceptedRight));
    rightValue = applyEffects(rightValue, right.receive(acceptedRight));

    expect(leftValue).toBe(3);
    expect(rightValue).toBe(3);
    expect(left.getRevision()).toBe(2);
    expect(right.getRevision()).toBe(2);
    expect(left.getPendingCount()).toBe(0);
    expect(right.getPendingCount()).toBe(0);
  });

  it('keeps exactly one submission in flight and sends the next after acknowledgement', () => {
    const authority = new CollaborationAuthority(createContributors());
    const engine = new CollaborationEngine(createContributors());
    engine.connect('counter-1', 'client');

    const first = sendEffect(engine.submitLocal('counter.value', [{ p: [], delta: 1 }]));
    expect(engine.submitLocal('counter.value', [{ p: [], delta: 2 }])).toEqual([]);
    const effects = engine.receive(authority.accept(first));
    const second = sendEffect(effects);

    expect(second.baseRevision).toBe(1);
    expect(second.operationId).not.toBe(first.operationId);
  });

  it('deduplicates operation ids, provides ordered catch-up, and rejects invalid revisions', () => {
    const authority = new CollaborationAuthority(createContributors());
    const engine = new CollaborationEngine(createContributors());
    engine.connect('counter-1', 'client');
    const submission = sendEffect(engine.submitLocal('counter.value', [{ p: [], delta: 1 }]));

    const accepted = authority.accept(submission);
    expect(authority.accept(submission)).toBe(accepted);
    expect(authority.sync('counter-1', 0).batches).toEqual([accepted]);
    expect(() => authority.sync('counter-1', 2)).toThrow(
      expect.objectContaining({ code: CollaborationErrorCode.InvalidRevision }),
    );
  });

  it('detects sequence gaps and unknown collaborative owners', () => {
    const engine = new CollaborationEngine(createContributors());
    engine.connect('counter-1', 'client');
    const gap: CollaborationAcceptedBatch = {
      kind: 'accepted',
      protocolVersion: 1,
      resourceId: 'counter-1',
      clientId: 'remote',
      operationId: 'remote:1',
      ownerId: 'counter.value',
      operationType: { id: CounterOT.id, version: CounterOT.version },
      baseRevision: 0,
      serverRevision: 2,
      payload: [],
    };

    expect(() => engine.receive(gap)).toThrow(expect.objectContaining({ code: CollaborationErrorCode.RevisionGap }));
    expect(() => engine.submitLocal('unknown', [{ p: [], delta: 1 }])).toThrow(
      expect.objectContaining({ code: CollaborationErrorCode.OwnerNotRegistered }),
    );
  });
});
