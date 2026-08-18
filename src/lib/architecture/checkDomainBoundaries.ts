// src/lib/architecture/checkDomainBoundaries.ts
//
// Moteur générique de vérification des frontières déclarées dans
// domainRegistry.ts. Ne connaît rien de "Mode 1", "Mode 2" ou de quelque
// domaine que ce soit — il ne fait qu'appliquer les règles fournies. C'est
// ce qui garantit qu'ajouter un domaine n'implique jamais de modifier ce
// fichier.

import { readFileSync } from 'fs'
import { join } from 'path'
import type { DomainDefinition } from './domainRegistry'

export type BoundaryViolation = {
  domainId: string
  file: string
  line: number
  pattern: string
  reason: string
}

export function checkDomainBoundaries(domain: DomainDefinition, repoRoot: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = []

  for (const relPath of domain.ownedFiles) {
    const absPath = join(repoRoot, relPath)
    const raw = readFileSync(absPath, 'utf8')
    const lines = raw.split('\n')

    lines.forEach((lineText, idx) => {
      if (domain.ignoreLinePattern && domain.ignoreLinePattern.test(lineText.trim())) return

      for (const rule of domain.forbiddenPatterns) {
        if (rule.pattern.test(lineText)) {
          violations.push({
            domainId: domain.id,
            file: relPath,
            line: idx + 1,
            pattern: rule.pattern.toString(),
            reason: rule.reason,
          })
        }
      }
    })
  }

  return violations
}

export function formatViolations(violations: BoundaryViolation[]): string {
  return violations
    .map((v) => `  - ${v.file}:${v.line} — motif interdit ${v.pattern} — ${v.reason}`)
    .join('\n')
}
