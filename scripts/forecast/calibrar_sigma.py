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
# ESPEJO de generar_forecast.py::MESES_PROPORCION_DERIVADA — la ventana con la
# que el pipeline calcula qué proporción del producto es cada formato. Tiene que
# ser la misma o el camino derivado se mide contra un ratio que no es el que se
# va a usar en producción.
MESES_PROPORCION_DERIVADA = 6

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


def ajustar_padre(producto: str, s: pd.DataFrame, corte_ds: pd.Timestamp, cache: dict) -> dict | None:
    """Ajuste del producto padre hasta `corte_ds`, cacheado.

    Varios envases comparten padre, así que sin cache el mismo ajuste se
    repetiría una vez por formato.
    """
    llave = (producto, corte_ds)
    if llave in cache:
        return cache[llave]
    train = s[s["ds"] < corte_ds]
    if len(train) < MIN_MESES_FORECAST:
        cache[llave] = None
        return None
    m = Prophet(yearly_seasonality=len(train) >= 24, weekly_seasonality=False,
                daily_seasonality=False, interval_width=0.8)
    m.fit(train[["ds", "y"]])
    fila = m.predict(pd.DataFrame({"ds": [corte_ds]})).iloc[-1]
    out = {"yhat": float(fila["yhat"]),
           "ancho": (float(fila["yhat_upper"]) - float(fila["yhat_lower"])) / (2 * Z_BANDA_PROPHET)}
    cache[llave] = out
    return out


def medir_serie_derivada(s_combo: pd.DataFrame, producto: str, s_padre: pd.DataFrame,
                         cache: dict) -> dict | None:
    """Igual que medir_serie, pero por el camino que usa de verdad un combo derivado.

    Un producto×envase marcado `derivado` NO tiene banda propia en producción:
    generar_forecast.py::derivar_de_producto le da la del producto padre
    escalada por la proporción reciente del formato. O sea que el k medido
    sobre un ajuste propio corrige el ratio equivocado para esas series. Acá se
    reproduce la derivación fold por fold — mismo ratio sobre los últimos
    MESES_PROPORCION_DERIVADA meses de overlap que usa el pipeline — y se mide
    el k contra la banda que esa serie realmente va a recibir.
    """
    n = len(s_combo)
    folds = min(MAX_FOLDS, n - MIN_MESES_FORECAST)
    if folds < 3:
        return None

    padre_por_mes = dict(zip(s_padre["ds"], s_padre["y"]))
    residuales, anchos = [], []
    for corte in range(n - folds, n):
        corte_ds = s_combo.iloc[corte]["ds"]
        p = ajustar_padre(producto, s_padre, corte_ds, cache)
        if not p:
            continue

        # Ratio con los datos disponibles ANTES del corte, como en producción.
        train_combo = s_combo.iloc[:corte]
        meses = list(train_combo["ds"])[-MESES_PROPORCION_DERIVADA:]
        meses = [m for m in meses if m in padre_por_mes]
        total_padre = sum(float(padre_por_mes[m]) for m in meses)
        if total_padre <= 0:
            continue
        total_combo = float(train_combo[train_combo["ds"].isin(meses)]["y"].sum())
        ratio = max(total_combo, 0.0) / total_padre

        residuales.append(float(s_combo.iloc[corte]["y"]) - p["yhat"] * ratio)
        anchos.append(p["ancho"] * ratio)

    if len(residuales) < 3:
        return None
    sigma_banda = statistics.fmean(anchos)
    if sigma_banda <= 0:
        return None
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
    # PostgREST rechaza un insert masivo si las filas no tienen todas las mismas
    # claves ("All object keys must match"), y las de nivel producto no llevan
    # los campos del camino derivado. Se completan con None.
    columnas = sorted({c for f in filas for c in f})
    filas = [{c: f.get(c) for c in columnas} for f in filas]

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

    series_producto = {c: s for (n, c, s) in series if n == "producto"}
    cache_padre: dict = {}

    medidas, por_nivel, por_nivel_der = [], defaultdict(list), defaultdict(list)
    for i, (nivel, clave, s) in enumerate(series, 1):
        print(f"  [{i}/{len(series)}] {nivel}/{clave}", flush=True)
        r = medir_serie(s)
        if not r:
            continue
        r.update(nivel=nivel, clave=clave)

        # Para los combos, medir TAMBIÉN el camino derivado: en producción un
        # combo puede recibir la banda del padre escalada en vez de la propia,
        # y el pipeline elige método corrida a corrida. Se guardan los dos y
        # generar_forecast.py toma el que corresponda al método de esa corrida.
        if nivel == "producto_envase":
            nombre_padre = (clave or "").split("::")[0]
            padre = series_producto.get(nombre_padre)
            rd = (medir_serie_derivada(s, nombre_padre, padre, cache_padre)
                  if padre is not None else None)
            if rd:
                r["k_crudo_derivado"] = rd["k_crudo"]
                r["folds_derivado"] = rd["folds"]
                if rd["folds"] >= MIN_FOLDS_CONFIABLE:
                    por_nivel_der[nivel].append(rd["k_crudo"])

        medidas.append(r)
        if r["folds"] >= MIN_FOLDS_CONFIABLE:
            por_nivel[nivel].append(r["k_crudo"])

    # Mediana por nivel: es el ancla contra la que se encoge cada serie, y el
    # valor que usan las series sin backtest propio suficiente.
    k_nivel = {n: statistics.median(v) for n, v in por_nivel.items() if v}
    k_nivel_der = {n: statistics.median(v) for n, v in por_nivel_der.items() if v}

    def encoger(k_crudo: float, n: int, ancla: float) -> float:
        # Con pocos folds el k propio es ruido, así que se lo tira hacia la
        # mediana del nivel. peso = n/(n+MIN_FOLDS_CONFIABLE) — con 6 folds
        # pesa 50% lo propio, con 12 pesa 67%, con 3 sólo 33%.
        w = n / (n + MIN_FOLDS_CONFIABLE)
        return acotar_k(w * k_crudo + (1 - w) * ancla)

    filas = []
    for r in medidas:
        fila = {"nivel": r["nivel"], "clave": r["clave"],
                "k": round(encoger(r["k_crudo"], r["folds"], k_nivel.get(r["nivel"], 2.0)), 4),
                "k_crudo": round(r["k_crudo"], 4), "folds": r["folds"],
                "sigma_real": round(r["sigma_real"], 2),
                "sigma_banda": round(r["sigma_banda"], 2),
                "sesgo_litros": round(r["sesgo"], 2)}
        if "k_crudo_derivado" in r:
            nd = r["folds_derivado"]
            fila["k_derivado"] = round(
                encoger(r["k_crudo_derivado"], nd, k_nivel_der.get(r["nivel"], 2.0)), 4)
            fila["k_crudo_derivado"] = round(r["k_crudo_derivado"], 4)
            fila["folds_derivado"] = nd
        filas.append(fila)

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

    ks_der = sorted(f["k_crudo_derivado"] for f in filas if "k_crudo_derivado" in f)
    if ks_der:
        print(f"  {'por camino derivado':<18}{len(ks_der):>8}"
              f"{ks_der[len(ks_der) // 10]:>8.2f}{ks_der[len(ks_der) // 4]:>8.2f}"
              f"{statistics.median(ks_der):>10.2f}{ks_der[len(ks_der) * 3 // 4]:>8.2f}"
              f"{ks_der[min(len(ks_der) * 9 // 10, len(ks_der) - 1)]:>8.2f}")

    print(f"\n  ancla por nivel (mediana, solo series con >= {MIN_FOLDS_CONFIABLE} folds):")
    for n, v in k_nivel.items():
        print(f"    {n:<18}{v:.2f}")
    for n, v in k_nivel_der.items():
        print(f"    {n + ' (derivado)':<18}{v:.2f}")

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
