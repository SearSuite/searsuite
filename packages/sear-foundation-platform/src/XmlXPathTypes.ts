/** Result values in document order; selected nodes contribute their string values. */
export interface XmlXPathEvaluation {
  readonly values: readonly string[];
}

/** Explicit prefix bindings used by an XPath expression. */
export interface XmlXPathOptions {
  readonly namespaces?: Readonly<Record<string, string>>;
}
