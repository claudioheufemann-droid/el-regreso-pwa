"""
ERP Sync — Stock de insumos — Gestión Cervecera → El Regreso PWA
====================================================================
Descarga el informe de stock de insumos desde Gestión Cervecera
(Playwright) y lo sube a /api/insumos/stock/upload — mismo patrón que
extractor_stock.py (producto terminado): login, ir a la página del
informe, clic en "Exportar a excel", subir el archivo tal cual (el
parseo vive en la PWA, en lib/insumosParser.ts, no acá).

Ejecución local :  python extractor_insumos.py
                    HEADLESS=1 python extractor_insumos.py (como en CI)
En producción   :  GitHub Actions (.github/workflows/erp-sync-insumos.yml)

Variables de entorno (.env local / secrets en GitHub) — reusa ERP_URL/
ERP_USERNAME/ERP_PASSWORD de extractor.py (ventas):
  ERP_URL, ERP_USERNAME, ERP_PASSWORD
  UPLOAD_URL_BASE   ej. https://el-regreso-pwa-psi.vercel.app (sin slash final)
  UPLOAD_SECRET     valor de UPLOAD_SECRET_INSUMOS en Vercel (secret
                     dedicado, mismo motivo que cada endpoint de upload
                     tiene el suyo — ver la nota en app/api/clientes/upload).

Fuente del archivo (7-sep-2026, confirmado por el usuario inspeccionando el
DOM): https://www.gestioncervecera.com/Compra/StockInsumos, botón
"Exportar a excel" con id propio #btnExportarListadoExcel (a diferencia del
de Stock de producto terminado, que no tiene id y hay que apuntarlo por
selector CSS completo).
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


def descargar_insumos(page) -> Path:
    print("   [Insumos] Navegando a /Compra/StockInsumos")
    page.goto("https://www.gestioncervecera.com/Compra/StockInsumos", wait_until="networkidle")
    page.wait_for_timeout(1000)
    with page.expect_download(timeout=90000) as dl_info:
        page.click("#btnExportarListadoExcel")
    download = dl_info.value
    destino = DOWNLOAD_DIR / (download.suggested_filename or "insumos.xlsx")
    download.save_as(destino)
    print(f"   [Insumos] Descargado: {destino.name}")
    return destino


def subir(filepath: Path, endpoint: str) -> dict:
    url = f"{UPLOAD_URL_BASE}{endpoint}"
    print(f"   Subiendo {filepath.name} -> {url}")
    with open(filepath, "rb") as f:
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {UPLOAD_SECRET}"},
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
        "ERP_USERNAME": ERP_USERNAME, "ERP_PASSWORD": ERP_PASSWORD, "UPLOAD_SECRET": UPLOAD_SECRET,
    }.items() if not v]
    if faltan:
        print(f"ERROR: faltan variables de entorno: {', '.join(faltan)}")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        login(page)

        print("[3/3] Descargando y subiendo Stock de Insumos...")
        try:
            archivo = descargar_insumos(page)
            resultado = subir(archivo, "/api/insumos/stock/upload")
            print(f"   Insumos -> insertados={resultado.get('insertados')} sinMatch={resultado.get('sinMatch')} fecha={resultado.get('fechaInforme')}")
        except Exception as e:
            print(f"   ERROR en Insumos: {e}")
            browser.close()
            return 1

        browser.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
