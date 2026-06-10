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
import re
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
# NAVEGACION DENTRO DEL ERP (mapeada con playwright codegen)
# Flujo: cerrar modal -> Informes -> "Ver" (abre popup del informe) ->
#        cerrar modal -> datepicker desde/hasta -> check2 -> Generar ->
#        "Exportar a excel" (descarga). Fechas parametrizadas (24 -> hoy).
# =============================================================================
def _cerrar_modal(target, selector_text: str = "×", timeout: int = 4000) -> None:
    """Cierra un modal/aviso si aparece (no falla si no existe)."""
    try:
        target.get_by_role("button", name=selector_text).first.click(timeout=timeout)
    except Exception:
        try:
            target.get_by_text(selector_text, exact=True).first.click(timeout=1500)
        except Exception:
            pass


def _elegir_fecha(rep, input_selector: str, objetivo: date, hoy: date) -> None:
    """Abre el datepicker y selecciona `objetivo` navegando meses con «.
    El calendario abre en el mes actual; retrocede los meses necesarios."""
    rep.locator(input_selector).click()
    meses_atras = (hoy.year - objetivo.year) * 12 + (hoy.month - objetivo.month)
    for _ in range(max(0, meses_atras)):
        rep.get_by_role("columnheader", name="«").first.click()
    rep.get_by_role("cell", name=str(objetivo.day), exact=True).first.click()


def navegar_y_descargar(page, desde: date, hasta: date) -> Path:
    """Desde la pagina post-login: ir al informe, filtrar fechas y descargar."""
    hoy = date.today()

    # Aviso/modal post-login
    _cerrar_modal(page)

    # Menu Informes -> abrir informe "Ver" (se abre en una pestana nueva)
    page.get_by_role("link", name="Informes").nth(1).click()
    with page.expect_popup() as popup_info:
        page.get_by_role("link", name="Ver").nth(2).click()
    rep = popup_info.value
    rep.wait_for_load_state("networkidle")

    # Aviso/modal dentro del informe
    _cerrar_modal(rep)

    # Filtro de fechas (período 24 -> hoy)
    _elegir_fecha(rep, "#fechaDesde", desde, hoy)
    _elegir_fecha(rep, "#fechaHasta", hasta, hoy)

    # Opcion adicional confirmada en la grabacion + generar
    rep.locator("#check2").check()
    rep.get_by_text("Generar").first.click()

    # Exportar a excel -> dispara descarga (y una pestana auxiliar)
    with rep.expect_download() as dl_info:
        with rep.expect_popup() as aux_info:
            rep.locator("a").filter(has_text=re.compile(r"^Exportar a excel$")).click()
        try:
            aux_info.value.close()
        except Exception:
            pass
    download = dl_info.value

    destino = DOWNLOAD_DIR / (download.suggested_filename or "ventas_detalladas.xlsx")
    download.save_as(destino)
    print(f"   Descargado: {destino.name}")
    return destino


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
