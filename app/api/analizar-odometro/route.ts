import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type SupportedType = typeof SUPPORTED_TYPES[number]

export async function POST(req: NextRequest) {
  try {
    const { imagen, tipo } = await req.json()
    if (!imagen) return NextResponse.json({ km: null })

    const mediaType: SupportedType = SUPPORTED_TYPES.includes(tipo) ? tipo : 'image/jpeg'

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imagen },
          },
          {
            type: 'text',
            text: 'Lee el número del odómetro en esta imagen. Responde ÚNICAMENTE con el número entero en kilómetros, sin puntos ni comas ni texto. Ejemplo: 45250. Si no puedes leerlo claramente, responde: 0',
          },
        ],
      }],
    })

    const texto = (message.content[0] as { type: string; text: string }).text.trim().replace(/\D/g, '')
    const km = parseInt(texto, 10)
    return NextResponse.json({ km: km > 0 ? km : null })
  } catch {
    return NextResponse.json({ km: null })
  }
}
