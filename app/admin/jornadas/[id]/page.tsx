import JornadaDetailClient from './JornadaDetailClient'

export default async function JornadaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <JornadaDetailClient jornadaId={id} />
}
