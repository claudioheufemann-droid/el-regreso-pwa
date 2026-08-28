"""
ERP Sync — Clientes y Deudores — Gestión Cervecera → El Regreso PWA
====================================================================
Descarga el maestro de Clientes y el informe de Deudores desde Gestión
Cervecera (Playwright) y los sube a /api/clientes/upload y
/api/deudores/upload de la PWA — mismos endpoints que ya usa la carga manual
desde el admin, así que la lógica de parseo/columnas es la misma probada.
NO escribe directo a Supabase.

Ejecución local :  python extractor_clientes_deudores.py
                    HEADLESS=1 python extractor_clientes_deudores.py (como en CI)
En producción   :  GitHub Actions (.github/workflows/erp-sync-clientes-deudores.yml),
                    una vez al día (estos datos no cambian tan seguido como ventas).

Variables de entorno (.env local / secrets en GitHub) — reusa las mismas de
extractor.py (ventas):
  ERP_URL, ERP_USERNAME, ERP_PASSWORD
  UPLOAD_URL_BASE   ej. https://el-regreso-pwa-psi.vercel.app (sin slash final)
  UPLOAD_SECRET     mismo valor que CRON_SECRET en Vercel

Fuente de cada archivo (confirmado por inspección directa del ERP, 28-ago-2026):
  - Clientes: NO es Informes/Ver?informe=Clientes (esa versión sólo trae 18
    columnas, le faltan ruta_despacho/dirección/provincia/límite cta cte).
    El maestro completo (30 columnas, igual al que se sube a mano) sale del
    botón "Exportar" (#btnExportarClientesExcel) en la página de listado
    https://www.gestioncervecera.com/Cliente
  - Deudores: Informes/Ver?informe=Deudores, con los filtros por defecto
    (fechaHasta = hoy, tipoDeCliente = Todos, checkbox "incluir clientes con
    barriles y sin deuda" SIN marcar — igual que las cargas manuales de
    sesiones anteriores).
"""
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

load_dotenv()

ERP_URL       = os.getenv("ERP_URL", "https://www.gestioncervecera.com/login")
ERP_USERNAME  = os.getenv("ERP_USERNAME")
ERP_PASSWORD  = os.getenv("ERP_PASSWORD")
UPLOAD_URL_BASE = os.getenv("UPLOAD_URL_BASE", "https://el-regreso-pwa-psi.vercel.app")
UPLOAD_SECRET = os.getenv("UPLOAD_SECRET")
HEADLESS      = os.getenv("HEADLESS", "0") == "1"

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


def descargar_clientes(page) -> Path:
    """Maestro completo de clientes (30 columnas) — botón Exportar en /Cliente."""
    print("   [Clientes] Navegando a /Cliente")
    page.goto("https://www.gestioncervecera.com/Cliente", wait_until="networkidle")
    page.wait_for_timeout(1000)
    with page.expect_download(timeout=90000) as dl_info:
        page.click("#btnExportarClientesExcel")
    download = dl_info.value
    destino = DOWNLOAD_DIR / (download.suggested_filename or "clientes.xlsx")
    download.save_as(destino)
    print(f"   [Clientes] Descargado: {destino.name}")
    return destino


def descargar_deudores(page) -> Path:
    """Informe de deudores — filtros por defecto (fechaHasta=hoy, todos los tipos)."""
    print("   [Deudores] Navegando al informe")
    page.goto("https://www.gestioncervecera.com/Informes/Ver?informe=Deudores", wait_until="networkidle")
    page.wait_for_timeout(1000)
    page.get_by_text("Generar", exact=True).first.click()
    try:
        page.wait_for_load_state("networkidle", timeout=60000)
    except PWTimeout:
        pass
    page.wait_for_timeout(1500)
    with page.expect_download(timeout=90000) as dl_info:
        page.evaluate(
            "() => document.querySelector(\"a.generarInforme[data-formato='excel']\").click()"
        )
    download = dl_info.value
    destino = DOWNLOAD_DIR / (download.suggested_filename or "deudores.xlsx")
    download.save_as(destino)
    print(f"   [Deudores] Descargado: {destino.name}")
    return destino


def subir(filepath: Path, endpoint: str, extra_fields: dict | None = None) -> dict:
    url = f"{UPLOAD_URL_BASE}{endpoint}"
    print(f"   Subiendo {filepath.name} -> {url}")
    with open(filepath, "rb") as f:
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {UPLOAD_SECRET}"},
            files={"file": (filepath.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data=extra_fields or {},
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
        "ERP_USERNAME": ERP_USERNAME, "ERP_PASSWORD": ERP_PASSWORD, "UPLOAD_SECRET": UPLOAD_SECRET,
    }.items() if not v]
    if faltan:
        print(f"ERROR: faltan variables de entorno: {', '.join(faltan)}")
        return 1

    con_error = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        login(page)

        print("[3/3] Descargando y subiendo Clientes...")
        try:
            archivo = descargar_clientes(page)
            # mode=upsert explícito a propósito: 'replace' borraría toda la
            # tabla antes de reinsertar — nunca usarlo desde el sync automático.
            resultado = subir(archivo, "/api/clientes/upload", {"mode": "upsert"})
            print(f"   Clientes -> total={resultado.get('total')} insertadas={resultado.get('insertadas')}")
        except Exception as e:
            print(f"   ERROR en Clientes: {e}")
            con_error += 1

        print("Descargando y subiendo Deudores...")
        try:
            archivo = descargar_deudores(page)
            resultado = subir(archivo, "/api/deudores/upload")
            print(f"   Deudores -> procesados={resultado.get('total_procesados')} "
                  f"nuevos={resultado.get('nuevos')} actualizados={resultado.get('actualizados')} "
                  f"eliminados={resultado.get('eliminados')}")
        except Exception as e:
            print(f"   ERROR en Deudores: {e}")
            con_error += 1

        browser.close()

    print("=== RESUMEN ===")
    print(f"  Con error: {con_error}/2")
    return 1 if con_error == 2 else 0


if __name__ == "__main__":
    sys.exit(main())
