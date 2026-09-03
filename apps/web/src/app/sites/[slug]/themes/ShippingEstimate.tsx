"use client"
import { useEffect, useState } from "react"

interface Props {
  siteId: string
  cjVid: string
  primary?: string
  deliveryLabel?: string
  daysLabel?: string
}

export default function ShippingEstimate({ siteId, cjVid, primary, deliveryLabel, daysLabel }: Props) {
  const [aging, setAging] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchEstimate() {
      try {
        // 1. Detect buyer country via IP
        const geoRes = await fetch("https://ipapi.co/country/")
        const countryCode = (await geoRes.text()).trim()
        if (!countryCode || countryCode.length !== 2) {
          setLoading(false)
          return
        }

        // 2. Call our API with real CJ data
        const res = await fetch("/api/shipping-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId,
            countryCode,
            products: [{ vid: cjVid, quantity: 1 }],
          }),
        })

        if (!res.ok) {
          setLoading(false)
          return
        }

        const data = await res.json()
        if (!cancelled && data.logisticAging) {
          setAging(data.logisticAging)
        }
      } catch {
        // silently fail — no shipping estimate shown
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchEstimate()
    return () => { cancelled = true }
  }, [siteId, cjVid])

  if (loading || !aging) return null

  return (
    <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: primary || "#666" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
      {deliveryLabel || "Estimated delivery:"} {aging} {daysLabel || "days"}
    </p>
  )
}
