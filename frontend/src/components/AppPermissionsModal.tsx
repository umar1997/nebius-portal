import { useState, useEffect, useMemo } from 'react'
import { X, Search, Loader2, LayoutGrid, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { App, adminApi } from '../lib/api'
import { toast } from '../stores/useToastStore'

interface AppPermissionsModalProps {
  userId: string
  userName: string
  onClose: () => void
  onSaved: (appIds: string[]) => void
  confirmLabel?: string
}

export default function AppPermissionsModal({
  userId,
  userName,
  onClose,
  onSaved,
  confirmLabel = 'Save permissions',
}: AppPermissionsModalProps) {
  const [apps, setApps] = useState<App[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    Promise.all([adminApi.getApps(), adminApi.getUserApps(userId)])
      .then(([allApps, { appIds }]) => {
        setApps(allApps)
        setSelected(new Set(appIds))
      })
      .catch(() => toast.error('Failed to load apps'))
      .finally(() => setLoading(false))
  }, [userId])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return apps
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.host.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q)
    )
  }, [apps, search])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === apps.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(apps.map((a) => a.id)))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const appIds = Array.from(selected)
      await adminApi.setUserApps(userId, appIds)
      onSaved(appIds)
    } catch {
      toast.error('Failed to save permissions')
    } finally {
      setSaving(false)
    }
  }

  const TYPE_COLOR: Record<App['type'], string> = {
    react: 'text-blue-400',
    gradio: 'text-orange-400',
    other: 'text-violet-400',
  }

  const allSelected = apps.length > 0 && selected.size === apps.length

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative z-50 w-full max-w-lg animate-slide-up rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-100">App Permissions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose which apps <span className="text-slate-300">{userName}</span> can access
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + select all */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-800 shrink-0 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps…"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/40 transition-all"
            />
          </div>
          {!loading && apps.length > 0 && (
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <div className={clsx(
                'h-4 w-4 rounded border flex items-center justify-center transition-all',
                allSelected
                  ? 'border-violet-500 bg-violet-500'
                  : 'border-slate-600 bg-slate-800'
              )}>
                {allSelected && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              {allSelected ? 'Deselect all' : 'Select all'} ({apps.length})
            </button>
          )}
        </div>

        {/* App list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </div>
          ) : apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutGrid className="mb-2 h-8 w-8 text-slate-700" />
              <p className="text-sm text-slate-500">No apps registered yet</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-slate-500">No apps match your search</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/50">
              {filtered.map((app) => {
                const isChecked = selected.has(app.id)
                return (
                  <li key={app.id}>
                    <button
                      onClick={() => toggle(app.id)}
                      className={clsx(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer',
                        isChecked ? 'bg-violet-500/5' : 'hover:bg-slate-800/40'
                      )}
                    >
                      <div className={clsx(
                        'h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-all',
                        isChecked
                          ? 'border-violet-500 bg-violet-500'
                          : 'border-slate-600 bg-slate-800'
                      )}>
                        {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-200 truncate">{app.name}</p>
                          <span className={clsx('text-[10px] font-medium shrink-0', TYPE_COLOR[app.type])}>
                            {app.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono truncate">
                          {app.host}:{app.port}
                        </p>
                        {app.description && (
                          <p className="text-xs text-slate-600 truncate mt-0.5">{app.description}</p>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 p-4 shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {selected.size} of {apps.length} app{apps.length !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
