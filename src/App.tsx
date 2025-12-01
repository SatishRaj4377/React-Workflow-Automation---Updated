import React, { useEffect, useMemo, useState } from 'react';
import { enableRipple } from '@syncfusion/ej2-base';
import { ProjectData } from './types';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import Home from './components/Home';
import Editor from './components/Editor';
import WorkflowProjectService from './services/WorkflowProjectService';

import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useNavigate,
  useParams,
  useLocation,
  useOutletContext,
} from 'react-router-dom';

import './App.css';

// Enable Syncfusion ripple
enableRipple(true);

type AppOutletContext = {
  projects: ProjectData[];
  handleCreateNew: () => void;
  handleOpenProject: (project: ProjectData) => void;
  handleDeleteProject: (projectId: string) => void;
  handleMultipleDeleteProjects: (projectIds: string[]) => void;
  handleBookmarkToggle: (projectId: string) => void;
  handleSaveProject: (updatedProject: ProjectData) => void;
};

const AppContent: React.FC = () => {
  const { theme } = useTheme();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const navigate = useNavigate();

  const refreshProjects = () => {
    setProjects(WorkflowProjectService.getSortedProjects());
  };

  // Load projects on mount
  useEffect(refreshProjects, []);

  const handleCreateNew = () => {
    const newProject = WorkflowProjectService.createBlankProject();
    navigate(`/workflow/${newProject.id}`, { state: { newProject } });
  };

  const handleDeleteProject = (projectId: string) => {
    WorkflowProjectService.deleteProject(projectId);
    refreshProjects();
  };

  const handleMultipleDeleteProjects = (projectIds: string[]) => {
    WorkflowProjectService.deleteMultipleProjects(projectIds);
    refreshProjects();
  };

  const handleSaveProject = (updated: ProjectData) => {
    WorkflowProjectService.saveProject(updated);
    refreshProjects();
  };

  const handleBookmarkToggle = (projectId: string) => {
    WorkflowProjectService.toggleBookmark(projectId);
    refreshProjects();
  };

  const handleOpenProject = (project: ProjectData) => {
    navigate(`/workflow/${project.id}`);
  };

  return (
    <div className="app-container" data-theme={theme}>
      <Outlet
        context={{
          projects,
          handleCreateNew,
          handleOpenProject,
          handleDeleteProject,
          handleMultipleDeleteProjects,
          handleBookmarkToggle,
          handleSaveProject,
        } satisfies AppOutletContext}
      />
    </div>
  );
};

function useAppOutlet() {
  return useOutletContext<AppOutletContext>();
}

// Home route wrapper
const HomeRoute: React.FC = () => {
  const {
    projects,
    handleCreateNew,
    handleOpenProject,
    handleDeleteProject,
    handleMultipleDeleteProjects,
    handleBookmarkToggle,
    handleSaveProject
  } = useAppOutlet();

  return (
    <Home
      projects={projects}
      onCreateNew={handleCreateNew}
      onOpenProject={handleOpenProject}
      onDeleteProject={handleDeleteProject}
      onMultipleDeleteProjects={handleMultipleDeleteProjects}
      onBookmarkToggle={handleBookmarkToggle}
      onSaveProject={handleSaveProject}
    />
  );
};

// Editor route wrapper
const EditorRoute: React.FC = () => {
  const { projects, handleSaveProject } = useAppOutlet();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const project =
    projects.find((p) => p.id === id) ?? (location.state as any)?.newProject;

  if (!project) {
    return <Navigate to="/" replace />;
  }

  return (
    <Editor
      project={project}
      onSaveProject={handleSaveProject}
      onBackToHome={() => navigate('/', { replace: true })}
    />
  );
};

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppContent />,
    errorElement: <div style={{ padding: 16 }}>Something went wrong. Please try again.</div>,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'workflow/:id', element: <EditorRoute /> },
      { path: '*', element: <Navigate to="/" /> },
    ],
  },
]);

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
};

export default App;