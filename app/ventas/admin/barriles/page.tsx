import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import BarrilesUploadClient from './BarrilesUploadClient'

export default async function BarrilesUploadPage() {
  const user = await getServerUser()
  if (!user?.isAdmin) redirect('/ventas')

  return <BarrilesUploadClient />
}
