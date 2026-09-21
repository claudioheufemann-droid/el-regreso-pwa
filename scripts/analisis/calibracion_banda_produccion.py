"""
¿La banda de confianza de Prophet dice la verdad?

    scripts/forecast/.venv/Scripts/python.exe scripts/analisis/calibracion_banda_produccion.py

POR QUE ESTA PREGUNTA ES LA QUE IMPORTA
----------------------------------------
El stock de seguridad de Produccion no se calcula con el forecast: se calcula
con su INCERTIDUMBRE. En generar_forecast.py::calcular_stock_seguridad:

    sigma_mensual = (litrosMax - litrosMin) / (2 * 1.2816)
    SS = Z * sqrt(ventana * sigma_semanal^2 + ...)

O sea que el colchon sale de la banda de Prophet (interval_width=0.8), no de
su error real. Si la banda es mas angosta que el error que el modelo comete de
verdad, el sigma queda chico, el colchon queda chico, y el panel dice "estas
cubierto" mientras la planta quiebra stock.

Esto mide exactamente eso: en el walk-forward, que porcentaje de los meses
reales cayo DENTRO de la banda de 80%. Si el modelo estuviera bien calibrado
seria ~80%. Menos que eso = el colchon esta subdimensionado en esa proporcion.
"""

import os
import re
import sys
import logging
import warnings
from collections import defaultdict

import pandas as pd
import requests

warnings.simplefilter("ignore")
logging.getLogger("prophet").setLevel(logging.CRITICAL)
logging.getLogger("cmdstanpy").setLevel(logging.CRITICAL)
from prophet import Prophet  # noqa: E402

MIN_MESES_FORECAST = 6
MESES_BACKTEST = 6
Z_BANDA = 1.2816  # interval_width=0.8 => +-1.2816 sigma


def cargar_env() -> tuple[str, str]:
    raiz = os.path.join(os.path.dirname(__file__), "..", "..")
    env = {}
    with open(os.path.join(raiz, ".env.local"), encoding="utf-8") as fh:
        for linea in fh:
            m = re.match(r"^([A-Za-z0-9_]+)=(.*)$", linea)
            if m:
                env[m.group(1)] = m.group(2).strip().strip("\"'")
    return env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"]


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


def main() -> int:
    url, key = cargar_env()
    print("descargando historico…", flush=True)
    df = traer_historico(url, key)

    res = defaultdict(lambda: {"dentro": 0, "total": 0, "bajo": 0, "sobre": 0,
                               "sigma_banda": [], "sigma_real": []})
    series = [(n, c, g.sort_values("ds")[["ds", "y"]].reset_index(drop=True))
              for (n, c), g in df.groupby(["nivel", "clave"], dropna=False)
              if n in ("producto", "producto_envase")]

    for i, (nivel, clave, s) in enumerate(series, 1):
        n = len(s)
        if n < MIN_MESES_FORECAST + MESES_BACKTEST:
            continue
        print(f"  [{i}/{len(series)}] {nivel}/{clave}", flush=True)
        errores = []
        for corte in range(n - MESES_BACKTEST, n):
            train = s.iloc[:corte]
            if len(train) < MIN_MESES_FORECAST:
                continue
            m = Prophet(yearly_seasonality=len(train) >= 24, weekly_seasonality=False,
                        daily_seasonality=False, interval_width=0.8)
            m.fit(train[["ds", "y"]])
            p = m.predict(m.make_future_dataframe(periods=1, freq="MS")).iloc[-1]
            real = float(s.iloc[corte]["y"])
            lo, hi, yhat = float(p["yhat_lower"]), float(p["yhat_upper"]), float(p["yhat"])

            r = res[nivel]
            r["total"] += 1
            if lo <= real <= hi:
                r["dentro"] += 1
            elif real > hi:
                r["sobre"] += 1   # vendimos MAS de lo que la banda admitia => riesgo de quiebre
            else:
                r["bajo"] += 1
            # sigma que declara la banda vs. sigma del error real
            r["sigma_banda"].append((hi - lo) / (2 * Z_BANDA))
            errores.append(real - yhat)

        if errores:
            media = sum(errores) / len(errores)
            var = sum((e - media) ** 2 for e in errores) / max(len(errores) - 1, 1)
            res[nivel]["sigma_real"].append(var ** 0.5)

    print("\n" + "=" * 74)
    print("CALIBRACION DE LA BANDA DE PROPHET (deberia cubrir el 80%)")
    print("=" * 74)
    print(f"  {'nivel':<18}{'meses':>7}{'dentro':>9}{'por encima':>12}{'por debajo':>12}")
    for nivel, r in res.items():
        t = r["total"]
        print(f"  {nivel:<18}{t:>7}{r['dentro'] / t * 100:>8.0f}%"
              f"{r['sobre'] / t * 100:>11.0f}%{r['bajo'] / t * 100:>11.0f}%")

    print("\n" + "=" * 74)
    print("SIGMA DECLARADO POR LA BANDA vs. SIGMA DEL ERROR REAL")
    print("=" * 74)
    print(f"  {'nivel':<18}{'banda':>12}{'real':>12}{'cuanto falta':>15}")
    for nivel, r in res.items():
        sb = sum(r["sigma_banda"]) / len(r["sigma_banda"])
        sr = sum(r["sigma_real"]) / len(r["sigma_real"])
        print(f"  {nivel:<18}{sb:>12.0f}{sr:>12.0f}{sr / sb:>14.2f}x")

    print("\nLectura: 'por encima' es el caso peligroso — el mes real supero el techo")
    print("de la banda, o sea que se vendio mas de lo que el colchon contemplaba.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
