import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  criarOrdem, ultimaOsDaPlaca, ultimaOsFinalizadaDaPlaca, servicoPrincipal,
} from '../data/ordens.js'
import { useConfiguracoes } from '../data/configuracoes.js'
import { placaValida } from '../lib/placa.js'
import { vencimentoGarantia, garantiaVigente } from '../lib/garantia.js'
import { formatarData, hojeISO } from '../lib/datas.js'
import { formatarBRL, somarCentavos, totalDoItem } from '../lib/dinheiro.js'
import { STATUS } from '../lib/status.js'
import CamposDaOs from './CamposDaOs.jsx'
import ItensEditor from './ItensEditor.jsx'
import { ITEM_VAZIO } from './item.js'
import { CAMPOS_VAZIOS } from './dadosOs.js'
import { salvarRascunho, lerRascunho, limparRascunho } from './rascunho.js'
import Botao from '../ui/Botao.jsx'

export default function NovaOS() {
  const navegar = useNavigate()
  const { config } = useConfiguracoes()

  const [campos, setCampos] = useState(CAMPOS_VAZIOS)
  const [itens, setItens] = useState([{ ...ITEM_VAZIO }])
  const [observacoes, setObservacoes] = useState('')

  const [sugestao, setSugestao] = useState(null)
  const [ultimaFinalizada, setUltimaFinalizada] = useState(null)
  const [placaConsultada, setPlacaConsultada] = useState('')

  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [rascunhoOferecido, setRascunhoOferecido] = useState(lerRascunho())

  const placa = campos.veiculo_placa

  // A placa é a memória do sistema agora: não há cadastro, então o que o app
  // sabe daquele carro é o que foi digitado nas OS anteriores.
  //
  // O efeito não limpa estado de forma síncrona: a placa inválida é tratada
  // na renderização, derivando de `placaConsultada`. E `cancelado` impede que
  // uma resposta atrasada de uma placa antiga sobrescreva a da placa atual —
  // digitar rápido num 4G de oficina produz exatamente essa corrida.
  useEffect(() => {
    if (!placaValida(placa)) return undefined
    let cancelado = false
    Promise.all([ultimaOsDaPlaca(placa), ultimaOsFinalizadaDaPlaca(placa)])
      .then(([anterior, finalizada]) => {
        if (cancelado) return
        setSugestao(anterior)
        setUltimaFinalizada(finalizada)
        setPlacaConsultada(placa)
      })
      .catch((e) => { if (!cancelado) setErro(e.message) })
    return () => { cancelado = true }
  }, [placa])

  useEffect(() => {
    if (!placa && itens.length === 1 && !itens[0].descricao) return
    salvarRascunho({ campos, itens, observacoes })
  }, [campos, itens, observacoes, placa])

  function usarSugestao() {
    setCampos((c) => ({
      ...c,
      cliente_nome: sugestaoValida.cliente_nome,
      cliente_telefone: sugestaoValida.cliente_telefone || '',
      veiculo_descricao: sugestaoValida.veiculo_descricao,
    }))
  }

  async function gerar(status) {
    setErro('')
    setSalvando(true)
    try {
      const os = await criarOrdem({ dados: campos, itens, status, observacoes })
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
    // Rascunho no formato antigo não tem `campos`; cai no vazio sem quebrar.
    setCampos({ ...CAMPOS_VAZIOS(), ...(r.campos || {}) })
  }

  function descartarRascunho() {
    limparRascunho()
    setRascunhoOferecido(null)
  }

  const total = somarCentavos(
    itens.map((i) => totalDoItem(i.quantidade, i.valor_unitario_centavos)),
  )

  // Resultado de outra placa nao vale para esta.
  const atual = placaConsultada === placa
  // Derivado, nao guardado: esta consultando enquanto a placa valida
  // digitada ainda nao e a que voltou do banco.
  const consultando = placaValida(placa) && !atual
  const sugestaoValida = atual ? sugestao : null
  const finalizadaValida = atual ? ultimaFinalizada : null

  const meses = config?.garantia_meses ?? 3
  const vencimento = finalizadaValida
    ? vencimentoGarantia(finalizadaValida.data_os, meses)
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

        <CamposDaOs campos={campos} aoMudar={setCampos} />

        {consultando && <p className="mb-3 text-sm text-mute">Consultando…</p>}

        {sugestaoValida && (
          <div className="mb-3 rounded-xl border border-[#BCE5C8] bg-[#F0FAF2] px-3 py-2.5">
            <span className="block text-[13px] font-bold">
              Última OS deste carro
              {sugestaoValida.numero ? ` — nº ${sugestaoValida.numero}` : ''}
            </span>
            <span className="text-[11.5px] text-[#3D6B4B]">
              {sugestaoValida.cliente_nome}
              {sugestaoValida.cliente_telefone ? ` · ${sugestaoValida.cliente_telefone}` : ''}
              {` · ${sugestaoValida.veiculo_descricao}`}
            </span>
            <button
              type="button"
              onClick={usarSugestao}
              className="mt-2 h-10 rounded-lg bg-ink px-3 text-xs font-bold text-white"
            >
              Usar estes dados
            </button>
          </div>
        )}

        {emGarantia && finalizadaValida && (
          <div className="mb-3 rounded-xl border border-[#F2D479] bg-[#FEF3C7] px-3 py-2.5 text-[11.5px] leading-snug text-[#7A4A06]">
            <strong className="font-extrabold">Garantia vigente</strong> até{' '}
            {formatarData(vencimento)} — OS nº {finalizadaValida.numero ?? '—'}
            {servicoPrincipal(finalizadaValida)
              ? `, ${servicoPrincipal(finalizadaValida)}`
              : ''}
            , de {formatarData(finalizadaValida.data_os)}.
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
            disabled={salvando}
            onClick={() => gerar(STATUS.ORCAMENTO)}
          >
            Orçamento
          </Botao>
          <Botao
            tamanho="pequeno"
            disabled={salvando}
            onClick={() => gerar(STATUS.APROVADA)}
          >
            Gerar OS
          </Botao>
        </div>
      </div>
    </div>
  )
}
