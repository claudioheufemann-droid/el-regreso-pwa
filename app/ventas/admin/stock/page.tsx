import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import StockUploadClient from './StockUploadClient'

export default async function StockPage() {
  const user = await getServerUser()
  if (!user?.isAdmin) redirect('/ventas')

  return <StockUploadClient />
}
