import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { Draggable } from '@syncfusion/ej2-base';
import { ensurePortalRoot } from '../../utilities/variablePickerUtils';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DatePickerComponent, TimePickerComponent } from '@syncfusion/ej2-react-calendars';
import './FormPopup.css';

export type FormField = {
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'password'
    | 'email'
    | 'dropdown'
    | 'date'
    | 'time';
  placeholder?: string;
  required?: boolean;
  options?: string[];
};

interface FormPopupProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fields: FormField[];
  onSubmit?: (payload: { values: string[]; fields: FormField[] }) => void;
  showPreviewBadge?: boolean; // text is generic ("Form")
}

const emptyValFor = () => '';

const FormPopup: React.FC<FormPopupProps> = ({
  open,
  onClose,
  title,
  description,
  fields,
  onSubmit: onSubmitExternal,
  showPreviewBadge,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const popupHeightRef = useRef('0px');
  const dragRef = useRef<Draggable | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [errors, setErrors] = useState<string[]>(fields.map(() => ''));
  const [submitted, setSubmitted] = useState(false);
  
  const initialValues = useMemo(() => fields.map(() => emptyValFor()), [fields]);
  const [values, setValues] = useState<string[]>(initialValues);

  // Reset when fields change or popup reopens
  useEffect(() => {
    if (open) {
      setValues(fields.map(() => emptyValFor()));
      setErrors(fields.map(() => ''));
      setSubmitted(false);
    }
  }, [open, fields]);

  // Enable dragging for the popup
  useEffect(() => {
    if (!open || !popupRef.current) return;
    const el = popupRef.current;
    dragRef.current = new Draggable(el, {
      clone: false,
      handle: '.form-popup-header',
      dragArea: '.editor-container',
    });
    return () => {
      (dragRef.current as any)?.destroy?.();
      dragRef.current = null;
    };
  }, [open]);

  const toggleMinimize = () => {
    if (!popupRef.current) return;
    if (popupRef.current.style.height === '0px') {
      popupRef.current.style.height = popupHeightRef.current; // restore
      setIsMinimized(false);
    } else {
      popupHeightRef.current =
        popupRef.current.style.height ||
        `${popupRef.current.getBoundingClientRect().height}px`;
      popupRef.current.style.height = '0px';
      setIsMinimized(true);
    }
  };

  if (!open) return null;

  // ---------- Custom validation (no EJ2 FormValidator) ----------
  const setFieldError = (i: number, msg: string) => {
    setErrors(prev => {
      const next = prev.slice();
      next[i] = msg;
      return next;
    });
  };

  const validateForm = (): string[] => {
    const requiredMsg = 'This field is required';
    const emailMsg = 'Please enter a valid email';

    const nextErrors = fields.map((f, i) => {
      const v = (values[i] ?? '').trim();

      // Required rule for all types (including date & time)
      if (f.required && !v) return requiredMsg;

      // Basic email format rule
      if (f.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return emailMsg;
      }

      return '';
    });

    setErrors(nextErrors);
    return nextErrors;
  };

  const onInputChange = (idx: number, val: string) => {
    const next = values.slice();
    next[idx] = val;
    setValues(next);

    // Optimistically clear error when user provides a value
    if (val && errors[idx]) setFieldError(idx, '');
  };

  const renderField = (f: FormField, idx: number) => {
    const id = `form-field-${idx}`;
    const name = `field_${f.type}_${idx}`; // kept for consistency; not required for custom validation

    switch (f.type) {
      case 'textarea':
        return (
          <textarea
            id={id}
            name={name}
            placeholder={f.placeholder ?? ''}
            value={values[idx] ?? ''}
            onChange={(e: any) => onInputChange(idx, e?.target?.value ?? '')}
            className={`form-control${errors[idx] ? ' invalid' : ''}`}
            rows={3}
          />
        );
      case 'number':
        return (
          <input
            id={id}
            name={name}
            placeholder={f.placeholder ?? ''}
            value={values[idx] ?? ''}
            onChange={(e: any) => onInputChange(idx, e?.target?.value ?? '')}
            className={`form-control${errors[idx] ? ' invalid' : ''}`}
            type="number"
          />
        );
      case 'password':
        return (
          <input
            id={id}
            name={name}
            placeholder={f.placeholder ?? ''}
            value={values[idx] ?? ''}
            onChange={(e: any) => onInputChange(idx, e?.target?.value ?? '')}
            className={`form-control${errors[idx] ? ' invalid' : ''}`}
            type="password"
          />
        );
      case 'email':
        return (
          <input
            id={id}
            name={name}
            placeholder={f.placeholder ?? ''}
            value={values[idx] ?? ''}
            onChange={(e: any) => onInputChange(idx, e?.target?.value ?? '')}
            className={`form-control${errors[idx] ? ' invalid' : ''}`}
            type="email"
          />
        );
      case 'dropdown':
        return (
          <select
            id={id}
            name={name}
            value={values[idx] ?? ''}
            onChange={(e: any) => onInputChange(idx, e?.target?.value ?? '')}
            className={`form-control${errors[idx] ? ' invalid' : ''}`}
          >
            <option value="" disabled hidden>
              Select...
            </option>
            {(f.options ?? []).map((opt, i) => (
              <option key={i} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      case 'date':
        return (
          <>
            <DatePickerComponent
              id={id}
              cssClass={errors[idx] ? 'invalid' : ''}
              value={values[idx] ? new Date(values[idx]) : undefined}
              change={(e: any) =>
                onInputChange(idx, e?.value ? new Date(e.value).toISOString() : '')
              }
              placeholder={f.placeholder ?? ''}
            />
          </>
        );
      case 'time':
        return (
          <>
            <TimePickerComponent
              id={id}
              cssClass={errors[idx] ? 'invalid' : ''}
              value={values[idx] ? new Date(`2000-01-01T${values[idx]}`) : undefined}
              change={(e: any) => {
                const d: Date | null = e?.value ?? null;
                const hh = d ? String(d.getHours()).padStart(2, '0') : '';
                const mm = d ? String(d.getMinutes()).padStart(2, '0') : '';
                onInputChange(idx, d ? `${hh}:${mm}` : '');
              }}
              placeholder={f.placeholder ?? ''}
            />
          </>
        );
      default:
        return (
          <input
            id={id}
            name={name}
            placeholder={f.placeholder ?? ''}
            value={values[idx] ?? ''}
            onChange={(e: any) => onInputChange(idx, e?.target?.value ?? '')}
            className={`form-control${errors[idx] ? ' invalid' : ''}`}
            type="text"
          />
        );
    }
  };

  const onSubmit = (e?: any) => {
    e?.preventDefault?.();
    const nextErrors = validateForm();
    const ok = nextErrors.every(m => !m);

    if (!ok) {
      // Focus first invalid field
      const firstIdx = nextErrors.findIndex(m => !!m);
      const el = document.getElementById(`form-field-${firstIdx}`) as HTMLElement | null;
      el?.focus?.();
      return;
    }

    onSubmitExternal?.({ values, fields });
    setSubmitted(true);
  };

  return createPortal(
    <div ref={popupRef} className="form-popup">
      <div className="form-popup-header">
        <div className="badge">{showPreviewBadge ? 'Preview Form' : 'Form'}</div>
        <div className="spacer" />
        <ButtonComponent
          className="icon-btn"
          title={isMinimized ? 'Maximize' : 'Minimize'}
          iconCss={isMinimized ? 'e-icons e-expand' : 'e-icons e-collapse-2'}
          onClick={toggleMinimize}
        />
        <ButtonComponent className="icon-btn" iconCss="e-icons e-close" onClick={onClose} />
      </div>

      <div className="form-popup-body">
        {(title || description) && (
          <div className="form-intro">
            {title && <h3 className="form-title centered">{title}</h3>}
            {description && <div className="form-description centered">{description}</div>}
          </div>
        )}

        {!submitted ? (
          <form ref={formRef} className="form-body" onSubmit={onSubmit} noValidate>
            {fields.map((f, i) => (
              <div key={i} className="form-group">
                {f.label && (
                  <label className="form-label">
                    {f.label}
                    {f.required && <span className="req">*</span>}
                  </label>
                )}
                {renderField(f, i)}
                {errors[i] && <div className="error-text">{errors[i]}</div>}
              </div>
            ))}

            <div className="actions">
              <ButtonComponent cssClass="submit-btn" type="submit">
                Submit
              </ButtonComponent>
            </div>
          </form>
        ) : (
          <div className="submitted">Form submitted successfully.</div>
        )}
      </div>
    </div>,
    ensurePortalRoot()
  );
};

export default FormPopup;

// ---------------------------------------------
// Global host initializer
// ---------------------------------------------
let __formPopupRoot: Root | null = null;
let __formPopupInitialized = false;

export function ensureGlobalFormPopupHost() {
  if (__formPopupInitialized) return;
  __formPopupInitialized = true;

  const container = ensurePortalRoot();
  if (!__formPopupRoot) {
    __formPopupRoot = createRoot(container);
  }

  const Host: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState<string | undefined>('');
    const [fields, setFields] = useState<FormField[]>([]);

    useEffect(() => {
      const onOpen = (e: Event) => {
        const ce = e as CustomEvent<{ title?: string; description?: string; fields?: FormField[] }>;
        setTitle(ce.detail?.title || 'Form');
        setDescription(ce.detail?.description || '');
        setFields(Array.isArray(ce.detail?.fields) ? (ce.detail!.fields! as FormField[]) : []);
        setOpen(true);
      };
      const onClear = () => setOpen(false);

      window.addEventListener('wf:form:open', onOpen as EventListener);
      window.addEventListener('wf:trigger:clear', onClear as EventListener);
      window.addEventListener('wf:trigger:resumed', onClear as EventListener);

      return () => {
        window.removeEventListener('wf:form:open', onOpen as EventListener);
        window.removeEventListener('wf:trigger:clear', onClear as EventListener);
        window.removeEventListener('wf:trigger:resumed', onClear as EventListener);
      };
    }, []);

    const handleClose = () => {
      setOpen(false);
      window.dispatchEvent(new CustomEvent('wf:form:cancel'));
    };

    const handleSubmit = (payload: { values: string[]; fields: FormField[] }) => {
      window.dispatchEvent(
        new CustomEvent('wf:form:submitted', {
          detail: { values: payload.values, at: new Date().toISOString() },
        })
      );
      setOpen(false);
    };

    return (
      <FormPopup
        open={open}
        onClose={handleClose}
        title={title}
        description={description}
        fields={fields}
        onSubmit={handleSubmit}
        showPreviewBadge={false}
      />
    );
  };

  __formPopupRoot.render(<Host />);
}
