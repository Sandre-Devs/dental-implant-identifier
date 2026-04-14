import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Microscope, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow]       = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate  = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault(); setLoading(true)
    try { await login(email, password); navigate('/') }
    catch (err) { toast.error(err.response?.data?.error || 'Falha ao autenticar.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center mb-4 shadow-lg shadow-primary-900/50">
            <Microscope size={28} className="text-white"/>
          </div>
          <h1 className="text-2xl font-bold text-white">DII</h1>
          <p className="text-gray-500 text-sm mt-1">Dental Implant Identifier</p>
        </div>
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" placeholder="admin@dii.sandre.dev"
                value={email} onChange={e => setEmail(e.target.value)} required autoFocus/>
            </div>
            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <input className="input pr-10" type={show?'text':'password'} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} required/>
                <button type="button" onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <Loader2 size={16} className="animate-spin"/> : 'Entrar'}
            </button>
          </form>
        </div>
        <p className="text-center text-gray-600 text-xs mt-6">dii.sandre.dev</p>
      </div>
    </div>
  )
}
