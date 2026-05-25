'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { importCompaniesFromCSV, type ImportResult } from '@/app/actions/clients'

// ── Sample CSV template ─────────────────────────────────────────
const SAMPLE_CSV = `name,industry,website,billing_address,abn_acn,status,lead_source,lead_stage,estimated_value,notes,first_name,last_name,email,phone,job_title
Acme Corp,Hospitality,https://acme.com.au,"123 Example St, Melbourne VIC 3000",12 345 678 901,active,referral,,5000,Long-standing client,Jane,Smith,jane@acme.com.au,0412 345 678,Marketing Manager
Blue Sky Media,Media & Entertainment,https://bluesky.com.au,,98 765 432 109,lead,website,proposal_sent,12000,,Tom,Jones,tom@bluesky.com.au,0499 999 888,Director
`

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'agency_os_clients_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Simple client-side CSV preview parser ───────────────────────
function parsePreview(text: string, maxRows = 5): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1, maxRows + 1).map(l => parseLine(l))
  return { headers, rows }
}

type Step = 'upload' | 'preview' | 'importing' | 'done'

export default function ImportClientsPage() {
  const [step, setStep] = useState<Step>('upload')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [totalRows, setTotalRows] = useState(0)
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] }>({ headers: [], rows: [] })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileLoad(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      setCsvText(text)
      setTotalRows(Math.max(0, lines.length - 1))
      setPreview(parsePreview(text))
      setStep('preview')
    }
    reader.readAsText(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) handleFileLoad(file)
  }, [])

  async function handleImport() {
    setStep('importing')
    const fd = new FormData()
    fd.append('csv', csvText)
    const res = await importCompaniesFromCSV(fd)
    setResult(res)
    setStep('done')
  }

  // ── Upload step ────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="p-8 max-w-2xl">
        <div className="mb-8">
          <Link href="/clients" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">← Back to Clients</Link>
          <h1 className="text-2xl font-bold text-gray-900">Import Clients from CSV</h1>
          <p className="text-gray-500 mt-1">Bulk import companies and their primary contacts from a CSV file.</p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition ${
            dragOver ? 'border-[#E8611A] bg-orange-50' : 'border-gray-200 hover:border-[#E8611A] hover:bg-orange-50/50'
          }`}
        >
          <div className="text-4xl mb-3">📄</div>
          <p className="font-semibold text-gray-700 mb-1">Drop your CSV file here</p>
          <p className="text-sm text-gray-400">or click to browse</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileLoad(file)
            }}
          />
        </div>

        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Supported Columns</h2>
            <button onClick={downloadSample} className="text-sm text-[#E8611A] hover:underline font-medium">
              ↓ Download template
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-600 mb-2">Company fields</p>
              <ul className="space-y-1 text-gray-500">
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">name</span> <span className="text-red-500">*required</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">industry</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">website</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">billing_address</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">abn_acn</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">status</span> <span className="text-gray-400 text-xs">lead / active / inactive / churned</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">lead_source</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">lead_stage</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">estimated_value</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">notes</span></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-600 mb-2">Contact fields <span className="text-gray-400 text-xs font-normal">(optional)</span></p>
              <ul className="space-y-1 text-gray-500">
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">first_name</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">last_name</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">email</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">phone</span></li>
                <li><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">job_title</span></li>
              </ul>
              <p className="mt-3 text-xs text-gray-400">If any contact field is present, first name, last name and email are all required.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Preview step ───────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="p-8 max-w-5xl">
        <div className="mb-6">
          <Link href="/clients" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">← Back to Clients</Link>
          <h1 className="text-2xl font-bold text-gray-900">Preview Import</h1>
          <p className="text-gray-500 mt-1">
            <span className="font-medium text-gray-700">{fileName}</span> — {totalRows} row{totalRows !== 1 ? 's' : ''} detected
          </p>
        </div>

        {preview.headers.length === 0 ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600 text-sm">
            Could not parse the CSV file. Make sure it has a header row and is comma-separated.
          </div>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
              <strong>Columns detected:</strong> {preview.headers.join(', ')}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {preview.headers.map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      {row.map((cell, j) => (
                        <td key={j} className="px-4 py-3 text-gray-700 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">
                          {cell || <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalRows > 5 && (
                <div className="px-4 py-3 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                  Showing first 5 of {totalRows} rows
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleImport} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition">
                Import {totalRows} Client{totalRows !== 1 ? 's' : ''}
              </button>
              <button
                onClick={() => { setCsvText(''); setFileName(''); setPreview({ headers: [], rows: [] }); setStep('upload') }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Choose different file
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Importing step ─────────────────────────────────────────────
  if (step === 'importing') {
    return (
      <div className="p-8 max-w-2xl">
        <div className="flex items-center gap-4 py-16 text-gray-500">
          <div className="w-6 h-6 border-2 border-[#E8611A] border-t-transparent rounded-full animate-spin" />
          <span className="text-lg font-medium">Importing {totalRows} clients…</span>
        </div>
      </div>
    )
  }

  // ── Done step ──────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="mb-8">
          <Link href="/clients" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">← Back to Clients</Link>
          <h1 className="text-2xl font-bold text-gray-900">Import Complete</h1>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-green-600">{result.imported}</div>
            <div className="text-sm text-green-700 mt-1">Companies imported</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-blue-600">{result.contactsImported}</div>
            <div className="text-sm text-blue-700 mt-1">Contacts imported</div>
          </div>
          <div className={`rounded-xl p-5 text-center border ${result.skipped > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`text-3xl font-bold ${result.skipped > 0 ? 'text-red-600' : 'text-gray-400'}`}>{result.skipped}</div>
            <div className={`text-sm mt-1 ${result.skipped > 0 ? 'text-red-700' : 'text-gray-500'}`}>Rows skipped</div>
          </div>
        </div>
        {result.errors.length > 0 && (
          <div className="bg-white rounded-xl border border-red-200 mb-6 overflow-hidden">
            <div className="px-5 py-3 bg-red-50 border-b border-red-200">
              <h2 className="text-sm font-semibold text-red-700">Issues ({result.errors.length})</h2>
            </div>
            <ul className="divide-y divide-red-50">
              {result.errors.map((e, i) => (
                <li key={i} className="px-5 py-3 text-sm">
                  <span className="text-gray-400 mr-2">Row {e.row}</span>
                  <span className="text-red-600">{e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Link href="/clients" className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition">
            View Clients →
          </Link>
          <button
            onClick={() => { setCsvText(''); setFileName(''); setPreview({ headers: [], rows: [] }); setResult(null); setStep('upload') }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Import another file
          </button>
        </div>
      </div>
    )
  }

  return null
}
