import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const NIVELES = ['lleno', 'tres_cuartos', 'medio', 'cuarto', 'reserva', 'vacio'] as const
type Nivel = typeof NIVELES[number]

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type SupportedType = typeof SUPPORTED_TYPES[number]

export async function POST(req: NextRequest) {
  try {
    const { imagen, tipo } = await req.json()
    if (!imagen) return NextResponse.json({ nivel: null })

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
            text: 'Observa el indicador de combustible en esta imagen del tablero. Responde ÚNICAMENTE con una de estas palabras exactas (sin explicación): lleno, tres_cuartos, medio, cuarto, reserva, vacio. Si no puedes verlo claramente, responde: medio',
          },
        ],
      }],
    })

    const texto = (message.content[0] as { type: string; text: string }).text.trim().toLowerCase()
    const nivel: Nivel = NIVELES.find(n => texto.includes(n)) ?? 'medio'
    return NextResponse.json({ nivel })
  } catch {
    return NextResponse.json({ nivel: null })
  }
}
