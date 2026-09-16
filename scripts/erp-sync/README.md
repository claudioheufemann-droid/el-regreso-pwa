# ERP Sync — Carga automática de ventas

Robot que descarga el informe de **Ventas Detalladas** desde **Gestión
Cervecera** y lo sube a la PWA, sin intervención manual. Corre en dos
frecuencias distintas:

```
GitHub Actions (cada 15 min, 11:00-23:00 UTC / ~07:00-19:00 Chile)
  → Playwright: login + descarga del Excel del período de venta vigente (24 → hoy)
  → POST a /api/upload-ventas  ← reusa TODA la lógica de la carga manual
      (alias Charly→Carlos, dedup, exclusión de internos, reemplazo día a día)

GitHub Actions (1 vez al día, 08:30 UTC / ~04:30-05:30 Chile) — backfill
  → mismo flujo, pero pide los ÚLTIMOS 90 DÍAS en vez del período vigente
```

**Por qué existe el backfill diario:** el sync de 15 min sólo vuelve a pedir
el período de venta vigente. Si un pedido se factura DESPUÉS de que su
período quedó atrás, esa factura nunca se vuelve a sincronizar y
`numero_factura` queda en `null` para siempre en la app, aunque el ERP ya
tenga el número — se detectó el 16-sep-2026 con julio-2026 100% marcado "sin
facturar" en el módulo de Deudores. El backfill re-pide los últimos 90 días
todos los días para que esas facturas tardías se reflejen apenas el ERP las
emite. Usa el mismo endpoint de reemplazo-por-pedido, así que no duplica nada.

No escribe directo a Supabase: el endpoint de la PWA es la única fuente de verdad.

## Probar en local

```bash
cd scripts/erp-sync
pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env      # y completa los valores
python extractor.py       # abre ventana visible; HEADLESS=1 para sin ventana
```

## Completar la navegación (paso único)

`navegar_y_descargar()` en `extractor.py` está sin mapear. Para grabarla:

```bash
python -m playwright codegen https://www.gestioncervecera.com/login
```

Login → Ventas Detalladas → filtro de fechas → descargar. Copia el código
que genera y reemplaza el cuerpo de `navegar_y_descargar()` (debe terminar
con `download.save_as(...)` y `return` de la ruta).

## Secrets en GitHub (Settings → Secrets and variables → Actions)

| Secret | Valor |
|--------|-------|
| `ERP_URL` | `https://www.gestioncervecera.com/login` |
| `ERP_USERNAME` | correo del ERP |
| `ERP_PASSWORD` | password del ERP |
| `UPLOAD_URL` | `https://el-regreso-pwa-psi.vercel.app/api/upload-ventas` |
| `CRON_SECRET` | mismo valor que `CRON_SECRET` en Vercel |

> `CRON_SECRET` debe existir también en Vercel (Project → Settings → Env Vars).
> El endpoint acepta `Authorization: Bearer <CRON_SECRET>` y usa service-role
> para escribir saltando RLS.
