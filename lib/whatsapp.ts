/**
 * Envío de mensajes vía WhatsApp Business Cloud API (Meta Graph API).
 *
 * Un mensaje de imagen "libre" (free-form) solo se entrega si el destinatario
 * tiene una conversación abierta con el número de negocio en las últimas 24h.
 * Fuera de esa ventana, Meta lo rechaza — para el cliente (que normalmente no
 * inicia la conversación) hace falta un mensaje de plantilla pre-aprobado.
 * Ver WHATSAPP_TEMPLATE_ENTREGA_CONFIRMADA más abajo.
 */

const WA_API_VERSION = 'v20.0'

function waUrl(): string | null {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!phoneId) return null
  return `https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`
}

async function waFetch(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const url = waUrl()
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!url || !token) return { ok: false, error: 'WhatsApp no configurado (faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)' }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: err?.error?.message ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red' }
  }
}

/** Mensaje libre de imagen — requiere ventana de 24h abierta con el destinatario. */
export async function sendWhatsAppImage(to: string, imageUrl: string, caption: string) {
  return waFetch({ to, type: 'image', image: { link: imageUrl, caption } })
}

/**
 * Mensaje de plantilla — funciona fuera de la ventana de 24h.
 * La plantilla debe existir y estar APROBADA en Meta Business Manager antes de usarse.
 * Se asume una plantilla con un componente header de imagen y un body con 1 variable (nombre del cliente).
 */
export async function sendWhatsAppTemplate(to: string, templateName: string, imageUrl: string, nombreCliente: string) {
  return waFetch({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es' },
      components: [
        { type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] },
        { type: 'body', parameters: [{ type: 'text', text: nombreCliente }] },
      ],
    },
  })
}
