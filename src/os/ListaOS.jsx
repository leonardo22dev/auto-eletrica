import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { listarOrdens } from '../data/ordens.js'
import { STATUS } from '../lib/status.js'
import { formatarData } from '../lib/datas.js'
import { formatarBRL } from '../lib/dinheiro.js'
import { formatarPlaca } from '../lib/placa.js'
import { useDebounce } from '../ui/useDebounce.js'
import Busca from '../ui/Busca.jsx'
import Botao from '../ui/Botao.jsx'
import Chip from '../ui/Chip.jsx'
import EstadoVazio from '../ui/EstadoVazio.jsx'

const FILTROS = [
  { valor: '', rotulo: 'Todas' },
  { valor: STATUS.ORCAMENTO, rotulo: 'Orçamento' },
  { valor: STATUS.APROVADA, rotulo: 'Aprovada' },
  { valor: STATUS.FINALIZADA, rotulo: 'Finalizada' },
]

export function LinhaOS({ os, aoClicar }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="mb-2 flex w-full items-center gap-3 rounded-xl border border-linha bg-paper px-3 py-2.5 text-left"
    >
      <span className="w-10 shrink-0 text-xs font-extrabold text-mute">
        {os.numero ?? '—'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold">{os.cliente_nome}</span>
        <span className="text-[11px] text-mute">
          {formatarData(os.data_os)} · {formatarPlaca(os.veiculo_placa)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[13.5px] font-extrabold">
          {formatarBRL(os.total_centavos)}
        </span>
        <Chip status={os.status} />
      </span>
    </button>
  )
}

export default function ListaOS() {
  const navegar = useNavigate()
  const [termo, setTermo] = useState('')
  const termoAtrasado = useDebounce(termo)
  const [status, setStatus] = useState('')
  const [ordens, setOrdens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const buscar = useCallback(
    (t, s) =>
      listarOrdens({ termo: t, status: s })
        .then((lista) => { setOrdens(lista); setErro('') })
        .catch((e) => setErro(e.message))
        .finally(() => setCarregando(false)),
    [],
  )

  useEffect(() => { buscar(termoAtrasado, status) }, [buscar, termoAtrasado, status])

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Histórico</h1>
        <Botao className="w-auto" onClick={() => navegar('/os/nova')}>
          <Plus size={18} aria-hidden="true" /> Nova
        </Botao>
      </div>

      <Busca valor={termo} aoMudar={setTermo} placeholder="Nº, cliente ou placa" />

      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {FILTROS.map((f) => (
          <button
            key={f.valor || 'todas'}
            type="button"
            onClick={() => setStatus(f.valor)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-bold ${
              status === f.valor
                ? 'border-ink bg-ink text-white'
                : 'border-linha bg-paper text-[#4A4846]'
            }`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {erro && <p className="mb-3 text-sm font-semibold text-red">{erro}</p>}
      {carregando && <p className="text-mute">Carregando…</p>}

      {!carregando && ordens.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma ordem de serviço"
          descricao={
            termo || status
              ? 'Tente outro termo ou troque o filtro.'
              : 'Comece abrindo a primeira OS pela placa do veículo.'
          }
          acao={<Botao onClick={() => navegar('/os/nova')}>Nova OS</Botao>}
        />
      )}

      <ul>
        {ordens.map((o) => (
          <li key={o.id}>
            <LinhaOS os={o} aoClicar={() => navegar(`/os/${o.id}`)} />
          </li>
        ))}
      </ul>
    </div>
  )
}
