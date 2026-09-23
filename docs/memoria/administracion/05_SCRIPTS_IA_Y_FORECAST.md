# 05 — Scripts de IA y Forecast (Módulo de Administración y Finanzas)

## Pipeline de Machine Learning Financiero (Prophet)

A diferencia del módulo de Producción (que proyecta volumen físico en litros), el pipeline de ML de **Administración y Finanzas** proyecta **Venta Neta en CLP ($)**.

```mermaid
flowchart LR
    A[Ventas Históricas ERP] -->|Filtrado por esIngresoReal| B[Agregación Mensual en CLP]
    B -->|Pipeline Prophet Python| C[Generación de Forecast Finanzas]
    C -->|Escritura RLS| D[Tabla forecast_finanzas en Supabase]
    D --> E[Cálculo de Remanente & Flujo Semanal en Next.js]
```

---

## 1. Niveles de Proyección Financiera

1. **General (`general`)**: Total consolidado de venta neta de la empresa.
2. **Por Categoría (`categoria`)**:
   - `Cerveza`: Venta neta de todos los estilos.
   - `Kombucha`: Venta neta de todos los sabores.
3. **Por Cliente Individual (`cliente`)**:
   - Clientes clave con volumen suficiente para un modelo independiente (ej. `Cliente PDV`).
4. **Restaurante BaseCamp (`restaurante`)**:
   - Venta bruta del local propio cargada desde POS Toteat (`ventas_restaurante`).
5. **Compras a Proveedores (`compra`)**:
   - Proyección de egresos por compras a proveedores recurrentes (`compras_historico`).

---

## 2. Validación Walk-Forward y Métricas de Confiabilidad

- **Métrica de Error**: MAPE (Mean Absolute Percentage Error) calculado sobre un backtest walk-forward a 3 meses.
- **Tabla de resultados**: `forecast_finanzas_validacion`.
- **Interpretación**:
  - `MAPE < 15%`: Confiabilidad Alta (línea verde en UI).
  - `15% <= MAPE < 30%`: Confiabilidad Media (línea amarilla).
  - `MAPE >= 30%`: Confiabilidad Baja (línea roja o serie derivada).

---

## 3. Backtest de Modelos de Cobranza (`scripts/analisis/backtest-cobranza.ts`)

Para validar qué estimador proyecta mejor la caja semanal, se ejecutó un backtest sobre 26 semanas de histórico real:

| Estimador Evaluado | MAE Semanal | MAPE | Sesgo | Correlación |
| :--- | :--- | :--- | :--- | :--- |
| **Promedio Medido (Usado en el sistema)** | **$1.800.000 CLP** | **32%** | **+3%** | **0,49** |
| Mediana (p50) | $2.160.000 CLP | 41% | -4% | 0,39 |
| Plazo Declarado en Ficha ERP | $2.490.000 CLP | 47% | +8% | 0,23 |

### Conclusiones Técnicas
1. **Mander la Medición Real sobre la Ficha**: El plazo real medido supera significativamente al plazo declarado por la ficha del ERP (correlación de 0,49 vs. 0,23).
2. **Promedio para Suma de Caja**: Aunque la mediana (p50) describe mejor el comportamiento individual a una persona, el **promedio** es matemáticamente el mejor estimador para proyectar la suma total de dinero que ingresará a la cuenta bancaria en una semana dada.
