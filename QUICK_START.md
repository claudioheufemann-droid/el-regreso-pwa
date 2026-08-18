# Quick Start: Módulo de Deudores

## En 5 Minutos

### 1. Acceder al Dashboard

```
URL: http://localhost:3000/ventas/admin/deudores
Requisito: Estar logueado como admin
```

### 2. Cargar Archivo Excel

1. Arrastra `Deudores (2).xlsx` al área de upload
2. O haz click para seleccionar
3. Espera confirmación (segundos)
4. ✅ Verás stats: nuevos, actualizados, etc.

### 3. Filtrar y Buscar

- **Búsqueda:** Nombre del cliente
- **Vendedor:** Dropdown
- **Categoría:** Dropdown
- **Estado:** Con deuda vencida / Sin deuda vencida

### 4. Ver Detalles

Click en una fila para expandir:
- Información de contacto
- Deuda por antigüedad (0-14 días, 15-29, etc.)
- Detalles de cuenta (límite, última compra, etc.)

---

## Cargas Automáticas 2x Diarias

### Setup (Opcional)

**Solo una vez:**

1. Ir a `.github/workflows/deudores-upload.yml`
2. Actualizar URL del archivo:
   ```yaml
   "file_url": "https://tu-servidor.com/deudores.xlsx"
   ```
3. Agregar secrets en GitHub:
   - `DEUDORES_CRON_SECRET`: Token secreto cualquiera
   - `DEUDORES_FILE_URL`: URL del Excel

4. Commit y push

**Resultado:** El archivo se cargará automáticamente cada día a las 9 AM y 5 PM (Chile).

---

## API (Para Desarrolladores)

### Upload desde código

```bash
# Terminal
curl -X POST http://localhost:3000/api/deudores/upload \
  -F "file=@deudores.xlsx"
```

### Obtener datos

```bash
curl http://localhost:3000/api/deudores/list | jq .
```

### Cron scheduled

```bash
curl -X POST http://localhost:3000/api/deudores/cron-upload \
  -H "Authorization: Bearer tu-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"file_url": "https://..."}'
```

---

## Archivos Excel Esperados

**Hoja:** "Datos" o "Sheet1"

**Columnas obligatorias:**
- NombreDeFantasia ✅

**Columnas importantes:**
- DeudaVencida$ (monto a cobrar urgente)
- BarrilesAdeudados (unidades)
- UltimoPago (última fecha de pago)
- Saldo$ (total debe)

**Opcionales:**
- Email, Telefono, Localidad
- CategoriaCliente, Vendedor
- FechaUltimaCompra, FechaAlta
- Deuda aging breakdown (14 días, 29 días, etc.)

---

## Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| "Solo archivos Excel" | Formato incorrecto | Usa .xlsx o .xls |
| "No data found" | Hoja mal nombrada | Verifica "Datos" o "Sheet1" |
| "Duplicados en archivo" | Nombres repetidos | Revisa columna NombreDeFantasia |
| 401 Unauthorized (cron) | Secret token inválido | Verifica `DEUDORES_CRON_SECRET` |
| Page not found | No eres admin | Pide acceso |

---

## Deduplicación Automática

**¿Qué pasa si cargo el mismo archivo dos veces?**

→ Se actualizan los registros con los nuevos datos. Cero duplicados.

**¿Y si cargo archivos diferentes pero con clientes iguales?**

→ Se actualiza con la información más reciente.

**Ejemplo:**
- Carga 1: Cliente "ABC" con deuda $1000
- Carga 2: Cliente "ABC" con deuda $1500
- Resultado: Deuda = $1500 ✅

---

## Integración con Clientes

El campo `nombre_fantasia` une deudores con clientes:

```
deudores.nombre_fantasia = clientes.nombre_fantasia
```

**Próximas mejoras:**
- [ ] Ver deuda en perfil del cliente
- [ ] Alertas por deuda vencida
- [ ] Historial de pagos

---

## Monitoreo

**Dashboard muestra:**
- 📊 Total de deudores
- 💰 Deuda vencida acumulada
- 💵 Saldo total
- 🛢️ Barriles adeudados
- 📋 Tabla con filtros avanzados

**Últimas cargas:**
- Batch ID (identificador único)
- Cantidad procesada
- Nuevos vs actualizados
- Timestamp

---

## Preguntas Rápidas

**P: ¿Cómo borro un deudor?**
A: No implementado. Los datos persisten. (Próxima versión)

**P: ¿Puedo ver el historial de cambios?**
A: No. Solo última versión. (Próxima versión)

**P: ¿Y si quiero integrar mi sistema contable?**
A: Usa `/api/deudores/list` para leer datos. Cron-upload para cargar.

**P: ¿Funciona en mobile?**
A: Solo dashboard no soportado en mobile. (Próxima versión)

**P: ¿Dónde veo los logs de carga?**
A: En GitHub Actions > Workflows > Deudores Upload

---

## Documentación Completa

📖 Ver: `docs/DEUDORES_SETUP.md`

---

**Necesitas ayuda?** Revisa los archivos:
- `IMPLEMENTATION_SUMMARY.md` - Detalles técnicos
- `docs/DEUDORES_SETUP.md` - Documentación completa
- `scripts/test-deudores-api.sh` - Test los endpoints
