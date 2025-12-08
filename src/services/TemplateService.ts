import { ProjectData, TemplateProjectConfig } from "../types";

type Cache = { projects: Record<string, ProjectData>; configs: TemplateProjectConfig[] } | null;

// Load all template JSON modules from src/data/Templates
function getTemplatesContext(): any | null {
  try { return (require as any).context('../data/Templates', false, /^\.\/.*\.json$/); } catch { return null; }
}

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

function toProject(raw: any): ProjectData {
  const now = new Date();
  const lastModified = raw?.lastModified ? new Date(raw.lastModified) : now;
  const created = raw?.workflowData?.metadata?.created ? new Date(raw.workflowData.metadata.created) : now;
  const modified = raw?.workflowData?.metadata?.modified ? new Date(raw.workflowData.metadata.modified) : lastModified;

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

  private buildCache(): void {
    const rawMap = loadRawTemplates();
    const projects: Record<string, ProjectData> = {};
    const configs: TemplateProjectConfig[] = Object.keys(rawMap).map((id) => {
      const raw = rawMap[id];
      const project = toProject(raw);
      project.id = id;
      project.isTemplate = true;
      projects[id] = project;
      const title = project.name || id;
      const description = raw?.description || '';
      return { id, title, description, nodes: (raw?.nodes|| []) } as TemplateProjectConfig;
    });
    this.cache = { projects, configs };
  }

  private ensureCache(): void { if (!this.cache) this.buildCache(); }

  getTemplateConfigs(): TemplateProjectConfig[] {
    this.ensureCache();
    return this.cache!.configs;
  }

  getTemplateProjectById(id: string): ProjectData | null {
    this.ensureCache();
    return this.cache!.projects[id] || null;
  }
}

export default new TemplateService();
