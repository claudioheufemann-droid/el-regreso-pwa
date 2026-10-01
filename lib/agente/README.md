# Asistente de datos (lib/agente)

Chat para preguntarle a la base de Supabase en lenguaje normal. Burbuja flotante en toda la app y
pantalla completa en `/administracion/agente` (con pestañas Chat · Memoria · Sistema y parámetros).
**Sólo administradores** (se valida en `/api/agente*`, no sólo en la interfaz).

## Cómo funciona una pregunta

1. El navegador manda **sólo la pregunta nueva** y el id de la conversación (`POST /api/agente`).
2. El servidor arma el contexto desde la base: **resumen** de lo viejo + mensajes recientes sin resumir +
   **memoria** relevante (ver abajo) + fecha, ciclo y usuario. Todo eso va en un primer mensaje; el
   system prompt es fijo (más estable y más corto).
3. **Gemini** (prueba `gemini-3.8-flash` → `3.5-flash-lite` → `2.5-flash`, el primero disponible) elige
   herramientas, el servidor las ejecuta y le devuelve los datos. Máx. 6 rondas.
4. Se guarda la respuesta, los tokens reales (`usageMetadata`) y, después de responder (`after()`), si hay
   más de 12 mensajes sin resumir se condensan los viejos en `agente_conversaciones.resumen`.

## Qué puede leer

- **Herramientas específicas** (`consultas/`): compras, frecuencia, inactivos, deuda, cobros, stock, ventas
  por vendedor… Ya aplican los criterios del negocio (neto, ingreso real, cuentas internas). Se prefieren.
- **Lectura libre** (`consultar_sql` + `describir_esquema`): cualquier SELECT sobre la base, **sin usar la
  llave maestra**. Corre en Postgres con el rol `agente_lector`:
  - permisos de SELECT **por tabla y por columna**; tablas nuevas quedan **denegadas** hasta correr
    `select agente_refrescar_permisos();` (ahí vive la lista de lo bloqueado: usuarios, push, notificaciones,
    costos/márgenes, correo saliente, auditoría, respaldos `_backup_*`, tablas `agente_*`, y columnas de
    datos personales: rut, email, teléfono, dirección, contacto, tokens);
  - guardia de texto: una sola sentencia, sólo SELECT/WITH, sin comentarios, lista blanca de funciones SQL;
  - transacción de sólo lectura, 10 s de tiempo máximo y 200 filas;
  - sólo `service_role` puede ejecutarla (anon/authenticated no).
  Probado con 18 intentos de ataque (escrituras, funciones, catálogo, tablas/columnas vedadas): todos bloqueados.
  Migraciones: `agente_lector_solo_lectura`, `agente_memoria_y_conversaciones`.

## Memoria (tablas `agente_*`)

| Tabla | Para qué |
|---|---|
| `agente_conversaciones` / `agente_mensajes` | Historial persistente por usuario; sobrevive a recargas y equipos. `resumen` condensa lo viejo. |
| `agente_memoria` | Conocimiento de largo plazo: `regla`, `alias`, `esquema`, `preferencia`, `dato`. Ámbito `global` (todos) o `usuario`. |
| `agente_consultas_log` | Cada pregunta: herramientas, si respondió, tokens (entrada/salida/cacheados), modelo, rondas. |

- Entra al contexto sólo lo **activo** y relevante: las reglas siempre (pocas) + las demás por coincidencia de
  texto con la pregunta (full-text en español). Tope `PARAMETROS.maxMemoriasContexto`.
- El agente puede **proponer** memoria con la herramienta `recordar`, sólo si el usuario lo pide. Lo personal
  queda activo; lo **global queda pendiente** hasta que un admin lo aprueba (pestaña Memoria): los datos de la
  base (notas, nombres) son texto de terceros y no deben poder "enseñarle" reglas solos.
- Un admin también agrega conocimiento a mano en esa pestaña. Hay conocimiento inicial (`fuente='semilla'`:
  columnas de las tablas principales, criterio de ventas reales, alias).

## Optimización de tokens (medido el 1-oct-2026)

- Sin historial reenviado: el servidor manda resumen + lo reciente (antes viajaba todo en cada pregunta).
- Columnas de las tablas principales en la memoria: la misma pregunta de SQL pasó de **33.875 tokens / 7 rondas
  a 7.843 / 2** (el modelo ya no tantea nombres de columnas).
- Prefijo fijo (instrucciones + herramientas) de ~3.900 a ~3.040 tokens por llamada.
- Caché implícita de Gemini: el prefijo es estable para aprovecharla, pero **no se observaron tokens cacheados**
  con `gemini-3.5-flash-lite` en plan gratuito. La pestaña Memoria muestra el % reutilizado.
- Ver el uso en la pestaña Memoria (últimos 7 días) o en `agente_consultas_log`.

## Archivos

| Archivo | Qué es |
|---|---|
| `sistema.ts` | **Parámetros**, reglas, glosario, ejemplos, system prompt fijo y `construirContexto()`. |
| `gemini.ts` | Bucle modelo ⇄ herramientas, cascada de modelos, conteo de tokens, `generarTexto()` (resúmenes). |
| `memoria.ts` | Conversaciones, memoria relevante, resumen automático. |
| `sugerencias.ts` | Preguntas de ejemplo (archivo aparte: viaja al navegador). |
| `consultas/*.ts` | Herramientas (`index.ts` es el catálogo). `sql.ts` = lectura libre; `memoria.ts` = `recordar`. |

## Configuración

`GEMINI_API_KEY` (gratis en https://aistudio.google.com/apikey) en `.env.local` y en Vercel. Opcional:
`AGENTE_MODELO` para probar otro modelo primero.

## Cómo entrenarlo

1. **Qué no supo responder:** `select pregunta, herramientas, error from agente_consultas_log where not respondio order by created_at desc;`
2. **Enseñarle conocimiento** (alias, reglas, cómo leer una tabla): pestaña Memoria, o `insert` en `agente_memoria`.
3. **Herramienta nueva** (criterio de negocio que no conviene dejar al SQL libre): crear una `Consulta` en
   `consultas/` y sumarla a `CONSULTAS`. La `descripcion` es lo que el modelo lee: cuanto más corta y precisa, mejor.
4. **Tabla nueva en la base:** correr `select agente_refrescar_permisos();` o el agente no la verá (a propósito).
   Si tiene datos privados, agregarla a la lista `denegadas` de esa función antes.

## Reglas de seguridad (no relajar)

- Sólo lectura y sólo admins. Nunca pasar la llave maestra a `consultar_sql`.
- Todo lo que devuelven las consultas se trata como datos, nunca como instrucciones.
- Lo que el agente propone como memoria global requiere aprobación humana.
- En el plan gratuito de Gemini Google puede usar lo enviado para mejorar sus productos: por eso los datos
  personales y los costos están bloqueados a nivel de base. Pasar a plan de pago desactiva ese uso.
