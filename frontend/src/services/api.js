import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({ baseURL: '/api' })

// ─── Refresh queue ─────────────────────────────────────────────
// Evita race condition quando múltiplas requisições expiram ao mesmo tempo:
// a primeira faz o refresh real, as demais aguardam a mesma Promise.
let refreshPromise = null

async function doRefresh() {
  const refresh = localStorage.getItem('dii_refresh')
  if (!refresh) throw new Error('no_refresh')
  const { data } = await axios.post('/api/auth/refresh', { refresh_token: refresh })
  localStorage.setItem('dii_token', data.token)
  localStorage.setItem('dii_refresh', data.refresh_token)
  return data.token
}

function logout() {
  localStorage.clear()
  window.location.href = '/login'
}

// ─── Request interceptor — injeta token ───────────────────────
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('dii_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ─── Response interceptor — auto-refresh com fila ─────────────
api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true

      try {
        // Se já há um refresh em andamento, aguarda ele ao invés de disparar outro
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => { refreshPromise = null })
        }
        const newToken = await refreshPromise
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        logout()
        return Promise.reject(err)
      }
    }

    const msg = err.response?.data?.error || 'Erro inesperado.'
    if (err.response?.status !== 401) toast.error(msg)
    return Promise.reject(err)
  }
)

// ─── Proactive refresh ─────────────────────────────────────────
// Verifica a cada 30min se o access token vence em menos de 30min
// e renova silenciosamente, sem esperar uma requisição falhar.
function getTokenExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000  // ms
  } catch { return 0 }
}

function scheduleProactiveRefresh() {
  const token = localStorage.getItem('dii_token')
  if (!token) return

  const exp      = getTokenExp(token)
  const now      = Date.now()
  const timeLeft = exp - now
  // Renova quando faltar ≤ 30min (1_800_000 ms)
  const delay    = Math.max(0, timeLeft - 30 * 60 * 1000)

  setTimeout(async () => {
    if (!localStorage.getItem('dii_token')) return  // deslogado
    try {
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => { refreshPromise = null })
      }
      await refreshPromise
      scheduleProactiveRefresh()  // agenda o próximo ciclo
    } catch {
      // Refresh falhou — deixa o interceptor de response tratar na próxima req
    }
  }, delay)
}

// Inicia o ciclo proativo assim que o módulo é carregado
scheduleProactiveRefresh()

// Reinicia o ciclo após login bem-sucedido (token novo no localStorage)
export function initTokenRefresh() {
  scheduleProactiveRefresh()
}

export default api
