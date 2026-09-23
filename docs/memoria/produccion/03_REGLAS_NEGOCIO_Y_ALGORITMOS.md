# 03 — Reglas de Negocio y Algoritmos (Módulo de Producción)

## Fuente Única de Verdad
La lógica de negocio reside centralizada en [`lib/produccion/reglas.ts`](file:///c:/Users/benja/Downloads/Gas%20abastible%20-20260402T132210Z-1-001/el-regreso-web/.git/El%20Regreso%20PWA/lib/produccion/reglas.ts), compartida entre las funciones Server-Side Rendering (`app/produccion/page.tsx`) y las APIs de agregación.

---

## 1. Días Hábiles de Chile (`esDiaHabilISO`)

### Regla Operativa
El reparto comercial opera de **lunes a viernes**, sin ventas en fines de semana ni feriados oficiales. 
Por lo tanto, la velocidad o ritmo de venta ($L/\text{día}$) se calcula exclusivamente dividiendo el volumen vendido por **días hábiles transcurridos**, no por días calendario.

### Algoritmo de Feriados Chilenos
- **Pascua y Semana Santa**: Se calcula automáticamente el Domingo de Pascua mediante el algoritmo de Gauss/Meeus para cualquier año.
- **Traslado de Feriados (Ley 19.668)**: San Pedro y San Pablo, Encuentro de Dos Mundos si caen martes/miércoles/jueves se desplazan al lunes anterior.
- **Fijos**: 1 ene, 1 may, 21 may, 16 jul, 15 ago, 18-19 sep, 31 oct, 1 nov, 8 dic, 25 dic.

---

## 2. Estimación de Ritmo Real: Trailing 28 días vs MTD

Para estimar la velocidad de venta actual y proyectar fechas de quiebre:

- **MTD (Month-To-Date)**: Ventas acumuladas desde el día 24 del ciclo actual. Presenta alta volatilidad durante los primeros 10-12 días hábiles de cada ciclo.
- **Trailing 28 Días (Ventana Móvil)**: Se consideran las ventas de los **últimos 28 días corridos** sobre el número de **días hábiles** en ese rango. Es el estimador oficial usado para calcular:
  - Alarmas de quiebre de stock.
  - Fechas de quiebre proyectadas.
  - Reparto de fermentadores (Split).

---

## 3. Stock de Seguridad y Punto de Reorden

$$
\text{Punto de Reorden (L)} = \text{Demanda en Ventana} + \text{Stock de Seguridad}
$$

Donde la ventana abarca:
$$
\text{Ventana Total (Semanas)} = \text{Lead Time Cocción} + \text{Periodo Revisión} + \text{Lead Time Insumos (2 sem)}
$$

- **`LEAD_TIME_INSUMOS_SEMANAS` = 2**: Tiempo necesario para gestionar la compra y llegada de materias primas antes de iniciar la cocción.

### Redondeo Físico a Barriles (`redondearLitrosABarril`)
Un barril no se llena ni almacena a medias. 
Los objetivos de stock de seguridad para `barril_30` o `barril_50` se redondean hacia arriba al múltiplo entero de barril más cercano ($\lceil \text{litros} / \text{tamaño} \rceil \times \text{tamaño}$).

---

## 4. Algoritmo de Split de Fermentadores (`SplitFermentador`)

Cuando un fermentador tiene cerveza o kombucha lista (líquido a granel), este volumen aún no tiene envase. El sistema decide automáticamente cuántos litros enviar a `barril_30`, `barril_50` o `lata`:

1. **Prioridad por Necesidad**: Calcula cuánto le falta a cada formato para alcanzar su Punto de Reorden individual.
2. **Asignación en 3 Capas**:
   - Capa 1: Cubrir el Colchón de Seguridad de cada formato.
   - Capa 2: Cubrir la Venta de la Ventana de Reposición.
   - Capa 3: Excedente repartido proporcionalmente según la demanda futura proyectada.
3. **Disponibilidad Estimada**: Asume la fecha estimada de embarrilado del tanque más tardío del lote.

---

## 5. Fechas Límite de Producción y Gestión

Para una sugerencia de cocción con fecha estimada de quiebre $F_{\text{quiebre}}$:

- **Fecha Límite de Inicio de Cocción**:
  $$F_{\text{inicio}} = F_{\text{quiebre}} - \text{Lead Time Cocción (días hábiles)}$$
- **Fecha Límite de Gestión de Insumos**:
  $$F_{\text{gestión}} = F_{\text{inicio}} - 10 \text{ días hábiles (2 semanas)}$$

Si $F_{\text{gestión}}$ o $F_{\text{inicio}}$ son anteriores a la fecha de hoy, la sugerencia se marca como **Atrasada**, alertando de forma crítica en la UI.
