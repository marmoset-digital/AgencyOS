import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { updateContact } from '@/app/actions/clients'

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>
}) {
  const { id, cid } = await params
  const supabase = await createClient()

  const [{ data: company }, { data: contact }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('id', id).single(),
    supabase.from('contacts').select('*').eq('id', cid).eq('company_id', id).single(),
  ])

  if (!company || !contact) notFound()

  const action = updateContact.bind(null, cid, id)

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <Link
          href={`/clients/${id}`}
          className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block"
        >
          ← Back to {company.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Contact</h1>
      </div>

      <form action={action as any} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              name="first_name"
              required
              defaultValue={contact.first_name}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              name="last_name"
              required
              defaultValue={contact.last_name}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              name="email"
              type="email"
              required
              defaultValue={contact.email}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
            <input
              name="phone"
              type="tel"
              defaultValue={contact.phone ?? ''}
              className="input"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Job Title</label>
            <input
              name="job_title"
              defaultValue={contact.job_title ?? ''}
              className="input"
            />
          </div>

          <div className="col-span-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                name="is_primary"
                type="checkbox"
                defaultChecked={contact.is_primary}
                className="w-4 h-4 rounded border-gray-300 text-[#E8611A] focus:ring-[#E8611A]"
              />
              <span className="text-sm text-gray-700">Primary contact for this client</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
          >
            Save Changes
          </button>
          <Link href={`/clients/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
