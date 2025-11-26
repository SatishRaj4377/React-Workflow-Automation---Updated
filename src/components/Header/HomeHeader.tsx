import { AppBarComponent } from '@syncfusion/ej2-react-navigations';
import { IconRegistry } from '../../assets/icons';
import { useTheme } from '../../contexts/ThemeContext';
import { TooltipComponent } from '@syncfusion/ej2-react-popups';
import { SwitchComponent } from '@syncfusion/ej2-react-buttons';
import './Header.css';

const HomeHeader: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const WorkflowLogoIcon = IconRegistry['WorkflowLogo']; 
  return (
      <AppBarComponent colorMode="Light" className="home-appbar">
        <div className="appbar-left">
          <span className="header-logo">
            <WorkflowLogoIcon className="svg-icon"/>
          </span>
          <span className="header-title">Workflow Automation</span>
        </div>
        
        <div className="appbar-right">
          <TooltipComponent content={`Toggle to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <SwitchComponent
              checked={theme === 'dark'}
              change={() => toggleTheme()}
              cssClass={`theme-toggle-switch ${theme}`}
              />
          </TooltipComponent>
        </div>
      </AppBarComponent>
  );
};

export default HomeHeader;