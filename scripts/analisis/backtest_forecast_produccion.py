"""
Backtest del forecast de Producción, por producto y por producto x envase.

    scripts/forecast/.venv/Scripts/python.exe scripts/analisis/backtest_forecast_produccion.py

QUE MIDE
--------
Walk-forward de 6 pliegues con horizonte de 1 mes, el mismo protocolo que ya
usa generar_forecast.py::backtest(): entrena sólo con lo anterior al mes M y
predice M. Sobre esos MISMOS pliegues compara varios metodos, para poder
decidir con datos cual conviene en cada nivel:

  prophet           el modelo actual
  derivado          (sólo producto x envase) forecast del producto x la
                    proporcion reciente del formato — lo que hoy se usa como
                    plan B, replicando derivar_de_producto()
  media3            promedio de los ultimos 3 meses
  naive_estacional  el mismo mes del año anterior
  naive             el ultimo mes

POR QUE HACE FALTA
------------------
1) El MAPE que hoy se guarda para una serie DERIVADA no mide la serie
   derivada: es el MAPE del PRODUCTO, copiado. El codigo lo justifica con
   "escalar por una proporcion constante no cambia el error porcentual", y
   eso vale si el real tambien escalara igual — pero el real del formato no
   es el del producto por el ratio: la mezcla de formatos se mueve mes a mes.
   O sea que el error verdadero de las derivadas nunca se midio.

2) Las constantes que deciden propio vs derivado (MIN_MESES_MODELO_PROPIO,
   MAPE_MAXIMO_MODELO_PROPIO) se fijaron a criterio. Con los dos metodos
   medidos sobre los mismos pliegues se puede ver si la regla elige bien.

3) Los baselines tontos son el control que faltaba. En series mensuales
   cortas y ruidosas, Prophet no siempre le gana a un promedio movil; si
   pierde, conviene saberlo antes que seguir pagando 6 fits por serie.

RESULTADO DE LA CORRIDA DEL 19-sep-2026 (44 meses de historia)
--------------------------------------------------------------
La metrica que manda es WAPE = litros de error / litros reales. El MAPE por
serie NO sirve para decidir acá: una serie de 20 L/mes errada por 20 L marca
100%, igual que una de 2.000 L errada por 2.000, y con eso Kombucha Mango
(2.895% de MAPE) arrastra cualquier promedio.

  producto (22 series)          WAPE   sesgo   gana en
    ensemble                     27%    +15%      23%
    naive_estacional             28%     +4%       9%
    estacional_crec              29%    +11%      23%
    naive                        32%    +15%      32%
    media3                       39%    +28%       9%
    prophet  (el actual)         55%    +42%       5%

  producto x envase (49 series) WAPE   sesgo   gana en
    ensemble                     36%    +13%      27%
    naive_estacional             39%      0%      20%
    naive                        42%    +13%      16%
    estacional_crec              45%    +14%       8%
    media3                       45%    +26%       6%
    prophet  (el actual)         54%    +35%       6%
    derivado (el plan B actual)  56%    +39%      16%

Tres conclusiones:

  · Prophet es el PEOR metodo en los dos niveles y gana en 1 de 22 productos.
    Con 44 meses de historia y estacionalidad fuerte (Dic-Feb), el "mismo mes
    del año pasado" captura el patron directo y Prophet sobreajusta ruido.

  · Prophet ademas SOBREESTIMA de forma sistematica (+42% y +35%). El negocio
    crecio 2-4x en el historial y Prophet extrapola esa tendencia; si el
    crecimiento se aplano, sigue proyectando hacia arriba. Traducido a
    planta: sugiere cocer de mas. Que `estacional_crec` (corregir por
    crecimiento reciente) EMPEORE el resultado confirma que el crecimiento
    ya se aplano.

  · El `derivado` es el peor de todos, peor incluso que el naive mas tonto.
    Es el plan B que hoy se activa para 32 de 69 combinaciones, justamente
    las que menos historia tienen. Esas series estarian mejor con casi
    cualquier otra cosa, su propio modelo Prophet incluido (gana el propio en
    63% de los cara a cara).

QUE FALTA ANTES DE CAMBIAR EL PIPELINE
--------------------------------------
No es un cambio de una linea. Prophet ademas entrega dos cosas que el resto
de la app consume y que un baseline no trae puestas:

  · la banda de confianza (litrosMin/litrosMax), de donde calcular_stock_seguridad
    saca el sigma. Habria que derivarla de los residuos del walk-forward.
  · la descomposicion tendencia/estacionalidad que muestra "Ver el modelo".

Y este backtest mide horizonte de 1 mes (igual que el del pipeline, y es lo
que responde "Proximo mes" en pantalla), pero Necesidad de Produccion
Anticipada suma varios meses hacia adelante. El estacional se extiende bien a
cualquier horizonte; el `media3` del ensemble se aplana pasado el primer mes.
"""

import json
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
MESES_PROPORCION_DERIVADA = 6


def cargar_env() -> tuple[str, str]:
    raiz = os.path.join(os.path.dirname(__file__), "..", "..")
    with open(os.path.join(raiz, ".env.local"), encoding="utf-8") as fh:
        env = {}
        for linea in fh:
            m = re.match(r"^([A-Za-z0-9_]+)=(.*)$", linea)
            if m:
                env[m.group(1)] = m.group(2).strip().strip("\"'")
    return env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"]


def traer_historico(url: str, key: str) -> pd.DataFrame:
    filas, offset = [], 0
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    while True:
        r = requests.get(
            f"{url}/rest/v1/forecast_produccion",
            headers={**headers, "Range": f"{offset}-{offset + 999}"},
            params={"select": "nivel,clave,mes,tipo,litros", "tipo": "eq.historico",
                    "order": "mes.asc"},
            timeout=120,
        )
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


def prophet_1mes(train: pd.DataFrame) -> float:
    """Igual que el pipeline: yearly sólo con >=24 meses, predice 1 mes."""
    m = Prophet(yearly_seasonality=len(train) >= 24, weekly_seasonality=False, daily_seasonality=False)
    m.fit(train[["ds", "y"]])
    pred = m.predict(m.make_future_dataframe(periods=1, freq="MS")).iloc[-1]
    return max(float(pred["yhat"]), 0.0)


def metricas(pares: list[tuple[float, float]]) -> dict | None:
    """pares = [(real, estimado)]. MAPE ignora reales en 0, con abs() en el
    denominador — mismo criterio que el pipeline."""
    if not pares:
        return None
    mae = sum(abs(r - e) for r, e in pares) / len(pares)
    no_cero = [(r, e) for r, e in pares if r != 0]
    mape = (sum(abs(r - e) / abs(r) for r, e in no_cero) / len(no_cero) * 100) if no_cero else None
    # Para el WAPE agregado: el error total y el volumen total de la serie.
    # WAPE = sum|error| / sum|real| no revienta cuando un mes real es chico,
    # que es justo donde el MAPE deja de servir (una serie de 20 L/mes con un
    # error de 20 L marca 100%, igual que una de 2.000 L errada por 2.000).
    suma_err = sum(abs(r - e) for r, e in pares)
    suma_real = sum(abs(r) for r, e in pares)
    # Error CON signo: un metodo que se queda corto de forma sistematica es
    # peligroso para el stock de seguridad, aunque su error absoluto sea bajo.
    suma_sesgo = sum(e - r for r, e in pares)
    return {"mae": mae, "mape": mape, "n": len(pares),
            "suma_err": suma_err, "suma_real": suma_real, "suma_sesgo": suma_sesgo}


def main() -> int:
    url, key = cargar_env()
    print("descargando historico…", flush=True)
    df = traer_historico(url, key)
    print(f"  {len(df)} filas", flush=True)

    series: dict[tuple[str, str], pd.DataFrame] = {}
    for (nivel, clave), g in df.groupby(["nivel", "clave"], dropna=False):
        if nivel not in ("producto", "producto_envase"):
            continue
        s = g.sort_values("ds")[["ds", "y"]].reset_index(drop=True)
        series[(nivel, clave)] = s

    productos = {k[1]: v for k, v in series.items() if k[0] == "producto"}
    combos = {k[1]: v for k, v in series.items() if k[0] == "producto_envase"}
    print(f"  {len(productos)} productos, {len(combos)} producto x envase", flush=True)

    # ── Pliegues del producto, cacheados: cada combo derivado los reutiliza ──
    # (un producto con 6 pliegues se ajusta 6 veces, no una por cada formato)
    print("\najustando productos…", flush=True)
    pred_producto: dict[str, dict[pd.Timestamp, float]] = defaultdict(dict)
    filas_res = []

    def evaluar(nivel: str, clave: str, s: pd.DataFrame, es_combo: bool) -> None:
        n = len(s)
        if n < MIN_MESES_FORECAST + MESES_BACKTEST:
            return
        producto = clave.split("::", 1)[0] if es_combo else clave
        s_prod = productos.get(producto)

        pares: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for corte in range(n - MESES_BACKTEST, n):
            train = s.iloc[:corte]
            if len(train) < MIN_MESES_FORECAST:
                continue
            real = float(s.iloc[corte]["y"])
            mes = s.iloc[corte]["ds"]

            pares["prophet"].append((real, prophet_1mes(train)))

            # media movil de 3 meses
            pares["media3"].append((real, float(train["y"].tail(3).mean())))
            # ultimo mes
            pares["naive"].append((real, float(train["y"].iloc[-1])))
            # mismo mes del año anterior
            hace_un_anio = mes - pd.DateOffset(years=1)
            fila = train[train["ds"] == hace_un_anio]
            if not fila.empty:
                base = float(fila["y"].iloc[0])
                pares["naive_estacional"].append((real, base))

                # El mismo mes del año pasado, corregido por cuanto crecio el
                # negocio desde entonces: los ultimos 3 meses contra esos
                # mismos 3 meses un año antes. El historial tiene al negocio
                # creciendo 2-4x, asi que el estacional puro deberia quedar
                # corto de forma sistematica — esto lo pone a prueba.
                # El factor se acota a [0.5, 2] para que un mes raro en el
                # denominador no dispare la proyeccion.
                meses_prev = [mes - pd.DateOffset(years=1, months=k) for k in (1, 2, 3)]
                prev3 = float(train[train["ds"].isin(meses_prev)]["y"].sum())
                ult3 = float(train["y"].tail(3).sum())
                factor = min(max(ult3 / prev3, 0.5), 2.0) if prev3 > 0 else 1.0
                pares["estacional_crec"].append((real, max(base * factor, 0.0)))

                # Promedio simple del estacional y la media movil: combinar dos
                # metodos con errores poco correlacionados suele ganarle a los
                # dos por separado.
                pares["ensemble"].append((real, (base + float(train["y"].tail(3).mean())) / 2))

            # derivado: forecast del producto en ese mes x proporcion reciente,
            # todo calculado sin mirar mas alla del corte
            if es_combo and s_prod is not None:
                tp = s_prod[s_prod["ds"] < mes]
                if len(tp) >= MIN_MESES_FORECAST:
                    if mes not in pred_producto[producto]:
                        pred_producto[producto][mes] = prophet_1mes(tp)
                    yhat_prod = pred_producto[producto][mes]
                    meses_ratio = list(train["ds"].tail(MESES_PROPORCION_DERIVADA))
                    prod_reciente = float(tp[tp["ds"].isin(meses_ratio)]["y"].sum())
                    if prod_reciente > 0:
                        combo_reciente = float(train[train["ds"].isin(meses_ratio)]["y"].sum())
                        ratio = max(combo_reciente, 0.0) / prod_reciente
                        pares["derivado"].append((real, yhat_prod * ratio))

        for metodo, ps in pares.items():
            m = metricas(ps)
            if m:
                filas_res.append({"nivel": nivel, "clave": clave, "metodo": metodo,
                                  "meses": n, **m})

    for i, (clave, s) in enumerate(productos.items(), 1):
        print(f"  [{i}/{len(productos)}] {clave}", flush=True)
        evaluar("producto", clave, s, es_combo=False)
    print("\najustando producto x envase…", flush=True)
    for i, (clave, s) in enumerate(combos.items(), 1):
        print(f"  [{i}/{len(combos)}] {clave}", flush=True)
        evaluar("producto_envase", clave, s, es_combo=True)

    res = pd.DataFrame(filas_res)
    res.to_csv(os.path.join(os.path.dirname(__file__), "backtest_produccion_resultado.csv"), index=False)

    print("\n" + "=" * 78)
    print("RESUMEN POR NIVEL Y METODO  (WAPE mas bajo = mejor)")
    print("=" * 78)
    # WAPE = error total en litros / volumen total. Es la metrica que manda
    # para planificar produccion: equivocarse 200 L en un producto de 3.000
    # L/mes pesa mas que equivocarse 20 L en uno de 20 L/mes, y el MAPE dice
    # lo contrario (ambos marcan ~100%). Por eso el MAPE de una serie de bajo
    # volumen se dispara a miles por ciento y arrastra cualquier promedio.
    resumen = (res.groupby(["nivel", "metodo"])
                  .agg(series=("clave", "nunique"),
                       err=("suma_err", "sum"),
                       real=("suma_real", "sum"),
                       sesgo=("suma_sesgo", "sum"),
                       mae_mediana=("mae", "median"),
                       mape_mediana=("mape", "median"))
                  .reset_index())
    resumen["wape"] = resumen["err"] / resumen["real"] * 100
    resumen["sesgo_pct"] = resumen["sesgo"] / resumen["real"] * 100
    resumen = resumen.sort_values(["nivel", "wape"])
    for nivel, g in resumen.groupby("nivel"):
        print(f"\n{nivel}")
        print(f"  {'metodo':<20}{'series':>7}{'WAPE':>8}{'sesgo':>8}{'MAE med':>10}{'error total L':>16}")
        for _, r in g.iterrows():
            print(f"  {r['metodo']:<20}{int(r['series']):>7}{r['wape']:>7.0f}%"
                  f"{r['sesgo_pct']:>7.0f}%{r['mae_mediana']:>10.0f}{r['err']:>16,.0f}")

    print("\n" + "=" * 78)
    print("EN CUANTAS SERIES GANA CADA METODO  (menor MAE de la serie)")
    print("=" * 78)
    for nivel in ("producto", "producto_envase"):
        sub = res[res["nivel"] == nivel]
        piv_mae = sub.pivot_table(index="clave", columns="metodo", values="mae")
        ganador = piv_mae.idxmin(axis=1).value_counts()
        total = len(piv_mae)
        print(f"\n  {nivel}  ({total} series)")
        for metodo, cuantas in ganador.items():
            print(f"    {metodo:<18}{cuantas:>4}  ({cuantas / total * 100:.0f}%)")

    # ── Cara a cara sobre las MISMAS series: prophet vs derivado ────────────
    print("\n" + "=" * 78)
    print("PROPIO vs DERIVADO, misma serie y mismos pliegues (producto x envase)")
    print("=" * 78)
    pe = res[res["nivel"] == "producto_envase"].dropna(subset=["mape"])
    piv = pe.pivot_table(index="clave", columns="metodo", values="mape")
    piv = piv.join(pe.groupby("clave")["meses"].first())
    ambos = piv.dropna(subset=["prophet", "derivado"])
    if not ambos.empty:
        gana_propio = (ambos["prophet"] < ambos["derivado"]).sum()
        print(f"  series con ambos metodos medidos : {len(ambos)}")
        print(f"  gana el modelo propio            : {gana_propio}  ({gana_propio / len(ambos) * 100:.0f}%)")
        print(f"  gana el derivado                 : {len(ambos) - gana_propio}")
        print(f"  MAPE mediano propio              : {ambos['prophet'].median():.0f}%")
        print(f"  MAPE mediano derivado            : {ambos['derivado'].median():.0f}%")

        print("\n  Por tramo de historia (para calibrar MIN_MESES_MODELO_PROPIO):")
        print(f"  {'meses de historia':<20}{'series':>7}{'propio':>10}{'derivado':>10}{'gana propio':>13}")
        for lo, hi, etq in [(0, 17, "12 a 17"), (18, 23, "18 a 23"), (24, 35, "24 a 35"), (36, 999, "36 o mas")]:
            t = ambos[(ambos["meses"] >= lo) & (ambos["meses"] <= hi)]
            if len(t) == 0:
                continue
            gp = (t["prophet"] < t["derivado"]).sum()
            print(f"  {etq:<20}{len(t):>7}{t['prophet'].median():>9.0f}%{t['derivado'].median():>9.0f}%"
                  f"{gp / len(t) * 100:>12.0f}%")

    # ── Cuanto se aleja el MAPE guardado del real, en las derivadas ─────────
    print("\n" + "=" * 78)
    print("LAS 12 SERIES producto x envase CON PEOR MAPE PROPIO")
    print("=" * 78)
    peores = piv.dropna(subset=["prophet"]).nlargest(12, "prophet")
    print(f"  {'serie':<44}{'meses':>6}{'propio':>9}{'derivado':>10}{'media3':>9}")
    for clave, r in peores.iterrows():
        d = f"{r['derivado']:.0f}%" if pd.notna(r.get("derivado")) else "  -"
        m3 = f"{r['media3']:.0f}%" if pd.notna(r.get("media3")) else "  -"
        print(f"  {str(clave)[:43]:<44}{int(r['meses']):>6}{r['prophet']:>8.0f}%{d:>10}{m3:>9}")

    print("\nCSV con el detalle completo: scripts/analisis/backtest_produccion_resultado.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
