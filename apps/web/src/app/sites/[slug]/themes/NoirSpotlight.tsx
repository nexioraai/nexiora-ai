'use client'

// src/app/sites/[slug]/themes/NoirSpotlight.tsx
//
// Interaction signature de Noir : la lumiere suit le curseur et REVELE la
// matiere -- pas un simple halo decoratif pose a cote du contenu.
//
// useSpotlightXY() ne retourne JAMAIS de ref -- uniquement les valeurs de
// position (x/y en MotionValue) et l'etat reduceMotion, pour pouvoir les
// passer librement en props a SpotlightGlow()/SpotlightSheen() a plusieurs
// endroits (fond du hero, reflet sur la piece en vedette) sans declencher
// la regle react-hooks/refs -- celle-ci considere "contaminee" toute
// valeur qui transiterait par un hook dont le retour contiendrait aussi
// une ref, meme apres extraction dans une variable locale. La ref du
// conteneur (necessaire uniquement pour capter la position de la souris)
// reste donc locale a chaque composant qui la declare, jamais partagee.
import { useRef } from 'react'
import { motion, useMotionValue, useMotionTemplate, useReducedMotion, type MotionValue } from 'framer-motion'

export function useSpotlightXY() {
  const x = useMotionValue(50)
  const y = useMotionValue(50)
  const reduceMotion = useReducedMotion()
  return { x, y, reduceMotion }
}

// Halo ambiant + point chaud -- pose en fond de scene (le hero dans son
// ensemble).
export function SpotlightGlow({
  x,
  y,
  reduceMotion,
  size = 620,
  opacity = 0.22,
}: {
  x: MotionValue<number>
  y: MotionValue<number>
  reduceMotion: boolean | null
  size?: number
  opacity?: number
}) {
  const ambient = useMotionTemplate`radial-gradient(${size}px circle at ${x}% ${y}%, rgba(201,162,75,${opacity}), transparent 72%)`
  const hot = useMotionTemplate`radial-gradient(${Math.round(size * 0.32)}px circle at ${x}% ${y}%, rgba(232,196,104,${opacity * 1.7}), transparent 65%)`
  if (reduceMotion) return null
  return (
    <>
      <motion.div className="pointer-events-none absolute inset-0 hidden md:block z-0" style={{ background: ambient }} />
      <motion.div className="pointer-events-none absolute inset-0 hidden md:block z-0 mix-blend-soft-light" style={{ background: hot }} />
    </>
  )
}

// Reflet directionnel qui glisse sur une surface (la piece en vedette du
// hero) -- donne l'impression que la lumiere touche reellement un objet,
// pas qu'elle flotte dans le vide a cote.
export function SpotlightSheen({ x, reduceMotion }: { x: MotionValue<number>; reduceMotion: boolean | null }) {
  const sheen = useMotionTemplate`linear-gradient(115deg, transparent calc(${x}% - 35%), rgba(255,255,255,0.22) ${x}%, transparent calc(${x}% + 35%))`
  if (reduceMotion) return null
  return <motion.div className="pointer-events-none absolute inset-0 hidden md:block mix-blend-overlay" style={{ background: sheen }} />
}

export default function NoirSpotlight({
  children,
  className = '',
  size = 620,
  opacity = 0.22,
}: {
  children: React.ReactNode
  className?: string
  size?: number
  opacity?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { x, y, reduceMotion } = useSpotlightXY()

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    x.set(((e.clientX - rect.left) / rect.width) * 100)
    y.set(((e.clientY - rect.top) / rect.height) * 100)
  }

  return (
    <div ref={containerRef} onMouseMove={handleMove} className={`relative ${className}`}>
      <SpotlightGlow x={x} y={y} reduceMotion={reduceMotion} size={size} opacity={opacity} />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
