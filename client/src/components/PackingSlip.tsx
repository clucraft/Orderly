import type { Order, ShipFromAddress, ShippingLabel } from '../types'

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

interface Props {
  order: Order
  from: ShipFromAddress | null
  label: ShippingLabel | null
}

// Letter-size invoice / packing slip; rendered into #print-root and printed with printNow('invoice')
export default function PackingSlip({ order, from, label }: Props) {
  const items = order.items_json || []
  const address = order.shipping_json?.address
  const notes = order.shipping_json?.notes
  const shopName = from?.company || order.shop_name || ''
  const placed = order.platform_created_at || order.created_at

  return (
    <div
      className="print-invoice bg-white text-black text-[11pt] leading-snug"
      style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
    >
      <div className="flex justify-between items-start gap-6 border-b-2 border-black pb-3 mb-5">
        <div>
          {shopName && <p className="text-[18pt] font-bold">{shopName}</p>}
          {from && (
            <div className="text-[10pt] mt-1">
              {from.company && <p>{from.name}</p>}
              {!from.company && !shopName && <p className="font-bold">{from.name}</p>}
              <p>{from.street1}</p>
              {from.street2 && <p>{from.street2}</p>}
              <p>{[from.city, from.state].filter(Boolean).join(', ')} {from.zip}</p>
              {from.email && <p>{from.email}</p>}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[16pt] font-bold">Invoice</p>
          <p>Order #{order.receipt_id || order.external_id}</p>
          <p>{new Date(placed).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="flex justify-between gap-6 mb-5">
        {address && (address.address1 || address.city) && (
          <div>
            <p className="text-[9pt] font-bold uppercase tracking-wide mb-1">Ship to</p>
            {address.name && <p>{address.name}</p>}
            {address.address1 && <p>{address.address1}</p>}
            {address.address2 && <p>{address.address2}</p>}
            <p>{[address.city, address.state, address.zip].filter(Boolean).join(', ')}</p>
            {address.country && <p>{address.country}</p>}
          </div>
        )}
        {label?.tracking_code && (
          <div className="text-right">
            <p className="text-[9pt] font-bold uppercase tracking-wide mb-1">Shipped with</p>
            <p>{label.carrier} {label.service}</p>
            <p>{label.tracking_code}</p>
          </div>
        )}
      </div>

      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1.5 text-left text-[9pt] text-black">Item</th>
            <th className="py-1.5 text-right text-[9pt] text-black w-16">Qty</th>
            <th className="py-1.5 text-right text-[9pt] text-black w-24">Price</th>
            <th className="py-1.5 text-right text-[9pt] text-black w-24">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-gray-300 align-top">
              <td className="py-2 pr-3 text-black">
                <p>{item.title}</p>
                {item.options?.map((opt, j) => (
                  <p key={j} className="text-[9pt] text-gray-700">
                    {opt.name}: {opt.value}
                  </p>
                ))}
              </td>
              <td className="py-2 text-right text-black">{item.quantity}</td>
              <td className="py-2 text-right text-black">
                {formatCents(Math.round(item.price * 100), item.currency || order.currency)}
              </td>
              <td className="py-2 text-right text-black">
                {formatCents(Math.round(item.price * item.quantity * 100), item.currency || order.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <p className="text-[12pt] font-bold">Total paid: {formatCents(order.total, order.currency)}</p>
      </div>

      {notes && (
        <div className="mt-5">
          <p className="text-[9pt] font-bold uppercase tracking-wide mb-1">Note from buyer</p>
          <p className="whitespace-pre-wrap">{notes}</p>
        </div>
      )}

      <p className="mt-10 text-center">Thank you for your order!</p>
    </div>
  )
}
