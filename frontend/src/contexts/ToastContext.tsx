import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CircleCheck, CircleX } from 'lucide-react'
import './Toast.css'

export type ToastVariant = 'success' | 'error'

export interface ToastContent {
  title: string
  description?: string
}

export interface ToastOptions {
  variant: ToastVariant
  duration?: number
}

interface Toast extends ToastContent {
  id: number
  variant: ToastVariant
  duration: number
}

interface ToastContextValue {
  showToast: (content: ToastContent | string, options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 3

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 5500,
  error: 5000,
}

function normalizeContent(content: ToastContent | string): ToastContent {
  if (typeof content === 'string') {
    return { title: content }
  }
  return content
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return <CircleCheck className="toast-icon toast-icon--success" size={20} strokeWidth={2} aria-hidden="true" />
  }
  return <CircleX className="toast-icon toast-icon--error" size={20} strokeWidth={2} aria-hidden="true" />
}

function ToastItem({
  toast,
  removeToast,
}: {
  toast: Toast
  removeToast: (id: number) => void
}) {
  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), toast.duration)
    return () => clearTimeout(timer)
  }, [removeToast, toast.duration, toast.id])

  return (
    <div className={`toast toast--${toast.variant}`} role="status">
      <ToastIcon variant={toast.variant} />
      <div className="toast-body">
        <p className="toast-title">{toast.title}</p>
        {toast.description && <p className="toast-description">{toast.description}</p>}
      </div>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextIdRef = useRef(0)

  const showToast = useCallback((content: ToastContent | string, options: ToastOptions) => {
    const normalized = normalizeContent(content)
    const duration = options.duration ?? DEFAULT_DURATION[options.variant]
    nextIdRef.current += 1

    setToasts((prev) => {
      const next: Toast[] = [
        ...prev,
        {
          id: nextIdRef.current,
          ...normalized,
          variant: options.variant,
          duration,
        },
      ]
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next
    })
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
