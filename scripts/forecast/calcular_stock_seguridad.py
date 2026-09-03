"""
Stock de Seguridad estacional — El Regreso PWA
====================================================================
SS = Z · σ_semanal(mes) · √LT_semanas

Z = 1.645 → 95% de nivel de servicio (probabilidad de no quebrar stock
durante el lead time). Pedido como "Z de 0.95" — 0.95 es el nivel de
servicio, no el valor de Z: Z=0.95 en la curva normal es ~82.9% de
servicio, un número raro para gestionar inventario. La conversión
estándar nivel-de-servicio → Z usa la inversa de la normal estándar.

Lead time: 4 semanas cerveza, 3 semanas kombucha (pedido explícito) —
por categoría, desde costos_precios.categoria.

σ ESTACIONAL, no un solo número para todo el año: se calcula por MES
CALENDARIO (todos los eneros juntos, todos los febreros juntos, etc.)
sobre la misma serie mensual por producto que ya arma
GET /api/produccion/datos — no se vuelve a tocar Supabase ni se duplica
la limpieza de datos (exclusión de clientes internos, cruce producto→
código). Si un mes puntual no tiene ≥2 años de historial, cae a la σ de
toda la serie del producto como respaldo más conservador (confianza='baja').

Punto de reorden = demanda semanal promedio del mes × LT + stock de
seguridad — cuándo hay que reponer, no sólo cuánto colchón mantener.

Ejecución local :  python calcular_stock_seguridad.py
En producción   :  GitHub Actions (.github/workflows/forecast-produccion.yml),
                    mismo cron mensual que el forecast.

Variables de entorno (.env local / secrets en GitHub):
  UPLOAD_URL_BASE         ej. https://el-regreso-pwa-psi.vercel.app
  UPLOAD_SECRET_FORECAST  valor de UPLOAD_SECRET_FORECAST en Vercel
"""
import math
import os
import sys
from collections import defaultdict
from statistics import mean, stdev

import requests
from dotenv import load_dotenv

load_dotenv()

UPLOAD_URL_BASE = os.getenv("UPLOAD_URL_BASE", "https://el-regreso-pwa-psi.vercel.app")
UPLOAD_SECRET = os.getenv("UPLOAD_SECRET_FORECAST")
HEADERS = {"Authorization": f"Bearer {UPLOAD_SECRET}"}

Z_95 = 1.645  # nivel de servicio 95% (one-sided normal)
LEAD_TIME_SEMANAS = {"cerveza": 4, "kombucha": 3}
DIAS_POR_MES = 30.44  # promedio calendario — no hace falta el mes exacto acá
SEMANAS_POR_MES = DIAS_POR_MES / 7
MIN_MUESTRAS_MES_CONFIANZA_ALTA = 2  # ≥2 años del mismo mes calendario


def obtener_datos() -> dict:
    print(f"Descargando datos limpios desde {UPLOAD_URL_BASE}/api/produccion/datos ...")
    r = requests.get(f"{UPLOAD_URL_BASE}/api/produccion/datos", headers=HEADERS, timeout=120)
    r.raise_for_status()
    return r.json()


def calcular_producto(producto: str, categoria: str, puntos: list[dict]) -> list[dict]:
    """Una fila por mes calendario (1-12) para este producto."""
    if categoria not in LEAD_TIME_SEMANAS:
        return []

    por_mes_calendario: dict[int, list[float]] = defaultdict(list)
    todos: list[float] = []
    for p in puntos:
        mes_cal = int(p["mes"][5:7])
        litros = float(p["litros"])
        por_mes_calendario[mes_cal].append(litros)
        todos.append(litros)

    if len(todos) < 2:
        return []  # ni para un σ de respaldo alcanza

    sigma_global = stdev(todos)
    media_global = mean(todos)
    lt = LEAD_TIME_SEMANAS[categoria]

    filas = []
    for mes_cal in range(1, 13):
        valores = por_mes_calendario.get(mes_cal, [])
        if len(valores) >= MIN_MUESTRAS_MES_CONFIANZA_ALTA:
            media_mes, sigma_mes, confianza = mean(valores), stdev(valores), "alta"
        else:
            media_mes, sigma_mes, confianza = media_global, sigma_global, "baja"

        demanda_semanal = media_mes / SEMANAS_POR_MES
        sigma_semanal = sigma_mes / math.sqrt(SEMANAS_POR_MES)
        ss = Z_95 * sigma_semanal * math.sqrt(lt)
        rop = demanda_semanal * lt + ss

        filas.append({
            "producto": producto, "categoria": categoria, "mesCalendario": mes_cal,
            "leadTimeSemanas": lt,
            "demandaSemanalPromedio": round(demanda_semanal, 2),
            "sigmaSemanal": round(sigma_semanal, 2),
            "z": Z_95,
            "stockSeguridadLitros": round(max(ss, 0), 2),
            "puntoReordenLitros": round(max(rop, 0), 2),
            "confianza": confianza,
            "mesesHistorialMes": len(valores),
        })
    return filas


def main() -> int:
    if not UPLOAD_SECRET:
        print("ERROR: falta UPLOAD_SECRET_FORECAST")
        return 1

    datos = obtener_datos()
    productos = datos["series"]["producto"]
    categorias = datos.get("categoriaPorProducto", {})

    filas: list[dict] = []
    sin_categoria = []
    for producto, puntos in productos.items():
        categoria = categorias.get(producto)
        if categoria not in LEAD_TIME_SEMANAS:
            sin_categoria.append(producto)
            continue
        resultado = calcular_producto(producto, categoria, puntos)
        filas.extend(resultado)
        alta = sum(1 for f in resultado if f["confianza"] == "alta")
        print(f"  {producto} ({categoria}): {len(resultado)} meses calculados, {alta} con confianza alta")

    if sin_categoria:
        print(f"\nSin categoría cerveza/kombucha en costos_precios, saltados: {', '.join(sin_categoria)}")

    print(f"\nSubiendo {len(filas)} filas de stock de seguridad ...")
    r = requests.post(
        f"{UPLOAD_URL_BASE}/api/produccion/stock-seguridad/upload",
        headers=HEADERS, json={"filas": filas}, timeout=120,
    )
    if r.status_code != 200:
        print(f"ERROR al subir ({r.status_code}): {r.text}")
        return 1
    print("OK:", r.json())
    return 0


if __name__ == "__main__":
    sys.exit(main())
