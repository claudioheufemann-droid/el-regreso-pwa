# Sistema de Memoria y Contexto de IA — El Regreso PWA

> **Instrucción para cualquier Asistente / Agente IA:**
> Antes de realizar análisis, refactorizaciones o agregar funcionalidades en este repositorio, debes consultar la documentación acumulada en esta carpeta `docs/memoria/` correspondiente al área en la que vas a trabajar.

---

## Estrategia de Contexto Persistente

Para evitar pérdida de contexto entre sesiones de chat o cambios de modelo de IA, mantenemos una memoria técnica estructurada en control de versiones (Git).

Cada módulo del sistema cuenta con su subcarpeta dedicada conteniendo:
1. **Dominio y Resumen Ejecutivo**: Conceptos del negocio y reglas operativas.
2. **Modelos de Datos y Arquitectura**: Esquemas de Supabase, tablas, RLS e interfaces TypeScript.
3. **Reglas de Negocio y Algoritmos**: Fórmulas, ventanas de tiempo, lead times, lógica de quiebre de stock.
4. **Componentes y Vistas**: Mapa de componentes React / Next.js y estado del cliente.
5. **Modelos de IA y Scripts**: Pipelines de machine learning (Prophet, Python, backtesting).

---

## Módulos Disponibles

| Módulo | Ruta de Memoria | Estado | Descripción Principal |
| :--- | :--- | :--- | :--- |
| **Producción** | [`docs/memoria/produccion/`](file:///c:/Users/benja/Downloads/Gas%20abastible%20-20260402T132210Z-1-001/el-regreso-web/.git/El%20Regreso%20PWA/docs/memoria/produccion/) | Activo | Forecasting Prophet, Stock de Seguridad, Gantt de Tanques, Plan Maestro, MRP Insumos. |

---

## Buenas Prácticas al Trabajar con la Memoria

1. **Si descubres una nueva regla de negocio o solucionas un bug arquitectónico importante**, actualiza la memoria relevante dentro de `docs/memoria/`.
2. **Preserva la precisión histórica**: No elimines decisiones pasadas sin documentar por qué cambiaron (ej. fusión de latas 354ml+473ml, ciclo 24-23, agrupación de barriles 30L+50L).
3. **Sincronización:** Si modificas `lib/produccion/reglas.ts`, asegúrate de reflejarlo en `03_REGLAS_NEGOCIO_Y_ALGORITMOS.md`.
