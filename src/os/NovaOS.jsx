import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buscarVeiculoPorPlaca, buscarVeiculo, criarVeiculo, descricaoVeiculo } from '../data/veiculos.js'
import { criarCliente } from '../data/clientes.js'
import { criarOrdem, ultimaOrdemDoVeiculo } from '../data/ordens.js'
import { useConfiguracoes } from '../data/configuracoes.js'
import { normalizarPlaca, placaValida, formatarPlaca } from '../lib/placa.js'
import { vencimentoGarantia, garantiaVigente } from '../lib/garantia.js'
import { formatarData, hojeISO } from '../lib/datas.js'
import { formatarBRL, somarCentavos, totalDoItem } from '../lib/dinheiro.js'
import { STATUS } from '../lib/status.js'
import FormCliente from '../clientes/FormCliente.jsx'
import FormVeiculo from '../veiculos/FormVeiculo.jsx'
import ItensEditor from './ItensEditor.jsx'
import { ITEM_VAZIO } from './item.js'
import { salvarRascunho, lerRascunho, limparRascunho } from './rascunho.js'
import Botao from '../ui/Botao.jsx'

export default function NovaOS() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const { config } = useConfiguracoes()

  const [placa, setPlaca] = useState('')
  const [veiculo, setVeiculo] = useState(null)
  const [ultimaOS, setUltimaOS] = useState(null)
  const [consultando, setConsultando] = useState(false)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [clienteNovo, setClienteNovo] = useState(null)

  const [itens, setItens] = useState([{ ...ITEM_VAZIO }])
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [rascunhoOferecido, setRascunhoOferecido] = useState(lerRascunho())

  const veiculoDaUrl = params.get('veiculo')

  const carregarVeiculo = useCallback(async (v) => {
    setVeiculo(v)
    setNaoEncontrado(false)
    setPlaca(normalizarPlaca(v.placa))
    try {
      setUltimaOS(await ultimaOrdemDoVeiculo(v.id))
    } catch {
      setUltimaOS(null)
    }
  }, [])

  // Veículo vindo da ficha: pula a digitação da placa.
  useEffect(() => {
    if (!veiculoDaUrl) return
    buscarVeiculo(veiculoDaUrl).then(carregarVeiculo).catch((e) => setErro(e.message))
  }, [veiculoDaUrl, carregarVeiculo])

  // Rascunho é salvo a cada mudança, para que queda de conexão ou recarga
  // acidental não custem a OS inteira digitada em pé ao lado do carro.
  useEffect(() => {
    if (!placa && itens.length === 1 && !itens[0].descricao) return
    salvarRascunho({ placa, itens, observacoes })
  }, [placa, itens, observacoes])

  async function consultarPlaca(valor) {
    const p = normalizarPlaca(valor)
    setPlaca(p)
    setVeiculo(null)
    setUltimaOS(null)
    setNaoEncontrado(false)
    if (!placaValida(p)) return

    setConsultando(true)
    try {
      const achado = await buscarVeiculoPorPlaca(p)
      if (achado) await carregarVeiculo(achado)
      else setNaoEncontrado(true)
    } catch (e) {
      setErro(e.message)
    } finally {
      setConsultando(false)
    }
  }

  async function salvarClienteNovo(dados) {
    setClienteNovo(await criarCliente(dados))
  }

  async function salvarVeiculoNovo(dados) {
    const novo = await criarVeiculo({ ...dados, cliente_id: clienteNovo.id })
    await carregarVeiculo({ ...novo, cliente: clienteNovo })
    setClienteNovo(null)
  }

  async function gerar(status) {
    if (!veiculo) {
      setErro('Informe a placa do veículo.')
      return
    }
    setErro('')
    setSalvando(true)
    try {
      const os = await criarOrdem({
        cliente: veiculo.cliente,
        veiculo: {
          id: veiculo.id,
          placa: veiculo.placa,
          descricao: descricaoVeiculo(veiculo),
        },
        itens,
        status,
        observacoes,
      })
      limparRascunho()
      navegar(`/os/${os.id}`)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  function retomarRascunho() {
    const r = rascunhoOferecido
    setRascunhoOferecido(null)
    if (!r) return
    setObservacoes(r.observacoes || '')
    setItens(r.itens?.length ? r.itens : [{ ...ITEM_VAZIO }])
    if (r.placa) consultarPlaca(r.placa)
  }

  function descartarRascunho() {
    limparRascunho()
    setRascunhoOferecido(null)
  }

  const total = somarCentavos(
    itens.map((i) => totalDoItem(i.quantidade, i.valor_unitario_centavos)),
  )

  const meses = config?.garantia_meses ?? 3
  const vencimento = ultimaOS?.data_conclusao
    ? vencimentoGarantia(ultimaOS.data_conclusao, meses)
    : null
  const emGarantia = garantiaVigente(vencimento, hojeISO())

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <div className="flex-1 p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Nova OS</h1>
          <button
            type="button"
            onClick={() => navegar(-1)}
            className="text-sm font-semibold text-mute"
          >
            Cancelar
          </button>
        </div>

        {rascunhoOferecido && (
          <div className="mb-4 rounded-xl border border-[#F2D479] bg-[#FEF3C7] p-3">
            <p className="mb-2 text-sm font-semibold text-[#7A4A06]">
              Há uma OS em andamento que não chegou a ser salva.
            </p>
            <div className="flex gap-2">
              <Botao tamanho="pequeno" onClick={retomarRascunho}>Retomar</Botao>
              <Botao tamanho="pequeno" variante="fantasma" onClick={descartarRascunho}>
                Descartar
              </Botao>
            </div>
          </div>
        )}

        <label
          htmlFor="placa-os"
          className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
        >
          Placa
        </label>
        <input
          id="placa-os"
          value={placa}
          onChange={(e) => consultarPlaca(e.target.value)}
          maxLength={7}
          autoCapitalize="characters"
          placeholder="ABC1D23"
          className="mb-3 h-15 w-full rounded-xl border-[1.5px] border-ink bg-paper text-center text-2xl font-extrabold tracking-[0.14em] focus:outline-none"
        />

        {consultando && <p className="mb-3 text-sm text-mute">Consultando…</p>}

        {veiculo && (
          <div className="mb-2 rounded-xl border border-[#BCE5C8] bg-[#F0FAF2] px-3 py-2.5">
            <span className="block text-[13px] font-bold">
              {descricaoVeiculo(veiculo) || formatarPlaca(veiculo.placa)}
            </span>
            <span className="text-[11.5px] text-[#3D6B4B]">
              {veiculo.cliente?.nome}
              {veiculo.cliente?.telefone ? ` · ${veiculo.cliente.telefone}` : ''}
            </span>
          </div>
        )}

        {emGarantia && ultimaOS && (
          <div className="mb-3 rounded-xl border border-[#F2D479] bg-[#FEF3C7] px-3 py-2.5 text-[11.5px] leading-snug text-[#7A4A06]">
            <strong className="font-extrabold">Garantia vigente</strong> até{' '}
            {formatarData(vencimento)} — OS nº {ultimaOS.numero ?? '—'}, concluída em{' '}
            {formatarData(ultimaOS.data_conclusao)}.
          </div>
        )}

        {naoEncontrado && !clienteNovo && (
          <div className="mb-3 rounded-xl border border-linha bg-paper p-4">
            <p className="mb-3 text-sm text-mute">
              Placa não cadastrada. Cadastre o dono e o veículo aqui mesmo.
            </p>
            <FormCliente embutido aoSalvar={salvarClienteNovo} />
          </div>
        )}

        {naoEncontrado && clienteNovo && (
          <div className="mb-3 rounded-xl border border-linha bg-paper p-4">
            <p className="mb-3 text-sm text-mute">
              Cliente <strong>{clienteNovo.nome}</strong> salvo. Agora o veículo.
            </p>
            <FormVeiculo
              embutido
              clienteId={clienteNovo.id}
              valorInicial={{ placa }}
              aoSalvar={salvarVeiculoNovo}
            />
          </div>
        )}

        <h2 className="mt-4 mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          Itens
        </h2>
        <ItensEditor itens={itens} aoMudar={setItens} />

        <label
          htmlFor="obs-os"
          className="mt-4 mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
        >
          Observações
        </label>
        <textarea
          id="obs-os"
          rows={2}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          className="w-full rounded-xl border-[1.5px] border-linha bg-paper p-3.5 text-[15px] focus:border-ink focus:outline-none"
        />

        {erro && <p className="mt-3 text-sm font-semibold text-red">{erro}</p>}
      </div>

      {/* Total colado no rodapé: ele some de vista justamente quando a lista
          cresce, que é quando mais importa. */}
      <div className="sticky bottom-0 border-t border-linha bg-paper px-4 pt-3 pb-4">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
            Total
          </span>
          <strong className="text-[27px] font-extrabold tracking-tight">
            {formatarBRL(total)}
          </strong>
        </div>
        <div className="flex gap-2">
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            disabled={salvando || !veiculo}
            onClick={() => gerar(STATUS.ORCAMENTO)}
          >
            Orçamento
          </Botao>
          <Botao
            tamanho="pequeno"
            disabled={salvando || !veiculo}
            onClick={() => gerar(STATUS.APROVADA)}
          >
            Gerar OS
          </Botao>
        </div>
      </div>
    </div>
  )
}
