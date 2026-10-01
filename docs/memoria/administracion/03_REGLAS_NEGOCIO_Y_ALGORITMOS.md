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

## Calendario de entradas por día (1-oct-2026)

- **Facturas**: cada factura impaga cae en su fecha esperada de pago (`fechaEsperada` o `fechaEsperadaPactada` según escenario). Las **ya atrasadas no se calendarizan** (su fecha pasó; se informan aparte). **Los clientes con crédito pagan sólo de lunes a viernes** (medido en `cobros_erp`: 0 pagos en fin de semana), así que lo que vence sábado o domingo se muestra el **lunes**.
- **Mostrador PDV**: promedio semanal de cobros (`cobro_mostrador_semanal`, 12 semanas) repartido con el patrón real por día de la semana de los últimos 112 días (lun 9% · mar 10% · mié 15% · jue 16% · vie 24% · sáb 25% · dom ~0%).
- **BaseCamp**: monto semanal = forecast del modelo (ciclo 24→23 repartido parejo por día y sumado por semana completa) repartido con el patrón por día de `ventas_restaurante` (vie 27% · sáb 22%). El restaurante se carga a mano: si la última venta cargada tiene más de 3 días, los días pasados sin dato muestran lo esperado marcado con * y NO cuentan como "ya entró".
- **Alerta de datos (1-oct-2026)**: el forecast de BaseCamp para el ciclo de octubre ($20,8 M/semana) está ~55% sobre lo que vendió de verdad en las últimas 8 semanas completas ($13,4 M/semana). La pantalla lo avisa y ofrece un interruptor "Forecast / Promedio real". Pendiente: revisar el modelo `restaurante` en `forecast_finanzas`.
- Todo en **bruto** (lo que llega al banco), igual que el resto del flujo de caja.
