import GuiaClient from './GuiaClient'

export const dynamic = 'force-dynamic'

export default async function GuiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <GuiaClient loteId={id} />
}
