import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { LoaderCircle } from 'lucide-react'
import type { NormalReceptionWarehousePackage } from '../../../services/normalReceptionPackageService'

type WarehouseQrLabelProps = {
  item: NormalReceptionWarehousePackage
}

export function WarehouseQrLabel({ item }: WarehouseQrLabelProps) {
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    let active = true

    void QRCode.toDataURL(`GGGPKG:${item.tracking_code}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    }).then((url) => {
      if (active) setQrUrl(url)
    })

    return () => {
      active = false
    }
  }, [item.tracking_code])

  return (
    <article className="warehouse-qr-label break-inside-avoid rounded-xl border-2 border-slate-900 bg-white p-3 text-slate-950">
      <div className="flex items-start gap-3">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center bg-white">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`QR ${item.tracking_code}`}
              className="h-32 w-32"
            />
          ) : (
            <LoaderCircle className="animate-spin text-slate-500" size={24} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider">GGG · Paquete</p>
          <p className="mt-1 font-mono text-lg font-black">{item.tracking_code}</p>
          <dl className="mt-2 space-y-1 text-xs">
            {item.pallet_number !== undefined && (
              <div><dt className="inline font-bold">Pallet: </dt><dd className="inline">{item.pallet_number}</dd></div>
            )}
            <div><dt className="inline font-bold">Parte: </dt><dd className="inline">{item.part_number}</dd></div>
            {item.quantity !== null && (
              <div><dt className="inline font-bold">Cantidad: </dt><dd className="inline">{item.quantity}</dd></div>
            )}
            {item.purchase_order && (
              <div><dt className="inline font-bold">PO: </dt><dd className="inline">{item.purchase_order}</dd></div>
            )}
            {item.supplier_package_id && (
              <div><dt className="inline font-bold">Paquete proveedor: </dt><dd className="inline">{item.supplier_package_type || ''}{item.supplier_package_id}</dd></div>
            )}
          </dl>
        </div>
      </div>
    </article>
  )
}
