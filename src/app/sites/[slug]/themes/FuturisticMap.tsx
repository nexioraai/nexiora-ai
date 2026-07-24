'use client'

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type Props = {
  lat: number
  lng: number
  accent?: string
  className?: string
  label?: string
}

export default function FuturisticMap({
  lat,
  lng,
  accent = '#6366f1',
  className = '',
  label = 'Voir la carte',
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [lng, lat],
      zoom: 15.4,
      pitch: 52,
      bearing: -18,
      attributionControl: false,
      interactive: true,
    })
    mapRef.current = map

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left'
    )
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const el = document.createElement('div')
    el.style.width = '18px'
    el.style.height = '18px'
    el.style.borderRadius = '9999px'
    el.style.backgroundColor = accent
    el.style.boxShadow = '0 0 0 6px ' + accent + '33, 0 0 26px 8px ' + accent + '99'
    new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)


    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [lat, lng, accent])

  const osmLink = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=17/' + lat + '/' + lng

  return (
    <div
      className={'relative rounded-2xl overflow-hidden ' + className}
      style={{
        border: '1px solid ' + accent + '40',
        boxShadow: '0 0 0 1px ' + accent + '14, 0 22px 60px -26px ' + accent + '99',
      }}
    >
      <div ref={ref} style={{ width: '100%', height: 300 }} />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, transparent 42%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      <a
        href={osmLink}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-full text-[10px] font-medium uppercase tracking-[0.12em] backdrop-blur-md text-white transition-transform hover:-translate-y-0.5"
        style={{
          backgroundColor: accent + '2e',
          border: '1px solid ' + accent + '70',
        }}
      >
        {label}
      </a>
    </div>
  )
}
