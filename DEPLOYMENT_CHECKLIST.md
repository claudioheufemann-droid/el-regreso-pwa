# Deployment Checklist: Módulo de Deudores

**Fecha de Deploy:** ___________
**Responsable:** ___________
**Ambiente:** ☐ Staging ☐ Production

---

## Pre-Deployment (Desarrollo Local)

### Verificaciones Iniciales
- [ ] Git repo limpio (git status)
- [ ] Branch actualizado (git pull origin main)
- [ ] No conflictos pendientes

### Build & Dependencies
- [ ] `npm install` ejecutado (si hay cambios en package.json)
- [ ] `npm run build` sin errores
- [ ] `npm run lint` sin errores (eslint)

### Database
- [ ] Supabase project: `ploqghkbgmayrnqtqdrs`
- [ ] Tabla `deudores` existe (verificar en Supabase dashboard)
- [ ] RLS habilitado ✅
- [ ] Índices creados ✅
- [ ] Migrations aplicadas ✅

### Environment Variables
- [ ] `.env.local` configurado con:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `DEUDORES_CRON_SECRET` (cualquier valor para testing)
  - `NEXT_PUBLIC_APP_URL=http://localhost:3000`

### Testing Local

#### 1. Start Server
```bash
npm run dev
```
- [ ] Server inicia sin errores (http://localhost:3000)

#### 2. Test Dashboard
```
URL: http://localhost:3000/ventas/admin/deudores
```
- [ ] Página carga sin errores
- [ ] KPI cards visibles
- [ ] Upload zone renderiza
- [ ] Filtros funcionales
- [ ] Mobile warning aparece en mobile

#### 3. Test Upload API
```bash
curl -X POST http://localhost:3000/api/deudores/upload \
  -F "file=@./Deudores\ \(2\).xlsx"
```
- [ ] Respuesta JSON válida
- [ ] batch_id generado
- [ ] Stats correctas (total_procesados, nuevos, actualizados)

#### 4. Test List API
```bash
curl http://localhost:3000/api/deudores/list | jq . | head -20
```
- [ ] Array de deudores retornado
- [ ] Campos correctos (nombre_fantasia, deuda_vencida, etc.)
- [ ] Ordenado por deuda_vencida DESC

#### 5. Test Cron Endpoint
```bash
curl -X POST http://localhost:3000/api/deudores/cron-upload \
  -H "Authorization: Bearer test-secret" \
  -H "Content-Type: application/json" \
  -d '{"file_url": "https://..."}'
```
- [ ] Sin Authorization: retorna 401
- [ ] Con Authorization correcta: intenta fetch del archivo
- [ ] Respuesta esperada en caso de error

#### 6. Run Test Script
```bash
bash scripts/test-deudores-api.sh http://localhost:3000 "./Deudores (2).xlsx"
```
- [ ] Todos los tests pasan
- [ ] No hay timeouts
- [ ] Respuestas válidas

### Browser Testing (Desktop)
- [ ] Chrome/Edge: Funciona ✅
- [ ] Upload file drag & drop: Funciona ✅
- [ ] Filtros: Funciona ✅
- [ ] Expand rows: Funciona ✅
- [ ] No console errors ✅
- [ ] Responsive desktop (1920px+): Óptimo ✅

---

## Deployment a Staging (Vercel)

### Pre-Deploy
- [ ] Todos los tests locales pasan
- [ ] No hay console errors o warnings
- [ ] Code review completo

### Deploy Steps
```bash
git add .
git commit -m "feat: deudores module + desktop optimization"
git push origin main
```

- [ ] GitHub Actions dispara build automático
- [ ] Build completa sin errores
- [ ] Deployment a Vercel inicia

### Post-Deploy Staging
- [ ] URL staging disponible
- [ ] Verificar SUPABASE_SERVICE_KEY en Vercel (no expuesto)
- [ ] Verificar DEUDORES_CRON_SECRET en Vercel
- [ ] Test dashboard en staging URL
- [ ] Test upload con archivo real

---

## Pre-Production Checks

### Security Audit
- [ ] RLS habilitado en deudores ✅
- [ ] Service key no expuesto en frontend ✅
- [ ] Cron endpoint requiere Authorization header ✅
- [ ] CORS implícitamente limitado ✅
- [ ] No hay secrets en código ✅

### Performance Check
- [ ] Dashboard carga < 3 segundos
- [ ] Upload 273 registros < 1 segundo
- [ ] Query list < 500ms
- [ ] No memory leaks en React components

### Data Integrity
- [ ] Deduplicación funciona (upload dos veces = sin duplicados)
- [ ] Campos NULL se manejan correctamente
- [ ] Números se parsean correctamente
- [ ] Fechas se convierten correctamente

---

## Production Deployment

### Final Checks (2 horas antes)
- [ ] Backup de database Supabase
- [ ] Plan de rollback identificado
- [ ] Team notificado del deployment
- [ ] Maintenance window planeado (si es necesario)

### Deploy
```bash
# Vercel auto-deploys from main, pero puedes también:
vercel --prod
```

- [ ] Production build completa
- [ ] Health checks pasan
- [ ] No errors en Vercel dashboard

### Post-Deploy Verification (Primeras 2 horas)

#### 1. Basic Functionality
- [ ] Dashboard accesible: `/ventas/admin/deudores`
- [ ] Upload funciona con archivo test
- [ ] List API retorna datos
- [ ] Filtros funcionan

#### 2. Monitor Logs
- [ ] Vercel logs: No errors
- [ ] Supabase logs: No errors
- [ ] API response times: Normales

#### 3. Data Verification
```sql
-- En Supabase console:
SELECT COUNT(*) FROM deudores;
SELECT * FROM deudores ORDER BY updated_at DESC LIMIT 5;
```
- [ ] Registros visibles
- [ ] Updated_at timestamps correctos
- [ ] upload_batch_id poblado

#### 4. Edge Cases
- [ ] Re-upload mismo archivo: Deduplicación funciona
- [ ] Upload archivo pequeño: OK
- [ ] Upload archivo grande: OK
- [ ] Buscar cliente no existente: OK (sin resultados)

---

## GitHub Actions Setup (Cron 2x Daily)

### Prerequisites
- [ ] Repository secrets configurados en GitHub:
  ```
  DEUDORES_CRON_SECRET: [tu-secret-aqui]
  DEUDORES_FILE_URL: [url-al-archivo-excel]
  ```

### Workflow File
- [ ] `.github/workflows/deudores-upload.yml` existe
- [ ] Schedules correctos:
  ```
  - cron: '0 15 * * *'  # 9 AM Chile
  - cron: '0 21 * * *'  # 5 PM Chile
  ```
- [ ] File triggers on schedule

### First Run Test
- [ ] Manual trigger en GitHub Actions
- [ ] Workflow completa sin errores
- [ ] Check deudores count aumentó
- [ ] Email/Slack notification recibida (si está configurado)

### Schedule Verification (First 24 Hours)
- [ ] 9 AM: Cron dispara automáticamente
- [ ] Upload completa exitosamente
- [ ] 5 PM: Segundo cron dispara
- [ ] Upload completa exitosamente
- [ ] Logs accesibles en GitHub Actions

---

## Rollback Plan (Si algo sale mal)

### Opción 1: Revert Code
```bash
git revert [commit-hash]
git push origin main
# Vercel auto-redeploy
```

### Opción 2: Disable Cron
- [ ] Comentar schedules en `.github/workflows/deudores-upload.yml`
- [ ] Push changes
- [ ] Investigar issue

### Opción 3: Database Restore
- [ ] Supabase > Backup & Restore
- [ ] Restaurar a snapshot pre-deployment
- [ ] Verificar data integridad

---

## Monitoring Post-Deployment

### Daily (Primeros 7 días)
- [ ] Dashboard accesible
- [ ] API latencies normales
- [ ] No error spikes en logs
- [ ] Cron jobs ejecutándose a tiempo

### Weekly (Próximas 4 semanas)
- [ ] User feedback positivo
- [ ] No issues reportados
- [ ] Performance stable
- [ ] Deuda data accurata

### Monthly
- [ ] Performance review
- [ ] Security audit
- [ ] Backup verification
- [ ] Plan próximas features

---

## Success Criteria ✅

Deployment considerado exitoso cuando:

- [x] Dashboard carga sin errores en todos los navegadores
- [x] Upload de Excel funciona y deduplica correctamente
- [x] APIs responden en < 1 segundo para datos normales
- [x] Cron jobs se ejecutan 2x diarios sin errores
- [x] RLS implementado y funcional
- [x] Ningún usuario reporte problemas
- [x] Logs sin errores críticos
- [x] Database integridad verificada

---

## Sign-Off

### Deployment Lead
- Nombre: _______________
- Fecha: _______________
- Firma: _______________

### QA Approval
- Nombre: _______________
- Fecha: _______________
- Firma: _______________

### Production Owner
- Nombre: _______________
- Fecha: _______________
- Firma: _______________

---

## Notes & Issues Found

```
[Espacio para notas durante deployment]


```

---

**Deployment Guide Version:** 1.0
**Last Updated:** 2026-05-28
**Status:** Ready for Deployment ✅
