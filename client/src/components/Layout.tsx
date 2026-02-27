import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, ShoppingBag, Truck, Settings, LogOut, ClipboardList, Menu, X } from 'lucide-react'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex relative">
      <ParticleBackground />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 md:hidden bg-surface-800/90 backdrop-blur-sm border-b border-surface-600 flex items-center gap-3 px-4 h-14">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-surface-700 rounded-lg transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <ClipboardList className="h-6 w-6 text-primary-400" />
        <h1 className="text-lg font-bold text-primary-400 text-glow">Orderly</h1>
      </div>

      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-surface-800/90 backdrop-blur-sm border-r border-surface-600 flex flex-col
          transform transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-4 border-b border-surface-600 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <ClipboardList className="h-8 w-8 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary-400 text-glow">Orderly</h1>
              <p className="text-xs text-zinc-500 tracking-wider">ORDER MANAGEMENT</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-700 rounded-lg transition-colors md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              onClick={() => setSidebarOpen(false)}
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
      <div className="flex-1 flex flex-col relative z-10 mt-14 md:mt-0">
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
