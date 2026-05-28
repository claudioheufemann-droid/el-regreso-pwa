# Sistema de Gestión de Deudores

## Descripción General

Sistema completo para cargar, monitorear y administrar información de deuda vencida, barriles adeudados y últimos pagos de clientes.

**Características:**
- ✅ Upload de archivos Excel (.xlsx, .xls) optimizado para desktop
- ✅ Deduplicación automática basada en nombre_fantasia
- ✅ Seguimiento de deuda por antigüedad (0-14 días, 15-29, etc.)
- ✅ Integración con tabla clientes via nombre_fantasia
- ✅ Filtros avanzados por vendedor, categoría, estado de deuda
- ✅ Carga 2x diaria vía cron jobs
- ✅ API REST para automatización externa

## Estructura de Datos

### Tabla: `deudores`

```sql
- id (uuid, primary key)
- nombre_fantasia (text, unique) - Foreign key equivalente a clientes.nombre_fantasia
- saldo_total (numeric)
- deuda_vencida (numeric) - Deuda vencida a cobrar urgente
- barriles_adeudados (integer)
- ultimo_pago (timestamp)
- razon_social (text)
- email, telefono, localidad (text)
- categoria_cliente (text)
- vendedor (text)
- tipo_cliente (text)
- fecha_ultima_compra (timestamp)
- fecha_alta (timestamp)
- limite_cta_cte (numeric)

### Deuda Aging (por antigüedad):
- deuda_menor_14_dias
- deuda_entre_15_29_dias
- deuda_entre_30_44_dias
- deuda_entre_45_59_dias
- deuda_entre_60_89_dias
- deuda_mas_90_dias

### Metadata:
- upload_batch_id (text) - Identificador único de cada carga
- external_remito_mas_antiguo, external_fecha
- created_at, updated_at
```

## Acceso

### UI Dashboard (Desktop Only)
- **URL:** `/ventas/admin/deudores`
- **Requisitos:** User admin
- **Responsivo:** Desktop optimizado (alerta si se accede desde mobile)

**Funcionalidades:**
1. **Upload de archivos Excel**
   - Drag & drop o click para seleccionar
   - Validación en tiempo real
   - Feedback de deduplicación automática

2. **Dashboard KPIs**
   - Total de deudores
   - Deuda vencida total
   - Saldo total acumulado
   - Barriles adeudados

3. **Tabla de deudores**
   - Ordenable por deuda vencida (descendente)
   - Filtros: Cliente, Vendedor, Categoría, Estado deuda
   - Click en fila para expandir detalles
   - Desglose de deuda por antigüedad

## APIs

### 1. POST `/api/deudores/upload`

**Función:** Cargar archivo Excel con datos de deudores

**Request:**
```bash
curl -X POST http://localhost:3000/api/deudores/upload \
  -F "file=@deudores.xlsx"
```

**Content-Type:** `multipart/form-data`
- Field: `file` (Excel file .xlsx or .xls)

**Response (Success):**
```json
{
  "ok": true,
  "batch_id": "1716979200000-a1b2c3d4e",
  "total_procesados": 273,
  "nuevos": 45,
  "actualizados": 228,
  "duplicados_en_archivo": 0
}
```

**Validaciones:**
- ✅ Solo Excel (.xlsx, .xls)
- ✅ Hoja "Datos" o "Sheet1" obligatoria
- ✅ Columna "NombreDeFantasia" obligatoria
- ✅ Detecta duplicados dentro del mismo archivo
- ✅ Auto-deduplicación: actualiza registros existentes con última versión

**Columnas esperadas (del archivo Deudores (2).xlsx):**
- NombreDeFantasia ✓
- Saldo$ ✓
- DeudaVencida$ ✓
- BarrilesAdeudados ✓
- UltimoPago
- RazonSocial
- Email, Telefono, Localidad
- CategoriaCliente, Vendedor, TipoDeCliente
- FechaUltimaCompra, FechaAlta
- LimiteCtaCte$
- DeudaMenorA14Dias$, DeudaEntre15Y29Dias$, etc. (aging breakdown)

### 2. GET `/api/deudores/list`

**Función:** Obtener lista completa de deudores

**Response:**
```json
[
  {
    "id": "uuid",
    "nombre_fantasia": "Cliente X",
    "deuda_vencida": 1500000,
    "saldo_total": 3000000,
    "barriles_adeudados": 10,
    ...
  }
]
```

### 3. GET `/api/deudores/upload`

**Función:** Obtener estadísticas generales

**Response:**
```json
{
  "total_deudores": 273,
  "ultimo_batch_id": "1716979200000-a1b2c3d4e"
}
```

### 4. POST `/api/deudores/cron-upload` (Scheduled)

**Función:** Endpoint para cargas programadas (GitHub Actions, Vercel Cron, etc.)

**Requisitos:**
- Header: `Authorization: Bearer {DEUDORES_CRON_SECRET}`
- Environment variable: `DEUDORES_CRON_SECRET` configurada

**Request:**
```json
{
  "file_url": "https://your-server.com/path/to/deudores.xlsx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Scheduled upload completed",
  "result": { ... },
  "timestamp": "2026-05-28T14:30:00.000Z"
}
```

## Configuración de Cargas 2x Diarias

### Opción 1: GitHub Actions

Crear `.github/workflows/deudores-cron.yml`:

```yaml
name: Deudores Upload

on:
  schedule:
    # 9 AM Chile Time (UTC-4, daylight saving UTC-3)
    - cron: '0 13 * * *'
    # 5 PM Chile Time
    - cron: '0 21 * * *'

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - name: Upload deudores
        run: |
          curl -X POST https://tu-app.vercel.app/api/deudores/cron-upload \
            -H "Authorization: Bearer ${{ secrets.DEUDORES_CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            -d '{
              "file_url": "${{ secrets.DEUDORES_FILE_URL }}"
            }'
```

**Secrets necesarios en GitHub:**
- `DEUDORES_CRON_SECRET`: Token para autenticación
- `DEUDORES_FILE_URL`: URL del archivo Excel (debe ser descargable públicamente o con auth)

### Opción 2: Vercel Cron Functions

Crear `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/deudores/cron-upload",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/deudores/cron-upload",
      "schedule": "0 17 * * *"
    }
  ]
}
```

Environment variables:
- `DEUDORES_CRON_SECRET` en Vercel dashboard

### Opción 3: Servicio Externo (Zapier, n8n, etc.)

1. Configurar webhook POST a: `https://tu-app.vercel.app/api/deudores/cron-upload`
2. Headers:
   - `Authorization: Bearer {DEUDORES_CRON_SECRET}`
   - `Content-Type: application/json`
3. Body:
   ```json
   {
     "file_url": "https://..."
   }
   ```
4. Schedule: 2x daily

## Environment Variables

```bash
# En .env.local (desarrollo) o Vercel (producción)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Cron uploads
DEUDORES_CRON_SECRET=your-secret-token

# Optional: Para cron endpoint
NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
```

## Deduplicación

### Cómo funciona:

1. **Dentro del mismo archivo:** Detecta nombres duplicados y rechaza la carga
   - Error: "Duplicados en el archivo: Cliente A, Cliente B..."

2. **Entre cargas:** Usa `nombre_fantasia` como clave única
   - Si existe un deudor con ese nombre, actualiza sus datos
   - Mantiene solo la versión más reciente
   - Historial: `upload_batch_id` registra de dónde vino

3. **Validación de datos:**
   - Nombres vacíos se ignoran
   - Números se parsean correctamente
   - Fechas se convierten automáticamente
   - Valores NULL en campos opcionales se preservan

## Integración con Clientes

### Link automático:

El campo `nombre_fantasia` actúa como foreign key equivalente:

```typescript
// Buscar cliente por deudor
const deudor = await supabase
  .from('deudores')
  .select('*')
  .eq('nombre_fantasia', 'Mi Cliente')

const cliente = await supabase
  .from('clientes')
  .select('*')
  .eq('nombre_fantasia', deudor.nombre_fantasia)
```

### Próxima implementación:
- [ ] Mostrar deuda en perfil de cliente
- [ ] Historial de pagos integrado
- [ ] Alertas por deuda vencida
- [ ] Reportes combinados ventas + deuda

## Troubleshooting

### Error: "Solo archivos Excel"
- Asegúrate de usar .xlsx o .xls
- Verifica que el navegador no está bloqueando la descarga

### Error: "No data found in Excel"
- Asegúrate que existe hoja "Datos" o "Sheet1"
- Verifica que hay datos desde fila 2 en adelante

### Error: "Duplicados en el archivo"
- Revisa que cada cliente tenga un nombre único en el Excel
- Usa búsqueda Find & Replace para limpiar nombres

### Cron no se ejecuta
- Verifica `DEUDORES_CRON_SECRET` está configurado
- Test el endpoint: `GET /api/deudores/cron-upload`
- Revisa logs de GitHub Actions o Vercel

## Performance

**Optimizaciones:**
- Índices en: `nombre_fantasia`, `upload_batch_id`, `vendedor`, `updated_at`
- Carga máx: 1000 registros por upload (limitado en código)
- UI: Renderizado virtual para tablas grandes (futura mejora)

**Benchmarks:**
- Parse Excel: 273 registros ~100ms
- Upsert: 273 registros ~500ms
- Total carga: ~600ms

## Preguntas Frecuentes

**P: ¿Qué pasa si cargo el mismo archivo dos veces?**
A: Se actualizan los registros con los mismos datos. Sin duplicados.

**P: ¿Puedo deletar deudores?**
A: No implementado. Los registros persisten. Para limpiar, carga un Excel sin esos clientes.

**P: ¿Cómo integro con mi sistema contable?**
A: Usa `/api/deudores/list` para extraer datos. Cron-upload para las cargas programadas.

**P: ¿En qué zona horaria se ejecutan los cron?**
A: UTC (server). Ajusta los schedules según tu zona (Chile: UTC-3 o UTC-4).

## Roadmap

- [ ] API para deletar deudores
- [ ] Exportar a Excel desde dashboard
- [ ] Historial de cambios (audit log)
- [ ] Webhooks para eventos (deuda_vencida>0, etc.)
- [ ] Integración con WhatsApp para alertas
- [ ] Reportes PDF automáticos
- [ ] Mobile UI para consulta rápida
