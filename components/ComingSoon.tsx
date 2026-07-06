export default function ComingSoon({ title, phase, blurb }: { title: string; phase?: string; blurb?: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
      <div className="max-w-lg mt-16 mx-auto text-center">
        <div className="text-4xl mb-4">🚧</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Coming soon</h2>
        <p className="text-sm text-gray-500">
          {blurb ?? `The ${title} module isn't built yet.`}
        </p>
        {phase && <p className="text-xs text-gray-400 mt-3">Planned for {phase}.</p>}
      </div>
    </div>
  )
}
