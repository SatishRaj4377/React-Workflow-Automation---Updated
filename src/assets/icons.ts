import ChatIcon from '../assets/images/svg-icons/chat.svg';
import FilterIcon from '../assets/images/svg-icons/filter.svg';
import HttpRequestIcon from '../assets/images/svg-icons/http-request.svg';
import IfConditionIcon from '../assets/images/svg-icons/if-condition.svg';
import SwitchConditionIcon from '../assets/images/svg-icons/switch-condition.svg';
import FormIcon from '../assets/images/svg-icons/form.svg';
import ManualClickIcon from '../assets/images/svg-icons/manual-click.svg';
import EmailJSIcon from '../assets/images/svg-icons/email-js.svg';
import LoopIcon from '../assets/images/svg-icons/loop.svg';
import WordIcon from '../assets/images/svg-icons/word.svg';
import ExcelIcon from '../assets/images/svg-icons/excel.svg';
import NodeLoader from '../assets/images/svg-icons/node-loader.svg';
import StopIcon from '../assets/images/svg-icons/stop.svg';
import BellIcon from '../assets/images/svg-icons/bell.svg';

import DefaultImage from '../assets/images/template-images/default-image.jpg';
import GithubTemplateImage from '../assets/images/template-images/auto-notify-github-issues.png';
import UseCaseGeneratorImage from '../assets/images/template-images/component-usecase-generator.png';
import WorklogTrackerImage from '../assets/images/template-images/daily-worklog-tracker.png';
import FormSubmissionPriorityImage from '../assets/images/template-images/user-form-submission-priority.png';
import HRPolicyAssistantImage from '../assets/images/template-images/hr-policy-assistant.png';
import OfferLetterGeneratorImage from '../assets/images/template-images/offer-letter-generator.png';
import PatientAppointmentImage from '../assets/images/template-images/patient-appointment.png';
import WikipediaArticleSummarizerImage from '../assets/images/template-images/wikipedia-article-summarizer.png';
import IssueSubmissionImage from '../assets/images/template-images/issue-submission.png';

import {ReactComponent as WorkflowLogo} from '../assets/images/svg-icons/workflow-logo.svg';
import {ReactComponent as WorkflowFolder} from '../assets/images/svg-icons/workflow-folder.svg';
import {ReactComponent as WorkflowFolderSearch} from '../assets/images/svg-icons/workflow-folder-search.svg';
import {ReactComponent as NodeSearch} from '../assets/images/svg-icons/node-search.svg';
import {ReactComponent as ChevronDown} from '../assets/images/svg-icons/chevron-down.svg';
import {ReactComponent as Message} from '../assets/images/svg-icons/message-icon.svg';

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
  ChevronDown,
  Message
};

export const templateImages = {
  DefaultImageImage: DefaultImage,
  HRPolicyAssistantImage,
  GithubTemplateImage,
  UseCaseGeneratorImage,
  WorklogTrackerImage,
  FormSubmissionPriorityImage,
  OfferLetterGeneratorImage,
  PatientAppointmentImage,
  WikipediaArticleSummarizerImage,
  IssueSubmissionImage
};