import { Sun, TrendingUp, ClipboardList, Factory, ShoppingCart } from 'lucide-react'

/**
 * Las cinco pestañas del módulo Producción (rediseño 4-oct-2026). Antes eran
 * siete, y la misma pregunta —"¿cuánto y cuándo producir?"— se contestaba en
 * varias a la vez. Ahora cada pestaña contesta UNA pregunta, en el orden en
 * que se trabaja:
 *
 *   Hoy      → ¿estamos bien? ¿qué hay que hacer esta semana?
 *   Demanda  → ¿cuánto vamos a vender?
 *   Plan     → ¿cuánto y cuándo producir? (motor único de cobertura)
 *   Planta   → ¿qué hay en cada tanque y qué se cocina? (Gantt + cola + lotes)
 *   Compras  → ¿qué compramos, cuánto y cuánto cuesta? (insumos + envase)
 *
 * Si una sección no contesta la pregunta de su pestaña, está en la pestaña
 * equivocada.
 */
export const navItems = [
  { id: 'hoy', icon: Sun, label: 'Hoy', pregunta: '¿Cómo estamos y qué hay que hacer esta semana?' },
  { id: 'demanda', icon: TrendingUp, label: 'Demanda', pregunta: '¿Cuánto vamos a vender?' },
  { id: 'plan', icon: ClipboardList, label: 'Plan', pregunta: '¿Cuánto y cuándo hay que producir?' },
  { id: 'planta', icon: Factory, label: 'Planta', pregunta: '¿Qué hay en cada tanque y qué se cocina?' },
  { id: 'compras', icon: ShoppingCart, label: 'Compras', pregunta: '¿Qué compramos, cuánto y cuánto cuesta?' },
] as const

export type TabId = (typeof navItems)[number]['id']
