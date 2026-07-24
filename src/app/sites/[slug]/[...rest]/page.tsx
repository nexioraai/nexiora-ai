import { notFound } from 'next/navigation'

// Capture tout sous-chemin inconnu d'un site marchand
// (ex: monsite.com/nimportequoi) et declenche le not-found
// brande du segment [slug] plutot que le 404 global Nexiora.
export default function SiteCatchAll() {
  notFound()
}
