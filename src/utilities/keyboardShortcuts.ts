import { ToolbarAction } from '../types';

const normalizeShortcut = (e: KeyboardEvent): string => {
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    let combo = '';
    if (ctrl) combo += 'ctrl+';
    if (shift) combo += 'shift+';
    combo += key;
    return combo;
};

type ShortcutContext = {
    onAction: (action: ToolbarAction) => void;
    isExecuting: boolean;
    isDirty: boolean;
    handleSave: () => Promise<void>;
    showSuccessToast: (title: string, message: string) => void;
};

const performShortcutAction = async (e: KeyboardEvent, shortcut: string, ctx: ShortcutContext): Promise<boolean> => {
    const { onAction, isExecuting, isDirty, handleSave, showSuccessToast } = ctx;
    switch (shortcut) {
        case 'tab':
            onAction('addNode');
            return true;
        case 'shift+s':
            onAction('addSticky');
            return true;
        case 'shift+a':
            onAction('autoAlign');
            return true;
        case 'ctrl+0':
            onAction('resetZoom');
            return true;
        case 'ctrl+1':
            onAction('fitToPage');
            return true;
        case 'ctrl+s':
            e.preventDefault();
            if (isDirty) {
                await handleSave();
            } else {
                showSuccessToast('No Changes', 'Workflow is already saved.');
            }
            return true;
        case 'ctrl+enter':
            if (isExecuting) {
                onAction('cancel');
            } else {
                if (isDirty) {
                    try { await handleSave(); } catch { }
                }
                onAction('execute');
            }
            return true;
        default:
            return false;
    }
};

export const handleEditorKeyDown = async (
    e: KeyboardEvent,
    onAction: (action: ToolbarAction) => void,
    isExecuting: boolean,
    isDirty: boolean,
    handleSave: () => Promise<void>,
    showSuccessToast: (title: string, message: string) => void
) => {
    // Prevent shortcuts firing if inside a text input
    const target = e.target as HTMLElement;
    if (target.matches('input, textarea, [contenteditable="true"]')) {
        return;
    }
    
    const shortcut = normalizeShortcut(e);

    const handled = await performShortcutAction(e, shortcut, {
        onAction,
        isExecuting,
        isDirty,
        handleSave,
        showSuccessToast,
    });

    if (handled) {
        e.preventDefault();
        e.stopPropagation();
    }
};
