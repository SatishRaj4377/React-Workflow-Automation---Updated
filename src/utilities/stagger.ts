import type { DiagramComponent, NodeModel } from '@syncfusion/ej2-react-diagrams';

type StaggerStrategy = 'diagonal' | 'grid';

export interface StaggerOptions {
  /** Logical group name to keep independent sequences (e.g., 'sticky', 'paletteNode', 'bpmn') */
  group?: string;
  /** Horizontal step in pixels (default 16) */
  stepX?: number;
  /** Vertical step in pixels (default 16) */
  stepY?: number;
  /** For 'grid' strategy, number of columns before wrapping (default 4) */
  cols?: number;
  /** Strategy to place the next node ('diagonal' | 'grid'; default 'diagonal') */
  strategy?: StaggerStrategy;
  /**
   * If true, derive index from existing nodes on the canvas (persistent across reloads)
   * by scanning addInfo.stagger.{group,index}. If false, use an in‑memory counter.
   * Default: true (more robust).
   */
  usePersistentIndex?: boolean;
}

/** Internal counters per Diagram instance and group (when not scanning the canvas). */
const counters = new WeakMap<DiagramComponent, Map<string, number>>();

function nextCounter(diagram: DiagramComponent, group: string): number {
  let map = counters.get(diagram);
  if (!map) {
    map = new Map();
    counters.set(diagram, map);
  }
  const n = (map.get(group) ?? 0) + 1;
  map.set(group, n);
  return n - 1; // return index starting at 0
}

/**
 * Compute the next staggered offset near a base point for the given group.
 * Returns { x, y, index } where index is the sequential number used for the offset.
 */
export function getNextStaggeredOffset(
  diagram: DiagramComponent,
  baseX: number,
  baseY: number,
  opts: StaggerOptions = {}
): { x: number; y: number; index: number } {
  const {
    group = 'default',
    stepX = 16,
    stepY = 16,
    cols = 4,
    strategy = 'diagonal',
    usePersistentIndex = true,
  } = opts;

  // Determine the next index
  let index = 0;
  if (usePersistentIndex) {
    // Scan the canvas for nodes that were previously auto-placed for this group
    const existing = diagram.nodes.filter(n => {
      const info = (n as any)?.addInfo;
      return info?.stagger?.group === group && typeof info?.stagger?.index === 'number';
    }) as NodeModel[];

    if (existing.length) {
      // next index = maxIndex + 1
      const maxIndex = Math.max(
        ...existing.map(n => (n as any).addInfo.stagger.index as number)
      );
      index = maxIndex + 1;
    } else {
      index = 0;
    }
  } else {
    index = nextCounter(diagram, group);
  }

  // Compute offsets
  let dx = 0, dy = 0;
  if (strategy === 'grid') {
    const col = index % cols;
    const row = Math.floor(index / cols);
    dx = col * stepX;
    dy = row * stepY;
  } else {
    // 'diagonal'
    dx = index * stepX;
    dy = index * stepY;
  }

  return { x: baseX + dx, y: baseY + dy, index };
}

/**
 * Helper to stamp addInfo with persistent stagger metadata.
 * Call this on the node before adding it to the diagram to persist group/index.
 */
export function applyStaggerMetadata(
  node: NodeModel,
  group: string,
  index: number
) {
  const addInfo = (node.addInfo ?? {}) as any;
  addInfo.stagger = { group, index };
  addInfo.autoPlaced = true;
  node.addInfo = addInfo;
}