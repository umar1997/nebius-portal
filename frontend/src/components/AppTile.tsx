import { useState, useEffect } from 'react'
import { ExternalLink, Edit2, Trash2, Server } from 'lucide-react'
import { clsx } from 'clsx'
import { App, appsApi } from '../lib/api'
import { useAuthStore } from '../stores/useAuthStore'

type HealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'

const TYPE_CONFIG = {
  react: { label: 'React', className: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/25' },
  gradio: { label: 'Gradio', className: 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25' },
  other: { label: 'Other', className: 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/25' },
}

interface AppTileProps {
  app: App
  onEdit: (app: App) => void
  onDelete: (app: App) => void
}

export default function AppTile({ app, onEdit, onDelete }: AppTileProps) {
  const [health, setHealth] = useState<HealthStatus>('unknown')
  const { accessToken } = useAuthStore()
  const typeConfig = TYPE_CONFIG[app.type] ?? TYPE_CONFIG.other

  useEffect(() => {
    let cancelled = false
    setHealth('checking')
    appsApi.health(app.id)
      .then((data) => {
        if (!cancelled) setHealth(data.healthy ? 'healthy' : 'unhealthy')
      })
      .catch(() => {
        if (!cancelled) setHealth('unhealthy')
      })
    return () => { cancelled = true }
  }, [app.id])

  const handleOpen = () => {
    window.open(`/app/${app.id}/?token=${accessToken}`, '_blank', 'noopener,noreferrer')
  }

  const healthDot = {
    unknown: <span className="h-2 w-2 rounded-full bg-slate-600" />,
    checking: <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />,
    healthy: (
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
      </span>
    ),
    unhealthy: <span className="h-2 w-2 rounded-full bg-red-500" />,
  }

  const healthLabel = {
    unknown: 'Unknown',
    checking: 'Checking…',
    healthy: 'Live',
    unhealthy: 'Unreachable',
  }

  return (
    <article className={clsx(
      'group relative flex flex-col rounded-2xl border border-slate-800 bg-slate-900',
      'transition-all duration-200 hover:border-slate-700 hover:shadow-xl hover:shadow-black/30',
      'hover:-translate-y-0.5'
    )}>
      {/* Top */}
      <div className="flex items-start justify-between p-5 pb-3">
        <span className={clsx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', typeConfig.className)}>
          {typeConfig.label}
        </span>
        <div className="flex items-center gap-1.5">
          {healthDot[health]}
          <span className="text-[11px] text-slate-500">{healthLabel[health]}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-5 pb-4">
        <h3 className="text-base font-semibold text-slate-100 leading-snug">{app.name}</h3>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Server className="h-3 w-3" />
          <span>{app.host} · port {app.port}</span>
        </div>
        {app.description && (
          <p className="mt-2.5 text-sm text-slate-400 line-clamp-2 leading-relaxed">
            {app.description}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
        <button
          onClick={handleOpen}
          className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400 ring-1 ring-green-500/20 hover:bg-green-500/20 hover:ring-green-500/40 transition-all duration-150 cursor-pointer"
        >
          Open
          <ExternalLink className="h-3 w-3" />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(app)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-all duration-150 cursor-pointer"
            aria-label="Edit application"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(app)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 cursor-pointer"
            aria-label="Delete application"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  )
}
