import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export async function buscarConfiguracoes() {
  const { data, error } = await supabase
    .from('configuracoes').select('*').eq('id', 1).single()
  if (error) throw new Error('Não foi possível ler as configurações.')
  return data
}

export async function salvarConfiguracoes(dados) {
  const { data, error } = await supabase
    .from('configuracoes').update(dados).eq('id', 1).select().single()
  if (error) throw new Error('Não foi possível salvar as configurações.')
  return data
}

export async function definirProximoNumero(numero) {
  const { error } = await supabase.rpc('definir_proximo_numero', {
    p_numero: Number(numero),
  })
  if (error) throw new Error(error.message)
}

export function useConfiguracoes() {
  const [config, setConfig] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // `buscar` não liga o carregando: chamado de dentro do efeito, um setState
  // síncrono ali dispara render em cascata. O estado já nasce carregando.
  const buscar = useCallback(
    () =>
      buscarConfiguracoes()
        .then((c) => { setConfig(c); setErro('') })
        .catch((e) => setErro(e.message))
        .finally(() => setCarregando(false)),
    [],
  )

  // `recarregar` é chamado de manipulador de evento, onde ligar o carregando
  // é legítimo.
  const recarregar = useCallback(() => {
    setCarregando(true)
    return buscar()
  }, [buscar])

  useEffect(() => { buscar() }, [buscar])
  return { config, carregando, erro, recarregar }
}
