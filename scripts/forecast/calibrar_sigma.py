"""
Mide cuánto miente la banda de Prophet, por serie, y guarda el factor de corrección.

    scripts/forecast/.venv/Scripts/python.exe scripts/forecast/calibrar_sigma.py [--dry]

POR QUÉ EXISTE
--------------
`calcular_stock_seguridad` en generar_forecast.py saca el sigma del colchón de la
banda que Prophet declara:

    sigma_mensual = (litrosMax - litrosMin) / (2 * 1.2816)

Esa banda es la autoevaluación del modelo sobre su propio ajuste, no su error fuera
de muestra. Medida contra la realidad (19-sep-2026) cubre 28% de los meses a nivel
producto y 48% a nivel producto×envase, cuando debería cubrir 80%. El sigma real es
~1.8x / ~2.2x el declarado, o sea que el colchón está calculado con la mitad de la
incertidumbre que corresponde.

Este script corre un walk-forward por serie, compara el sigma de los residuales
REALES contra el que declaró la banda, y deja el cociente `k` en la tabla
`calibracion_sigma`. generar_forecast.py lo lee y multiplica.

QUÉ SIGMA SE MIDE, Y POR QUÉ ESE
---------------------------------
Se usa el desvío estándar de los residuales ALREDEDOR DE SU MEDIA, no el RMSE.
La diferencia importa: Prophet sobre-pronostica sistemáticamente (+42%/+35%), así
que sus residuales tienen media distinta de cero. Ese sesgo YA infla el punto de
reorden por el otro término (`demanda_semanal * ventana`); meterlo también en el
sigma lo contaría dos veces. El desvío mide la DISPERSIÓN, que es lo que el colchón
tiene que cubrir, y queda correcto tanto ahora como si más adelante se corrige el
sesgo.

SE CORRE APARTE, NO EN CADA FORECAST
-------------------------------------
Son hasta 12 ajustes de Prophet por serie (~1.100 en total) contra 1 por serie del
pipeline normal. La calibración cambia lento — es una propiedad del modelo, no del
mes — así que se recalcula de tanto en tanto y el forecast diario sólo lee la tabla.
"""

import os
import re
import sys
import json
import logging
import warnings
import statistics
from collections import defaultdict

import pandas as pd
import requests

warnings.simplefilter("ignore")
logging.getLogger("prophet").setLevel(logging.CRITICAL)
logging.getLogger("cmdstanpy").setLevel(logging.CRITICAL)
from prophet import Prophet  # noqa: E402

MIN_MESES_FORECAST = 6       # igual que el pipeline: mínimo para intentar un ajuste
MAX_FOLDS = 12               # cuántos meses de walk-forward pedirle a cada serie
MIN_FOLDS_CONFIABLE = 6      # con menos residuales que esto, el k propio no manda solo
Z_BANDA_PROPHET = 1.2816
K_MIN, K_MAX = 1.0, 4.0      # ver acotar_k()

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")


def cargar_env() -> dict:
    env = {}
    with open(os.path.join(RAIZ, ".env.local"), encoding="utf-8") as fh:
        for linea in fh:
            m = re.match(r"^([A-Za-z0-9_]+)=(.*)$", linea)
            if m:
                env[m.group(1)] = m.group(2).strip().strip("\"'")
    return env


def traer_historico(url: str, key: str) -> pd.DataFrame:
    filas, offset = [], 0
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    while True:
        r = requests.get(f"{url}/rest/v1/forecast_produccion",
                         headers={**h, "Range": f"{offset}-{offset + 999}"},
                         params={"select": "nivel,clave,mes,litros", "tipo": "eq.historico",
                                 "order": "mes.asc"}, timeout=120)
        r.raise_for_status()
        lote = r.json()
        if not lote:
            break
        filas.extend(lote)
        if len(lote) < 1000:
            break
        offset += 1000
    df = pd.DataFrame(filas)
    df["ds"] = pd.to_datetime(df["mes"])
    df["y"] = df["litros"].astype(float)
    return df


def medir_serie(s: pd.DataFrame) -> dict | None:
    """Walk-forward sobre una serie. Devuelve sigma real vs. sigma declarado."""
    n = len(s)
    folds = min(MAX_FOLDS, n - MIN_MESES_FORECAST)
    if folds < 3:
        return None

    residuales, anchos = [], []
    for corte in range(n - folds, n):
        train = s.iloc[:corte]
        m = Prophet(yearly_seasonality=len(train) >= 24, weekly_seasonality=False,
                    daily_seasonality=False, interval_width=0.8)
        m.fit(train[["ds", "y"]])
        p = m.predict(m.make_future_dataframe(periods=1, freq="MS")).iloc[-1]
        residuales.append(float(s.iloc[corte]["y"]) - float(p["yhat"]))
        anchos.append((float(p["yhat_upper"]) - float(p["yhat_lower"])) / (2 * Z_BANDA_PROPHET))

    sigma_banda = statistics.fmean(anchos)
    if sigma_banda <= 0:
        return None
    # Desvío alrededor de la media, NO rmse: el sesgo no va acá (ver docstring).
    sigma_real = statistics.stdev(residuales)
    return {"folds": len(residuales), "sigma_real": sigma_real,
            "sigma_banda": sigma_banda, "k_crudo": sigma_real / sigma_banda,
            "sesgo": statistics.fmean(residuales)}


def acotar_k(k: float) -> float:
    """
    El piso en 1.0 es una decisión, no un detalle: si una serie midió que su banda
    es MÁS ancha que su error real, no le achicamos el colchón. El backtest tiene
    pocos folds y una serie puede salir 'sobre-cubierta' por suerte; equivocarse
    hacia el colchón grande cuesta capital inmovilizado, hacia el chico cuesta
    quiebre y góndola perdida. El techo evita que una serie con 3 residuales raros
    dispare el colchón a un litraje que Producción no va a poder cocer igual.
    """
    return max(K_MIN, min(K_MAX, k))


def subir(url: str, key: str, filas: list[dict]) -> int:
    print(f"\nsubiendo {len(filas)} filas a calibracion_sigma ...", flush=True)
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}
    r = requests.post(f"{url}/rest/v1/calibracion_sigma?on_conflict=nivel,clave",
                      headers=h, json=filas, timeout=120)
    if r.status_code >= 300:
        print(f"ERROR al subir ({r.status_code}): {r.text}")
        return 1
    print("OK")
    return 0


def main() -> int:
    dry = "--dry" in sys.argv
    env = cargar_env()
    url, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"]
    salida = os.path.join(RAIZ, "scripts", "forecast", "calibracion_sigma.json")

    # Re-subir lo ya medido sin repetir ~1.100 ajustes de Prophet. Sirve cuando
    # la medición salió bien pero la subida falló, o para reponer la tabla.
    if "--desde-json" in sys.argv:
        with open(salida, encoding="utf-8") as fh:
            guardado = json.load(fh)
        return subir(url, key, guardado["series"])

    print("descargando histórico ...", flush=True)
    df = traer_historico(url, key)
    series = [(n, c, g.sort_values("ds")[["ds", "y"]].reset_index(drop=True))
              for (n, c), g in df.groupby(["nivel", "clave"], dropna=False)
              if n in ("producto", "producto_envase")]

    medidas, por_nivel = [], defaultdict(list)
    for i, (nivel, clave, s) in enumerate(series, 1):
        print(f"  [{i}/{len(series)}] {nivel}/{clave}", flush=True)
        r = medir_serie(s)
        if not r:
            continue
        r.update(nivel=nivel, clave=clave)
        medidas.append(r)
        if r["folds"] >= MIN_FOLDS_CONFIABLE:
            por_nivel[nivel].append(r["k_crudo"])

    # Mediana por nivel: es el ancla contra la que se encoge cada serie, y el
    # valor que usan las series sin backtest propio suficiente.
    k_nivel = {n: statistics.median(v) for n, v in por_nivel.items() if v}

    filas = []
    for r in medidas:
        n = r["folds"]
        ancla = k_nivel.get(r["nivel"], 2.0)
        # Shrinkage: con pocos folds el k propio es ruido, así que se lo tira
        # hacia la mediana del nivel. peso = n/(n+MIN_FOLDS_CONFIABLE) — con 6
        # folds pesa 50% lo propio, con 12 pesa 67%, con 3 sólo 33%.
        w = n / (n + MIN_FOLDS_CONFIABLE)
        k = acotar_k(w * r["k_crudo"] + (1 - w) * ancla)
        filas.append({"nivel": r["nivel"], "clave": r["clave"], "k": round(k, 4),
                      "k_crudo": round(r["k_crudo"], 4), "folds": n,
                      "sigma_real": round(r["sigma_real"], 2),
                      "sigma_banda": round(r["sigma_banda"], 2),
                      "sesgo_litros": round(r["sesgo"], 2)})

    print("\n" + "=" * 78)
    print("DISTRIBUCION DEL FACTOR k (sigma real / sigma que declara la banda)")
    print("=" * 78)
    print(f"  {'nivel':<18}{'series':>8}{'p10':>8}{'p25':>8}{'mediana':>10}{'p75':>8}{'p90':>8}")
    for nivel in ("producto", "producto_envase"):
        ks = sorted(f["k_crudo"] for f in filas if f["nivel"] == nivel)
        if not ks:
            continue

        def q(p, _ks=ks):
            return _ks[min(int(p * len(_ks)), len(_ks) - 1)]

        print(f"  {nivel:<18}{len(ks):>8}{q(.10):>8.2f}{q(.25):>8.2f}"
              f"{statistics.median(ks):>10.2f}{q(.75):>8.2f}{q(.90):>8.2f}")

    print(f"\n  ancla por nivel (mediana, solo series con >= {MIN_FOLDS_CONFIABLE} folds):")
    for n, v in k_nivel.items():
        print(f"    {n:<18}{v:.2f}")

    bajo = sum(1 for f in filas if f["k_crudo"] < 1.0)
    topeadas = sum(1 for f in filas if f["k"] >= K_MAX)
    print(f"\n  series cuya banda YA era suficiente (k<1): {bajo}/{len(filas)}")
    print(f"  series topeadas en k={K_MAX}: {topeadas}")

    with open(salida, "w", encoding="utf-8") as fh:
        json.dump({"k_por_nivel": k_nivel, "series": filas}, fh, ensure_ascii=False, indent=2)
    print(f"\n  detalle por serie -> {os.path.relpath(salida, RAIZ)}")

    if dry:
        print("\n--dry: no se sube nada.")
        return 0
    return subir(url, key, filas)


if __name__ == "__main__":
    sys.exit(main())
