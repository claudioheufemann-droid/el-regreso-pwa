"""
Calibra el forecast de Producción contra su error real, medido en walk-forward.

    scripts/forecast/.venv/Scripts/python.exe scripts/forecast/calibrar_sigma.py [--dry]

Produce DOS factores por serie, que corrigen dos cosas distintas:

    k  →  el ANCHO del colchón.  sigma_real / sigma_que_declara_la_banda
    b  →  el CENTRO del forecast.  forecast_corregido = forecast * b

POR QUÉ EXISTE
--------------
Prophet se autoevalúa mal en las dos dimensiones, y las dos se midieron contra la
realidad el 19-sep-2026:

  · La banda (`interval_width=0.8`) debería cubrir el 80% de los meses. Cubre 28%
    a nivel producto y 48% a nivel producto×envase. El sigma real es ~1.8x/~2.2x
    el declarado, o sea que el colchón salía con la mitad de la incertidumbre que
    corresponde.
  · El centro sobre-pronostica sistemáticamente: +42% a nivel producto, +35% a
    nivel producto×envase. Eso entra lineal al punto de reorden vía
    demanda_semanal = yhat/4.33 — venía mandando a cocer de más.

LOS DOS FACTORES SE MIDEN JUNTOS, Y NO ES UN DETALLE
-----------------------------------------------------
Los errores se compensaban: el sobre-forecast inflaba el punto de reorden justo lo
suficiente para tapar el colchón chico. Corregir uno solo rompe el equilibrio — por
eso `k` se implementó primero (sólo agrega colchón, es seguro aislado) y `b` después.

Además `k` NO es independiente de `b`: al corregir el centro el residual pasa de
(a - y) a (a - b·y) = (a - y) + (1-b)·y, y con b≈0.7 ese término pesa si `y` varía
entre folds. Por eso `k` se calcula sobre los residuales ya corregidos por `b`, en
la misma pasada. Medirlos por separado daría un colchón que no corresponde al
forecast que se publica.

SE CORRE APARTE, NO EN CADA FORECAST
-------------------------------------
Son hasta 12 ajustes de Prophet por serie (~1.400 en total) contra 1 por serie del
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
B_MIN, B_MAX = 0.5, 1.5      # ver acotar_b()
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


def semibanda(yhat: float, yhat_upper: float) -> float:
    """σ declarado por la banda, medido SÓLO con la mitad de arriba.

    generar_forecast.py recorta yhat_lower en 0 antes de guardar (`.clip(lower=0)`),
    así que en las series chicas la banda guardada es más angosta que la que
    Prophet produjo y (yhat_upper - yhat_lower)/2 subestima σ. La mitad de
    arriba no sufre ese recorte — y tampoco se mueve cuando el factor `b`
    desplaza el centro, que es lo que permite corregir el sesgo sin que el
    colchón se achique solo. La banda de Prophet es simétrica, así que la
    semibanda superior es σ·z igual que la inferior.
    """
    return max(yhat_upper - yhat, 0.0) / Z_BANDA_PROPHET


def resumir(reales: list[float], predichos: list[float], anchos: list[float]) -> dict | None:
    """Convierte los folds de un walk-forward en los dos factores de calibración.

    `b` es multiplicativo, no aditivo: el sesgo de Prophet es proporcional al
    nivel de la serie (sobre-pronostica ~40% sobre lo que venda, no ~400 litros
    fijos), así que una razón generaliza cuando el nivel se mueve y una resta no.

    `k` se mide sobre los residuales YA corregidos por `b`, y no sobre los
    crudos: el residual pasa de (a - y) a (a - b·y) = (a - y) + (1-b)·y, y con
    b≈0.7 ese segundo término no es despreciable si y varía entre folds. Medir
    los dos por separado daría un k que no corresponde al forecast que se va a
    publicar.

    Y una vez corregido el sesgo se usa RMSE, no el desvío alrededor de la
    media: antes la media de los residuales era el colchón accidental y había
    que dejarla afuera para no contarla dos veces; ahora ese colchón ya no
    existe, así que lo que quede de sesgo residual tiene que entrar al colchón.
    """
    sigma_banda = statistics.fmean(anchos)
    total_pred = sum(predichos)
    if sigma_banda <= 0 or total_pred <= 0:
        return None

    b_crudo = sum(reales) / total_pred
    corregidos = [a - b_crudo * y for a, y in zip(reales, predichos)]
    sigma_real = (sum(e * e for e in corregidos) / len(corregidos)) ** 0.5

    return {"folds": len(reales), "sigma_real": sigma_real, "sigma_banda": sigma_banda,
            "k_crudo": sigma_real / sigma_banda, "b_crudo": b_crudo,
            # Sesgo de los residuales SIN corregir, sólo para poder mirarlo.
            "sesgo": statistics.fmean([a - y for a, y in zip(reales, predichos)])}


def medir_serie(s: pd.DataFrame) -> dict | None:
    """Walk-forward sobre una serie, con su propio ajuste de Prophet."""
    n = len(s)
    folds = min(MAX_FOLDS, n - MIN_MESES_FORECAST)
    if folds < 3:
        return None

    reales, predichos, anchos = [], [], []
    for corte in range(n - folds, n):
        train = s.iloc[:corte]
        m = Prophet(yearly_seasonality=len(train) >= 24, weekly_seasonality=False,
                    daily_seasonality=False, interval_width=0.8)
        m.fit(train[["ds", "y"]])
        p = m.predict(m.make_future_dataframe(periods=1, freq="MS")).iloc[-1]
        reales.append(float(s.iloc[corte]["y"]))
        predichos.append(float(p["yhat"]))
        anchos.append(semibanda(float(p["yhat"]), float(p["yhat_upper"])))

    return resumir(reales, predichos, anchos)


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
           "ancho": semibanda(float(fila["yhat"]), float(fila["yhat_upper"]))}
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
    reales, predichos, anchos = [], [], []
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

        reales.append(float(s_combo.iloc[corte]["y"]))
        predichos.append(p["yhat"] * ratio)
        anchos.append(p["ancho"] * ratio)

    if len(reales) < 3:
        return None
    # El padre entra SIN corregir, igual que en producción: derivar_de_producto
    # escala el forecast crudo del producto, y generar_forecast.py aplica la
    # corrección a cada serie después de derivar. Si acá se midiera contra un
    # padre ya corregido, el b derivado saldría medido contra otra cosa.
    return resumir(reales, predichos, anchos)


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


def acotar_b(b: float) -> float:
    """
    El tope evita que una serie con pocos folds raros mande el forecast a algo
    que nadie reconocería. No hay asimetría deliberada acá, a diferencia de
    acotar_k: el sesgo se corrige en la dirección que se midió, para arriba o
    para abajo. Quien protege contra el quiebre es el colchón, no el centro —
    dejar el centro alto "por las dudas" es justamente el colchón invisible que
    este paso viene a sacar.
    """
    return max(B_MIN, min(B_MAX, b))


def subir(url: str, key: str, filas: list[dict]) -> int:
    # PostgREST rechaza un insert masivo si las filas no tienen todas las mismas
    # claves ("All object keys must match"), y las de nivel producto no llevan
    # los campos del camino derivado. Se completan con None.
    #
    # Y los NaN se pasan a None: el nivel `general` no tiene clave, y el
    # groupby(dropna=False) de pandas la trae como NaN, que no es JSON válido
    # ("Out of range float values are not JSON compliant").
    def limpio(v):
        return None if isinstance(v, float) and v != v else v

    columnas = sorted({c for f in filas for c in f})
    filas = [{c: limpio(f.get(c)) for c in columnas} for f in filas]

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
              if n in ("general", "envase", "producto", "producto_envase")]

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
                r["derivado"] = rd
                if rd["folds"] >= MIN_FOLDS_CONFIABLE:
                    por_nivel_der[nivel].append(rd)

        medidas.append(r)
        if r["folds"] >= MIN_FOLDS_CONFIABLE:
            por_nivel[nivel].append(r)

    # Mediana por nivel: es el ancla contra la que se encoge cada serie, y el
    # valor que usan las series sin backtest propio suficiente. Cada factor
    # tiene su propia ancla — el sesgo y la sub-cobertura de la banda no son
    # el mismo fenómeno y no tienen por qué moverse juntos.
    def anclas(agrupado: dict) -> dict:
        return {n: {campo: statistics.median([m[campo] for m in v])
                    for campo in ("k_crudo", "b_crudo")}
                for n, v in agrupado.items() if v}

    ancla_propio, ancla_der = anclas(por_nivel), anclas(por_nivel_der)

    def encoger(crudo: float, n: int, ancla: float, acotar) -> float:
        # Con pocos folds el valor propio es ruido, así que se lo tira hacia la
        # mediana del nivel. peso = n/(n+MIN_FOLDS_CONFIABLE) — con 6 folds
        # pesa 50% lo propio, con 12 pesa 67%, con 3 sólo 33%.
        w = n / (n + MIN_FOLDS_CONFIABLE)
        return acotar(w * crudo + (1 - w) * ancla)

    filas = []
    for r in medidas:
        a = ancla_propio.get(r["nivel"], {"k_crudo": 2.0, "b_crudo": 1.0})
        fila = {"nivel": r["nivel"], "clave": r["clave"], "folds": r["folds"],
                "k": round(encoger(r["k_crudo"], r["folds"], a["k_crudo"], acotar_k), 4),
                "b": round(encoger(r["b_crudo"], r["folds"], a["b_crudo"], acotar_b), 4),
                "k_crudo": round(r["k_crudo"], 4), "b_crudo": round(r["b_crudo"], 4),
                "sigma_real": round(r["sigma_real"], 2),
                "sigma_banda": round(r["sigma_banda"], 2),
                "sesgo_litros": round(r["sesgo"], 2)}
        rd = r.get("derivado")
        if rd:
            ad = ancla_der.get(r["nivel"], {"k_crudo": 2.0, "b_crudo": 1.0})
            fila["k_derivado"] = round(
                encoger(rd["k_crudo"], rd["folds"], ad["k_crudo"], acotar_k), 4)
            fila["b_derivado"] = round(
                encoger(rd["b_crudo"], rd["folds"], ad["b_crudo"], acotar_b), 4)
            fila["k_crudo_derivado"] = round(rd["k_crudo"], 4)
            fila["b_crudo_derivado"] = round(rd["b_crudo"], 4)
            fila["folds_derivado"] = rd["folds"]
        filas.append(fila)

    def tabla(titulo: str, subtitulo: str, campo: str) -> None:
        print("\n" + "=" * 78)
        print(titulo)
        print("=" * 78)
        print(f"  {subtitulo}")
        print(f"  {'':<22}{'series':>8}{'p10':>8}{'p25':>8}{'mediana':>10}{'p75':>8}{'p90':>8}")
        grupos = [(n, [f[campo] for f in filas if f["nivel"] == n])
                  for n in ("producto", "producto_envase")]
        grupos.append(("producto_envase (der.)",
                       [f[campo + "_derivado"] for f in filas if campo + "_derivado" in f]))
        for nombre, vals in grupos:
            if not vals:
                continue
            vs = sorted(vals)
            def q(p, _vs=vs):
                return _vs[min(int(p * len(_vs)), len(_vs) - 1)]
            print(f"  {nombre:<22}{len(vs):>8}{q(.10):>8.2f}{q(.25):>8.2f}"
                  f"{statistics.median(vs):>10.2f}{q(.75):>8.2f}{q(.90):>8.2f}")

    tabla("FACTOR k — colchon", "sigma real / sigma que declara la banda", "k_crudo")
    tabla("FACTOR b — centro", "cuanto hay que multiplicar el forecast (b<1 = sobre-pronostica)",
          "b_crudo")

    sobre = sum(1 for f in filas if f["b_crudo"] < 1.0)
    print(f"\n  series que SOBRE-pronostican (b<1): {sobre}/{len(filas)}")
    print(f"  series topeadas en k={K_MAX}: {sum(1 for f in filas if f['k'] >= K_MAX)}")
    print(f"  series topeadas en b={B_MIN}/{B_MAX}: "
          f"{sum(1 for f in filas if f['b'] <= B_MIN or f['b'] >= B_MAX)}")

    with open(salida, "w", encoding="utf-8") as fh:
        json.dump({"ancla_propio": ancla_propio, "ancla_derivado": ancla_der,
                   "series": filas}, fh, ensure_ascii=False, indent=2)
    print(f"\n  detalle por serie -> {os.path.relpath(salida, RAIZ)}")

    if dry:
        print("\n--dry: no se sube nada.")
        return 0
    return subir(url, key, filas)


if __name__ == "__main__":
    sys.exit(main())
