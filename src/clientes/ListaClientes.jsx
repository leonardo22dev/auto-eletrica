import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { listarClientes, criarCliente } from '../data/clientes.js'
import { useDebounce } from '../ui/useDebounce.js'
import Busca from '../ui/Busca.jsx'
import Botao from '../ui/Botao.jsx'
import EstadoVazio from '../ui/EstadoVazio.jsx'
import FormCliente from './FormCliente.jsx'

export default function ListaClientes() {
  const navegar = useNavigate()
  const [termo, setTermo] = useState('')
  const termoAtrasado = useDebounce(termo)
  const [clientes, setClientes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)

  const buscar = useCallback(
    (t) =>
      listarClientes({ termo: t })
        .then((lista) => { setClientes(lista); setErro('') })
        .catch((e) => setErro(e.message))
        .finally(() => setCarregando(false)),
    [],
  )

  useEffect(() => { buscar(termoAtrasado) }, [buscar, termoAtrasado])

  async function salvarNovo(dados) {
    const cliente = await criarCliente(dados)
    setCriando(false)
    navegar(`/clientes/${cliente.id}`)
  }

  if (criando) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-6">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Novo cliente</h1>
        <FormCliente aoSalvar={salvarNovo} aoCancelar={() => setCriando(false)} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Clientes</h1>
        <Botao className="w-auto" onClick={() => setCriando(true)}>
          <Plus size={18} aria-hidden="true" /> Novo
        </Botao>
      </div>

      <Busca valor={termo} aoMudar={setTermo} placeholder="Nome ou telefone" />

      {erro && <p className="mb-3 text-sm font-semibold text-red">{erro}</p>}
      {carregando && <p className="text-mute">Carregando…</p>}

      {!carregando && clientes.length === 0 && (
        <EstadoVazio
          titulo={termo ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          descricao={
            termo
              ? 'Confira o nome ou o telefone digitado.'
              : 'O primeiro cliente costuma nascer junto com a primeira OS.'
          }
        />
      )}

      <ul>
        {clientes.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => navegar(`/clientes/${c.id}`)}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-linha bg-paper px-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{c.nome}</span>
                <span className="text-xs text-mute">
                  {c.telefone || 'sem telefone'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
