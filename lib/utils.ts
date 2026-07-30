export function format(n: number, decimals = 1) {
  return n.toFixed(decimals)
}

/**
 * fetch con timeout — evita que una conexión colgada (señal débil en
 * terreno) deje un fetch pendiente para siempre. Lanza el mismo error
 * que dispararía el catch de un fetch normal.
 */
export function fetchConTimeout(input: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '$0'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
