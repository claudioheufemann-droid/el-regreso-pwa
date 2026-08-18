import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HubClient from '@/components/ui/HubClient'

export const dynamic = 'force-dynamic'

export default async function HubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('nombre, is_admin, email, macro_area')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.is_admin ?? false
  const nombre = profile?.nombre ?? user.email?.split('@')[0] ?? 'Usuario'
  const macroArea = profile?.macro_area ?? null

  return <HubClient isAdmin={isAdmin} nombre={nombre} macroArea={macroArea} />
}
