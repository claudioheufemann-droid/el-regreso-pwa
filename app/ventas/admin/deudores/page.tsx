import { createAdminClient } from '@/lib/supabase/admin'
import DeudoresClient from './DeudoresClient'

// Service-role a propósito — ver lib/supabase/admin.ts. Esta página ya está
// detrás de app/ventas/admin/layout.tsx (redirige si !isAdmin).
export default async function DeudoresPage() {
  const supabase = createAdminClient()

  const { data: deudores } = await supabase
    .from('deudores')
    .select('*')
    .order('deuda_vencida', { ascending: false })

  return <DeudoresClient initialDeudores={deudores ?? []} />
}
