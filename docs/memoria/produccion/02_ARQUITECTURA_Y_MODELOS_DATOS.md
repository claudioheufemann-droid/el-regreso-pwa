# 02 — Arquitectura y Modelos de Datos (Módulo de Producción)

## Visión General de Datos

El módulo de Producción se nutre de **13 tablas en Supabase**, combinando datos importados periódicamente del ERP con configuraciones manuales de planta y proyecciones calculadas por el modelo de IA.

---

## 1. Tablas de Forecasting y Validación

### `forecast_produccion`
Almacena las series temporales de demanda proyectada y su descomposición Prophet.
- **Campos**: `nivel` (`general` | `producto` | `envase` | `producto_envase`), `clave` (string | null), `mes` (`yyyy-mm-01`), `tipo` (`historico` | `forecast`), `litros`, `litros_min`, `litros_max`, `tendencia`, `estacionalidad`.
- **Paginación**: Consulta paginada de 1.000 en 1.000 desde el servidor (`page.tsx`), ya que las filas de proyección aparecen al final por orden de fecha.

### `forecast_validacion`
Almacena las métricas de rendimiento del backtest para cada serie.
- **Campos**: `nivel`, `clave`, `mae` (Error Absoluto Medio en L/mes), `mape` (Error Porcentual Absoluto Medio en %), `meses_historial`, `metodo` (`propio` | `derivado`).

### `forecast_calidad_datos`
Registro de anomalías y advertencias detectadas al generar el forecast.
- **Campos**: `tipo`, `clave`, `detalle`, `severidad` (`info` | `advertencia`), `generado_at`.

---

## 2. Tablas de Inventario y Stock de Seguridad

### `stock_productos`
Reflejo del informe de existencias del ERP en tiempo real.
- **Campos**: `producto`, `categoria`, `tipo` (`barril` | `envase` | `tanque`), `camara`, `cantidad`, `litros`, `lotes`.
- **Filtro de Cámaras de Producción**: Para calcular disponible vendible en producción se filtran cámaras como *Frío Planta*, *Latas FIFO* (definidas en `lib/camaras.ts`).

### `stock_seguridad`
Puntos de reorden y colchón de seguridad calculados para cada combinación producto × formato.
- **Campos**: `nivel`, `producto`, `envase`, `categoria`, `mes`, `lead_time_semanas`, `periodo_revision_semanas`, `demanda_mensual_proyectada`, `demanda_en_ventana`, `sigma_semanal`, `stock_seguridad_litros`, `punto_reorden_litros`, `confianza` (`alta` | `media` | `baja`), `mape_backtest`, `meses_historial`, `metodo`.

---

## 3. Tablas de Planta y Plan Maestro

### `plan_produccion`
Cola de cocciones planificadas y en curso.
- **Campos**: `id`, `producto`, `categoria`, `litros_planificados`, `fecha_planificada`, `prioridad` (0..N), `estado` (`planificado` | `en_curso` | `completado` | `cancelado`), `origen` (`sugerido` | `manual`), `motivo`, `observaciones`, `fermentador`, `dias_ocupacion`.

### `fermentadores`
Capacidad física nominal de los tanques activos en la planta.
- **Campos**: `nombre` (ej. "T-01"), `tipo`, `categoria` (`cerveza` | `kombucha`), `capacidad_litros`, `activo` (boolean).

### `ajuste_lote_tanque`
Ajustes manuales de fechas para lotes específicos en fermentador.
- **Campos**: `tanque`, `codigo_lote`, `fecha_inicio_manual`, `fecha_embarrillado_manual`.

---

## 4. Tablas de Insumos y Recetas (MRP)

### `recetas` y `receta_insumos`
Definición de composición por producto base.
- **`recetas`**: `id`, `producto`, `litros_base`.
- **`receta_insumos`**: `receta_id`, `insumo_id` (FK `insumos.id`), `cantidad`.

### `insumos` y `stock_insumos`
Catálogo de materias primas e inventario actual.
- **`insumos`**: `id`, `nombre`, `categoria` (`malta` | `lupulo` | `levadura` | `otros`), `unidad_base` (`gr` | `ml`), `precio_unitario`.
- **`stock_insumos`**: `insumo_id`, `cantidad`, `fecha_informe`.

---

## 5. Estructuras de Datos Principales en TypeScript (`app/produccion/page.tsx`)

- `SerieForecast`: Punto de gráfico + métricas de validación por serie.
- `StockSeguridadItem`: Parámetros de inventario objetivo y reorden.
- `OcupacionPlanta`: Resumen global de capacidad instalada vs. litros en fermentación.
- `SplitFermentador`: Asignación proyectada de líquido a granel entre barriles y latas según urgencia de reorden.
- `SugerenciaPlan`: Propuesta automática de cocción basada en alarmas de quiebre de stock.
- `NecesidadInsumo`: Requerimiento de insumos escalado linealmente por el Plan Maestro activo.
