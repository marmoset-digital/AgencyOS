import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import DefinitionsManager from './DefinitionsManager'
import type { FieldDefinition } from '@/app/actions/customFields'

export const dynamic = 'force-dynamic'

export default async function CustomFieldsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('custom_field_definitions')
    .select('id, entity_type, label, field_type, options, required, sort_order')
    .order('entity_type', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  const all = (data ?? []) as FieldDefinition[]
  const clientFields = all.filter(d => d.entity_type === 'company')
  const projectFields = all.filter(d => d.entity_type === 'project')

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <Link href="/settings" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">
          ← Back to Settings
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>
        <p className="text-gray-500 mt-1">
          Define fields once and they appear on every client or project, ready to fill in.
          One-off fields you add on a single record still work as before.
        </p>
      </div>

      <DefinitionsManager entityType="company" title="Client fields" definitions={clientFields} />
      <div className="h-6" />
      <DefinitionsManager entityType="project" title="Project fields" definitions={projectFields} />
    </div>
  )
}
