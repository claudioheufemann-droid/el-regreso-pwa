# 03 — Reglas de Negocio y Algoritmos (Módulo de Administración y Finanzas)

## 1. Algoritmo de Flujo de Caja Semanal (`construirFlujoSemanal`)

El dashboard de flujo de caja modela 13 semanas hacia adelante y 4 hacia atrás de la siguiente manera:

1. **Ingresos Confirmados**:
   $$\text{Confirmados} = \text{Ventas Despachadas con Factura} \quad (\text{Fecha de Cobro} = \text{Fecha Entrega} + \text{Días Pago Cliente})$$
2. **Ingresos Proyectados**:
   $$\text{Proyectados} = \text{Backlog Vendido Sin Despachar} + \text{Remanente del Forecast Mensual Prophet}$$
   - **Remanente del Forecast**:
     $$\text{Remanente Neto} = \text{Forecast del Mes} - \text{Ventas Registradas en el Mes}$$
     Se prorratea por los días restantes del mes y se aplica el factor de conversión Neto $\to$ Bruto (`factorBruto`).
3. **Egresos por Compras**:
   - Semanas con compras cargadas: usa `comprasReales` y `comprasProyectadas` comprometidas.
   - Semanas futuras sin carga manual: se usa el **promedio semanal histórico de los últimos 90 días** (`promedioSemanalHistorico`) para evitar subestimar falsamente el gasto.

---

## 2. aging de Cartera y Semáforo de Riesgo (`semaforoClientes`)

### Tramos de Antigüedad del ERP
Se respetan los tramos reales entregados por el ERP sin reagrupamientos forzados:
- **Hasta 14 días** (Verde)
- **15 – 29 días** (Amarillo)
- **30 – 44 días** (Amarillo)
- **45 – 59 días** (Naranja)
- **60 – 89 días** (Naranja)
- **90+ días** (Rojo)

### Reglas del Semáforo de Riesgo
Solo entran clientes con `deuda_vencida > 0` real del ERP. El nivel de alerta se asigna por la **edad de la deuda**, no por el monto:
- **Rojo**: Deuda vencida en el tramo de **60+ días**.
- **Amarillo**: Deuda vencida en el tramo de **30–59 días** O clientes que pagan con más de 7 días de exceso sobre su plazo pactado (`real - declarado > 7`).
- **Verde**: Deuda vencida concentrada únicamente en tramos recientes (< 30 días).

---

## 3. Ciclo de Conversión de Efectivo (`cicloConversionEfectivo`)

Calcula los días requeridos para convertir insumos e inventario en caja real:

$$CCC = DIO + DSO - DPO$$

Donde:
- **$DIO$ (Días de Inventario)**: $\frac{\text{Litros Físicos en Cámaras}}{\text{Litros Vendidos por Día (Últimas 4 Semanas)}}$
- **$DSO$ (Días de Cobro)**: Mediana de días de pago observados en la cartera (`comportamiento_pago_clientes`).
- **$DPO$ (Días de Pago a Proveedores)**: Promedio de días entre `fecha_documento` y `fecha_pago` de las compras realizadas.

---

## 4. Validación de Precisión de Cobranza (`calcularPrecisionCobro`)

Para evaluar la confiabilidad del modelo de cobranza sin conciliar pago por pago, se realiza una calibración cruzada:

1. Se toman las ventas cuya fecha de cobro esperada ($\text{Fecha Entrega} + \text{Días Pago}$) ya venció dentro de los últimos 60 días.
2. Se verifica si el cliente figura con `deuda_vencida > 0` en el último informe de deudores del ERP.
3. Si el cliente no tiene deuda vencida, se cuenta como cobro cumplido; si figura en Deudores, se cuenta como incumplimiento.
4. **Porcentaje de Cumplimiento**:
   $$\% \text{ Cumplimiento} = \frac{\text{Monto Bruto Confirmado Pagado}}{\text{Monto Bruto Total Esperado}} \times 100$$
- **Error MAE del modelo**: $1.800.000 CLP/semana (medido mediante backtest walk-forward en 26 semanas).
