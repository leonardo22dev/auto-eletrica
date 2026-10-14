import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, MessageCircle, Copy } from 'lucide-react'
import {
  buscarOrdem, atualizarItens, atualizarDadosDaOs, mudarStatus, cancelarOrdem,
} from '../data/ordens.js'
import { useConfiguracoes } from '../data/configuracoes.js'
import { STATUS, transicoesPermitidas, rotuloStatus } from '../lib/status.js'
import { formatarData, formatarDataHora, hojeISO } from '../lib/datas.js'
import { formatarPlaca } from '../lib/placa.js'
import { formatarBRL } from '../lib/dinheiro.js'
import { situacaoGarantia } from './situacaoGarantia.js'
import { salvarRascunho } from './rascunho.js'
import { editadaDepoisDeEmitida } from './edicao.js'
import ItensEditor from './ItensEditor.jsx'
import CamposDaOs from './CamposDaOs.jsx'
import Botao from '../ui/Botao.jsx'
import Chip from '../ui/Chip.jsx'

const ROTULO_ACAO = {
  [STATUS.APROVADA]: 'Aprovar',
  [STATUS.FINALIZADA]: 'Finalizar',
  [STATUS.CANCELADA]: 'Cancelar OS',
}

// Salvaguarda da decisão de permitir editar OS finalizada: quem abrir a OS
// precisa ver que ela mudou depois de emitida.
function MarcaDeEdicao({ os }) {
  if (!editadaDepoisDeEmitida(os)) return null
  return (
    <p className="mt-1 text-xs text-mute">
      Editada em {formatarDataHora(os.atualizado_em)}
    </p>
  )
}

export default function DetalheOS() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { config } = useConfiguracoes()

  const [os, setOs] = useState(null)
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [editandoDados, setEditandoDados] = useState(false)
  const [campos, setCampos] = useState(null)
  // Lido dentro do callback de busca, que nao enxerga o estado atual.
  const editandoRef = useRef(false)

  const buscar = useCallback(
    () =>
      buscarOrdem(id)
        .then((o) => {
          setOs(o)
          setItens(o.itens)
          // Nao zera os campos com o painel de edicao aberto: uma correcao de
          // nome ainda nao salva seria descartada em silencio quando o usuario
          // salvasse os itens ou mudasse o status.
          setCampos((c) => (editandoRef.current ? c : null))
          setErro('')
          return o
        })
        .catch((e) => { setErro(e.message); return null })
        .finally(() => setCarregando(false)),
    [id],
  )

  useEffect(() => { buscar() }, [buscar])

  // Semeado durante o render, nao em efeito: em efeito custaria um render
  // extra e um piscar de campos vazios.
  if (os && !campos) {
    setCampos({
      veiculo_placa: os.veiculo_placa,
      data_os: os.data_os,
      cliente_nome: os.cliente_nome,
      cliente_telefone: os.cliente_telefone || '',
      veiculo_descricao: os.veiculo_descricao,
    })
  }

  async function executar(acao) {
    setOcupado(true)
    setErro('')
    setAviso('')
    try {
      await acao()
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  // Salvaguarda que o spec vinculou à decisão de permitir editar OS emitida:
  // se o PDF já foi enviado por link, o link tem de passar a servir a versão
  // corrigida — senão o cliente reabre e lê o valor antigo para sempre.
  async function regerarPdfPublicado(atualizada) {
    if (!atualizada?.pdf_path || !config) return
    try {
      const { republicarPdf } = await import('../pdf/compartilhar.js')
      await republicarPdf({ os: atualizada, config })
    } catch {
      setAviso((a) =>
        `${a} O PDF publicado não pôde ser atualizado — reenvie pelo WhatsApp.`.trim())
    }
  }

  const salvarDados = () => executar(async () => {
    await atualizarDadosDaOs(os.id, campos)
    const atualizada = await buscar()
    editandoRef.current = false
    setEditandoDados(false)
    setCampos(null)
    setAviso('Dados salvos.')
    await regerarPdfPublicado(atualizada)
  })

  const salvarItens = () => executar(async () => {
    await atualizarItens(os.id, itens)
    const atualizada = await buscar()
    setAviso('Itens salvos.')
    await regerarPdfPublicado(atualizada)
  })

  const transicionar = (novo) => executar(async () => {
    if (novo === STATUS.CANCELADA) {
      if (!window.confirm('Cancelar esta ordem de serviço?')) return
      const devolveu = await cancelarOrdem(os.id)
      await buscar()
      setAviso(devolveu
        ? `OS cancelada. O número ${os.numero} volta a ficar disponível para a próxima.`
        : 'OS cancelada.')
      return
    }
    await mudarStatus(os.id, novo)
    const atualizada = await buscar()
    setAviso(`OS marcada como ${rotuloStatus(novo).toLowerCase()}.`)
    // O título do documento muda com o status, então o PDF publicado também.
    await regerarPdfPublicado(atualizada)
  })

  // O motor de PDF pesa mais de 1 MB. Carregar só no clique mantém leve o
  // primeiro acesso, que na oficina acontece no 4G do celular.
  const baixar = () => executar(async () => {
    const [{ gerarPdfDaOS, nomeArquivoPdf }, { baixarPdf }] = await Promise.all([
      import('../pdf/gerar.jsx'),
      import('../pdf/compartilhar.js'),
    ])
    const blob = await gerarPdfDaOS(os, config)
    baixarPdf(blob, nomeArquivoPdf(os))
    setAviso('PDF gerado.')
  })

  const whatsapp = () => executar(async () => {
    const { enviarOsPorWhatsApp } = await import('../pdf/compartilhar.js')
    const r = await enviarOsPorWhatsApp({ os, config })
    const mensagens = {
      compartilhamento: 'PDF entregue ao aplicativo escolhido.',
      link: 'WhatsApp aberto com o link do PDF.',
      download: 'Sem conexão para enviar: o PDF foi baixado.',
      cancelado: '',
    }
    setAviso(mensagens[r.via] ?? '')
  })

  function duplicar() {
    salvarRascunho({
      // A data da copia e hoje, nao a da OS original: e uma OS nova.
      campos: {
        veiculo_placa: os.veiculo_placa,
        data_os: hojeISO(),
        cliente_nome: os.cliente_nome,
        cliente_telefone: os.cliente_telefone || '',
        veiculo_descricao: os.veiculo_descricao,
      },
      itens: itens.map((i) => ({
        quantidade: String(i.quantidade),
        descricao: i.descricao,
        valor_unitario_centavos: i.valor_unitario_centavos,
      })),
      observacoes: os.observacoes || '',
    })
    navegar('/os/nova')
  }

  if (carregando) return <p className="p-6 text-mute">Carregando…</p>
  if (erro && !os) return <p className="p-6 text-red">{erro}</p>
  if (!os) return null

  const meses = config?.garantia_meses ?? 3
  const garantia = situacaoGarantia(os, meses, hojeISO())

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="bg-ink px-4 pt-4 pb-4 text-white">
        <button
          type="button"
          onClick={() => navegar('/os')}
          className="mb-2 text-sm font-semibold text-[#9A9490]"
        >
          ← Histórico
        </button>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xl font-extrabold tracking-tight">
            OS nº {os.numero ?? '—'}
          </span>
          <Chip status={os.status} />
        </div>
        <p className="text-[11.5px] text-[#9A9490]">{formatarData(os.data_os)}</p>
        <MarcaDeEdicao os={os} />
      </header>

      <div className="flex-1 p-4">
        <div className="mb-3 rounded-xl border border-linha bg-paper p-3">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
              Dados do documento
            </h2>
            <button
              type="button"
              onClick={() => setEditandoDados((v) => { editandoRef.current = !v; return !v })}
              className="text-sm font-semibold text-red"
            >
              {editandoDados ? 'Cancelar' : 'Editar'}
            </button>
          </div>

          {editandoDados && campos ? (
            <>
              <CamposDaOs campos={campos} aoMudar={setCampos} />
              <Botao variante="fantasma" tamanho="pequeno" onClick={salvarDados}
                disabled={ocupado}>
                Salvar dados
              </Botao>
            </>
          ) : (
            <dl>
              {[
                ['Data', formatarData(os.data_os)],
                ['Cliente', os.cliente_nome],
                ['Telefone', os.cliente_telefone || '—'],
                ['Veículo', os.veiculo_descricao],
                ['Placa', formatarPlaca(os.veiculo_placa)],
              ].map(([rotulo, valor], i, lista) => (
                <div
                  key={rotulo}
                  className={`flex justify-between py-1.5 text-[12.5px] ${
                    i < lista.length - 1 ? 'border-b border-linha' : ''
                  }`}
                >
                  <dt className="text-mute">{rotulo}</dt>
                  <dd className="font-bold">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          Itens
        </h2>
        <ItensEditor itens={itens} aoMudar={setItens} />

        <div className="mt-2">
          <Botao variante="fantasma" tamanho="pequeno" onClick={salvarItens}
            disabled={ocupado}>
            Salvar itens
          </Botao>
        </div>

        <div className="mt-3 flex items-baseline justify-between rounded-xl border border-linha bg-paper px-3 py-3">
          <span className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
            Total
          </span>
          <strong className="text-2xl font-extrabold">
            {formatarBRL(os.total_centavos)}
          </strong>
        </div>

        {os.observacoes && (
          <div className="mt-3 rounded-xl border border-linha bg-paper p-3">
            <h2 className="mb-1 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
              Observações
            </h2>
            <p className="text-[13px] whitespace-pre-wrap">{os.observacoes}</p>
          </div>
        )}

        {/* A informação é útil nos dois casos; o que não pode é a tela
            afirmar vigência de uma garantia vencida, no balcão, para o
            cliente ler. */}
        {garantia.vencimento && (
          <p
            className={`mt-3 rounded-xl border px-3 py-2.5 text-[11.5px] leading-snug ${
              garantia.vigente
                ? 'border-[#F3C7BF] bg-red-tint text-red-dark'
                : 'border-linha bg-paper text-mute'
            }`}
          >
            <strong className="font-extrabold">
              Garantia de {meses} {meses === 1 ? 'mês' : 'meses'}
            </strong>{' '}
            para peças com defeito —{' '}
            {garantia.vigente ? 'vigente até ' : 'encerrada em '}
            <strong className="font-extrabold">
              {formatarData(garantia.vencimento)}
            </strong>
            .
          </p>
        )}

        {aviso && <p className="mt-3 text-sm font-semibold text-[#15803D]">{aviso}</p>}
        {erro && <p className="mt-3 text-sm font-semibold text-red">{erro}</p>}
      </div>

      <div className="sticky bottom-0 border-t border-linha bg-paper px-4 pt-3 pb-4">
        <div className="mb-2 flex gap-2">
          <Botao variante="fantasma" tamanho="pequeno" onClick={baixar} disabled={ocupado}>
            <Download size={16} aria-hidden="true" /> PDF
          </Botao>
          <Botao variante="whatsapp" tamanho="pequeno" onClick={whatsapp} disabled={ocupado}>
            <MessageCircle size={16} aria-hidden="true" /> WhatsApp
          </Botao>
        </div>

        <div className="mb-2 flex gap-2">
          {transicoesPermitidas(os.status).map((novo) => (
            <Botao
              key={novo}
              tamanho="pequeno"
              variante={novo === STATUS.CANCELADA ? 'perigo' : 'primario'}
              onClick={() => transicionar(novo)}
              disabled={ocupado}
            >
              {ROTULO_ACAO[novo]}
            </Botao>
          ))}
        </div>

        <Botao variante="fantasma" tamanho="pequeno" onClick={duplicar}>
          <Copy size={16} aria-hidden="true" /> Duplicar como nova OS
        </Botao>
      </div>
    </div>
  )
}
