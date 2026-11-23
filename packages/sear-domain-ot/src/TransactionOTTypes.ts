import { type OTOperation, type OTTransformPriority } from './BaseOT';

/** JSON-compatible values accepted by collaboration transports. */
export type OTEncodedValue =
  | null
  | boolean
  | number
  | string
  | readonly OTEncodedValue[]
  | { readonly [key: string]: OTEncodedValue };

/** Stable, versioned operation family shared by history and collaboration. */
export interface TransactionOTDefinition<OperationType extends OTOperation = OTOperation> {
  readonly id: string;
  readonly version: number;
  isOperation(operation: OTOperation): operation is OperationType;
  encode(operations: readonly OperationType[]): OTEncodedValue;
  decode(payload: unknown): OperationType[];
  invert?(operations: readonly OperationType[]): OperationType[];
}

/** Pair transformation result preserving both concurrent branches. */
export interface OTTransformPair<Left extends OTOperation = OTOperation, Right extends OTOperation = OTOperation> {
  readonly left: Left[];
  readonly right: Right[];
}

/** Domain-specific transformation relation between two operation families. */
export interface OTTransformRelation<Left extends OTOperation = OTOperation, Right extends OTOperation = OTOperation> {
  readonly left: TransactionOTDefinition<Left>;
  readonly right: TransactionOTDefinition<Right>;
  transformPair(
    left: readonly Left[],
    right: readonly Right[],
    priority: OTTransformPriority,
  ): OTTransformPair<Left, Right>;
}

/** Returns the wire identity of one versioned OT family. */
export function transactionOTTypeKey(definition: Pick<TransactionOTDefinition, 'id' | 'version'>): string {
  return `${definition.id}@${definition.version}`;
}
