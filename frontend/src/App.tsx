import { useEffect, useState } from 'react'
import { apiGet } from './lib/api'

type ApiStatus = 'checking' | 'online' | 'offline'

const STATUS_LABEL: Record<ApiStatus, string> = {
  checking: 'Verificando API…',
  online: 'API conectada',
  offline: 'API indisponível — rode o backend em http://localhost:8000',
}

const STATUS_COLOR: Record<ApiStatus, string> = {
  checking: 'bg-muted',
  online: 'bg-success',
  offline: 'bg-danger',
}

export default function App() {
  const [status, setStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    apiGet<{ status: string }>('/health')
      .then(() => setStatus('online'))
      .catch(() => setStatus('offline'))
  }, [])

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Pipeline B2B</h1>
      <p className="mt-2 text-muted">Deals, contratos e regras de automação.</p>
      <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm">
        <span className={`size-2 rounded-full ${STATUS_COLOR[status]}`} aria-hidden="true" />
        {STATUS_LABEL[status]}
      </p>
    </main>
  )
}
