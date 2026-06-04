import { createCompany } from '@/app/actions/clients'
import Link from 'next/link'

export default function NewClientPage() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <Link href="/clients" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">← Back to Clients</Link>
        <h1 className="text-2xl font-bold text-gray-900">Add New Client</h1>
      </div>

      <form action={createCompany as any} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-5">

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name *</label>
            <input name="name" required className="input" placeholder="Acme Corp" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
            <input name="industry" className="input" placeholder="e.g. Hospitality" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
            <input name="website" type="url" className="input" placeholder="https://example.com.au" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ABN / ACN</label>
            <input name="abn_acn" className="input" placeholder="12 345 678 901" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
            <select name="status" className="input">
              <option value="lead">Lead</option>
              <option value="active_client">Active Client</option>
              <option value="inactive">Inactive</option>
              <option value="churned">Churned</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Lead Source</label>
            <select name="lead_source" className="input">
              <option value="">— None —</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="linkedin">LinkedIn</option>
              <option value="google_ads">Google Ads</option>
              <option value="meta_ads">Meta Ads</option>
              <option value="cold_outreach">Cold Outreach</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Lead Stage</label>
            <select name="lead_stage" className="input">
              <option value="">— None —</option>
              <option value="new_enquiry">New Enquiry</option>
              <option value="proposal_sent">Proposal Sent</option>
              <option value="negotiation">Negotiation</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Value ($)</label>
            <input name="estimated_value" type="number" min="0" step="0.01" className="input" placeholder="0.00" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Street Address</label>
            <input name="address" className="input" placeholder="123 Example St" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Suburb</label>
            <input name="suburb" className="input" placeholder="Melbourne" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
            <select name="state" className="input">
              <option value="">— Select —</option>
              <option value="VIC">VIC</option>
              <option value="NSW">NSW</option>
              <option value="QLD">QLD</option>
              <option value="WA">WA</option>
              <option value="SA">SA</option>
              <option value="TAS">TAS</option>
              <option value="ACT">ACT</option>
              <option value="NT">NT</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Postcode</label>
            <input name="postcode" className="input" placeholder="3000" maxLength={4} />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea name="notes" rows={3} className="input" placeholder="Internal notes about this client..." />
          </div>

        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition">
            Save Client
          </button>
          <Link href="/clients" className="text-sm text-gray-500 hover:text-gray-700">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
