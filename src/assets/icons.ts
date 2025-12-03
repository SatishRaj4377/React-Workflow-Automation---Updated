import ChatIcon from '../assets/svg-icons/chat.svg';
import FilterIcon from '../assets/svg-icons/filter.svg';
import HttpRequestIcon from '../assets/svg-icons/http-request.svg';
import IfConditionIcon from '../assets/svg-icons/if-condition.svg';
import SwitchConditionIcon from '../assets/svg-icons/switch-condition.svg';
import FormIcon from '../assets/svg-icons/form.svg';
import ManualClickIcon from '../assets/svg-icons/manual-click.svg';
import EmailJSIcon from '../assets/svg-icons/email-js.svg';
import LoopIcon from '../assets/svg-icons/loop.svg';
import WordIcon from '../assets/svg-icons/word.svg';
import ExcelIcon from '../assets/svg-icons/excel.svg';
import NodeLoader from '../assets/svg-icons/node-loader.svg';
import StopIcon from '../assets/svg-icons/stop.svg';
import BellIcon from '../assets/svg-icons/bell.svg';

// Exported as react components for runtime changes
import {ReactComponent as WorkflowLogo} from '../assets/svg-icons/workflow-logo.svg';
import {ReactComponent as WorkflowFolder} from '../assets/svg-icons/workflow-folder.svg';
import {ReactComponent as WorkflowFolderSearch} from '../assets/svg-icons/workflow-folder-search.svg';
import {ReactComponent as NodeSearch} from '../assets/svg-icons/node-search.svg';
import {ReactComponent as ChevronDown} from '../assets/svg-icons/chevron-down.svg';
import {ReactComponent as Message} from '../assets/svg-icons/message-icon.svg';
import {ReactComponent as LockIcon} from '../assets/svg-icons/lock.svg';

export const IconRegistry: { [key: string]: string | React.ElementType } = {
  WorkflowLogo,
  WorkflowFolder,
  WorkflowFolderSearch,
  NodeSearch,
  ChatIcon,
  FilterIcon,
  WordIcon,
  ExcelIcon,
  HttpRequestIcon,
  IfConditionIcon,
  SwitchConditionIcon,
  FormIcon,
  ManualClickIcon,
  EmailJSIcon,
  LoopIcon,
  NodeLoader,
  StopIcon,
  BellIcon,
  LockIcon,
  ChevronDown,
  Message
};
