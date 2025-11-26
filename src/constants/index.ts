import { ItemModel } from "@syncfusion/ej2-react-splitbuttons";
import { templateImages } from "../assets/icons";
import { ConditionComparator, ConditionValueKind, NodeType, TemplateProjectConfig } from "../types";

export const NODE_MENU = ['editNode', 'delete'];
export const DIAGRAM_MENU = ['addNode', 'addSticky', 'lockWorkflow', 'selectAll', 'autoAlign'];

export const GRID_STYLE_OPTIONS = [
    { text: 'Lines', value: 'lines' },
    { text: 'Dotted', value: 'dotted' },
    { text: 'None', value: 'none' }
];

export const CONNECTOR_STYLE_OPTIONS = [
    { text: 'Orthogonal', value: 'Orthogonal' },
    { text: 'Bezier', value: 'Bezier' },
    { text: 'Straight', value: 'Straight' }
];

export const SETTINGS_DROPDOWN_ITEMS: ItemModel[] = [
    { text: 'Import', iconCss: 'e-icons e-import' },
    { text: 'Export', iconCss: 'e-icons e-export' },
    { separator: true },
    { text: 'Settings', iconCss: 'e-icons e-settings' },
];

export const SORT_OPTIONS = [
    { text: 'Last Modified', id: 'lastModified' },
    { text: 'Last Created', id: 'created' },
    { text: 'Name (A-Z)', id: 'nameAsc' },
    { text: 'Name (Z-A)', id: 'nameDesc' },
    { text: 'Bookmarked', id: 'bookmarked' }
];

export const SIDEBAR_ITEMS = [
    { text: "Dashboard", id: "dashboard", icon: "e-icons e-home" },
    { text: "My Workflows", id: "workflows", icon: "e-icons e-folder" },
    { text: "Templates", id: "templates", icon: "e-icons e-landscape" },
    { text: "Documentation", id: "docs", icon: "e-icons e-file-document" }
];

export const TEMPLATE_PROJECTS: TemplateProjectConfig[] = [
    {
        id: 'offer-letter-generator',
        title: 'Automated Offer Letter Generator Workflow',
        description: 'Template for preparing and delivering professional offer letters.',
        image: templateImages.OfferLetterGeneratorImage,
    },
    {
        id: 'patient-appointment',
        title: 'Patient Appointment Automation Workflow',
        description: 'Template for managing patient appointment bookings.',
        image: templateImages.PatientAppointmentImage,
    },
    {
        id: 'wikipedia-article-summarizer',
        title: 'Wikipedia Article Summarizer & Report Generator',
        description: 'Template for fetching Wikipedia article summaries and generating a Word report.',
        image: templateImages.WikipediaArticleSummarizerImage,
    },
    {
        id: 'issue-submission-priortization',
        title: 'Issue Submission & Prioritization Workflow',
        description: 'Template for capturing product issues and handling them based on priority.',
        image: templateImages.IssueSubmissionImage,
    },
    {
        id: 'worklog-status-check',
        title: 'Daily Worklog Status Check & Alert System',
        description: 'Template for tracking worklogs and sending notifications.',
        image: templateImages.WorklogTrackerImage,
    }
];

export const MENU_ITEMS = [
    { text: 'Edit', iconCss: 'e-icons e-edit' },
    { text: 'Export Project', iconCss: 'e-icons e-export' },
    { text: 'Delete', iconCss: 'e-icons e-trash' }
];

export const NODE_DIMENSIONS = {
  DEFAULT: {
    WIDTH: 80,
    HEIGHT: 80
  },
  AI_AGENT: {
    WIDTH: 160,
    HEIGHT: 80
  },
  STICKY_NOTE: {
    WIDTH: 200,
    HEIGHT: 120,
    MIN_WIDTH: 160,
    MIN_HEIGHT: 80
  }
};

export const PORT_POSITIONS = {
    TOP: { x: 0.5, y: 0 },
    LEFT: { x: -0.04, y: 0.5 }, // Slight left offset to improve connector link visibility
    AI_AGENT_LEFT: { x: -0.02, y: 0.5 }, // Slight left offset to improve connector link visibility
    RIGHT: { x: 1, y: 0.5 },
    RIGHT_TOP: { x: 1, y: 0.3 },
    RIGHT_BOTTOM: { x: 1, y: 0.7 },
    BOTTOM_LEFT: { x: 0.58, y: 1 },
    BOTTOM_MIDDLE: { x: 0.5, y: 1 },
    BOTTOM_RIGHT: { x: 0.85, y: 1 },
};

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
export const AUTH_NODE_TYPES: NodeType[] = [
  'Gmail',
  'Gmail Tool',
  'Google Sheets',
  'Google Sheets Tool',
  'Google Calendar',
  'Google Docs',
  'Telegram',
  'Twilio',
  'Azure Chat Model Tool',
  'EmailJS',
  'EmailJS Tool',
];

// ---- operator sets by kind (includes Exists / Doesn't exist everywhere)
export const STRING_COMPARATORS: ConditionComparator[] = [
  'exists', 'does not exist',
  'is empty', 'is not empty',
  'is equal to', 'is not equal to',
  'contains', 'does not contain',
  'starts with', 'ends with',
  'matches regex',
];

export const NUMBER_COMPARATORS: ConditionComparator[] = [
  'exists', 'does not exist',
  'is equal to', 'is not equal to',
  'greater than', 'greater than or equal to',
  'less than', 'less than or equal to',
  'is between', 'is not between',
];

export const BOOLEAN_COMPARATORS: ConditionComparator[] = [
  'exists', 'does not exist',
  'is true', 'is false',
  'is equal to', 'is not equal to', // keep equality for consistency
];

export const DATE_COMPARATORS: ConditionComparator[] = [
  'exists', 'does not exist',
  'is equal to', 'is not equal to',
  'before', 'after',
  'on or before', 'on or after',
  'is between', 'is not between',
];

// Time uses the same comparator values as Date
export const TIME_COMPARATORS: ConditionComparator[] = [
  'exists', 'does not exist',
  'is equal to', 'is not equal to',
  'before', 'after',
  'on or before', 'on or after',
  'is between', 'is not between',
];

export const ARRAY_COMPARATORS: ConditionComparator[] = [
  'exists', 'does not exist',
  'is empty', 'is not empty',
  'contains value',
  'length greater than', 'length less than',
];

export const OBJECT_COMPARATORS: ConditionComparator[] = [
  'exists', 'does not exist',
  'is empty', 'is not empty',
  'has key', 'has property',
];

export function getComparatorsFor(kind: ConditionValueKind): ConditionComparator[] {
  switch (kind) {
    case 'number': return NUMBER_COMPARATORS;
    case 'boolean': return BOOLEAN_COMPARATORS;
    case 'date': return DATE_COMPARATORS;
    case 'time': return TIME_COMPARATORS;
    case 'array': return ARRAY_COMPARATORS;
    case 'object': return OBJECT_COMPARATORS;
    default: return STRING_COMPARATORS;
  }
}

// ---- UI data for grouped DropDownList (kept compact "most used" ops)
export type OpKind = 'String' | 'Number' | 'Boolean' | 'Date' | 'Time' | 'Array' | 'Object';

export interface OpOption {
  group: OpKind;                 // group header
  text: string;                  // display text
  value: ConditionComparator;           // canonical comparator
  [key: string]: unknown;        // satisfy Syncfusion { [k:string]:Object }[] signature
}

export const OP_OPTIONS: OpOption[] = [
  // String
  { group: 'String', text: 'exists', value: 'exists' },
  { group: 'String', text: 'does not exist', value: 'does not exist' },
  { group: 'String', text: 'is empty', value: 'is empty' },
  { group: 'String', text: 'is not empty', value: 'is not empty' },
  { group: 'String', text: 'is equal to', value: 'is equal to' },
  { group: 'String', text: 'contains', value: 'contains' },
  { group: 'String', text: 'starts with', value: 'starts with' },
  { group: 'String', text: 'matches regex', value: 'matches regex' },

  // Number
  { group: 'Number', text: 'exists', value: 'exists' },
  { group: 'Number', text: 'does not exist', value: 'does not exist' },
  { group: 'Number', text: 'is equal to', value: 'is equal to' },
  { group: 'Number', text: 'greater than', value: 'greater than' },
  { group: 'Number', text: 'less than', value: 'less than' },
  { group: 'Number', text: 'is between', value: 'is between' },

  // Boolean
  { group: 'Boolean', text: 'exists', value: 'exists' },
  { group: 'Boolean', text: 'does not exist', value: 'does not exist' },
  { group: 'Boolean', text: 'is true', value: 'is true' },
  { group: 'Boolean', text: 'is false', value: 'is false' },

  // Date
  { group: 'Date', text: 'exists', value: 'exists' },
  { group: 'Date', text: 'does not exist', value: 'does not exist' },
  { group: 'Date', text: 'before', value: 'before' },
  { group: 'Date', text: 'after', value: 'after' },
  { group: 'Date', text: 'on or before', value: 'on or before' },
  { group: 'Date', text: 'on or after', value: 'on or after' },
  { group: 'Date', text: 'is between', value: 'is between' },

  // Time (uses the same comparator values as Date; parsed as today HH:mm[:ss])
  { group: 'Time', text: 'before', value: 'before' },
  { group: 'Time', text: 'after', value: 'after' },
  { group: 'Time', text: 'on or before', value: 'on or before' },
  { group: 'Time', text: 'on or after', value: 'on or after' },
  { group: 'Time', text: 'is between', value: 'is between' },

  // Array
  { group: 'Array', text: 'exists', value: 'exists' },
  { group: 'Array', text: 'does not exist', value: 'does not exist' },
  { group: 'Array', text: 'is empty', value: 'is empty' },
  { group: 'Array', text: 'is not empty', value: 'is not empty' },
  { group: 'Array', text: 'contains value', value: 'contains value' },

  // Object
  { group: 'Object', text: 'exists', value: 'exists' },
  { group: 'Object', text: 'does not exist', value: 'does not exist' },
  { group: 'Object', text: 'is empty', value: 'is empty' },
  { group: 'Object', text: 'is not empty', value: 'is not empty' },
  { group: 'Object', text: 'has key', value: 'has key' },
];

// Preferred group ordering helper (kept simple & pure)
export function orderByPreferredGroup(all: OpOption[], preferred: OpKind): OpOption[] {
  const first = all.filter(o => o.group === preferred);
  const rest = all.filter(o => o.group !== preferred);
  return [...first, ...rest];
}

// Ops which DO NOT need a right operand (hide value2 line for these)
export const UNARY_COMPARATORS = new Set<ConditionComparator>([
  'exists', 'does not exist',
  'is empty', 'is not empty',
  'is true', 'is false',
]);

export function usesRightOperand(op: ConditionComparator): boolean {
  return !UNARY_COMPARATORS.has(op);
}