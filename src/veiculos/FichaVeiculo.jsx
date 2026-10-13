import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { buscarVeiculo, atualizarVeiculo, descricaoVeiculo } from '../data/veiculos.js'
import { listarOrdens, servicoPrincipal } from '../data/ordens.js'
import { useConfiguracoes } from '../data/configuracoes.js'
import { formatarPlaca } from '../lib/placa.js'
import { formatarData, hojeISO } from '../lib/datas.js'
import { vencimentoGarantia, garantiaVigente } from '../lib/garantia.js'
import { formatarBRL, somarCentavos } from '../lib/dinheiro.js'
import { STATUS } from '../lib/status.js'
import Botao from '../ui/Botao.jsx'
import Chip from '../ui/Chip.jsx'
import FormVeiculo from './FormVeiculo.jsx'

function Garantia({ os, meses }) {
  if (os.status !== STATUS.FINALIZADA || !os.data_conclusao) {
    return <span className="text-mute">—</span>
  }
  const venc = vencimentoGarantia(os.data_conclusao, meses)
  if (garantiaVigente(venc, hojeISO())) {
    return (
      <span className="font-bold text-[#15803D]">
        Vigente até {formatarData(venc)}
      </span>
    )
  }
  return <span className="text-mute">Expirada</span>
}

export default function FichaVeiculo() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { config } = useConfiguracoes()
  const [veiculo, setVeiculo] = useState(null)
  const [ordens, setOrdens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState(false)

  const buscar = useCallback(
    () =>
      Promise.all([buscarVeiculo(id), listarOrdens({ veiculoId: id, comItens: true })])
        .then(([v, lista]) => { setVeiculo(v); setOrdens(lista); setErro('') })
        .catch((e) => setErro(e.message))
        .finally(() => setCarregando(false)),
    [id],
  )

  useEffect(() => { buscar() }, [buscar])

  async function salvar(dados) {
    await atualizarVeiculo(id, dados)
    setEditando(false)
    buscar()
  }

  if (carregando) return <p className="p-6 text-mute">Carregando…</p>
  if (erro) return <p className="p-6 text-red">{erro}</p>
  if (!veiculo) return null

  const meses = config?.garantia_meses ?? 3
  const totalHistorico = somarCentavos(
    ordens.filter((o) => o.status !== STATUS.CANCELADA)
      .map((o) => o.total_centavos),
  )

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <button
        type="button"
        onClick={() => navegar(-1)}
        className="mb-3 text-sm font-semibold text-mute"
      >
        ← Voltar
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Ficha do veículo</h1>
        <Botao
          className="w-auto"
          onClick={() => navegar(`/os/nova?veiculo=${veiculo.id}`)}
        >
          <Plus size={18} aria-hidden="true" /> Nova OS para este veículo
        </Botao>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-5 rounded-xl border border-linha bg-paper p-4">
        <span className="rounded-md border-2 border-ink px-3 py-1.5 text-xl font-extrabold tracking-[0.12em]">
          {formatarPlaca(veiculo.placa)}
        </span>
        <span>
          <span className="block font-bold">{descricaoVeiculo(veiculo) || '—'}</span>
          <span className="text-sm text-mute">
            {veiculo.cliente ? (
              <Link to={`/clientes/${veiculo.cliente.id}`} className="underline">
                {veiculo.cliente.nome}
              </Link>
            ) : '—'}
            {veiculo.cliente?.telefone ? ` · ${veiculo.cliente.telefone}` : ''}
          </span>
        </span>
        <span className="ml-auto text-right">
          <span className="block text-[10px] font-bold tracking-[0.1em] text-mute uppercase">
            Total histórico
          </span>
          <span className="text-xl font-extrabold">{formatarBRL(totalHistorico)}</span>
        </span>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          Ordens de serviço ({ordens.length})
        </h2>
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="text-sm font-semibold text-red"
        >
          {editando ? 'Fechar edição' : 'Editar veículo'}
        </button>
      </div>

      {editando && (
        <div className="mb-4">
          <FormVeiculo
            valorInicial={veiculo}
            clienteId={veiculo.cliente_id}
            aoSalvar={salvar}
            aoCancelar={() => setEditando(false)}
            rotuloSalvar="Salvar alterações"
          />
        </div>
      )}

      {ordens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-paper px-4 py-8 text-center text-sm text-mute">
          Este veículo ainda não tem ordem de serviço.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-linha bg-paper">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linha bg-[#FBFAF9] text-left text-[9.5px] tracking-[0.11em] text-mute uppercase">
                <th className="px-3 py-2.5">Nº</th>
                <th className="px-3 py-2.5">Data</th>
                <th className="px-3 py-2.5">Serviço principal</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Garantia</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navegar(`/os/${o.id}`)}
                  className="cursor-pointer border-b border-[#F2F0EE] last:border-0"
                >
                  <td className="px-3 py-3 font-bold">{o.numero ?? '—'}</td>
                  <td className="px-3 py-3">{formatarData(o.data_abertura)}</td>
                  <td className="px-3 py-3">{servicoPrincipal(o) || <span className="text-mute">sem itens</span>}</td>
                  <td className="px-3 py-3"><Chip status={o.status} /></td>
                  <td className="px-3 py-3"><Garantia os={o} meses={meses} /></td>
                  <td className="px-3 py-3 text-right font-bold">
                    {formatarBRL(o.total_centavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
