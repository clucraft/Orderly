import { Truck, Printer, PackageCheck } from 'lucide-react'

export default function Shipping() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-400 text-glow">Shipping & Labels</h1>
        <p className="text-zinc-500 mt-1">Generate shipping labels and packing slips</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Printer className="h-6 w-6 text-primary-400" />
            <h2 className="text-lg font-semibold text-zinc-200">Shipping Labels</h2>
          </div>
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <div className="text-center">
              <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Label generation coming soon</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <PackageCheck className="h-6 w-6 text-primary-400" />
            <h2 className="text-lg font-semibold text-zinc-200">Packing Slips</h2>
          </div>
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <div className="text-center">
              <PackageCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Packing slip templates coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
