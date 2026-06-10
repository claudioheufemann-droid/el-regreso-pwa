"""
ERP Sync — Gestión Cervecera → El Regreso PWA
==============================================
Descarga el informe de Ventas Detalladas desde Gestión Cervecera (Playwright)
y lo sube al endpoint /api/upload-ventas de la PWA, que aplica toda la lógica
probada de parseo (alias de vendedores, dedup, exclusión de internos,
reemplazo día a día). NO escribe directo a Supabase: una sola fuente de verdad.

Ejecución local :  python extractor.py            (ventana visible)
                   HEADLESS=1 python extractor.py (sin ventana, como en CI)
En producción   :  GitHub Actions (.github/workflows/erp-sync.yml), diario.

Variables de entorno (.env local / secrets en GitHub):
  ERP_URL          https://www.gestioncervecera.com/login
  ERP_USERNAME     correo de acceso al ERP
  ERP_PASSWORD     contraseña del ERP
  UPLOAD_URL       https://el-regreso-pwa-psi.vercel.app/api/upload-ventas
  UPLOAD_SECRET    mismo valor que CRON_SECRET en Vercel
"""
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

load_dotenv()

ERP_URL       = os.getenv("ERP_URL", "https://www.gestioncervecera.com/login")
ERP_USERNAME  = os.getenv("ERP_USERNAME")
ERP_PASSWORD  = os.getenv("ERP_PASSWORD")
UPLOAD_URL    = os.getenv("UPLOAD_URL", "https://el-regreso-pwa-psi.vercel.app/api/upload-ventas")
UPLOAD_SECRET = os.getenv("UPLOAD_SECRET")
HEADLESS      = os.getenv("HEADLESS", "0") == "1"
DOWNLOAD_DIR  = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)


def rango_periodo() -> tuple[date, date]:
    """Período de venta 24->23: desde el dia 24 vigente hasta hoy.
    Si hoy es >= 24, abrio este mes; si no, abrio el mes pasado."""
    hoy = date.today()
    if hoy.day >= 24:
        desde = hoy.replace(day=24)
    else:
        primero = hoy.replace(day=1)
        desde = (primero - timedelta(days=1)).replace(day=24)
    return desde, hoy


# =============================================================================
# NAVEGACION DENTRO DEL ERP -- PENDIENTE DE COMPLETAR CON EL CODIGO DE CODEGEN
#
# Reemplaza el cuerpo de esta funcion con los pasos que grabo `codegen`
# (login -> Ventas Detalladas -> filtro fechas -> descargar). Debe terminar
# devolviendo la ruta local del Excel descargado.
# =============================================================================
def navegar_y_descargar(page, desde: date, hasta: date) -> Path:
    """Desde la pagina post-login: ir al informe, filtrar fechas y descargar."""
    raise NotImplementedError(
        "Navegacion al informe aun no mapeada. Pega el codigo de "
        "`python -m playwright codegen https://www.gestioncervecera.com/login`."
    )
    # ── Plantilla tipica (reemplazar con lo grabado por codegen) ──────────────
    # page.get_by_role("link", name="Informes").click()
    # page.get_by_role("link", name="Ventas detalladas").click()
    # page.fill("#fecha_desde", desde.strftime("%d/%m/%Y"))
    # page.fill("#fecha_hasta", hasta.strftime("%d/%m/%Y"))
    # page.get_by_role("button", name="Buscar").click()
    # with page.expect_download() as dl:
    #     page.get_by_role("button", name="Exportar").click()
    # download = dl.value
    # destino = DOWNLOAD_DIR / download.suggested_filename
    # download.save_as(destino)
    # return destino


def login(page) -> None:
    """Login en Gestion Cervecera (selectores confirmados)."""
    print(f"[1/4] Abriendo {ERP_URL}")
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
        raise RuntimeError("Login fallo: seguimos en /login (revisa ERP_USERNAME/ERP_PASSWORD)")
    print(f"[2/4] Login OK -> {page.url}")


def subir_a_pwa(filepath: Path) -> dict:
    """Sube el Excel al endpoint de la PWA (misma logica que la carga manual)."""
    print(f"[4/4] Subiendo {filepath.name} a {UPLOAD_URL}")
    with open(filepath, "rb") as f:
        r = requests.post(
            UPLOAD_URL,
            headers={"Authorization": f"Bearer {UPLOAD_SECRET}"},
            files={"file": (filepath.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            timeout=300,
        )
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:500]}
    if r.status_code != 200:
        raise RuntimeError(f"Upload fallo (HTTP {r.status_code}): {body}")
    return body


def main() -> int:
    faltan = [k for k, v in {
        "ERP_USERNAME": ERP_USERNAME, "ERP_PASSWORD": ERP_PASSWORD, "UPLOAD_SECRET": UPLOAD_SECRET,
    }.items() if not v]
    if faltan:
        print(f"ERROR: faltan variables de entorno: {', '.join(faltan)}")
        return 1

    desde, hasta = rango_periodo()
    print(f"=== ERP SYNC | periodo {desde} -> {hasta} ===")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        login(page)
        print("[3/4] Navegando al informe y descargando...")
        archivo = navegar_y_descargar(page, desde, hasta)
        browser.close()

    resultado = subir_a_pwa(archivo)
    print("=== RESULTADO ===")
    print(f"  Insertadas        : {resultado.get('insertadas')}")
    print(f"  Rango cargado     : {resultado.get('fechaMin')} -> {resultado.get('fechaMax')}")
    print(f"  Internos excluidos: {resultado.get('clientesInternosExcluidos')}")
    for v in resultado.get("vendedores", []):
        print(f"  {v.get('nombre')}: {v.get('filas')} filas | {v.get('litros')} L | {v.get('fechas')} dias")
    return 0


if __name__ == "__main__":
    sys.exit(main())
