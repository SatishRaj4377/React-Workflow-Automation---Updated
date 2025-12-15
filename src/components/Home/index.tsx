import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { TooltipComponent } from '@syncfusion/ej2-react-popups';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { DropDownButtonComponent, MenuEventArgs } from '@syncfusion/ej2-react-splitbuttons';
import { ListViewComponent, SelectEventArgs } from '@syncfusion/ej2-react-lists';
import { CheckBoxComponent, ChangeEventArgs as CheckBoxChangeEventArgs } from '@syncfusion/ej2-react-buttons';
import WorkflowProjectService from '../../services/WorkflowProjectService';
import ConfirmationDialog from '../ConfirmationDialog';
import HomeHeader from '../Header/HomeHeader';
import TemplateCard from './TemplateCard';
import ProjectCard from './ProjectCard';
import RecentProjectItem from './RecentProjectItem';
import ProjectListItem from './ProjectListItem';
import EmptyState from './EmptyState';
import { ProjectData, TemplateProjectConfig } from '../../types';
import { MENU_ITEMS, SIDEBAR_ITEMS, SORT_OPTIONS } from '../../constants';
import TemplateService from '../../services/TemplateService';
import './Home.css';
import { computeItemsPerRow, formatDate, formatDateForListCell, observeResize } from '../../utilities/homeUtils';

interface HomeProps {
  projects: ProjectData[];
  onCreateNew: () => void;
  onOpenProject: (project: ProjectData) => void;
  onDeleteProject: (projectId: string) => void;
  onMultipleDeleteProjects: (projectIds: string[]) => void;
  onBookmarkToggle?: (projectId: string) => void;
  onSaveProject: (project: ProjectData) => void;
}

const Home: React.FC<HomeProps> = ({
  projects,
  onCreateNew,
  onOpenProject,
  onDeleteProject,
  onMultipleDeleteProjects,
  onBookmarkToggle,
  onSaveProject
}) => {
  const searchRef = useRef<TextBoxComponent>(null);
  const sidebarRef = useRef<ListViewComponent>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const savedViewMode = localStorage.getItem('workflow_projects_view_mode');
    return (savedViewMode === 'list' || savedViewMode === 'card') ? savedViewMode : 'card';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('lastModified');
  const [sortText, setSortText] = useState('Last Modified');
  const [activeSection, setActiveSection] = useState('dashboard');
  const [projectToDelete, setProjectToDelete] = useState<ProjectData | null>(null);
  const [projectsToDelete, setProjectsToDelete] = useState<ProjectData[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [isMultiDeleteConfirmOpen, setMultiDeleteConfirmOpen] = useState(false);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);

  const availableTemplates = useMemo(() => TemplateService.getTemplateConfigs(), []);
  // Dashboard quick access: compute how many templates fit in the first row
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const [maxVisibleTemplates, setMaxVisibleTemplates] = useState<number>(3);

  const handleSearchCreated = () => {
    setTimeout(() => {
      if (searchRef.current) {
        searchRef.current.addIcon('append', 'e-icons e-search search-icon');
      }
    });
  };

  const handleSortSelect = (args: any) => {
    setSortBy(args.item.id);
    setSortText(args.item.text);
  };

  const handleSidebarSelect = (args: SelectEventArgs) => {
    setActiveSection((args.data as any).id);
  };

  const handleMenuSelect = (project: ProjectData) => (args: MenuEventArgs) => {
    switch (args.item.text) {
      case 'Edit':
        onOpenProject(project);
        break;
      case 'Export Project':
        WorkflowProjectService.exportProject(project);
        break;
      case 'Delete':
        setProjectToDelete(project); 
        break;
    }
  };

  const handleBookmarkToggle = useCallback((projectId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setTimeout(() => {
      if (onBookmarkToggle) {
        onBookmarkToggle(projectId);
      }
    }, 0);
  }, [onBookmarkToggle]);

  const handleConfirmDelete = () => {
    if (projectToDelete) {
      onDeleteProject(projectToDelete.id);
      setProjectToDelete(null);
    }
    if (projectsToDelete.length > 0) {
      onMultipleDeleteProjects(projectsToDelete.map(p => p.id));
      setProjectsToDelete([]);
      setSelectedProjects([]); // Clear selection after deletion
    }
    setMultiDeleteConfirmOpen(false);
  };

  const handleCloseDeleteDialog = () => {
    setProjectToDelete(null);
    setProjectsToDelete([]);
    setMultiDeleteConfirmOpen(false);
  };

  const handleMultiSelectToggle = (project: ProjectData, isChecked: boolean) => {
    if (isChecked) {
      setSelectedProjects(prev => [...prev, project.id]);
    } else {
      setSelectedProjects(prev => prev.filter(id => id !== project.id));
    }
  };

  const handleSelectAll = (isChecked: boolean) => {
    if (isChecked) {
      setSelectedProjects(filteredAndSortedProjects.map(p => p.id));
    } else {
      setSelectedProjects([]);
    }
  };

  const handleDeleteSelected = () => {
    const toDelete = projects.filter(p => selectedProjects.includes(p.id));
    if (toDelete.length > 0) {
      setProjectsToDelete(toDelete);
      setMultiDeleteConfirmOpen(true);
    }
  };

  const handleExportSelected = () => {
    const toExport = projects.filter(p => selectedProjects.includes(p.id));
    if (toExport.length > 0) {
      WorkflowProjectService.exportMultipleProjects(toExport);
    }
  };
  
  const handleOpenTemplateProject = (templateProject: TemplateProjectConfig) => {
    const template = TemplateService.getTemplateProjectById(templateProject.id);
    if (!template) {
      console.warn(`No project found for template "${templateProject.id}"`);
      return;
    }

    const newProject = WorkflowProjectService.createProjectFromTemplate(template as any);

    onOpenProject(newProject);
  };


  const bookmarkedIds = useMemo(() => WorkflowProjectService.getBookmarkedProjectIds(), [projects]);
  const isBookmarked = useCallback((projectId: string) => bookmarkedIds.includes(projectId), [bookmarkedIds]);

  // Generate stable keys that don't cause unnecessary re-renders
  const getProjectKey = useCallback((project: ProjectData, index: number, prefix: string = '') => {
    return `${prefix}${project.id}-${index}`;
  }, []);

  const filteredAndSortedProjects = useMemo(() => {
    let filteredProjects = projects.filter(project =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (showBookmarkedOnly) {
      // Filter to only bookmarked projects
      filteredProjects = filteredProjects.filter(project => isBookmarked(project.id));
    }

    return filteredProjects.sort((projectA, projectB) => {
      switch (sortBy) {
        case 'lastModified':
          // Use lastModified from ProjectData
          const lastModifiedA = new Date(projectA.lastModified).getTime();
          const lastModifiedB = new Date(projectB.lastModified).getTime();
          return lastModifiedB - lastModifiedA;

        case 'created':
          // Use created from WorkflowData metadata
          const createdDateA = projectA.workflowData?.metadata?.created || projectA.lastModified;
          const createdDateB = projectB.workflowData?.metadata?.created || projectB.lastModified;
          const createdTimeA = new Date(createdDateA).getTime();
          const createdTimeB = new Date(createdDateB).getTime();
          return createdTimeB - createdTimeA;

        case 'nameAsc':
          return projectA.name.localeCompare(projectB.name);

        case 'nameDesc':
          return projectB.name.localeCompare(projectA.name);

        default:
          return 0;
      }
    });
  }, [projects, searchTerm, sortBy, isBookmarked, showBookmarkedOnly]);

  // Save view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('workflow_projects_view_mode', viewMode);
  }, [viewMode]);

  // On mount, select the dashboard item
  useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.selectItem({ id: activeSection });
      // Scroll to top area of the page
      document.querySelector('.home-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // When switching to Dashboard, reset filters to default so Recent Projects is unfiltered
    if (activeSection === 'dashboard') {
      setSearchTerm('');
      setSortBy('lastModified');
      setSortText('Last Modified');
      setShowBookmarkedOnly(false);
      setSelectedProjects([]);
    }
  }, [activeSection]);

  // Compute how many template cards fit in the first row of the dashboard grid
  useEffect(() => {
    if (activeSection !== 'dashboard') return;
    const el = quickAccessRef.current;
    if (!el) return;

    const compute = () => {
      // Keep in sync with Home.css grid: repeat(auto-fit, minmax(280px, 1fr))
      const count = computeItemsPerRow(el, 280, 16);
      setMaxVisibleTemplates(Math.min(count, availableTemplates.length));
    };

    compute();
    const cleanup = observeResize(el, compute);
    return cleanup;
  }, [activeSection, availableTemplates.length]);

  return (
    <div className="home-layout">
      {/* Header */}
      <HomeHeader />

      {/* Sidebar */}
      <aside className="home-sidebar">
        {/* Action Button */}
        <ButtonComponent
          cssClass="e-primary action-btn create-workflow-btn"
          iconCss="e-icons e-plus"
          onClick={onCreateNew}
        >
          Create New Workflow
        </ButtonComponent>

        {/* Navigation Options */}
        <ListViewComponent
          ref={sidebarRef}
          id="sidebar-nav"
          dataSource={SIDEBAR_ITEMS}
          fields={{ id: "id", text: "text", iconCss: "icon" }}
          cssClass="sidebar-list"
          showIcon={true}
          select={handleSidebarSelect} 
        />
      </aside>

      {/* Main Section */}
      <main className="home-main">
        <div className="home-content">
          
          {/* DASHBOARD SECTION */}
          {activeSection === 'dashboard' && (
            <>
              {/* Quick Access Section */}
              <section className="quick-access-section animate-fade-in-up">
                <h2 className="section-title">Quick Start</h2>
                <div ref={quickAccessRef} className="quick-access-grid">
                  {/* Show only the templates that fit in the first row */}
                  {availableTemplates.slice(0, maxVisibleTemplates).map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onOpenTemplate={handleOpenTemplateProject}
                    />
                  ))}
                </div>
              </section>

              {/* Recent Projects Section */}
              {filteredAndSortedProjects.length > 0 && (
                <section className="recent-projects-section animate-fade-in-up">
                  <h2 className="section-title">Recent Workflows</h2>

                  {/* Show available projects in list view */}
                  <div className="projects-container list-view">
                    {/* List Header Row */}
                    <div className="project-list-header">
                      <span className="project-col project-icon-header"></span>
                      <span className="project-col project-title-header">Workflow Name</span>
                      <span className="project-col project-date-header">Created</span>
                      <span className="project-col project-date-header">Modified</span>
                      <span className="project-col project-bookmark-header"></span>
                      <span className="project-col project-menu-header"></span>
                    </div>
                    {filteredAndSortedProjects.slice(0, 5).map((project, index) => (
                      <RecentProjectItem
                        key={getProjectKey(project, index, 'recent-')}
                        project={project}
                        index={index}
                        isBookmarked={isBookmarked(project.id)}
                        getProjectKey={getProjectKey}
                        onOpenProject={onOpenProject}
                        onBookmarkToggle={handleBookmarkToggle}
                        onMenuSelect={handleMenuSelect}
                        menuItems={MENU_ITEMS}
                        formatDate={formatDate}
                        formatDateForListCell={formatDateForListCell}
                      />
                    ))}
                  </div>

                  {/* If projects are more than 5, then show the button to navigate to the My Workflow Section */}
                  {filteredAndSortedProjects.length > 5 && (
                    <div className="show-more-container">
                      <ButtonComponent
                        className="show-more-btn e-flat"
                        iconCss='e-icons e-arrow-right'
                        iconPosition='right'
                        onClick={() => {
                          setActiveSection('workflows');
                        }}
                      >
                        Show all workflows 
                      </ButtonComponent>
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {/* MY WORKFLOWS SECTION */}
          {activeSection === 'workflows' && (
            <section className="workflows-section animate-fade-in-up">
              <div className="section-header">
                <div className="section-title-group">
                  <h2 className="section-title">My Workflows</h2>
                  {filteredAndSortedProjects.length > 0 && (
                    <span className="projects-count">
                      {filteredAndSortedProjects.length} project{filteredAndSortedProjects.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {/* Project Managing Tools */}
                {projects.length > 0 && (
                <div className="tools-row">
                  {/* Search Box */}
                  <TextBoxComponent
                    ref={searchRef}
                    placeholder="Search Workflows"
                    value={searchTerm}
                    input={arg => setSearchTerm(arg.value)}
                    cssClass="project-search"
                    created={handleSearchCreated}
                  />
                  {/* Sort Dropdown */}
                  <DropDownButtonComponent
                    items={SORT_OPTIONS}
                    select={handleSortSelect}
                    cssClass="sort-dropdown-btn e-secondary"
                    popupWidth={150}
                  >
                    {sortText}
                  </DropDownButtonComponent>

                  {/* Bookmark filter toggle */}
                  <TooltipComponent position='TopCenter' content={showBookmarkedOnly ? 'Show All' : 'Show Bookmarked Only'}>
                    <ButtonComponent
                      cssClass={`view-toggle-btn e-secondary ${showBookmarkedOnly ? 'active' : ''}`}
                      iconCss="e-icons e-star-filled"
                      onClick={() => setShowBookmarkedOnly(prev => !prev)}
                    />
                  </TooltipComponent>

                  {/* Multiple Projects Export and Delete Button */}
                  {viewMode === 'list' && selectedProjects.length > 0 && (
                    <>
                      <TooltipComponent content="Export Selected">
                        <ButtonComponent
                          cssClass="e-secondary view-toggle-btn"
                          iconCss="e-icons e-export"
                          onClick={handleExportSelected}
                        />
                      </TooltipComponent>
                      <TooltipComponent content="Delete Selected">
                        <ButtonComponent
                          cssClass="e-secondary view-toggle-btn"
                          iconCss="e-icons e-trash"
                          onClick={handleDeleteSelected}
                        />
                      </TooltipComponent>
                    </>
                  )}
                  {/* Project View Mode - List/Card*/}
                  <TooltipComponent content="Card View">
                    <ButtonComponent
                      cssClass={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
                      onClick={() => setViewMode('card')}
                      iconCss="e-icons e-grid-view"
                    />
                  </TooltipComponent>
                  <TooltipComponent content={"List View"}>
                    <ButtonComponent
                      cssClass={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                      onClick={() => setViewMode('list')}
                      iconCss="e-icons e-list-unordered"
                      title="List View"
                    />
                  </TooltipComponent>
                </div>
                )}
              </div>

              {/* Displaying an empty state when there are No workflowprojects */}
              {filteredAndSortedProjects.length === 0 ? (
                // If no workflows exist at all, show create new; otherwise show "no results"
                projects.length === 0 ? (
                  <EmptyState type="empty" onCreateNew={onCreateNew} />
                ) : (
                  <EmptyState type="search" />
                )
              ) : (
                // Display the projects
                <div className={`projects-container ${viewMode === 'list' ? 'list-view' : 'card-view'} ${selectedProjects.length > 0 ? 'selection-active' : ''}`}>
                  {/* List view with multi select functionality */}
                  {viewMode === 'list' ? (
                    <>
                      {/* Table header row */}
                      <div className="project-list-header">
                        <span className="project-col project-icon-header">
                          <CheckBoxComponent
                            cssClass="project-select-all-checkbox"
                            checked={selectedProjects.length === filteredAndSortedProjects.length && filteredAndSortedProjects.length > 0}
                            indeterminate={selectedProjects.length > 0 && selectedProjects.length < filteredAndSortedProjects.length}
                            change={(e: CheckBoxChangeEventArgs) => handleSelectAll(e.checked as boolean)}
                          />
                        </span>
                        <span className="project-col project-title-header">Workflow Name</span>
                        <span className="project-col project-date-header">Created</span>
                        <span className="project-col project-date-header">Modified</span>
                        <span className="project-col project-bookmark-header"></span>
                        <span className="project-col project-menu-header"></span>
                      </div>
                      {filteredAndSortedProjects.map((project, index) => (
                        <ProjectListItem
                          key={getProjectKey(project, index, 'list-')}
                          project={project}
                          index={index}
                          isSelected={selectedProjects.includes(project.id)}
                          isBookmarked={isBookmarked(project.id)}
                          getProjectKey={getProjectKey}
                          onOpenProject={onOpenProject}
                          onToggleSelect={handleMultiSelectToggle}
                          onBookmarkToggle={handleBookmarkToggle}
                          onMenuSelect={handleMenuSelect}
                          menuItems={MENU_ITEMS}
                          formatDate={formatDate}
                          formatDateForListCell={formatDateForListCell}
                        />
                      ))}
                    </>
                  ) : (
                    filteredAndSortedProjects.map((project, index) => (
                      <ProjectCard
                        key={getProjectKey(project, index, 'card-')}
                        project={project}
                        isBookmarked={isBookmarked(project.id)}
                        onOpenProject={onOpenProject}
                        onBookmarkToggle={handleBookmarkToggle}
                        onMenuSelect={handleMenuSelect}
                        menuItems={MENU_ITEMS}
                      />
                    ))
                  )}
                </div>
              )}
            </section>
          )}

          {/* TEMPLATES SECTION */}
          {activeSection === 'templates' && (
            <section className="animate-fade-in-up">
              <h2 className="section-title">Templates</h2>
              <div className="quick-access-grid">
                {availableTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onOpenTemplate={handleOpenTemplateProject}
                    />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* FILE DELETE CONFIRMATION DIALOG */}
        <ConfirmationDialog
          isOpen={!!projectToDelete || isMultiDeleteConfirmOpen}
          onClose={handleCloseDeleteDialog}
          onConfirm={handleConfirmDelete}
          content={
            isMultiDeleteConfirmOpen
              ? `Are you sure you want to delete ${projectsToDelete.length} selected project(s)? This action cannot be undone.`
              : `Are you sure you want to delete ${projectToDelete?.name ? `"${projectToDelete?.name}"` : 'this item'}? This action cannot be undone.`
          }
        />
      </main>
    </div>
  );
};

export default Home;