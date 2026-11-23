import { type DocLayoutRect } from './DocLayoutCache';

/** Visible document window used to filter block and page layout ranges. */
export class DocViewportWindow {
  /** Creates a viewport window from document-space rectangle coordinates. */
  public constructor(
    /** Left edge in document coordinates. */
    public readonly x: number,
    /** Top edge in document coordinates. */
    public readonly y: number,
    /** Visible width in document units. */
    public readonly width: number,
    /** Visible height in document units. */
    public readonly height: number,
  ) {}

  /** Creates a document-space window from a viewport rectangle and scroll offsets. */
  public static fromViewport(
    viewport: { readonly contentRect: DocLayoutRect },
    scroll: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
  ): DocViewportWindow {
    return new DocViewportWindow(
      viewport.contentRect.x + scroll.x,
      viewport.contentRect.y + scroll.y,
      viewport.contentRect.width,
      viewport.contentRect.height,
    );
  }

  /** Bottom edge in document coordinates. */
  public get bottom(): number {
    return this.y + this.height;
  }

  /** Returns whether this viewport intersects another document-space rectangle. */
  public intersects(rect: DocLayoutRect): boolean {
    const horizontal = rect.x < this.x + this.width && rect.x + rect.width > this.x;
    const vertical = rect.y < this.bottom && rect.y + rect.height > this.y;
    return horizontal && vertical;
  }
}
