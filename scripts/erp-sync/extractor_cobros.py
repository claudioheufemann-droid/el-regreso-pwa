"""
ERP Sync — Movimientos Cta. Cte. — Gestión Cervecera → El Regreso PWA
====================================================================
Descarga el informe "Movimientos Cta. Cte." desde Gestión Cervecera
(Playwright) y lo sube a /api/administracion/cobros/upload de la PWA — mismo
endpoint que ya usa la carga manual desde el admin, así que la lógica de
parseo/columnas (lib/administracion/movimientosCtaCte.ts) es la misma probada.
NO escribe directo a Supabase.

Por qué existe: es la ÚNICA fuente de pagos reales del sistema (qué factura
está cobrada, cuándo, por cuánto) — sin ella, la proyección de cobranza de
Ingreso Real no sabe distinguir lo pagado de lo pendiente y cae al plazo
DECLARADO en la ficha del cliente, que el backtest mostró que predice mucho
peor que el comportamiento medido (BACKTEST_MAE_SEMANAL en
lib/administracion/proyeccionCobros.ts). Detectado 23-sep-2026: al no tener
sync automático, este informe llevaba 5 días sin cargarse y nadie se había
dado cuenta hasta que el widget de "esta semana" empezó a mostrar $0.

Ejecución local :  python extractor_cobros.py
                    HEADLESS=1 python extractor_cobros.py (como en CI)
En producción   :  GitHub Actions (.github/workflows/erp-sync-cobros.yml)

Variables de entorno (.env local / secrets en GitHub) — reusa ERP_URL/
ERP_USERNAME/ERP_PASSWORD/UPLOAD_URL_BASE de extractor.py (ventas):
  UPLOAD_SECRET_COBROS   secret DEDICADO — no reusar UPLOAD_SECRET ni
                         UPLOAD_SECRET_CLIENTES (ver la nota larga en
                         app/api/clientes/upload/route.ts sobre por qué cada
                         endpoint tiene el suyo).

Fuente del archivo (confirmado por el usuario, 23-sep-2026):
  https://www.gestioncervecera.com/Informes/Ver?informe=MovimientosCtaCte
  Botón de exportar: <a class="btn btn-info generarInforme"
    data-informe="MovimientosCtaCte" data-formato="excel">Exportar a excel</a>
  — misma clase/atributo que ya usa descargar_deudores() en
  extractor_clientes_deudores.py, así que se reutiliza el mismo mecanismo de
  click (evaluate + expect_download).

  Trae fechas (data-tienefechas="True"), a diferencia de Deudores que usa sus
  filtros por defecto: los campos son #fechaDesde / #fechaHasta (mismos IDs
  que ya usa extractor.py para Ventas Detalladas en la misma web). Se
  reutiliza tal cual el helper _JS_SET_FECHA de ese script: un `.fill()`
  simple dejaba el campo vacío ("Debe ingresar fechas") porque el datepicker
  necesita los eventos input/change/blur para tomar el valor.

Ventana de fechas: últimos 20 días en cada corrida. NO es un número libre:
por encima de cierto volumen de filas, el ERP deja de entregar el Excel como
descarga directa y en su lugar muestra un modal — "Se enviará la información
solicitada por email" — y genera el archivo de forma asíncrona, sin ningún
evento de descarga que Playwright pueda esperar. Probado en vivo el
23-sep-2026: 3d (360 filas), 7d (1.671), 15d (3.452) y 20d (4.389) bajan
directo; 45d se cuelga en el modal de email indefinidamente (probado
esperando 3 min de generación + 3 min de export, sin resultado). 20 días
queda con margen bajo ese límite sin medir.

El endpoint reemplaza por RANGO —borra `cobros_erp` sólo entre
diagnostico.desde y diagnostico.hasta antes de insertar (ver el comentario en
la ruta)— así que una ventana angosta no toca ni borra nada del historial más
viejo ya cargado, y correr cada 6h con sólo 20 días de solapamiento es de
sobra: ningún pago se cobra y desaparece de cobros_erp en menos de un día.
"""
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

REPORT_URL = "https://www.gestioncervecera.com/Informes/Ver?informe=MovimientosCtaCte"
# Ver la nota larga arriba: por encima de ~20-45 días el ERP deja de bajar el
# Excel directo y pasa a mandarlo por email de forma asíncrona.
DIAS_VENTANA = 20

# Idéntico al de extractor.py (Ventas Detalladas) — mismo sitio, mismos
# campos de fecha, mismo bug si se usa page.fill() a secas.
_JS_SET_FECHA = """([sel, v]) => {
    const el = document.querySelector(sel);
    if (!el) return 'NO_EL';
    el.value = v;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) { try { jQuery(el).trigger('change').trigger('blur'); } catch (e) {} }
    return el.value;
}"""

load_dotenv()

ERP_URL         = os.getenv("ERP_URL", "https://www.gestioncervecera.com/login")
ERP_USERNAME    = os.getenv("ERP_USERNAME")
ERP_PASSWORD    = os.getenv("ERP_PASSWORD")
UPLOAD_URL_BASE = os.getenv("UPLOAD_URL_BASE", "https://el-regreso-pwa-psi.vercel.app")
UPLOAD_SECRET_COBROS = os.getenv("UPLOAD_SECRET_COBROS")
HEADLESS        = os.getenv("HEADLESS", "0") == "1"

DOWNLOAD_DIR = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)


def login(page) -> None:
    print(f"[1/3] Abriendo {ERP_URL}")
    page.goto(ERP_URL, wait_until="domcontentloaded")
    try:
        page.click("#btnAceptaCookies", timeout=3000)
    except PWTimeout:
        pass
    page.fill("#usuario", ERP_USERNAME)
    page.fill("#password", ERP_PASSWORD)
    page.click('input[type="submit"]')
    page.wait_for_load_state("networkidle")
    if "/login" in page.url:
        raise RuntimeError("Login falló: seguimos en /login (revisa ERP_USERNAME/ERP_PASSWORD)")
    print(f"[2/3] Login OK -> {page.url}")


def navegar_y_descargar(page, desde: date, hasta: date) -> Path:
    """Abre el informe Movimientos Cta. Cte., fija el rango de fechas, genera
    y descarga el Excel. Mismo patrón ya probado en descargar_deudores()
    (extractor_clientes_deudores.py) para el click de exportar, y en
    navegar_y_descargar() (extractor.py, Ventas Detalladas) para los campos
    de fecha del mismo sitio."""
    print(f"   Informe: {REPORT_URL}")
    page.goto(REPORT_URL, wait_until="networkidle")
    page.wait_for_timeout(1000)

    r1 = page.evaluate(_JS_SET_FECHA, ["#fechaDesde", desde.strftime("%d/%m/%Y")])
    r2 = page.evaluate(_JS_SET_FECHA, ["#fechaHasta", hasta.strftime("%d/%m/%Y")])
    print(f"   Fechas pedidas: {desde:%d/%m/%Y} -> {hasta:%d/%m/%Y} | inputs quedaron: {r1!r} -> {r2!r}")

    # Generar dispara un POST asíncrono que arma la tabla. wait_for_load_state
    # resultó ambiguo para este informe en la práctica (probado 23-sep-2026);
    # se poll-ea la tabla misma en su lugar, que es rápido y confiable en los
    # 4 tamaños de ventana probados (2-4s para 3-20 días).
    page.get_by_text("Generar", exact=True).first.click()
    for _ in range(30):  # hasta 90s
        if page.evaluate("() => document.querySelectorAll('table tbody tr').length") > 0:
            break
        page.wait_for_timeout(3000)

    # Mismo chequeo defensivo que ya usa Ventas Detalladas: si el ERP
    # rechazó el filtro (fechas mal formadas, rango inválido), avisa acá en
    # vez de subir un Excel vacío o de otro rango sin que nadie se entere.
    warn = page.evaluate(
        "() => { const w = document.getElementById('alertWarning');"
        " return (w && getComputedStyle(w).display !== 'none')"
        " ? (w.innerText || '').replace(/\\s+/g,' ').trim().slice(0,120) : null; }"
    )
    if warn:
        raise RuntimeError(f"El ERP rechazó el filtro: {warn}")

    try:
        with page.expect_download(timeout=25000) as dl_info:
            page.evaluate(
                "() => document.querySelector(\"a.generarInforme[data-formato='excel']\").click()"
            )
    except PWTimeout:
        # Por encima de cierto volumen (ver la nota larga del módulo), el ERP
        # no descarga: abre un modal "se enviará por email" y ahí se queda
        # para siempre desde el punto de vista de Playwright. Si esto pasa,
        # es que DIAS_VENTANA quedó muy grande — fallar con un mensaje que lo
        # diga en vez de un timeout críptico.
        via_email = page.evaluate("() => document.body.innerText.includes('enviará la información')")
        if via_email:
            raise RuntimeError(
                f"El ERP mandó el informe por EMAIL en vez de descarga directa "
                f"(DIAS_VENTANA={DIAS_VENTANA} quedó muy grande — bajalo)."
            )
        raise
    download = dl_info.value
    destino = DOWNLOAD_DIR / (download.suggested_filename or "movimientos_cta_cte.xlsx")
    download.save_as(destino)
    print(f"   Descargado: {destino.name}")
    return destino


def subir(filepath: Path) -> dict:
    url = f"{UPLOAD_URL_BASE}/api/administracion/cobros/upload"
    print(f"   Subiendo {filepath.name} -> {url}")
    with open(filepath, "rb") as f:
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {UPLOAD_SECRET_COBROS}"},
            files={"file": (filepath.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            timeout=300,
        )
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:500]}
    if r.status_code != 200:
        raise RuntimeError(f"Upload falló (HTTP {r.status_code}): {body}")
    return body


def main() -> int:
    faltan = [k for k, v in {
        "ERP_USERNAME": ERP_USERNAME, "ERP_PASSWORD": ERP_PASSWORD,
        "UPLOAD_SECRET_COBROS": UPLOAD_SECRET_COBROS,
    }.items() if not v]
    if faltan:
        print(f"ERROR: faltan variables de entorno: {', '.join(faltan)}")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        login(page)

        print("[3/3] Descargando y subiendo Movimientos Cta. Cte...")
        try:
            hasta = date.today()
            desde = hasta - timedelta(days=DIAS_VENTANA)
            archivo = navegar_y_descargar(page, desde, hasta)
            resultado = subir(archivo)
            print(f"   Cobros -> {resultado.get('cobros')} movimientos, "
                  f"monto total {resultado.get('montoTotal')}, "
                  f"{resultado.get('clientesActualizados')} clientes actualizados")
        except Exception as e:
            print(f"   ERROR: {e}")
            browser.close()
            return 1

        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
