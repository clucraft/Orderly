import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, ShoppingBag, Truck, Settings, LogOut, ClipboardList } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ParticleBackground from './ParticleBackground'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Orders', href: '/orders', icon: ShoppingBag },
  { name: 'Shipping', href: '/shipping', icon: Truck },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen flex relative">
      <ParticleBackground />

      {/* Sidebar */}
      <div className="w-64 bg-surface-800/90 backdrop-blur-sm border-r border-surface-600 flex flex-col relative z-10">
        <div className="p-4 border-b border-surface-600">
          <div className="flex items-center gap-3">
            <div className="relative">
              <ClipboardList className="h-8 w-8 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary-400 text-glow">Orderly</h1>
              <p className="text-xs text-zinc-500 tracking-wider">ORDER MANAGEMENT</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30 glow-primary'
                    : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-200 border border-transparent'
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="tracking-wide">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-surface-600">
          {user && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-primary-400 text-sm font-medium flex-shrink-0">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">{user.displayName}</div>
                <div className="text-xs text-zinc-500 truncate">{user.email}</div>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-700 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col relative z-10">
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
