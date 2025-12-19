import { ProjectData, TemplateProjectConfig } from "../types";

type Cache = { projects: Record<string, ProjectData>; configs: TemplateProjectConfig[] } | null;

/**
 * Load all template JSON modules from src/data/Templates.
 * Returns a webpack require context when available; otherwise null.
 */
function getTemplatesContext(): any | null {
  try {
    return (require as any).context('../data/Templates', false, /^\.\/.*\.json$/);
  } catch {
    return null;
  }
}

/**
 * Load raw templates into a map keyed by template id.
 * Keeps insertion order identical to the file discovery order.
 */
function loadRawTemplates(): Record<string, any> {
  const ctx = getTemplatesContext();
  if (!ctx) return {};
  const map: Record<string, any> = {};
  ctx.keys().forEach((key: string) => {
    const mod = ctx(key);
    const data = mod?.default ?? mod;
    const fileId = key.replace(/^\.\//, '').replace(/\.json$/i, '');
    const id: string = data?.id || data?.workflowData?.metadata?.id || fileId;
    map[id] = data;
  });
  return map;
}

/**
 * Parse a template's optional order value.
 * Accepts number or numeric string. Returns a finite number or null.
 */
function parseOrder(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert a raw template JSON object to a ProjectData instance.
 * Fills reasonable defaults and normalizes date fields.
 */
function toProject(raw: any): ProjectData {
  const now = new Date();
  const lastModified = raw?.lastModified ? new Date(raw.lastModified) : now;
  const created = raw?.workflowData?.metadata?.created
    ? new Date(raw.workflowData.metadata.created)
    : now;
  const modified = raw?.workflowData?.metadata?.modified
    ? new Date(raw.workflowData.metadata.modified)
    : lastModified;

  return {
    id: raw?.id || raw?.workflowData?.metadata?.id || `project-${Date.now()}`,
    name: raw?.name || raw?.workflowData?.metadata?.name || 'Template',
    lastModified,
    isBookmarked: false,
    isTemplate: true,
    diagramSettings: raw?.diagramSettings,
    workflowData: {
      metadata: {
        id: raw?.workflowData?.metadata?.id || raw?.id || `project-${Date.now()}`,
        name: raw?.workflowData?.metadata?.name || raw?.name || 'Template',
        created,
        modified,
        version: raw?.workflowData?.metadata?.version ?? 1,
      },
      diagramString: raw?.workflowData?.diagramString || raw?.workflowData?.diagramstirng || '',
      locked: raw?.workflowData?.locked,
    },
  } as ProjectData;
}


class TemplateService {
  private cache: Cache = null;

  /**
   * Build in-memory cache of template projects and their configs.
   * Applies optional ordering: templates with "order" are sorted asc; others keep original order.
   */
  private buildCache(): void {
    const rawMap = loadRawTemplates();

    // Preserve discovery order via Object.keys (insertion order)
    const entries = Object.keys(rawMap).map((id, index) => ({ id, raw: rawMap[id], index }));

    // Split by presence of valid order, then sort the ordered ones stably
    const withOrder = entries
      .map((e) => ({ ...e, order: parseOrder(e.raw?.order) }))
      .filter((e) => e.order !== null)
      .sort((a, b) => (a.order as number) - (b.order as number) || a.index - b.index);

    const withoutOrder = entries.filter((e) => parseOrder(e.raw?.order) === null);

    const sorted = [...withOrder, ...withoutOrder];

    const projects: Record<string, ProjectData> = {};
    const configs: TemplateProjectConfig[] = sorted.map(({ id, raw }) => {
      const project = toProject(raw);
      project.id = id;
      project.isTemplate = true;
      projects[id] = project;
      const title = project.name || id;
      const description = raw?.description || '';
      return { id, title, description, nodes: raw?.nodes || [] } as TemplateProjectConfig;
    });

    this.cache = { projects, configs };
  }

  /** Ensure cache is built before use. */
  private ensureCache(): void {
    if (!this.cache) this.buildCache();
  }

  /** Get template card configurations in the desired display order. */
  getTemplateConfigs(): TemplateProjectConfig[] {
    this.ensureCache();
    return this.cache!.configs;
  }

  /** Get a full template project by its id. Returns null if not found. */
  getTemplateProjectById(id: string): ProjectData | null {
    this.ensureCache();
    return this.cache!.projects[id] || null;
  }
}

export default new TemplateService();
