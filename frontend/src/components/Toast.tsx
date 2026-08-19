import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { clsx } from 'clsx'
import { useToastStore, Toast as ToastType } from '../stores/useToastStore'

function ToastItem({ toast }: { toast: ToastType }) {
  const { removeToast } = useToastStore()

  const styles = {
    success: {
      container: 'border-green-500/30 bg-green-500/10',
      icon: 'text-green-400',
      text: 'text-green-100',
    },
    error: {
      container: 'border-red-500/30 bg-red-500/10',
      icon: 'text-red-400',
      text: 'text-red-100',
    },
    info: {
      container: 'border-blue-500/30 bg-blue-500/10',
      icon: 'text-blue-400',
      text: 'text-blue-100',
    },
  }

  const s = styles[toast.type]
  const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? AlertCircle : Info

  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm animate-slide-up',
        'glass min-w-[280px] max-w-[380px]',
        s.container
      )}
    >
      <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', s.icon)} />
      <p className={clsx('text-sm leading-relaxed', s.text)}>{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="ml-auto shrink-0 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function Toast() {
  const { toasts } = useToastStore()

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
