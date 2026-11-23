/** Fully consumed response; platform-native response objects never escape an adapter. */
export interface WebServiceResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly text: string;
}

/** Host-neutral request cancellation. */
export interface WebServiceCancellation {
  readonly cancelled: boolean;
  subscribe(listener: () => void): () => void;
}

export interface WebServiceRequestOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly cancellation?: WebServiceCancellation;
}
