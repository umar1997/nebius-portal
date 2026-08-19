import { useState, useEffect } from 'react'
import { X, Copy, Check, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { App, appsApi } from '../lib/api'
import { toast } from '../stores/useToastStore'

const WORKERS = ['worker-0', 'worker-1', 'worker-2', 'worker-3', 'worker-4', 'worker-5', 'worker-6', 'worker-7']
const TYPES: App['type'][] = ['react', 'gradio', 'other']
const TYPE_LABELS = { react: 'React', gradio: 'Gradio', other: 'Other' }

interface AddAppModalProps {
  app?: App | null
  onClose: () => void
  onSave: (app: App) => void
}

interface FormState {
  name: string
  host: string
  port: string
  type: App['type']
  description: string
}

export default function AddAppModal({ app, onClose, onSave }: AddAppModalProps) {
  const isEdit = !!app
  const [form, setForm] = useState<FormState>({
    name: app?.name ?? '',
    host: app?.host ?? 'worker-0',
    port: app?.port?.toString() ?? '',
    type: app?.type ?? 'gradio',
    description: app?.description ?? '',
  })
  const [errors, setErrors] = useState<Partial<FormState>>({})
  const [loading, setLoading] = useState(false)
  const [savedApp, setSavedApp] = useState<App | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const validate = (): boolean => {
    const errs: Partial<FormState> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    const port = parseInt(form.port)
    if (!form.port || isNaN(port) || port < 1 || port > 65535) {
      errs.port = 'Port must be 1–65535'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const payload = {
        name: form.name.trim(),
        host: form.host,
        port: parseInt(form.port),
        type: form.type,
        description: form.description.trim(),
      }

      if (isEdit && app) {
        const res = await appsApi.update(app.id, payload)
        toast.success('Application updated')
        onSave(res.app)
        onClose()
      } else {
        const res = await appsApi.create(payload)
        toast.success('Application added')
        setSavedApp(res.app)
        onSave(res.app)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save application')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const field = (id: keyof FormState) => ({
    id,
    value: form[id],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [id]: e.target.value })),
  })

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative z-50 w-full max-w-md animate-slide-up rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {isEdit ? 'Edit Application' : 'Add Application'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEdit ? 'Update the application details' : 'Register a new GPU app'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success state */}
        {savedApp && !isEdit ? (
          <div className="p-6">
            <div className="rounded-xl border border-green-500/25 bg-green-500/8 p-4">
              <p className="text-sm font-semibold text-green-400">Application added!</p>
              <p className="mt-1 text-xs text-slate-400">
                Set this in your app running on Nebius:
              </p>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2.5 font-mono text-sm text-green-300">
                <code>root_path=&apos;/app/{savedApp.id}&apos;</code>
                <button
                  onClick={() => handleCopy(`root_path='/app/${savedApp.id}'`)}
                  className="ml-2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label="Copy"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                {...field('name')}
                type="text"
                placeholder="My Gradio App"
                className={clsx(
                  'w-full rounded-xl border bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600',
                  'focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all',
                  errors.name ? 'border-red-500/50' : 'border-slate-700'
                )}
              />
              {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
            </div>

            {/* Host + Port */}
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-3">
                <label htmlFor="host" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Worker Node <span className="text-red-400">*</span>
                </label>
                <select
                  id="host"
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all cursor-pointer"
                >
                  {WORKERS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label htmlFor="port" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Port <span className="text-red-400">*</span>
                </label>
                <input
                  {...field('port')}
                  type="number"
                  placeholder="8001"
                  min="1"
                  max="65535"
                  className={clsx(
                    'w-full rounded-xl border bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600',
                    'focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all',
                    errors.port ? 'border-red-500/50' : 'border-slate-700'
                  )}
                />
                {errors.port && <p className="mt-1 text-xs text-red-400">{errors.port}</p>}
              </div>
            </div>

            {/* Type */}
            <div>
              <p className="text-xs font-medium text-slate-300 mb-1.5">
                Type <span className="text-red-400">*</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={clsx(
                      'rounded-xl border py-2 text-xs font-medium transition-all duration-150 cursor-pointer',
                      form.type === t
                        ? t === 'react'
                          ? 'border-blue-500/40 bg-blue-500/15 text-blue-400'
                          : t === 'gradio'
                          ? 'border-orange-500/40 bg-orange-500/15 text-orange-400'
                          : 'border-violet-500/40 bg-violet-500/15 text-violet-400'
                        : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-xs font-medium text-slate-300 mb-1.5">
                Description <span className="text-slate-600 font-normal">(optional)</span>
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="What does this app do?"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isEdit ? 'Update' : 'Add Application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
