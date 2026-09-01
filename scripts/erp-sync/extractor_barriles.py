"""
ERP Sync — Barriles en Cliente — Gestión Cervecera → El Regreso PWA
====================================================================
Descarga el informe "Barriles en Cliente" (una fila por barril actualmente
afuera, sin devolver) desde Gestión Cervecera (Playwright) y lo sube a
/api/barriles/upload — mismo endpoint que usa la carga manual desde el
admin. NO escribe directo a Supabase.

Ejecución local :  python extractor_barriles.py
                    HEADLESS=1 python extractor_barriles.py (como en CI)
En producción   :  GitHub Actions (.github/workflows/erp-sync-barriles.yml),
                    cada hora.

Variables de entorno (.env local / secrets en GitHub) — reusa ERP_URL/
ERP_USERNAME/ERP_PASSWORD de extractor.py (ventas):
  ERP_URL, ERP_USERNAME, ERP_PASSWORD
  UPLOAD_URL_BASE   ej. https://el-regreso-pwa-psi.vercel.app (sin slash final)
  UPLOAD_SECRET     valor de UPLOAD_SECRET_BARRILES en Vercel (secret dedicado
                     — mismo motivo que UPLOAD_SECRET_CLIENTES/STOCK: ver la
                     nota larga en app/api/clientes/upload/route.ts)

Fuente del archivo (01-sep-2026, confirmado por el usuario):
https://www.gestioncervecera.com/Informes/Ver?informe=BarrilesEnCliente,
botón "Exportar a excel" (a.generarInforme[data-formato='excel'],
data-tienefechas="False") — MISMO patrón que Deudores: sin filtros de fecha
que llenar, sólo click en "Generar" y después en el link de exportar.
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


def descargar_barriles(page) -> Path:
    print("   [Barriles] Navegando al informe BarrilesEnCliente")
    page.goto("https://www.gestioncervecera.com/Informes/Ver?informe=BarrilesEnCliente", wait_until="networkidle")
    page.wait_for_timeout(1000)
    try:
        page.get_by_text("Generar", exact=True).first.click(timeout=5000)
        page.wait_for_load_state("networkidle", timeout=60000)
    except PWTimeout:
        pass
    page.wait_for_timeout(1500)
    with page.expect_download(timeout=90000) as dl_info:
        page.evaluate(
            "() => document.querySelector(\"a.generarInforme[data-formato='excel']\").click()"
        )
    download = dl_info.value
    destino = DOWNLOAD_DIR / (download.suggested_filename or "barriles.xlsx")
    download.save_as(destino)
    print(f"   [Barriles] Descargado: {destino.name}")
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

        print("[3/3] Descargando y subiendo Barriles...")
        try:
            archivo = descargar_barriles(page)
            resultado = subir(archivo, "/api/barriles/upload")
            print(f"   Barriles -> insertadas={resultado.get('insertadas')} total={resultado.get('total')}")
        except Exception as e:
            print(f"   ERROR en Barriles: {e}")
            browser.close()
            return 1

        browser.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
