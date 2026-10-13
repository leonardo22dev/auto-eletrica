import { supabase } from './supabase.js'
import { condicaoIlike } from './filtros.js'

export async function listarClientes({ termo = '' } = {}) {
  let q = supabase.from('clientes')
    .select('id, nome, telefone, email')
    .order('nome', { ascending: true })
    .limit(100)
  const t = termo.trim()
  if (t) {
    q = q.or([condicaoIlike('nome', t), condicaoIlike('telefone', t)].join(','))
  }
  const { data, error } = await q
  if (error) throw new Error('Não foi possível listar os clientes.')
  return data
}

export async function buscarCliente(id) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, veiculos(id, placa, marca, modelo, ano, cor)')
    .eq('id', id).single()
  if (error) throw new Error('Cliente não encontrado.')
  return data
}

export async function criarCliente(dados) {
  const { data, error } = await supabase
    .from('clientes').insert(dados).select().single()
  if (error) throw new Error('Não foi possível salvar o cliente.')
  return data
}

export async function atualizarCliente(id, dados) {
  const { data, error } = await supabase
    .from('clientes').update(dados).eq('id', id).select().single()
  if (error) throw new Error('Não foi possível atualizar o cliente.')
  return data
}
