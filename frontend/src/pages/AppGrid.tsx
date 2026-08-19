import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, Cpu, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import Sidebar from '../components/Sidebar'
import AppTile from '../components/AppTile'
import AddAppModal from '../components/AddAppModal'
import { App, appsApi } from '../lib/api'
import { toast } from '../stores/useToastStore'

type TypeFilter = 'all' | App['type']

export default function AppGrid() {
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<App | null>(null)
  const [deletingApp, setDeletingApp] = useState<App | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchApps = async () => {
    try {
      const data = await appsApi.list()
      setApps(data)
    } catch {
      toast.error('Failed to load applications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchApps() }, [])

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      const matchesType = typeFilter === 'all' || a.type === typeFilter
      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.host.toLowerCase().includes(q)
      return matchesType && matchesSearch
    })
  }, [apps, search, typeFilter])

  const handleSave = (saved: App) => {
    setApps((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [saved, ...prev]
    })
  }

  const handleEdit = (app: App) => {
    setEditingApp(app)
    setModalOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingApp) return
    setDeleteLoading(true)
    try {
      await appsApi.delete(deletingApp.id)
      setApps((prev) => prev.filter((a) => a.id !== deletingApp.id))
      toast.success(`"${deletingApp.name}" removed`)
      setDeletingApp(null)
    } catch {
      toast.error('Failed to delete application')
    } finally {
      setDeleteLoading(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingApp(null)
  }

  const filterTabs: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'react', label: 'React' },
    { value: 'gradio', label: 'Gradio' },
    { value: 'other', label: 'Other' },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-6">
          <div>
            <h1 className="text-base font-semibold text-slate-100">Applications</h1>
            <p className="text-[11px] text-slate-500">
              {loading ? 'Loading…' : `${apps.length} app${apps.length !== 1 ? 's' : ''} registered`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setLoading(true); fetchApps() }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-all cursor-pointer"
              aria-label="Refresh"
            >
              <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
            </button>
            <button
              onClick={() => { setEditingApp(null); setModalOpen(true) }}
              className="flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-green-400 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add App
            </button>
          </div>
        </header>

        {/* Filters */}
        <div className="flex items-center gap-4 border-b border-slate-800 px-6 py-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps…"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 py-1.5 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-green-500/40 focus:border-green-500/40 transition-all"
            />
          </div>

          {/* Type tabs */}
          <div className="flex items-center gap-1">
            {filterTabs.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setTypeFilter(value)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer',
                  typeFilter === value
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-52 rounded-2xl border border-slate-800 bg-slate-900 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
                <Cpu className="h-7 w-7 text-slate-600" />
              </div>
              {apps.length === 0 ? (
                <>
                  <h3 className="text-base font-medium text-slate-300">No apps yet</h3>
                  <p className="mt-1.5 text-sm text-slate-500 max-w-xs">
                    Add your first application to get started.
                    Click "Add App" to register a running GPU app.
                  </p>
                  <button
                    onClick={() => setModalOpen(true)}
                    className="mt-5 flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-green-400 transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    Add your first app
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-base font-medium text-slate-300">No results</h3>
                  <p className="mt-1.5 text-sm text-slate-500">
                    No apps match your current filters.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((app) => (
                <AppTile
                  key={app.id}
                  app={app}
                  onEdit={handleEdit}
                  onDelete={setDeletingApp}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add / Edit modal */}
      {modalOpen && (
        <AddAppModal
          app={editingApp}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}

      {/* Delete confirmation */}
      {deletingApp && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setDeletingApp(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-50 w-full max-w-sm animate-slide-up rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">Remove application?</h3>
            <p className="mt-2 text-sm text-slate-400">
              <span className="font-medium text-slate-200">"{deletingApp.name}"</span> will be removed
              from the portal. The app on Nebius is unaffected.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeletingApp(null)}
                className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 rounded-xl bg-red-500/15 py-2.5 text-sm font-semibold text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/25 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {deleteLoading ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
