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
# Tope duro sobre el ancho de CADA tramo pedido al ERP: con rangos mas anchos
# que esto el ERP deja de descargar y responde "se enviara por email". El
# periodo completo (24->23, hasta ~32 dias) se parte en tramos de este ancho
# via chunks_seguros() para poder pedirlo completo igual, en varias pasadas.
MAX_DIAS_RANGO = 18
DOWNLOAD_DIR  = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)


def _parse_ddmmyyyy(s: str) -> date:
    d, m, y = (int(x) for x in s.split("/"))
    return date(y, m, d)


def periodo_actual() -> tuple[date, date]:
    """Rango COMPLETO del periodo de venta vigente: desde el dia 23 (el ultimo
    dia del periodo anterior, 24->23) hasta hoy.

    Por que desde el 23 y no el 24: el ERP filtra el informe por FECHA DE
    ENTREGA, no por fecha de pedido. Arrancar justo el dia 24 deja fuera para
    siempre los pedidos entregados el 23 o antes del periodo anterior. Paso de
    verdad: el pedido 00052061 de Zaatar (23-jul, entregado el 23-jul) nunca
    se cargo hasta que se pidio ese rango a mano.

    Por que el periodo COMPLETO y no solo lo reciente (hasta 25-ago-2026): con
    ventana corta, un pedido que el ERP borro por completo nunca vuelve a
    aparecer en ningun archivo futuro y queda huerfano en la BD para siempre
    — se detectaron 150 pedidos fantasma (5.284 L) acumulados asi en jul-ago
    2026. Pidiendo el periodo completo en cada corrida, /api/upload-ventas
    puede reconciliar (borrar) esos huerfanos dentro del rango que cubre cada
    descarga. Recargar dias ya cargados no duplica: se borra por pedido antes
    de insertar."""
    hoy = date.today()
    if hoy.day >= 24:
        inicio = hoy.replace(day=24)
    else:
        primero = hoy.replace(day=1)
        inicio = (primero - timedelta(days=1)).replace(day=24)
    return inicio - timedelta(days=1), hoy


def chunks_seguros(desde: date, hasta: date) -> list[tuple[date, date]]:
    """Parte [desde, hasta] en tramos de a lo mas MAX_DIAS_RANGO dias — el ERP
    rechaza la descarga directa ("se enviara por email") con rangos mas
    anchos. Cada tramo se pide y se sube por separado."""
    tramos = []
    cursor = desde
    while cursor <= hasta:
        fin = min(cursor + timedelta(days=MAX_DIAS_RANGO), hasta)
        tramos.append((cursor, fin))
        cursor = fin + timedelta(days=1)
    return tramos


def tramos_a_pedir() -> list[tuple[date, date]]:
    """Tramos a descargar en esta corrida. FECHA_DESDE/FECHA_HASTA (solo via
    workflow_dispatch, para diagnostico manual) piden un unico rango exacto
    sin trocear. Por defecto: el periodo completo vigente, en tramos seguros."""
    if FECHA_DESDE or FECHA_HASTA:
        desde = _parse_ddmmyyyy(FECHA_DESDE) if FECHA_DESDE else periodo_actual()[0]
        hasta = _parse_ddmmyyyy(FECHA_HASTA) if FECHA_HASTA else date.today()
        return [(desde, hasta)]
    return chunks_seguros(*periodo_actual())


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
    print(f"DEBUG TEMPORAL: UPLOAD_SECRET largo={len(UPLOAD_SECRET or '')}")
    try:
        r = requests.post(UPLOAD_URL, headers={
            "Authorization": f"Bearer {UPLOAD_SECRET}", "x-debug-auth": "1",
        }, timeout=30)
        print(f"DEBUG TEMPORAL: respuesta diagnostico = {r.status_code} {r.text}")
    except Exception as e:
        print(f"DEBUG TEMPORAL: fallo diagnostico: {e}")
    faltan = [k for k, v in {
        "ERP_USERNAME": ERP_USERNAME, "ERP_PASSWORD": ERP_PASSWORD, "UPLOAD_SECRET": UPLOAD_SECRET,
    }.items() if not v]
    if faltan:
        print(f"ERROR: faltan variables de entorno: {', '.join(faltan)}")
        return 1

    tramos = tramos_a_pedir()
    print(f"=== ERP SYNC | {len(tramos)} tramo(s) === {tramos}")

    huerfanos_total = 0
    con_error = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        login(page)
        for i, (desde, hasta) in enumerate(tramos, 1):
            print(f"[3/4] Tramo {i}/{len(tramos)}: {desde} -> {hasta}")
            try:
                archivo = navegar_y_descargar(page, desde, hasta)
            except Exception as e:
                print(f"   ERROR descargando tramo {desde}->{hasta}: {e}")
                con_error += 1
                continue

            if SOLO_DESCARGAR:
                print("   SOLO_DESCARGAR=true: el Excel queda como artifact, NO se sube")
                continue

            try:
                resultado = subir_a_pwa(archivo)
            except SinDatosAun as e:
                print(f"   sin datos todavia ({e}) — normal")
                continue
            except RuntimeError as e:
                print(f"   ERROR subiendo tramo {desde}->{hasta}: {e}")
                con_error += 1
                continue

            huerfanos = resultado.get("pedidosHuerfanosBorrados") or 0
            huerfanos_total += huerfanos
            print(f"   insertadas={resultado.get('insertadas')} "
                  f"rango={resultado.get('fechaMin')}->{resultado.get('fechaMax')} "
                  f"huerfanos_borrados={huerfanos}")
        browser.close()

    print("=== RESUMEN ===")
    print(f"  Tramos con error  : {con_error}/{len(tramos)}")
    print(f"  Pedidos huerfanos borrados (reconciliacion): {huerfanos_total}")
    return 1 if con_error == len(tramos) else 0


if __name__ == "__main__":
    sys.exit(main())
