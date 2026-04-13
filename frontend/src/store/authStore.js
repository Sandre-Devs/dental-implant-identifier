import { create } from 'zustand'
import api from '../services/api'

export const useAuthStore = create((set) => ({
  token: localStorage.getItem('dii_token') || null,
  user:  JSON.parse(localStorage.getItem('dii_user') || 'null'),

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('dii_token', data.token)
    localStorage.setItem('dii_user', JSON.stringify(data.user))
    localStorage.setItem('dii_refresh', data.refresh_token)
    set({ token: data.token, user: data.user })
    return data.user
  },

  logout: () => {
    localStorage.removeItem('dii_token')
    localStorage.removeItem('dii_user')
    localStorage.removeItem('dii_refresh')
    set({ token: null, user: null })
  }
}))
