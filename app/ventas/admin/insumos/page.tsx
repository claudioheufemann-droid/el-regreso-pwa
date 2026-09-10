import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import InsumosUploadClient from './InsumosUploadClient'

export default async function InsumosStockPage() {
  const user = await getServerUser()
  if (!user?.isAdmin) redirect('/ventas')

  return <InsumosUploadClient />
}
