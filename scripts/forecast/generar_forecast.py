"""
Forecast de Producción (Prophet) — El Regreso PWA
====================================================================
Proyecta litros de demanda a 8 meses: general, por producto y por tipo de
envase (barril 30L / barril 50L / lata 354ml / lata 473ml / otros). NO toca
Supabase directo: lee los datos ya limpios desde GET /api/produccion/datos
(esa ruta aplica la exclusión de clientes internos/mermas y el cruce
producto→código — la lógica de negocio vive una sola vez, en TypeScript) y
sube el resultado a POST /api/produccion/forecast/upload.

Por cada serie con al menos MIN_MESES_FORECAST meses de historial:
  1. Ajusta Prophet sobre toda la serie → proyecta 8 meses.
  2. Backtest: entrena sin los últimos MESES_BACKTEST meses, predice esos
     meses y los compara contra lo real (MAE / MAPE) — así se ve qué tan
     confiable es cada proyección, no sólo el número.
Series con menos historial se saltan (ya vienen marcadas como "historial
corto" en la respuesta de /api/produccion/datos).

Ejecución local :  python generar_forecast.py
En producción   :  GitHub Actions (.github/workflows/forecast-produccion.yml),
                    semanal.

Variables de entorno (.env local / secrets en GitHub):
  UPLOAD_URL_BASE      ej. https://el-regreso-pwa-psi.vercel.app (sin slash final)
  UPLOAD_SECRET_FORECAST  valor de UPLOAD_SECRET_FORECAST en Vercel
"""
import math
import os
import sys

import pandas as pd
import requests
from dotenv import load_dotenv
from prophet import Prophet

load_dotenv()

UPLOAD_URL_BASE = os.getenv("UPLOAD_URL_BASE", "https://el-regreso-pwa-psi.vercel.app")
UPLOAD_SECRET = os.getenv("UPLOAD_SECRET_FORECAST")

HORIZONTE_MESES = 8
MIN_MESES_FORECAST = 6
MESES_BACKTEST = 3
MESES_INACTIVIDAD = 6   # sin ventas por este tiempo ⇒ serie descontinuada, no se proyecta
HEADERS = {"Authorization": f"Bearer {UPLOAD_SECRET}"}

# ── Modelo propio vs. derivado (sólo aplica a producto_envase) ──────────
# Una serie producto×envase con poca historia o muy errática le da a Prophet
# casi nada para ajustar tendencia/estacionalidad propias, y el error se
# dispara — confirmado con un caso real: MAPE de 450% en una combinación de
# ~30L/mes. El total del producto tiene mucha más historia y es
# matemáticamente más estable, así que estas series se DERIVAN de ahí en vez
# de forzar un modelo propio sin datos para sostenerlo.
#
# El criterio se adapta solo, no es una lista a mano: se intenta SIEMPRE el
# modelo propio primero (mismo umbral MIN_MESES_FORECAST que cualquier otra
# serie) y sólo se descarta a favor del derivado cuando el resultado muestra
# que no alcanza — por historia corta o por backtest malo. Si una
# combinación tiene buena historia y buen MAPE, se queda con su modelo propio
# igual que hoy.
MIN_MESES_MODELO_PROPIO = 12   # menos que esto: ni se intenta confiar en el modelo propio
MAPE_MAXIMO_MODELO_PROPIO = 100.0   # backtest peor que esto (con historia "suficiente"): se deriva igual
MESES_PROPORCION_DERIVADA = 6   # ventana reciente para calcular qué % del producto es este formato

# ── Parámetros del stock de seguridad ───────────────────────────────────
Z_SERVICIO = 1.645          # 95% de nivel de servicio (normal, una cola)
Z_BANDA_PROPHET = 1.2816    # interval_width=0.8 en Prophet ⇒ banda = ±1.2816σ
SEMANAS_POR_MES = 30.44 / 7

LEAD_TIME_SEMANAS = {"cerveza": 4, "kombucha": 3}

# Cada cuánto se REVISA el inventario y se puede reaccionar. El modelo corre
# una vez al mes, así que si un producto cae bajo su punto de reorden el día
# 3, nadie se entera hasta la corrida siguiente: el colchón tiene que cubrir
# lead time + este período, no sólo el lead time.
PERIODO_REVISION_SEMANAS = SEMANAS_POR_MES

# Variabilidad del propio lead time, en semanas (cuánto se suele atrasar una
# cocción respecto de lo planificado: tanque ocupado, fermentación trabada).
# En 0 el término no aporta nada — se deja explícito y en cero a propósito
# en vez de inventar un número: cuando Producción mida el desvío real de sus
# cocciones, se pone acá y el colchón lo empieza a considerar solo.
SIGMA_LEAD_TIME_SEMANAS = {"cerveza": 0.0, "kombucha": 0.0}


def obtener_datos() -> dict:
    print(f"Descargando datos limpios desde {UPLOAD_URL_BASE}/api/produccion/datos ...")
    r = requests.get(f"{UPLOAD_URL_BASE}/api/produccion/datos", headers=HEADERS, timeout=120)
    r.raise_for_status()
    return r.json()


def a_dataframe(puntos: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(puntos)
    df["ds"] = pd.to_datetime(df["mes"])
    df["y"] = df["litros"].astype(float)
    return df[["ds", "y"]].sort_values("ds").reset_index(drop=True)


def ajustar_y_proyectar(df: pd.DataFrame, mes_base: pd.Timestamp) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Entrena Prophet y devuelve (proyección, descomposición).

    · proyección: los HORIZONTE_MESES posteriores a `mes_base` — el último mes
      cerrado del negocio, igual para todas las series.
    · descomposición: para CADA mes de la serie (histórico y futuro), las dos
      componentes que Prophet estima por separado y después suma —

          yhat  =  trend  +  yearly
                   ──┬──     ──┬───
             hacia dónde va   cuánto sube o baja
             el negocio       ese mes del año

      Es lo que hace que esto sea un modelo y no una regla de tres: la
      tendencia se estima con changepoints (quiebres de pendiente detectados
      en los datos) y la estacionalidad como una serie de Fourier ajustada a
      los ciclos anuales. Se exporta para poder mostrarlo en el gráfico, en
      vez de que el usuario sólo vea una línea aparecer sin explicación.

    El ancla del horizonte tiene que ser común y NO el último mes de cada
    serie: una combinación producto×envase que se dejó de vender en 2024
    seguía "proyectando" los 8 meses siguientes a su última venta, o sea meses
    que ya pasaron. Salían como forecast en el gráfico, en la tabla de detalle
    y en el stock de seguridad (bug real: filas fechadas en ago-2024). Ahora se
    predice hasta cubrir la brecha y se recorta al horizonte real.
    """
    tiene_anual = len(df) >= 24  # necesita ≥2 ciclos anuales para estimarla en serio
    m = Prophet(
        yearly_seasonality=tiene_anual,
        weekly_seasonality=False,
        daily_seasonality=False,
        interval_width=0.8,
    )
    m.fit(df)
    ultimo = df["ds"].max()
    # Meses a predecir: los que faltan para llegar al mes base (si la serie
    # murió antes) más el horizonte propiamente tal.
    brecha = max((mes_base.year - ultimo.year) * 12 + (mes_base.month - ultimo.month), 0)
    futuro = m.make_future_dataframe(periods=brecha + HORIZONTE_MESES, freq="MS")
    pred = m.predict(futuro)

    proyeccion = pred[pred["ds"] > mes_base].copy()
    for col in ("yhat", "yhat_lower", "yhat_upper"):
        proyeccion[col] = proyeccion[col].clip(lower=0)

    descomposicion = pred[["ds", "trend"]].copy()
    # Sin estacionalidad anual estimada la componente no existe: se informa 0
    # (no null) para que el gráfico pueda dibujar la banda igual, plana.
    descomposicion["yearly"] = pred["yearly"] if tiene_anual else 0.0

    return proyeccion[["ds", "yhat", "yhat_lower", "yhat_upper"]], descomposicion


def backtest(df: pd.DataFrame) -> dict | None:
    """Entrena sin los últimos MESES_BACKTEST meses, predice esos meses y
    compara contra lo real. None si no alcanza el historial para hacerlo."""
    if len(df) < MIN_MESES_FORECAST + MESES_BACKTEST:
        return None
    corte = len(df) - MESES_BACKTEST
    train, test = df.iloc[:corte], df.iloc[corte:]
    m = Prophet(yearly_seasonality=len(train) >= 24, weekly_seasonality=False, daily_seasonality=False)
    m.fit(train)
    futuro = m.make_future_dataframe(periods=MESES_BACKTEST, freq="MS")
    pred = m.predict(futuro).tail(MESES_BACKTEST)
    real = test["y"].to_numpy()
    estim = pred["yhat"].clip(lower=0).to_numpy()
    mae = float(abs(real - estim).mean())
    # MAPE ignora meses reales en 0 (división por cero no tiene sentido ahí).
    # abs() también en el denominador: algunas series (ej. "otros formatos",
    # que mezcla devoluciones/notas de crédito) pueden tener un mes con litros
    # netos negativos — sin el abs() el signo del error se invertía y mostraba
    # desvíos negativos sin sentido (confirmado con una corrida real: -108%).
    no_cero = real != 0
    mape = float((abs(real[no_cero] - estim[no_cero]) / abs(real[no_cero])).mean() * 100) if no_cero.any() else None
    return {"mae": round(mae, 2), "mape": round(mape, 1) if mape is not None else None,
            "mesesEvaluados": MESES_BACKTEST, "mesesHistorial": len(df)}


def procesar_serie(nivel: str, clave: str | None, puntos: list[dict], mes_base: pd.Timestamp, silencioso: bool = False) -> dict:
    """Ajusta (si hay datos) y arma las filas de una serie, SIN escribirlas a
    ninguna lista compartida — el caller decide qué hacer con el resultado:
    comprometerlo tal cual (comprometer_serie(), el caso normal) o
    descartar el forecast/validación propios y derivar de otra serie en su
    lugar (ver derivar_de_producto(), sólo para producto_envase).

    silencioso=True: no agrega notas de calidad por serie individual — para
    producto_envase, que son ~100 combinaciones y la mayoría chicas; una
    advertencia por cada una ahogaría el panel sin decir nada que "producto"
    (su nivel padre) no haya dicho ya.

    Devuelve {"historico": [...], "forecast": [...], "validacion": {...}|None,
    "calidad": [...], "df": DataFrame}. "forecast" queda vacío cuando la
    serie no se pudo proyectar (historial corto, inactiva, o error).
    """
    df = a_dataframe(puntos)
    etiqueta = clave or "general"
    resultado = {"historico": [], "forecast": [], "validacion": None, "calidad": [], "df": df}

    # Los históricos se emiten primero y se guardan indexados por mes, para
    # poder completarles después la descomposición del modelo (que recién se
    # conoce cuando Prophet está entrenado). Si la serie no se proyecta, se
    # quedan sin descomposición y el gráfico simplemente no la dibuja.
    historicos_por_mes: dict[str, dict] = {}
    for _, row in df.iterrows():
        mes = row["ds"].strftime("%Y-%m-%d")
        fila = {
            "nivel": nivel, "clave": clave, "mes": mes,
            "tipo": "historico", "litros": round(float(row["y"]), 2),
        }
        historicos_por_mes[mes] = fila
        resultado["historico"].append(fila)

    if len(df) < MIN_MESES_FORECAST:
        if not silencioso:
            resultado["calidad"].append({
                "tipo": "historial_corto", "clave": clave,
                "detalle": f'"{etiqueta}" tiene sólo {len(df)} mes(es) de historial — no se proyectó (mínimo {MIN_MESES_FORECAST}).',
                "severidad": "advertencia",
            })
        return resultado

    # Series descontinuadas: sin ventas en los últimos MESES_INACTIVIDAD, no se
    # proyecta. Extrapolar dos años una receta que ya no se hace no informa
    # nada y sólo ensucia el gráfico y el stock de seguridad con productos
    # fantasma que aparecerían pidiendo reposición.
    ultimo = df["ds"].max()
    meses_inactiva = (mes_base.year - ultimo.year) * 12 + (mes_base.month - ultimo.month)
    if meses_inactiva >= MESES_INACTIVIDAD:
        if not silencioso:
            resultado["calidad"].append({
                "tipo": "serie_inactiva", "clave": clave,
                "detalle": f'"{etiqueta}" no registra ventas desde {ultimo:%b %Y} ({meses_inactiva} meses) — no se proyectó.',
                "severidad": "info",
            })
        return resultado

    try:
        proy, descomp = ajustar_y_proyectar(df, mes_base)
    except Exception as e:
        if not silencioso:
            resultado["calidad"].append({
                "tipo": "error_modelo", "clave": clave,
                "detalle": f'"{etiqueta}" no se pudo proyectar: {e}',
                "severidad": "advertencia",
            })
        return resultado

    # trend y yearly de cada mes, para dibujar la descomposición del modelo.
    comp_por_mes = {
        row["ds"].strftime("%Y-%m-%d"): (round(float(row["trend"]), 2), round(float(row["yearly"]), 2))
        for _, row in descomp.iterrows()
    }

    for mes, fila in historicos_por_mes.items():
        if mes in comp_por_mes:
            fila["tendencia"], fila["estacionalidad"] = comp_por_mes[mes]

    for _, row in proy.iterrows():
        mes = row["ds"].strftime("%Y-%m-%d")
        tendencia, estacionalidad = comp_por_mes.get(mes, (None, None))
        resultado["forecast"].append({
            "nivel": nivel, "clave": clave, "mes": mes,
            "tipo": "forecast",
            "litros": round(float(row["yhat"]), 2),
            "litrosMin": round(float(row["yhat_lower"]), 2),
            "litrosMax": round(float(row["yhat_upper"]), 2),
            "tendencia": tendencia, "estacionalidad": estacionalidad,
        })

    bt = backtest(df)
    if bt:
        resultado["validacion"] = {"nivel": nivel, "clave": clave, "metodo": "propio", **bt}
    print(f"  {nivel}/{etiqueta}: {len(df)} meses historial, backtest={'ok' if bt else 'sin datos suficientes'}")
    return resultado


def comprometer_serie(resultado: dict, forecast_out: list, validacion_out: list, calidad_out: list):
    """Escribe el resultado de procesar_serie() tal cual a las listas
    compartidas — el camino normal, para toda serie que no necesitó
    derivarse (general/producto/envase siempre; producto_envase cuando su
    propio modelo alcanzó el estándar de confianza)."""
    forecast_out.extend(resultado["historico"])
    forecast_out.extend(resultado["forecast"])
    if resultado["validacion"]:
        validacion_out.append(resultado["validacion"])
    calidad_out.extend(resultado["calidad"])


def derivar_de_producto(
    producto: str, envase: str, df_combo: pd.DataFrame,
    forecast_producto_por_mes: dict[str, dict], historico_producto_por_mes: dict[str, float],
) -> dict | None:
    """Deriva el forecast de un producto×envase con poca historia o mal MAPE
    propio, repartiendo el forecast YA CALCULADO del producto (más historia,
    más estable) según qué proporción de ese producto representó este
    formato en los últimos MESES_PROPORCION_DERIVADA meses.

    Es una regla de tres sobre una proyección real (la del producto), no una
    inventada: litros_formato(mes) = litros_producto_proyectado(mes) × ratio.
    El ratio se calcula sobre meses donde EXISTEN ambos datos (el combo pudo
    empezar a venderse después que el producto). Devuelve None si el producto
    tampoco tiene forecast propio, o si no hay ningún mes de overlap para
    calcular el ratio — no hay de dónde derivar.
    """
    if not forecast_producto_por_mes:
        return None

    meses_combo = sorted(df_combo["ds"].unique())[-MESES_PROPORCION_DERIVADA:]
    meses_con_dato_producto = [m for m in meses_combo if m.strftime("%Y-%m-%d") in historico_producto_por_mes]
    litros_producto_reciente = sum(historico_producto_por_mes[m.strftime("%Y-%m-%d")] for m in meses_con_dato_producto)
    if litros_producto_reciente <= 0:
        return None
    litros_combo_reciente = float(df_combo[df_combo["ds"].isin(meses_con_dato_producto)]["y"].sum())
    ratio = max(litros_combo_reciente, 0.0) / litros_producto_reciente

    forecast_derivado = []
    for mes, fp in forecast_producto_por_mes.items():
        fila = {
            "nivel": "producto_envase", "clave": f"{producto}::{envase}", "mes": mes,
            "tipo": "forecast",
            "litros": round(fp["litros"] * ratio, 2),
            "litrosMin": round(fp["litrosMin"] * ratio, 2),
            "litrosMax": round(fp["litrosMax"] * ratio, 2),
            "tendencia": round(fp["tendencia"] * ratio, 2) if fp["tendencia"] is not None else None,
            "estacionalidad": round(fp["estacionalidad"] * ratio, 2) if fp["estacionalidad"] is not None else None,
        }
        forecast_derivado.append(fila)

    return {"forecast": forecast_derivado, "ratio": round(ratio, 4), "mesesRatio": len(meses_con_dato_producto)}


def calcular_stock_seguridad(forecast: list[dict], validacion: list[dict], categorias: dict) -> list[dict]:
    """Stock de seguridad y punto de reorden, derivados del forecast.

    SS = Z · √( ventana · σ_semanal²  +  demanda_semanal² · σ_LT² )
    ROP = demanda_semanal · ventana + SS        (ventana = lead time + revisión)

    Por qué así y no con la dispersión histórica cruda (versión anterior):
      · La demanda sale de la proyección de Prophet para ESE mes. El promedio
        histórico del mes calendario subestimaba a la mitad lo que se va a
        vender, porque el negocio creció 2-4x en el historial.
      · σ sale de la banda de confianza de Prophet, que ya descontó tendencia
        y estacionalidad. La dispersión entre años medía el CRECIMIENTO, no la
        incertidumbre: daba entre 1,2x y 3,1x más grande de lo real.
      · La ventana suma el período de revisión, no sólo el lead time.
    """
    mape_por_serie = {
        (v["nivel"], v.get("clave")): (v.get("mape"), v.get("mesesHistorial"), v.get("metodo", "propio"))
        for v in validacion
    }

    filas: list[dict] = []
    for f in forecast:
        if f["tipo"] != "forecast":
            continue
        nivel = f["nivel"]
        if nivel not in ("producto", "producto_envase"):
            continue

        clave = f["clave"] or ""
        producto, envase = (clave.split("::") + [None])[:2] if nivel == "producto_envase" else (clave, None)
        categoria = categorias.get(producto)
        if categoria not in LEAD_TIME_SEMANAS:
            continue

        yhat = float(f["litros"])
        lo, hi = f.get("litrosMin"), f.get("litrosMax")
        if lo is None or hi is None:
            continue

        # La banda de Prophet es simétrica alrededor de yhat: ancho = 2·z·σ
        sigma_mensual = max((float(hi) - float(lo)) / (2 * Z_BANDA_PROPHET), 0.0)
        sigma_semanal = sigma_mensual / math.sqrt(SEMANAS_POR_MES)
        demanda_semanal = max(yhat, 0.0) / SEMANAS_POR_MES

        lt = LEAD_TIME_SEMANAS[categoria]
        sigma_lt = SIGMA_LEAD_TIME_SEMANAS[categoria]
        ventana = lt + PERIODO_REVISION_SEMANAS

        ss = Z_SERVICIO * math.sqrt(ventana * sigma_semanal**2 + (demanda_semanal**2) * (sigma_lt**2))
        rop = demanda_semanal * ventana + ss

        mape, meses_hist, metodo = mape_por_serie.get((nivel, f["clave"]), (None, None, "propio"))
        # Una serie derivada nunca se marca "alta": el número sale de repartir
        # el forecast del producto por una proporción reciente, no de un
        # modelo propio validado contra su propio backtest — igual de útil
        # para decidir reposición, pero no equivalente a un ajuste directo.
        if metodo == "derivado":
            confianza = "media" if (mape is not None and mape <= 60) else "baja"
        elif meses_hist and meses_hist >= 24 and mape is not None and mape <= 30:
            confianza = "alta"
        elif meses_hist and meses_hist >= 12 and (mape is None or mape <= 60):
            confianza = "media"
        else:
            confianza = "baja"

        filas.append({
            "nivel": nivel, "producto": producto, "envase": envase, "categoria": categoria,
            "mes": f["mes"],
            "leadTimeSemanas": lt,
            "periodoRevisionSemanas": round(PERIODO_REVISION_SEMANAS, 3),
            "sigmaLeadTimeSemanas": sigma_lt,
            "demandaMensualProyectada": round(yhat, 2),
            "demandaEnVentana": round(demanda_semanal * ventana, 2),
            "sigmaSemanal": round(sigma_semanal, 2),
            "z": Z_SERVICIO,
            "stockSeguridadLitros": round(max(ss, 0), 2),
            "puntoReordenLitros": round(max(rop, 0), 2),
            "confianza": confianza,
            "mapeBacktest": round(mape, 1) if mape is not None else None,
            "mesesHistorial": meses_hist,
            "metodo": metodo,
        })
    return filas


def main() -> int:
    if not UPLOAD_SECRET:
        print("ERROR: falta UPLOAD_SECRET_FORECAST")
        return 1

    datos = obtener_datos()
    series = datos["series"]
    calidad = list(datos.get("calidadDatos", []))

    forecast: list[dict] = []
    validacion: list[dict] = []

    # Ancla del horizonte: el último mes cerrado del negocio, tomado de la
    # serie general (el endpoint ya excluye el mes en curso). Es el mismo para
    # todas las series a propósito — ver ajustar_y_proyectar().
    mes_base = pd.to_datetime(max(p["mes"] for p in series["general"]))
    print(f"\nÚltimo mes cerrado: {mes_base:%Y-%m} · se proyectan {HORIZONTE_MESES} meses desde ahí")

    print(f"\nGeneral: {len(series['general'])} meses")
    comprometer_serie(procesar_serie("general", None, series["general"], mes_base), forecast, validacion, calidad)

    print(f"\nPor producto: {len(series['producto'])} series")
    for producto, puntos in series["producto"].items():
        comprometer_serie(procesar_serie("producto", producto, puntos, mes_base), forecast, validacion, calidad)

    print(f"\nPor envase: {len(series['envase'])} series")
    for envase, puntos in series["envase"].items():
        comprometer_serie(procesar_serie("envase", envase, puntos, mes_base), forecast, validacion, calidad)

    # Índices del forecast de PRODUCTO ya comprometido arriba, para poder
    # derivar producto×envase — ver derivar_de_producto().
    forecast_producto_por_mes: dict[str, dict[str, dict]] = {}
    historico_producto_por_mes: dict[str, dict[str, float]] = {}
    for f in forecast:
        if f["nivel"] != "producto" or f["clave"] is None:
            continue
        if f["tipo"] == "forecast":
            forecast_producto_por_mes.setdefault(f["clave"], {})[f["mes"]] = f
        elif f["tipo"] == "historico":
            historico_producto_por_mes.setdefault(f["clave"], {})[f["mes"]] = f["litros"]

    productoEnvase = series.get("productoEnvase", {})
    print(f"\nPor producto y envase: {len(productoEnvase)} series")
    n_propio = n_derivado = n_sin_forecast = 0
    for clave, puntos in productoEnvase.items():
        producto, envase = clave.split("::", 1)  # mismo separador que claveProductoEnvase() en TS
        resultado = procesar_serie("producto_envase", clave, puntos, mes_base, silencioso=True)

        bt = resultado["validacion"]
        # El criterio se adapta solo: se intenta SIEMPRE el modelo propio
        # primero (procesar_serie ya lo hizo arriba) y sólo se descarta a
        # favor del derivado cuando el resultado muestra que no alcanza.
        usar_propio = (
            resultado["forecast"]
            and bt is not None
            and bt["mesesHistorial"] >= MIN_MESES_MODELO_PROPIO
            and (bt.get("mape") is None or bt["mape"] <= MAPE_MAXIMO_MODELO_PROPIO)
        )

        forecast.extend(resultado["historico"])  # el histórico real se muestra tal cual, sea cual sea el método
        calidad.extend(resultado["calidad"])

        if usar_propio:
            forecast.extend(resultado["forecast"])
            validacion.append(bt)
            n_propio += 1
        else:
            derivado = derivar_de_producto(
                producto, envase, resultado["df"],
                forecast_producto_por_mes.get(producto, {}), historico_producto_por_mes.get(producto, {}),
            )
            if derivado:
                forecast.extend(derivado["forecast"])
                # mesesHistorial queda el de la combinación (cuánta historia
                # REAL tiene, aunque el número salga derivado) — es lo que
                # calcular_stock_seguridad usa para decidir confianza cuando
                # metodo="propio" no aplica.
                validacion.append({
                    "nivel": "producto_envase", "clave": clave, "metodo": "derivado",
                    "mae": None,
                    # El MAPE del producto es la mejor estimación disponible del
                    # error relativo de ESTE número: escalar una serie por una
                    # proporción constante no cambia su error porcentual.
                    "mape": next((v.get("mape") for v in validacion if v["nivel"] == "producto" and v.get("clave") == producto), None),
                    "mesesEvaluados": MESES_BACKTEST,
                    "mesesHistorial": len(resultado["df"]),
                })
                n_derivado += 1
            else:
                n_sin_forecast += 1
    print(f"  producto_envase: {n_propio} con modelo propio, {n_derivado} derivadas del producto, {n_sin_forecast} sin forecast (ni el producto tiene)")

    print(f"\nSubiendo resultado: {len(forecast)} filas forecast, {len(validacion)} validaciones, {len(calidad)} notas de calidad ...")
    r = requests.post(
        f"{UPLOAD_URL_BASE}/api/produccion/forecast/upload",
        headers=HEADERS,
        json={"forecast": forecast, "validacion": validacion, "calidad": calidad},
        timeout=120,
    )
    if r.status_code != 200:
        print(f"ERROR al subir ({r.status_code}): {r.text}")
        return 1
    print("OK:", r.json())

    # Stock de seguridad — se calcula acá mismo, con el forecast recién
    # generado en memoria, y no en un script aparte: al derivarse por completo
    # del forecast, tenerlos separados sólo abría la puerta a que el colchón
    # quedara calculado sobre una corrida vieja del modelo.
    categorias = datos.get("categoriaPorProducto", {})
    filas_ss = calcular_stock_seguridad(forecast, validacion, categorias)
    por_nivel = {}
    for f in filas_ss:
        por_nivel[f["nivel"]] = por_nivel.get(f["nivel"], 0) + 1
    print(f"\nStock de seguridad: {len(filas_ss)} filas ({por_nivel}) — subiendo ...")
    r2 = requests.post(
        f"{UPLOAD_URL_BASE}/api/produccion/stock-seguridad/upload",
        headers=HEADERS, json={"filas": filas_ss}, timeout=120,
    )
    if r2.status_code != 200:
        print(f"ERROR al subir stock de seguridad ({r2.status_code}): {r2.text}")
        return 1
    print("OK:", r2.json())
    return 0


if __name__ == "__main__":
    sys.exit(main())
