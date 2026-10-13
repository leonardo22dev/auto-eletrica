import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { buscarCliente, atualizarCliente } from '../data/clientes.js'
import { formatarPlaca } from '../lib/placa.js'
import { descricaoVeiculo } from '../data/veiculos.js'
import FormCliente from './FormCliente.jsx'

export default function FichaCliente() {
  const { id } = useParams()
  const navegar = useNavigate()
  const [cliente, setCliente] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const buscar = useCallback(
    () =>
      buscarCliente(id)
        .then((c) => { setCliente(c); setErro('') })
        .catch((e) => setErro(e.message))
        .finally(() => setCarregando(false)),
    [id],
  )

  useEffect(() => { buscar() }, [buscar])

  async function salvar(dados) {
    await atualizarCliente(id, dados)
    setAviso('Cliente atualizado.')
    buscar()
  }

  if (carregando) return <p className="p-6 text-mute">Carregando…</p>
  if (erro) return <p className="p-6 text-red">{erro}</p>
  if (!cliente) return null

  const veiculos = cliente.veiculos || []

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <button
        type="button"
        onClick={() => navegar('/clientes')}
        className="mb-3 text-sm font-semibold text-mute"
      >
        ← Clientes
      </button>

      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">{cliente.nome}</h1>

      {aviso && <p className="mb-3 text-sm font-semibold text-[#15803D]">{aviso}</p>}

      <FormCliente
        valorInicial={cliente}
        aoSalvar={salvar}
        rotuloSalvar="Salvar alterações"
      />

      <h2 className="mt-6 mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        Veículos ({veiculos.length})
      </h2>

      {veiculos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-paper px-4 py-6 text-center text-sm text-mute">
          Nenhum veículo cadastrado para este cliente.
        </p>
      ) : (
        <ul>
          {veiculos.map((v) => (
            <li key={v.id}>
              <Link
                to={`/veiculos/${v.id}`}
                className="mb-2 flex items-center gap-3 rounded-xl border border-linha bg-paper px-3 py-2.5"
              >
                <span className="rounded-md border-2 border-ink px-2 py-1 text-sm font-extrabold tracking-[0.1em]">
                  {formatarPlaca(v.placa)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {descricaoVeiculo(v) || '—'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
