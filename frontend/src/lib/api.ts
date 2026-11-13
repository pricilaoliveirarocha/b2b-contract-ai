// Camada única de acesso à API. Todas as chamadas HTTP passam por aqui.
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`Erro ${response.status} ao acessar ${path}`)
  }
  return (await response.json()) as T
}
