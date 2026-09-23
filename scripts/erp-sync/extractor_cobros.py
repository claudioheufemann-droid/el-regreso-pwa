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

Fuente del archivo: PENDIENTE DE CONFIRMAR (a diferencia de Clientes/Deudores,
que se inspeccionaron directo el 28-ago-2026, acá todavía no se mapeó la
navegación real del ERP — ver navegar_y_descargar() más abajo). Para
completarla:

  python -m playwright codegen https://www.gestioncervecera.com/login

Login → el menú/página donde hoy se descarga "Movimientos Cta. Cte." para la
carga manual → el filtro de fechas que se use (¿últimos 30/45/60 días? ¿un
rango fijo?) → Exportar/Generar a Excel. Copiar el código que genera codegen
y reemplazar el cuerpo de navegar_y_descargar() — debe terminar con
download.save_as(...) y un return de la ruta, mismo contrato que
descargar_clientes()/descargar_deudores() en extractor_clientes_deudores.py.

OJO con el rango de fechas: el endpoint reemplaza por RANGO (borra
`cobros_erp` entre diagnostico.desde y diagnostico.hasta antes de insertar —
ver el comentario en la ruta), así que un rango más angosto que lo ya cargado
no borra nada fuera de sí mismo; es seguro pedir "últimos N días" sin miedo a
perder historial viejo.
"""
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

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


def navegar_y_descargar(page) -> Path:
    """PENDIENTE DE MAPEAR — ver el docstring del módulo. Placeholder que
    falla explícito en vez de descargar cualquier cosa por error."""
    raise NotImplementedError(
        "navegar_y_descargar() todavía no está mapeada. Corré "
        "'python -m playwright codegen https://www.gestioncervecera.com/login', "
        "grabá login -> Movimientos Cta. Cte. -> filtro de fechas -> Exportar, "
        "y reemplazá el cuerpo de esta función con el código generado."
    )
    # Ejemplo de la forma que debería tener (ver descargar_deudores() en
    # extractor_clientes_deudores.py para el patrón real ya probado):
    #
    # page.goto("https://www.gestioncervecera.com/Informes/Ver?informe=...", wait_until="networkidle")
    # page.wait_for_timeout(1000)
    # with page.expect_download(timeout=90000) as dl_info:
    #     page.click("...")
    # download = dl_info.value
    # destino = DOWNLOAD_DIR / (download.suggested_filename or "movimientos_cta_cte.xlsx")
    # download.save_as(destino)
    # return destino


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
            archivo = navegar_y_descargar(page)
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
