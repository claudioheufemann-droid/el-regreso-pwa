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
HEADERS = {"Authorization": f"Bearer {UPLOAD_SECRET}"}


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


def ajustar_y_proyectar(df: pd.DataFrame) -> pd.DataFrame:
    """Entrena Prophet sobre toda la serie y devuelve sólo los meses futuros."""
    m = Prophet(
        yearly_seasonality=len(df) >= 24,  # necesita ≥2 ciclos anuales para estimarla en serio
        weekly_seasonality=False,
        daily_seasonality=False,
        interval_width=0.8,
    )
    m.fit(df)
    futuro = m.make_future_dataframe(periods=HORIZONTE_MESES, freq="MS")
    pred = m.predict(futuro)
    proyeccion = pred[pred["ds"] > df["ds"].max()].copy()
    for col in ("yhat", "yhat_lower", "yhat_upper"):
        proyeccion[col] = proyeccion[col].clip(lower=0)
    return proyeccion[["ds", "yhat", "yhat_lower", "yhat_upper"]]


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


def procesar_serie(nivel: str, clave: str | None, puntos: list[dict], forecast_out: list, validacion_out: list, calidad_out: list, silencioso: bool = False):
    """silencioso=True: no agrega notas de calidad por serie individual — para
    producto_envase, que son ~100 combinaciones y la mayoría chicas; una
    advertencia por cada una ahogaría el panel sin decir nada que "producto"
    (su nivel padre) no haya dicho ya."""
    df = a_dataframe(puntos)
    etiqueta = clave or "general"

    for _, row in df.iterrows():
        forecast_out.append({
            "nivel": nivel, "clave": clave, "mes": row["ds"].strftime("%Y-%m-%d"),
            "tipo": "historico", "litros": round(float(row["y"]), 2),
        })

    if len(df) < MIN_MESES_FORECAST:
        if not silencioso:
            calidad_out.append({
                "tipo": "historial_corto", "clave": clave,
                "detalle": f'"{etiqueta}" tiene sólo {len(df)} mes(es) de historial — no se proyectó (mínimo {MIN_MESES_FORECAST}).',
                "severidad": "advertencia",
            })
        return

    try:
        proy = ajustar_y_proyectar(df)
    except Exception as e:
        if not silencioso:
            calidad_out.append({
                "tipo": "error_modelo", "clave": clave,
                "detalle": f'"{etiqueta}" no se pudo proyectar: {e}',
                "severidad": "advertencia",
            })
        return

    for _, row in proy.iterrows():
        forecast_out.append({
            "nivel": nivel, "clave": clave, "mes": row["ds"].strftime("%Y-%m-%d"),
            "tipo": "forecast",
            "litros": round(float(row["yhat"]), 2),
            "litrosMin": round(float(row["yhat_lower"]), 2),
            "litrosMax": round(float(row["yhat_upper"]), 2),
        })

    bt = backtest(df)
    if bt:
        validacion_out.append({"nivel": nivel, "clave": clave, **bt})
    print(f"  {nivel}/{etiqueta}: {len(df)} meses historial, backtest={'ok' if bt else 'sin datos suficientes'}")


def main() -> int:
    if not UPLOAD_SECRET:
        print("ERROR: falta UPLOAD_SECRET_FORECAST")
        return 1

    datos = obtener_datos()
    series = datos["series"]
    calidad = list(datos.get("calidadDatos", []))

    forecast: list[dict] = []
    validacion: list[dict] = []

    print(f"\nGeneral: {len(series['general'])} meses")
    procesar_serie("general", None, series["general"], forecast, validacion, calidad)

    print(f"\nPor producto: {len(series['producto'])} series")
    for producto, puntos in series["producto"].items():
        procesar_serie("producto", producto, puntos, forecast, validacion, calidad)

    print(f"\nPor envase: {len(series['envase'])} series")
    for envase, puntos in series["envase"].items():
        procesar_serie("envase", envase, puntos, forecast, validacion, calidad)

    productoEnvase = series.get("productoEnvase", {})
    print(f"\nPor producto y envase: {len(productoEnvase)} series")
    for clave, puntos in productoEnvase.items():
        procesar_serie("producto_envase", clave, puntos, forecast, validacion, calidad, silencioso=True)

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
    return 0


if __name__ == "__main__":
    sys.exit(main())
