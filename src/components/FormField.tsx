import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface BaseProps {
  label: string
  error?: string
  required?: boolean
  children?: ReactNode
}

interface InputFieldProps extends BaseProps {
  type?: 'text' | 'number' | 'email' | 'tel' | 'date' | 'password'
  inputProps: InputHTMLAttributes<HTMLInputElement>
}

interface SelectFieldProps extends BaseProps {
  selectProps: SelectHTMLAttributes<HTMLSelectElement>
}

interface TextareaFieldProps extends BaseProps {
  textareaProps: TextareaHTMLAttributes<HTMLTextAreaElement>
}

type FormFieldProps = InputFieldProps | SelectFieldProps | TextareaFieldProps

function isSelectField(props: FormFieldProps): props is SelectFieldProps {
  return 'selectProps' in props
}

function isTextareaField(props: FormFieldProps): props is TextareaFieldProps {
  return 'textareaProps' in props
}

export default function FormField(props: FormFieldProps) {
  const { label, error, required, children } = props

  return (
    <label className={error ? 'form-field-error' : ''}>
      {label}{required ? ' *' : ''}
      {isSelectField(props) ? (
        <select {...props.selectProps} aria-invalid={!!error}>
          {children}
        </select>
      ) : isTextareaField(props) ? (
        <textarea {...props.textareaProps} aria-invalid={!!error} />
      ) : (
        <input type={props.type ?? 'text'} {...props.inputProps} aria-invalid={!!error} />
      )}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  )
}
