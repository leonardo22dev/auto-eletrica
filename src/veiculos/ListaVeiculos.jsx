import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listarVeiculos, descricaoVeiculo } from '../data/veiculos.js'
import { formatarPlaca } from '../lib/placa.js'
import { useDebounce } from '../ui/useDebounce.js'
import Busca from '../ui/Busca.jsx'
import EstadoVazio from '../ui/EstadoVazio.jsx'

export default function ListaVeiculos() {
  const navegar = useNavigate()
  const [termo, setTermo] = useState('')
  const termoAtrasado = useDebounce(termo)
  const [veiculos, setVeiculos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const buscar = useCallback(
    (t) =>
      listarVeiculos({ termo: t })
        .then((lista) => { setVeiculos(lista); setErro('') })
        .catch((e) => setErro(e.message))
        .finally(() => setCarregando(false)),
    [],
  )

  useEffect(() => { buscar(termoAtrasado) }, [buscar, termoAtrasado])

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Veículos</h1>

      <Busca valor={termo} aoMudar={setTermo} placeholder="Placa" />

      {erro && <p className="mb-3 text-sm font-semibold text-red">{erro}</p>}
      {carregando && <p className="text-mute">Carregando…</p>}

      {!carregando && veiculos.length === 0 && (
        <EstadoVazio
          titulo="Nenhum veículo encontrado"
          descricao="Veículos são cadastrados ao abrir a primeira OS pela placa."
        />
      )}

      <ul>
        {veiculos.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => navegar(`/veiculos/${v.id}`)}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-linha bg-paper px-3 py-2.5 text-left"
            >
              <span className="shrink-0 rounded-md border-2 border-ink px-2 py-1 text-sm font-extrabold tracking-[0.1em]">
                {formatarPlaca(v.placa)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {descricaoVeiculo(v) || '—'}
                </span>
                <span className="text-xs text-mute">{v.cliente?.nome || '—'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
