import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, Loader2, Search, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import AdminSidebar from '../../components/AdminSidebar'
import AddAppModal from '../../components/AddAppModal'
import { App, adminApi } from '../../lib/api'
import { toast } from '../../stores/useToastStore'

const TYPE_CONFIG: Record<App['type'], { label: string; className: string }> = {
  react: {
    label: 'React',
    className: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/25',
  },
  gradio: {
    label: 'Gradio',
    className: 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25',
  },
  other: {
    label: 'Other',
    className: 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/25',
  },
}

export default function AdminApps() {
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<App | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<App | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const fetchApps = async () => {
    setLoading(true)
    try {
      const data = await adminApi.getApps()
      setApps(data)
    } catch {
      toast.error('Failed to load applications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchApps()
    adminApi.getNotificationsCount().then(({ pendingCount: c }) => setPendingCount(c)).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return apps
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.host.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q)
    )
  }, [apps, search])

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

  const closeModal = () => {
    setModalOpen(false)
    setEditingApp(null)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleteLoading(true)
    try {
      await adminApi.deleteApp(confirmDelete.id)
      setApps((prev) => prev.filter((a) => a.id !== confirmDelete.id))
      toast.success(`"${confirmDelete.name}" removed`)
      setConfirmDelete(null)
    } catch {
      toast.error('Failed to delete application')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <AdminSidebar pendingCount={pendingCount} />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-6">
          <div>
            <h1 className="text-base font-semibold text-slate-100">Applications</h1>
            <p className="text-[11px] text-slate-500">
              {loading ? 'Loading…' : `${apps.length} app${apps.length !== 1 ? 's' : ''} registered`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchApps}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-all cursor-pointer"
              aria-label="Refresh"
            >
              <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
            </button>
            <button
              onClick={() => { setEditingApp(null); setModalOpen(true) }}
              className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add App
            </button>
          </div>
        </header>

        {/* Search */}
        <div className="flex items-center gap-4 border-b border-slate-800 px-6 py-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps…"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 py-1.5 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/40 transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-sm text-slate-500">
                {apps.length === 0 ? 'No applications registered yet.' : 'No apps match your search.'}
              </p>
              {apps.length === 0 && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Add your first app
                </button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-slate-950">
                <tr className="border-b border-slate-800">
                  {['Application', 'Worker', 'Port', 'Type', 'Added', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((app) => {
                  const typeCfg = TYPE_CONFIG[app.type]
                  return (
                    <tr key={app.id} className="group hover:bg-slate-900/50 transition-colors">
                      {/* Application */}
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-slate-200">{app.name}</p>
                        {app.description && (
                          <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{app.description}</p>
                        )}
                        <p className="text-[10px] text-slate-600 font-mono mt-0.5">/app/{app.id}</p>
                      </td>

                      {/* Worker */}
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-slate-300">{app.host}</span>
                      </td>

                      {/* Port */}
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-slate-300">{app.port}</span>
                      </td>

                      {/* Type */}
                      <td className="px-6 py-4">
                        <span className={clsx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', typeCfg.className)}>
                          {typeCfg.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4">
                        <p className="text-xs text-slate-400">
                          {new Date(app.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(app)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-all cursor-pointer"
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(app)}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Add / Edit modal */}
      {modalOpen && (
        <AddAppModal
          app={editingApp}
          onClose={closeModal}
          onSave={handleSave}
          useAdminAuth
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-50 w-full max-w-sm animate-slide-up rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">Remove application?</h3>
            <p className="mt-2 text-sm text-slate-400">
              <span className="font-medium text-slate-200">"{confirmDelete.name}"</span> will be removed
              from the portal. The app on Nebius is unaffected.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
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
