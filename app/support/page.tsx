import SupportEntry from './SupportEntry'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support — Marmoset' }

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="text-[#254DA5] font-bold text-xs tracking-widest uppercase">Marmoset Digital</div>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Support</h1>
          <p className="text-sm text-gray-500">Raise a request and track its progress.</p>
        </div>
        <SupportEntry />
        <p className="text-center text-xs text-gray-400 mt-6">Marmoset Digital Media · Agency OS</p>
      </div>
    </div>
  )
}
