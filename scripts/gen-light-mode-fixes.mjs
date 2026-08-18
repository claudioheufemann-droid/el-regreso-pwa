// Script de un solo uso: genera el bloque CSS de overrides de modo claro
// para app/globals.css. Ver auditoría de contraste (2026-07-23).
//
// Estrategia: React serializa los estilos inline SIN espacios extra,
// exactamente como están escritos en el código fuente (verificado en DOM
// real). Eso permite usar selectores de atributo [style*="...;color:X"] /
// [style^="color:X"] para "interceptar" un valor de color hardcodeado SOLO
// cuando es la propiedad `color` (no `background-color` ni `border-color`,
// que jamás quedan precedidos por ";" ni están al inicio del string).

const INK_PRIMARY = '#1A1008'   // = var(--cream) en modo claro
const INK_SECONDARY = '#6B6050' // = var(--muted) en modo claro
const INK_TERTIARY = '#8A7A6A'  // = var(--dim) en modo claro

// ── 1. Colores de TEXTO (family blanco/crema/gris-claro) que se vuelven
//    invisibles sobre fondo blanco — agrupados en 3 niveles según su
//    prominencia original en modo oscuro. ──
const textTierA = [ // sólidos / muy opacos → texto principal
  '#FFFFFF', '#fff', 'white', '#F4EEDF', '#F8F6F0', '#F0EDE8', '#F0E8D4', '#E8DFC8',
  'rgba(244,238,223,0.8)',
  'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.65)',
  'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.8)',
]
const textTierB = [ // medios → texto secundario
  '#C8BEA4', '#eee', '#ddd', '#ccc', '#999',
  'rgba(244,238,223,0.5)',
  'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0.35)',
  'rgba(255,255,255,0.38)', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.45)',
  'rgba(255,255,255,0.5)',
  'rgba(128,128,128,0.4)', 'rgba(128,128,128,0.5)', 'rgba(128,128,128,0.6)',
  'rgba(156,163,175,0.4)',
]
const textTierC = [ // tenues → texto terciario / deshabilitado
  '#bbb', '#aaa', '#888',
  'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.18)',
  'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.25)',
  'rgba(255,255,255,0.28)',
  'rgba(128,128,128,0.3)',
]

function textRules(values, inkColor) {
  return values.map(v =>
    `[data-theme="light"] [style*=";color:${v}"],\n[data-theme="light"] [style^="color:${v}"]`
  ).join(',\n') + ` {\n  color: ${inkColor} !important;\n}`
}

// ── 2. Fondos translúcidos blancos (usados para "aclarar" sutilmente sobre
//    fondo oscuro) — se invierten a tinta oscura sobre fondo claro, misma
//    opacidad, mismo efecto relativo. ──
const bgValues = [
  '0.01','0.015','0.02','0.025','0.03','0.035','0.04','0.05','0.055','0.06',
  '0.07','0.08','0.1','0.12','0.15','0.18','0.4','0.5',
]
function bgRules() {
  return bgValues.map(a => {
    const v = `rgba(255,255,255,${a})`
    return `[data-theme="light"] [style*=";background:${v}"],\n[data-theme="light"] [style^="background:${v}"] {\n  background: rgba(26,16,8,${a}) !important;\n}`
  }).join('\n')
}

// ── 3. Bordes shorthand con rgba(255,255,255,X) — se sobreescribe solo
//    border-color (la propiedad longhand gana sobre el color del shorthand
//    ya aplicado, sin tocar width/style). ──
const borderShorthands = [
  '1.5px solid rgba(255,255,255,0.08)', '1.5px solid rgba(255,255,255,0.1)', '1.5px solid rgba(255,255,255,0.2)',
  '1px dashed rgba(255,255,255,0.06)', '1px dashed rgba(255,255,255,0.08)', '1px dashed rgba(255,255,255,0.12)',
  '1px dashed rgba(255,255,255,0.15)', '1px dashed rgba(255,255,255,0.2)',
  '1px solid rgba(255,255,255,0.05)', '1px solid rgba(255,255,255,0.055)', '1px solid rgba(255,255,255,0.06)',
  '1px solid rgba(255,255,255,0.07)', '1px solid rgba(255,255,255,0.08)', '1px solid rgba(255,255,255,0.09)',
  '1px solid rgba(255,255,255,0.1)', '1px solid rgba(255,255,255,0.12)', '1px solid rgba(255,255,255,0.14)',
  '1px solid rgba(255,255,255,0.15)', '1px solid rgba(255,255,255,0.2)',
  '2px solid rgba(255,255,255,0.12)', '3px solid rgba(255,255,255,0.35)',
]
function borderRules() {
  return borderShorthands.map(v => {
    const alphaMatch = v.match(/rgba\(255,255,255,([0-9.]+)\)/)
    const alpha = alphaMatch[1]
    return `[data-theme="light"] [style*=";border:${v}"],\n[data-theme="light"] [style^="border:${v}"] {\n  border-color: rgba(26,16,8,${alpha}) !important;\n}`
  }).join('\n')
}

// ── 4. Íconos lucide-react: el prop `color` se serializa como atributo
//    SVG `stroke`, no como estilo inline — se ataca por separado. ──
const strokeValues = [
  'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.15)',
  'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.35)',
  'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.55)',
]
function strokeTier(v) {
  const a = parseFloat(v.match(/,([0-9.]+)\)/)[1])
  if (a < 0.3) return INK_TERTIARY
  if (a <= 0.5) return INK_SECONDARY
  return INK_PRIMARY
}
function strokeRules() {
  return strokeValues.map(v =>
    `[data-theme="light"] svg[stroke="${v}"] {\n  stroke: ${strokeTier(v)} !important;\n}`
  ).join('\n')
}

const out = `
/* ═══════════════════════════════════════════════════════════
   AUDITORÍA DE CONTRASTE — MODO CLARO (2026-07-23)
   Generado por scripts/gen-light-mode-fixes.mjs — no editar a mano.

   Causa raíz: cientos de estilos inline usan literales de la familia
   blanco/crema (#F4EEDF, rgba(255,255,255,X), etc.) pensados para texto
   SOBRE fondo oscuro. Esos literales no son variables de tema, así que
   al cambiar a modo claro (fondos casi blancos) el texto queda casi
   invisible. Estas reglas interceptan esos literales exactos por
   selector de atributo — sin tocar los ~1000 usos correctos de
   var(--cream)/var(--muted) que sí funcionan bien en ambos modos.

   Fuera de alcance a propósito: colores semánticos/de marca (dorado,
   verde, rojo, azul de estado) — esos tienen su propio contraste por
   diseño y recalibrarlos es una decisión de marca, no un bug de tema.
   ═══════════════════════════════════════════════════════════ */

/* ── Texto: nivel primario ── */
${textRules(textTierA, INK_PRIMARY)}

/* ── Texto: nivel secundario ── */
${textRules(textTierB, INK_SECONDARY)}

/* ── Texto: nivel terciario / deshabilitado ── */
${textRules(textTierC, INK_TERTIARY)}

/* ── Fondos translúcidos blancos → tinta oscura translúcida ── */
${bgRules()}

/* ── Bordes shorthand con blanco translúcido → border-color oscuro ── */
${borderRules()}

/* ── Íconos lucide-react (prop color → atributo SVG stroke) ── */
${strokeRules()}
`

console.log(out)
