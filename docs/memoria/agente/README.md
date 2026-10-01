# Asistente de datos (chat con IA sobre Supabase)

Agregado el 1-oct-2026. Código en `lib/agente/` (leer `lib/agente/README.md`, es la guía operativa);
pantalla `/administracion/agente`; API `POST /api/agente`; tabla `agente_consultas_log`.

## Decisiones de diseño (y por qué)

- **IA gratuita = Google Gemini (AI Studio, tier gratis).** `GEMINI_API_KEY` en `.env.local` y Vercel. Modelos en cascada
  `gemini-3.8-flash` → `gemini-3.5-flash-lite` → `gemini-2.5-flash` (override `AGENTE_MODELO`): Google restringió la serie 2.5 a proyectos que ya la usaban (nota del 1-oct-2026), y cada modelo tiene su propia cuota gratis. Los 3.x no permiten apagar el razonamiento (sólo low/medium/high; `minimal` da error en 3.8-flash) y `thinkingBudget` sólo aplica a 2.5: en 3.x se pide `thinkingLevel: low` (nombre del campo NO verificado para generateContent; si Google lo rechaza se reintenta sin él) y `maxTokensRespuesta`=8192 porque los tokens de razonamiento cuentan contra ese tope.
- **Se usa `generateContent`, no la Interactions API:** la doc de Google (interactions.md.txt, oct-2026) dice que Interactions sigue en beta con cambios que rompen compatibilidad y que para producción se mantenga `generateContent`. Si algún día se migra, cambia `lib/agente/gemini.ts` (steps `function_call`/`function_result`, `thinking_level` en `generation_config`). Sin la clave, la pantalla avisa que falta configurarla.
- **Catálogo de consultas, no SQL libre.** El modelo elige una herramienta de `lib/agente/consultas/` con parámetros. Razón: el
  agente corre con service-role (ve toda la empresa) y `ventas` tiene ~150 mil filas; SQL inventado por el modelo es riesgo de
  fuga y de scans enormes. "Entrenarlo" = agregar consultas + afinar `sistema.ts`, no reentrenar un modelo.
- **Sólo administradores** (`isAdmin`, validado en la ruta; la página hereda el guard de `app/administracion/layout.tsx`).
- **Mismo criterio de ingreso real que Administración:** `esIngresoReal()` (sin mermas/muestras/tours/clientes internos), todo en
  NETO. El ranking de deuda omite `esClienteExcluido` (marketing, ferias, personal) salvo que se pida el cliente por nombre.
- **PostgREST corta en 1000 filas:** las consultas de ventas cuentan primero y piden las páginas en paralelo (de 12 s a ~3 s
  para 16 mil filas); tope `PARAMETROS.maxFilasEscaneadas` con aviso `truncado`.
- Los errores de consulta se sanean antes de llegar al modelo (el WAF/Cloudflare devuelve HTML entero).

## Cómo mejorarlo

`select pregunta, herramientas, error from agente_consultas_log where not respondio order by created_at desc;`
→ preguntas que no supo contestar → agregar una `Consulta` nueva. Estado actual: 12 herramientas — clientes, ventas, hábitos de compra (frecuencia, inactivos), deuda, pagos/cobros, stock y exploración controlada de tablas (`explorar_tabla`, lista blanca en `consultas/explorar.ts`).

**Privacidad:** en el tier gratuito de Gemini Google puede usar lo enviado para mejorar sus productos (confirmado en ai.google.dev/gemini-api/docs/pricing). Por eso `explorar_tabla` excluye datos de contacto (rut, teléfono, email, dirección), costos/márgenes, usuarios y respaldos. Pasar a la capa de pago desactiva ese uso.
**Probado con clave real el 1-oct-2026:** el bucle con Gemini funciona de punta a punta (frecuencia de compra, deuda, ventas por vendedor). Ese día `gemini-3.8-flash` respondía 503 "high demand" y el agente caía solo a `gemini-3.5-flash-lite` (~1 s por llamada, respuestas correctas y cuadradas con la base). El log `[agente] <modelo> respondió en N ms` en el servidor muestra qué modelo contestó.
