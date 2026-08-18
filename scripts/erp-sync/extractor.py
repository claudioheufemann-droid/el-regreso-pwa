"""
ERP Sync — Gestión Cervecera → El Regreso PWA
==============================================
Descarga el informe de Ventas Detalladas desde Gestión Cervecera (Playwright)
y lo sube al endpoint /api/upload-ventas de la PWA, que aplica toda la lógica
probada de parseo (alias de vendedores, dedup, exclusión de internos,
reemplazo día a día). NO escribe directo a Supabase: una sola fuente de verdad.

Ejecución local :  python extractor.py            (ventana visible)
                   HEADLESS=1 python extractor.py (sin ventana, como en CI)
En producción   :  GitHub Actions (.github/workflows/erp-sync-ventas.yml), cada
                   15 minutos en horario comercial (11:00-23:00 UTC).

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
# Overrides opcionales (workflow_dispatch) para diagnosticar rangos sin tocar
# la carga normal. SOLO_DESCARGAR deja el Excel como artifact sin subirlo.
FECHA_DESDE   = (os.getenv("FECHA_DESDE") or "").strip()
FECHA_HASTA   = (os.getenv("FECHA_HASTA") or "").strip()
SOLO_DESCARGAR = (os.getenv("SOLO_DESCARGAR") or "").strip().lower() == "true"
# Dias que se retrocede sobre el inicio del periodo para capturar entregas
# rezagadas (ver rango_periodo). 7 cubre una semana de atraso de despacho sin
# agrandar tanto el rango como para que el ERP mande el informe por email.
DIAS_SOLAPE = 7
# Tope duro sobre el ancho del rango pedido. El rango "periodo 24->23 + solape"
# crece con el volumen de ventas: cerca del dia 23 llega a ~32 dias, y el ERP
# empezo a rechazar eso (responde "se enviara por email" en vez de descargar).
# Con este tope, en la mayor parte del mes se pide solo lo mas reciente en vez
# de todo el periodo — se pierde la re-sincronizacion de entregas MUY rezagadas
# de días viejos del período (mas alla del tope), pero eso ya se habia
# sincronizado en corridas anteriores del mismo período, cuando el rango
# calculado aun entraba bajo el tope.
MAX_DIAS_RANGO = 18
DOWNLOAD_DIR  = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)


def _parse_ddmmyyyy(s: str) -> date:
    d, m, y = (int(x) for x in s.split("/"))
    return date(y, m, d)


def rango_periodo() -> tuple[date, date]:
    """Rango a consultar. OJO: el ERP filtra por FECHA DE ENTREGA, no por fecha
    de pedido — el Excel trae pedidos con FechaPedido anterior al rango pedido.

    Por defecto: período de venta 24->23 (desde el dia 24 vigente hasta hoy),
    pero retrocediendo DIAS_SOLAPE dias mas.

    Por que el solape: como el filtro es por fecha de ENTREGA, arrancar justo
    el dia 24 deja fuera para siempre los pedidos entregados el 23 o antes —
    el periodo anterior ya no se vuelve a consultar. Paso de verdad: el pedido
    00052061 de Zaatar (23-jul, entregado el 23-jul) nunca se cargo hasta que
    se pidio ese rango a mano. Con el solape esas entregas rezagadas entran
    solas. Recargar dias ya cargados no duplica: /api/upload-ventas borra por
    (vendedor_actual, fecha_pedido) antes de insertar."""
    hoy = date.today()
    if hoy.day >= 24:
        desde = hoy.replace(day=24)
    else:
        primero = hoy.replace(day=1)
        desde = (primero - timedelta(days=1)).replace(day=24)
    desde -= timedelta(days=DIAS_SOLAPE)
    tope = date.today() - timedelta(days=MAX_DIAS_RANGO)
    if desde < tope:
        desde = tope
    if FECHA_DESDE:
        desde = _parse_ddmmyyyy(FECHA_DESDE)
    if FECHA_HASTA:
        hoy = _parse_ddmmyyyy(FECHA_HASTA)
    return desde, hoy


# =============================================================================
# NAVEGACION AL INFORME (robusta — confirmada inspeccionando el ERP)
# En vez de navegar el menu (frágil: overlay del Academy + selectores
# posicionales), vamos DIRECTO a la URL del informe "Ventas Detalladas"
# (informe=VentasDet), que trae el detalle por producto/envase con las
# columnas que espera /api/upload-ventas (VendedorActual, FechaPedido,
# Producto, Envase, CategoriaProducto, Categoria, Litros, TotalSImp$, etc.).
# =============================================================================
REPORT_URL = "https://www.gestioncervecera.com/Informes/Ver?informe=VentasDet"

# Setea un input de fecha y dispara los eventos que el datepicker/validación
# necesitan (fill simple + Escape dejaba el campo vacío → "Debe ingresar fechas").
_JS_SET_FECHA = """([sel, v]) => {
    const el = document.querySelector(sel);
    if (!el) return 'NO_EL';
    el.value = v;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) { try { jQuery(el).trigger('change').trigger('blur'); } catch (e) {} }
    return el.value;
}"""


# Vuelca los controles del formulario del informe (selects, checkboxes, radios,
# inputs) para poder auditar qué filtros existen sin tener que entrar al ERP a
# mano. Se guarda junto al Excel y viaja en el artifact del workflow.
_JS_DUMP_FILTROS = """() => {
    const out = [];
    document.querySelectorAll('select, input, textarea').forEach(el => {
        if (['hidden','submit','button'].includes(el.type)) return;
        const lbl = (el.closest('.form-group')?.innerText || '').replace(/\\s+/g,' ').trim().slice(0,80);
        const item = { tag: el.tagName, type: el.type || null, id: el.id || null,
                       name: el.name || null, label: lbl,
                       value: el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value };
        if (el.tagName === 'SELECT') {
            item.selected = el.options[el.selectedIndex]?.text ?? null;
            item.options = [...el.options].slice(0, 40).map(o => `${o.value} = ${o.text}`);
        }
        out.push(item);
    });
    return JSON.stringify(out, null, 2);
}"""


def navegar_y_descargar(page, desde: date, hasta: date) -> Path:
    """Abre el informe Ventas Detalladas, fija el rango y descarga el Excel."""
    print(f"   Informe: {REPORT_URL}")
    page.goto(REPORT_URL, wait_until="networkidle")

    # Auditoría de filtros disponibles (diagnóstico; no altera la descarga).
    try:
        (DOWNLOAD_DIR / "filtros_informe.json").write_text(
            page.evaluate(_JS_DUMP_FILTROS), encoding="utf-8")
        print("   Filtros del informe volcados en filtros_informe.json")
    except Exception as e:
        print(f"   (no se pudo volcar filtros: {e})")

    # Fechas (dd/mm/yyyy) vía JS + eventos change/blur.
    r1 = page.evaluate(_JS_SET_FECHA, ["#fechaDesde", desde.strftime("%d/%m/%Y")])
    r2 = page.evaluate(_JS_SET_FECHA, ["#fechaHasta", hasta.strftime("%d/%m/%Y")])
    print(f"   Fechas pedidas: {desde:%d/%m/%Y} -> {hasta:%d/%m/%Y} | inputs quedaron: {r1!r} -> {r2!r}")

    # Dataset completo: incluir pedidos listos para entregar + pedidos pendientes.
    # (NO marcar "Solo Ventas PDV": excluiría la mayoría de las ventas.
    #  #check tampoco: es "Sin bonificaciones aplicadas", no lo que su nombre sugiere.)
    try:
        page.check("#check2")  # Incluir pedidos listos para entregar
        page.check("#check3")  # Incluir pedidos pendientes
    except Exception:
        pass

    # Generar aplica los filtros (valida fechas y arma la tabla). Con rangos
    # amplios el armado tarda bastante; esperar a que la red se calme en vez de
    # un timeout fijo (3 s alcanzaba para 5 días, no para 2 meses).
    page.get_by_text("Generar", exact=True).first.click()
    try:
        page.wait_for_load_state("networkidle", timeout=180000)
    except PWTimeout:
        print("   (el informe sigue cargando tras 3 min; se intenta exportar igual)")
    page.wait_for_timeout(2000)

    # ¿El ERP respetó las fechas o las revirtió al generar?
    post = page.evaluate(
        "() => [document.querySelector('#fechaDesde')?.value,"
        "       document.querySelector('#fechaHasta')?.value]"
    )
    print(f"   Fechas en el form DESPUES de Generar: {post[0]!r} -> {post[1]!r}")

    # Verificar que no haya error de validación visible.
    warn = page.evaluate(
        "() => { const w = document.getElementById('alertWarning');"
        " return (w && getComputedStyle(w).display !== 'none')"
        " ? (w.innerText || '').replace(/\\s+/g,' ').trim().slice(0,120) : null; }"
    )
    if warn:
        raise RuntimeError(f"El ERP rechazó el filtro: {warn}")

    # Exportar a excel → descarga.
    peticiones: list[str] = []

    def _cap(r):
        if "informeventasdet" not in r.url.lower():
            return
        try:
            body = r.post_data or ""
        except Exception:
            body = "(sin body)"
        peticiones.append(f"{r.method} {r.url[:120]} :: {body[:600]}")

    page.on("request", _cap)

    # El click normal de Playwright exige que el elemento sea "actionable"; con
    # rangos amplios queda tapado por el overlay de carga y da timeout aunque el
    # enlace ya esté listo. Se dispara por JS, que no pasa por esa verificación.
    try:
        with page.expect_download(timeout=180000) as dl_info:
            page.evaluate(
                "() => document.querySelector(\"a.generarInforme[data-formato='excel']\").click()"
            )
        download = dl_info.value
    except Exception:
        # Con rangos grandes el ERP no descarga: abre un modal avisando que
        # mandará el informe por email. Detectarlo para que el error diga eso y
        # no un timeout ciego.
        try:
            txt = page.evaluate(
                "() => (document.body.innerText || '').replace(/\\s+/g,' ')"
            ).lower()
        except Exception:
            txt = ""
        try:
            page.screenshot(path=str(Path(__file__).parent / "error_export.png"), full_page=True)
            print("   Captura de la pantalla de error: error_export.png")
        except Exception:
            pass
        if "por email" in txt or "por e-mail" in txt:
            raise RuntimeError(
                "El ERP no descargó el archivo: el rango pedido es demasiado grande y "
                "respondió 'Se enviará la información solicitada por email'. "
                "Usa un rango más corto."
            )
        raise
    for p in peticiones:
        print(f"   req> {p}")

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


class SinDatosAun(Exception):
    """El informe no tiene ventas reales que cargar en este momento. Normal:
    - al arrancar un periodo nuevo o muy temprano (archivo vacio), o
    - cuando el informe solo trae movimientos internos (ej. CERVECERIA ->
      Cliente PDV), que el endpoint excluye legitimamente dejando 0 validas.
    En ambos casos NO es un error: no hay nada que subir todavia."""


# Mensajes de error (HTTP 400) del endpoint que significan "nada valido que
# cargar ahora", no un fallo real. Se comparan en minusculas.
#
# OJO: "no se encontraron ventas de vendedores validos" NO va aca. Ese mensaje
# es ambiguo: puede ser legitimo (solo movimientos internos) o sintoma de un
# problema real — paso el 24-jul-2026, cuando el ERP renombro a los vendedores
# ('Transicion 1/2') y la version desplegada del endpoint los descartaba por
# lista blanca, perdiendo ~100 filas de ventas reales en silencio. Tratarlo como
# "normal" oculta ese tipo de fallo, asi que se deja fallar en rojo a proposito.
_MENSAJES_SIN_DATOS = (
    "no contiene datos",
)


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
    err = str(body.get("error", "")).lower()
    if r.status_code == 400 and any(m in err for m in _MENSAJES_SIN_DATOS):
        raise SinDatosAun(str(body.get("error")))
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

    if SOLO_DESCARGAR:
        print("=== SOLO_DESCARGAR=true: el Excel queda como artifact, NO se sube ===")
        return 0

    try:
        resultado = subir_a_pwa(archivo)
    except SinDatosAun as e:
        print(f"=== SIN DATOS TODAVIA ({e}) — normal, no es un error ===")
        return 0

    print("=== RESULTADO ===")
    print(f"  Insertadas        : {resultado.get('insertadas')}")
    print(f"    entregadas      : {resultado.get('entregadas')}")
    print(f"    por entregar    : {resultado.get('pendientesDeEntrega')}")
    print(f"  Rango cargado     : {resultado.get('fechaMin')} -> {resultado.get('fechaMax')}")
    print(f"  Internos excluidos: {resultado.get('clientesInternosExcluidos')}")
    for v in resultado.get("vendedores", []):
        print(f"  {v.get('nombre')}: {v.get('filas')} filas | {v.get('litros')} L | {v.get('fechas')} dias")
    return 0


if __name__ == "__main__":
    sys.exit(main())
