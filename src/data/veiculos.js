import { supabase } from './supabase.js'
import { normalizarPlaca } from '../lib/placa.js'

// É esta string que fica congelada na OS e vai impressa no PDF.
export function descricaoVeiculo(veiculo) {
  if (!veiculo) return ''
  const corpo = [veiculo.marca, veiculo.modelo, veiculo.ano]
    .filter(Boolean).join(' ').trim()
  const cor = veiculo.cor ? String(veiculo.cor).trim() : ''
  if (corpo && cor) return `${corpo} — ${cor}`
  if (corpo) return corpo
  if (cor) return cor
  return veiculo.placa ? normalizarPlaca(veiculo.placa) : ''
}

export async function buscarVeiculoPorPlaca(placa) {
  const p = normalizarPlaca(placa)
  if (!p) return null
  const { data, error } = await supabase
    .from('veiculos')
    .select('*, cliente:clientes(id, nome, telefone)')
    .eq('placa', p)
    .maybeSingle()
  if (error) throw new Error('Não foi possível consultar a placa.')
  return data
}

export async function buscarVeiculo(id) {
  const { data, error } = await supabase
    .from('veiculos')
    .select('*, cliente:clientes(id, nome, telefone)')
    .eq('id', id).single()
  if (error) throw new Error('Veículo não encontrado.')
  return data
}

export async function listarVeiculos({ termo = '' } = {}) {
  let q = supabase.from('veiculos')
    .select('*, cliente:clientes(id, nome)')
    .order('placa').limit(100)
  const t = normalizarPlaca(termo)
  if (t) q = q.ilike('placa', `%${t}%`)
  const { data, error } = await q
  if (error) throw new Error('Não foi possível listar os veículos.')
  return data
}

export async function criarVeiculo(dados) {
  const corpo = { ...dados, placa: normalizarPlaca(dados.placa) }
  const { data, error } = await supabase
    .from('veiculos').insert(corpo).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('Já existe veículo com essa placa.')
    throw new Error('Não foi possível salvar o veículo.')
  }
  return data
}

export async function atualizarVeiculo(id, dados) {
  const corpo = dados.placa
    ? { ...dados, placa: normalizarPlaca(dados.placa) }
    : dados
  const { data, error } = await supabase
    .from('veiculos').update(corpo).eq('id', id).select().single()
  if (error) throw new Error('Não foi possível atualizar o veículo.')
  return data
}
