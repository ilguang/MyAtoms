/**
 * 基础 UI 元素：按钮、输入框、Logo。
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-[#141210] hover:brightness-110',
  ghost: 'text-muted hover:text-white hover:bg-surface-2',
  outline: 'border border-line text-white hover:border-accent hover:text-accent',
  danger: 'border border-line text-danger hover:border-danger',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-all duration-150',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Field({ label, className, id, ...rest }: FieldProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'h-11 w-full rounded-[10px] border border-line bg-surface-2 px-3.5 text-sm text-white',
          'placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none',
          className,
        )}
        {...rest}
      />
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-accent font-mono text-[13px] font-bold text-[#141210]">
        A
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-white">
        Atoms<span className="text-accent"> Demo</span>
      </span>
    </span>
  )
}