export function formatPlazo(plazoStr: string): { text: string; urgent: boolean } {
  const plazo = new Date(plazoStr)
  const now = new Date()
  const diffMs = plazo.getTime() - now.getTime()
  const diffH = diffMs / (1000 * 60 * 60)
  const diffD = diffMs / (1000 * 60 * 60 * 24)

  if (diffMs < 0) {
    const ago = Math.abs(diffD)
    if (ago < 1) return { text: `Venció hace ${Math.ceil(Math.abs(diffH))}h`, urgent: true }
    return { text: `Venció hace ${Math.ceil(ago)}d`, urgent: true }
  }
  if (diffH < 24) return { text: `En ${Math.ceil(diffH)}h`, urgent: diffH < 4 }
  return { text: `En ${Math.ceil(diffD)}d`, urgent: false }
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}
