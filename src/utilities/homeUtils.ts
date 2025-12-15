export function parsePx(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// Compute how many min-width items fit in the first row of a CSS grid container
export function computeItemsPerRow(container: HTMLElement, minItemWidthPx: number, gapFallback = 16): number {
  const styles = window.getComputedStyle(container);
  const colGap = parsePx(styles.columnGap, gapFallback);
  const width = container.clientWidth || 0;
  const per = minItemWidthPx + colGap;
  const count = Math.max(1, Math.floor((width + colGap) / per));
  return count;
}

// Compute how many icons of fixed size fit in a row area
export function computeVisibleIcons(container: HTMLElement, iconSizePx: number, gapPx: number): number {
  const w = container.clientWidth || 0;
  const per = iconSizePx + gapPx;
  return Math.max(1, Math.floor((w + gapPx) / per));
}

// Observe resize for element + window; returns cleanup function
export function observeResize(el: HTMLElement, cb: () => void): () => void {
  const R: any = (window as any).ResizeObserver;
  const ro = R ? new R(cb) : null;
  if (ro && el) ro.observe(el);
  window.addEventListener('resize', cb);
  return () => {
    window.removeEventListener('resize', cb);
    if (ro && el) ro.unobserve(el);
  };
}

export const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export function formatDateForListCell(date: Date|string) {
  const value = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - value.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (diffDay === 0) {
    if (diffHour > 0) return `${diffHour}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return `Just now`;
  }
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); // e.g. "Aug 27"
}