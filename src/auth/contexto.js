import { createContext, useContext } from 'react'

export const AuthCtx = createContext(null)

export function useAuth() {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return v
}
