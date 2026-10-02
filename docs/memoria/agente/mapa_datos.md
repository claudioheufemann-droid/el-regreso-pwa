# Mapa de la base para el Asistente de datos

Creado el 1-oct-2026 y verificado contra la base (llaves foráneas, columnas legibles por `agente_lector`, formatos
reales). **Fuente de verdad para el agente: `lib/agente/mapa.ts`**: este documento es la versión para personas. Si
cambian las tablas, primero se actualiza `mapa.ts`; esta página va después.

## Cómo lo usa el agente (y por qué ahorra tokens)

| Nivel | Dónde | Cuándo viaja | Costo aprox. |
|---|---|---|---|
| Índice: una línea por área + las 4 llaves | system prompt fijo (`indiceMapa()`) | en cada llamada (prefijo estable, cacheable) | ~700 tokens |
| Detalle de un área: tablas, columnas, cruces, trampas | herramienta `mapa_datos(area)` | sólo si la pregunta lo necesita | ~300–600 tokens |
| Lista completa de tablas | `describir_esquema` sin tabla | último recurso (tablas que el mapa no trae) | ~2.500 tokens |

Antes, una pregunta fuera de las tablas sembradas (ej. "¿cuánto proyectamos para el PDV?") obligaba al modelo a listar
~80 tablas, adivinar y reintentar. De hecho, el agente terminó guardando una memoria personal para no volver a perderse
con `forecast_finanzas`. Ahora el índice lo manda directo al área y `mapa_datos` le da las columnas exactas.

## Diagrama: cómo se relaciona la información

```mermaid
flowchart LR
  subgraph CLIENTE["Cliente: llave nombre_fantasia"]
    clientes[(clientes<br/>ficha ERP)]
  end

  subgraph COMERCIAL["Ventas y hábito"]
    ventas[(ventas<br/>línea de pedido, neto)]
    scores[(client_scores<br/>score, segmento, alerta)]
    estado[(mv_clientes_estado<br/>activo/riesgo/perdido)]
    pred[(predicciones_compra)]
    misiones[(misiones<br/>pauta semanal)]
  end

  subgraph COBRANZA["Cobranza"]
    deudores[(deudores<br/>foto actual)]
    deudh[(deudores_historial<br/>foto diaria)]
    cobros[(cobros_erp<br/>pagos; cliente = nombre_fantasia)]
  end

  subgraph BARRILES["Barriles"]
    barr[(barriles_clientes)]
    barrh[(barriles_historial)]
  end

  subgraph TERRENO["Terreno"]
    visitas[(visitas_terreno)]
    vitems[(visitas_terreno_items)]
    seg[(seguimientos)]
    cterreno[(clientes_terreno)]
  end

  subgraph PRODUCTO["Producto: llave producto (texto)"]
    stock[(stock_productos<br/>"Fisura (Porter)")]
    fprod[(forecast_produccion<br/>litros por mes)]
    sseg[(stock_seguridad)]
    plan[(plan_produccion)]
    recetas[(recetas)] --> rins[(receta_insumos)] --> insumos[(insumos)]
    sins[(stock_insumos)] --> insumos
  end

  subgraph FINANZAS["Finanzas en $"]
    ffin[(forecast_finanzas<br/>nivel + clave + mes)]
    vrest[(ventas_restaurante<br/>BaseCamp, bruto)]
    comph[(compras_historico)]
    compc[(compras_comprometidas)]
  end

  clientes --- ventas & scores & estado & pred & misiones
  clientes --- deudores & deudh & cobros
  clientes --- barr & barrh
  clientes -- "id = cliente_erp_id" --- visitas
  visitas --- vitems & seg
  cterreno --- visitas
  ventas -- producto --- fprod & sseg & plan & recetas
  ventas -. "producto ilike 'X%'" .- stock
  ventas -. "Cliente PDV" .- ffin
  vrest -. "nivel restaurante" .- ffin
  comph -. "nivel compra" .- ffin
```

## Las 4 llaves que unen todo

1. **Cliente = `nombre_fantasia`** (texto). Une clientes, ventas (99,8% de coincidencia), deudores, deudores_historial,
   `cobros_erp.cliente` (100%), barriles, client_scores, mv_clientes_estado, misiones, predicciones_compra.
   `clientes.id` (número) sólo lo usan `visitas_terreno.cliente_erp_id` y cotizaciones.
2. **Producto** (texto). Igual en ventas, forecast_produccion (`clave`; en `producto_envase` es `"Fisura::lata"`),
   stock_seguridad, plan_produccion y recetas. `stock_productos` agrega el estilo entre paréntesis → `ilike 'Fisura%'`.
3. **Vendedor** (texto con el nombre; a veces correo → `ilike` por apellido). En terreno es `vendedor_id` (uuid) y la
   tabla de usuarios está bloqueada para el agente.
4. **Mes** en forecast_* y stock_seguridad = ciclo 24→23 que **termina** ese mes.

## Áreas (resumen; el detalle está en `mapa.ts`)

| Área | Tablas principales | Pantallas | Herramienta propia |
|---|---|---|---|
| ventas | ventas, ventas_restaurante | /ventas, /ventas/historico, /control-comercial/ventas | ventas_resumen, top_clientes, compras_cliente |
| clientes | clientes, client_scores, client_raw_metrics, mv_clientes_estado, predicciones_compra | /ventas/clientes, /control-comercial/clientes | buscar_cliente, frecuencia_compra_cliente, clientes_inactivos |
| cobranza | deudores, deudores_historial, cobros_erp | /ventas/deudores, /control-comercial/cobranza, /administracion | deuda_clientes, comportamiento_pago_cliente, cobros_resumen |
| finanzas | forecast_finanzas, compras_historico, compras_comprometidas | /administracion (Ingreso Real, Flujo, Forecast) | (SQL) |
| produccion | stock_productos, forecast_produccion, stock_seguridad, plan_produccion, insumos/recetas | /produccion, /ventas/stock | stock_actual |
| barriles | barriles_clientes, barriles_historial | /ventas/barriles, /control-comercial/barriles | (SQL) |
| comercial | metas + periodos, misiones, cold_leads, tasks | /ventas/metas, /ventas/misiones, /ventas/leads, /gestion | (SQL) |
| terreno | visitas_terreno (+items, seguimientos), jornadas_terreno, clientes_terreno | /terreno, /terreno/admin | (SQL) |
| flota | vehiculos, viajes_flota | /flota, /logistica | (SQL) |
| sistema | erp_sync_log, forecast_calidad_datos | — | (SQL) |

## Trampas que el mapa le advierte al agente

- `ventas` tiene una fila por **línea**: pedidos = `count(distinct pedido)`.
- "BaseCamp El Regreso" en `ventas` = cerveza vendida **al** restaurante; `ventas_restaurante` = venta **del** restaurante
  al público (bruto). No sumarlas.
- `categoria_negocio` es el tipo de **cliente** (Bar, Botillería…), no la categoría de producto.
- `stock_productos` guarda varias fotos: filtrar la `fecha_informe` más reciente. Además las latas traen litros NULL y
  otro nombre ("Lata (354 ml) de Kombucha Lemon Fresh") y `tipo=tanque` no está envasado: por eso el stock va siempre por
  la herramienta `stock_actual` (mismo criterio que /produccion). En la prueba del 2-oct, el SQL libre dijo "Kombucha
  Lemon 0 L" cuando había 901 L disponibles + 1.300 L en tanque.
- `deudores` y `barriles_clientes` son fotos actuales; para evolución, sus `_historial`.
- forecast_finanzas está en neto salvo `nivel='restaurante'` (bruto).
- `misiones` puede estar atrasada (última semana cargada: 24-ago-2026 al crear este mapa).
- Las tablas `plan_*_terreno`, despachos, lotes_produccion existen pero están casi vacías.

## Mantenimiento

- Tabla nueva que el agente deba leer: `select agente_refrescar_permisos();` + agregarla al área que corresponda en `mapa.ts`.
- Columna renombrada: corregir `mapa.ts` (si no, el agente va a pedir una columna que no existe y gastará una ronda).
