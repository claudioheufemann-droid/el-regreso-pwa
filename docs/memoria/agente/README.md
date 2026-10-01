# Asistente de datos (chat con IA sobre Supabase)

Agregado el 1-oct-2026. Código en `lib/agente/` (leer `lib/agente/README.md`, es la guía operativa); burbuja flotante
(`components/agente/`) y pantalla `/administracion/agente`; API `/api/agente`, `/api/agente/conversacion`, `/api/agente/memoria`;
tablas `agente_conversaciones`, `agente_mensajes`, `agente_memoria`, `agente_consultas_log`; rol `agente_lector`.
Migraciones: `agente_memoria_y_conversaciones.sql`, `agente_lector_solo_lectura.sql`.

## Decisiones de diseño (y por qué)

- **IA gratuita = Google Gemini (AI Studio, tier gratis).** `GEMINI_API_KEY` en `.env.local` y Vercel. Modelos en cascada
  `gemini-3.8-flash` → `gemini-3.5-flash-lite` → `gemini-2.5-flash` (override `AGENTE_MODELO`): Google restringió la serie 2.5
  a proyectos que ya la usaban (nota del 1-oct-2026) y cada modelo tiene su propia cuota gratis. Los 3.x no permiten apagar el
  razonamiento (sólo low/medium/high; `minimal` da error en 3.8-flash) y `thinkingBudget` sólo aplica a 2.5: en 3.x se pide
  `thinkingLevel: low` (nombre del campo NO verificado para generateContent; si Google lo rechaza se reintenta sin él) y
  `maxTokensRespuesta`=8192 porque los tokens de razonamiento cuentan contra ese tope.
- **Se usa `generateContent`, no la Interactions API:** la doc de Google (oct-2026) dice que Interactions sigue en beta con cambios
  que rompen compatibilidad y que para producción se mantenga `generateContent`.
- **Sólo administradores** (`isAdmin`, validado en cada ruta; en "Ver como vendedor" el chat se apaga). Para abrirlo a
  vendedores habría que forzar el filtro de cartera (`vendedoresErp`) DENTRO de cada herramienta y quitar la lectura libre:
  decisión pendiente del usuario (no hecho).
- **Lectura libre sin llave maestra (1-oct-2026, pedido del usuario: "libertad de recorrer toda la base").** Antes era un catálogo
  cerrado por miedo a service-role + SQL inventado. Ahora `consultar_sql` corre en Postgres con el rol `agente_lector`: SELECT por
  tabla y COLUMNA (lo privado y las tablas nuevas, bloqueado por defecto), guardia de texto, transacción de sólo lectura, 10 s,
  200 filas, ejecutable sólo por service_role. 18 intentos de ataque probados, todos bloqueados. Las herramientas específicas
  se mantienen porque encierran criterios de negocio (ingreso real, neto) que el SQL libre puede olvidar.
- **Criterio de venta real en SQL:** `_excluir_cliente_finanzas` (incluye PDV/BaseCamp) cuadra exacto con el módulo de Finanzas;
  `_excluir_cliente` (Comercial) excluye PDV y da otra cifra. Quedó como regla sembrada en `agente_memoria`.
- **Memoria en la base, no en el navegador:** conversaciones persistentes por usuario, resumen automático de lo viejo (>12
  mensajes, `after()`), memoria global/personal inyectada sólo si está activa y es relevante (full-text español). Lo global que
  propone el agente queda pendiente de aprobación (anti-inyección: los datos de la base son texto de terceros).
- **PostgREST corta en 1000 filas:** las herramientas de ventas cuentan primero y piden las páginas en paralelo (en lotes de 8).
- Los errores de consulta se sanean antes de llegar al modelo (el WAF/Cloudflare devuelve HTML entero).

## Tokens (medido el 1-oct-2026)

Misma pregunta de SQL: 33.875 tokens / 7 rondas → 7.843 / 2, gracias a sembrar las columnas de las tablas principales en la
memoria. Prefijo fijo ~3.900 → ~3.040 tokens. Caché implícita de Gemini: 0 tokens cacheados observados con
gemini-3.5-flash-lite en plan gratuito (el prefijo se mantiene estable por si algún día aplica). Panel de uso en la pestaña Memoria.

## Privacidad

En el tier gratuito de Gemini Google puede usar lo enviado para mejorar sus productos (ai.google.dev/gemini-api/docs/pricing). Por eso
los datos personales (rut, correo, teléfono, dirección) y los costos/márgenes están bloqueados a nivel de base. Pasar al plan de
pago desactiva ese uso.

## Cómo mejorarlo

`select pregunta, herramientas, error from agente_consultas_log where not respondio order by created_at desc;`
Enseñar conocimiento en la pestaña Memoria; herramienta nueva en `lib/agente/consultas/`; tabla nueva en la base →
`select agente_refrescar_permisos();` (si no, el agente no la ve).
