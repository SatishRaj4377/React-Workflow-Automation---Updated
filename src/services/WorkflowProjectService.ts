import { ProjectData, WorkflowData } from "../types";

/**
 * Service for managing workflow data and operations
 * Handles saving, loading, and executing workflows
 */
export class WorkflowProjectService {
  private STORAGE_KEY = 'workflow_automation_projects';

  /**
   * Get all saved projects
   */
  getProjects(): ProjectData[] {
    try {
      const projectsJson = localStorage.getItem(this.STORAGE_KEY);
      if (!projectsJson) return [];
      
      const projects: ProjectData[] = JSON.parse(projectsJson);
      // Convert string dates to Date objects
      return projects.map(project => ({
        ...project,
        lastModified: new Date(project.lastModified),
        workflowData: {
          ...project.workflowData,
          metadata: {
            ...project.workflowData.metadata,
            created: new Date(project.workflowData.metadata.created),
            modified: new Date(project.workflowData.metadata.modified)
          }
        }
      }));
    } catch (error) {
      console.error('Failed to load projects:', error);
      return [];
    }
  }

  /**
   * Get projects in sorted order
   */
  getSortedProjects(): ProjectData[] {
    const projects = this.getProjects();
    return projects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
  }

  /**
   * Get all bookmarked projects id
   */
  getBookmarkedProjectIds(): string[] {
    return this.getProjects().filter(p => p.isBookmarked).map(p => p.id);
  }

  /**
   * Get a specific project by ID
   */
  getProjectById(id: string): ProjectData | null {
    const projects = this.getProjects();
    return projects.find(project => project.id === id) || null;
  }

  /**
   * Save a project
   */
  saveProject(project: ProjectData): ProjectData {
    try {
      const projects = this.getProjects();
      const existingIndex = projects.findIndex(p => p.id === project.id);
      
      // Update last modified date
      const updatedProject = {
        ...project,
        lastModified: new Date(),
        workflowData: {
          ...project.workflowData,
          metadata: {
            ...project.workflowData.metadata,
            modified: new Date(),
            version: project.workflowData.metadata.version + 1
          }
        }
      };
      
      if (existingIndex >= 0) {
        // Update existing project
        projects[existingIndex] = updatedProject;
      } else {
        // Add new project
        projects.push(updatedProject);
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
      return updatedProject;
    } catch (error) {
      console.error('Failed to save project:', error);
      throw new Error('Failed to save project');
    }
  }

  /**
   * Delete a project by ID
   */
  deleteProject(id: string): boolean {
    try {
      const projects = this.getProjects();
      const updatedProjects = projects.filter(project => project.id !== id);
      
      if (updatedProjects.length === projects.length) {
        // No project was removed
        return false;
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedProjects));
      return true;
    } catch (error) {
      console.error('Failed to delete project:', error);
      return false;
    }
  }

  /**
   * Export a single project to a JSON file.
   * @param project The project to export.
   */
  exportProject(project: ProjectData): void {
    try {
      const exportData = {
        ...project,
        exportedAt: new Date().toISOString(),
        version: '1.0',
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);

      const fileName = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
      link.download = fileName;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error(`Failed to export project: ${project.name}`, error);
    }
  }

  /**
   * Exports each project in an array as a separate JSON file.
   * @param projects The array of projects to export.
   */
  exportMultipleProjects(projects: ProjectData[]): void {
    if (!projects || projects.length === 0) {
      console.warn('No projects selected for export.');
      return;
    }

    // Iterate over each selected project and trigger a separate download
    projects.forEach(project => {
      this.exportProject(project);
    });
  }
  
  /**
   * Delete multiple projects by their IDs
   */
  deleteMultipleProjects(ids: string[]): boolean {
    try {
      const projects = this.getProjects();
      const updatedProjects = projects.filter(project => !ids.includes(project.id));
      
      if (updatedProjects.length === projects.length - ids.length) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedProjects));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete multiple projects:', error);
      return false;
    }
  }

  /**
   * Create a new blank project
   */
  createBlankProject(name = 'Untitled Workflow'): ProjectData {
    const now = new Date();
    const id = `project-${Date.now()}`;
    
    const newProject: ProjectData = {
      id,
      name,
      lastModified: now,
      workflowData: {
        metadata: {
          id,
          name,
          created: now,
          modified: now,
          version: 1
        },
        diagramString: '' // Empty diagram initially
      }
    };
    
    return newProject;
  }

  /**
   * Toggle bookmark status for a project
   */
  toggleBookmark(projectId: string): ProjectData | null {
    try {
      const projects = this.getProjects();
      const projectIndex = projects.findIndex(p => p.id === projectId);
      
      if (projectIndex === -1) return null;
      
      const project = projects[projectIndex];
      
      // Create updated project with toggled bookmark status
      const updatedProject = {
        ...project,
        isBookmarked: !project.isBookmarked,
        // Don't update lastModified for bookmark changes to maintain sort order
        lastModified: project.lastModified
      };
      
      // Update the project in the array
      projects[projectIndex] = updatedProject;
      
      // Save all projects back to localStorage
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
      
      return updatedProject;
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
      return null;
    }
  }

  /**
   * Get all bookmarked projects
   */
  getBookmarkedProjects(): ProjectData[] {
    return this.getProjects().filter(project => project.isBookmarked);
  }
}

// Export a singleton instance
export default new WorkflowProjectService();