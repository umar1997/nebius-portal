import { useState, FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Loader2, Zap, Eye, EyeOff } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../stores/useAuthStore'
import { authApi } from '../lib/api'
import { toast } from '../stores/useToastStore'

export default function LoginPage() {
  const { accessToken, setAuth } = useAuthStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (accessToken) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await authApi.login({ email, password })
      localStorage.setItem('refreshToken', data.refreshToken)
      setAuth(data.accessToken, data.user)
      toast.success(`Welcome back, ${data.user.name}!`)
      navigate('/')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-slate-900 p-10 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/8 via-transparent to-transparent pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-green-500/5 blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/20 ring-1 ring-green-500/30">
            <Zap className="h-5 w-5 text-green-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Nebius Portal</span>
        </div>

        {/* Hero text */}
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-green-400/80 mb-4">
            Internal ML Gateway
          </p>
          <h1 className="text-4xl font-800 font-extrabold leading-tight text-slate-50">
            Your GPU apps,<br />one click away.
          </h1>
          <p className="mt-4 text-base text-slate-400 leading-relaxed max-w-sm">
            Access every ML application running on Nebius worker nodes without SSH,
            without remembering ports, without the friction.
          </p>

          {/* Feature list */}
          <ul className="mt-8 space-y-3">
            {[
              'SOCKS5 tunnel — automatic remote DNS resolution',
              'React & Gradio apps — native WebSocket support',
              'Admin approval flow — controlled team access',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="relative text-xs text-slate-600">
          M42 Internal Tool · {new Date().getFullYear()}
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-950 px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20 ring-1 ring-green-500/30">
            <Zap className="h-4 w-4 text-green-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Nebius Portal</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-50">Welcome back</h2>
            <p className="mt-1.5 text-sm text-slate-400">
              Sign in to your account to continue
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@m42.ae"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={clsx(
                'mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150 cursor-pointer',
                'bg-green-500 text-slate-950 hover:bg-green-400',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Sign in
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            No account?{' '}
            <Link
              to="/signup"
              className="text-green-400 hover:text-green-300 font-medium transition-colors"
            >
              Request access
            </Link>
          </p>

          <div className="mt-8 border-t border-slate-800 pt-6 text-center">
            <Link
              to="/admin"
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Admin panel →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
