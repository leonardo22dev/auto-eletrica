import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { obterOsParaAssinatura, registrarAceite } from '../data/assinatura.js'
import { normalizarCodigo } from './codigo.js'
import { acaoParaErro } from './erros.js'
import QuadroAssinatura from './QuadroAssinatura.jsx'
import ListaDeItens from './ListaDeItens.jsx'
import { rotuloDoTotal } from '../os/valorTotal.js'
import { formatarBRL } from '../lib/dinheiro.js'
import { formatarData, formatarDataHora } from '../lib/datas.js'
import { formatarPlaca } from '../lib/placa.js'

function Cabecalho({ oficina }) {
  return (
    <header className="bg-ink px-4 py-3 text-white">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <img src="/logo-mizuho.png" alt="" className="h-9 rounded-md bg-white p-px" />
        <span className="font-marca text-base leading-tight font-bold">
          {oficina?.razao_social || 'Auto Elétrica Mizuho II'}
        </span>
      </div>
    </header>
  )
}

function Mensagem({ titulo, texto, oficina }) {
  return (
    <div className="min-h-dvh bg-[#F6F4F2]">
      <Cabecalho oficina={oficina} />
      <main className="mx-auto max-w-xl p-5">
        <h1 className="mb-2 text-xl font-extrabold">{titulo}</h1>
        <p className="text-[15px] leading-relaxed text-[#4A4846]">{texto}</p>
        {oficina?.telefone && (
          <p className="mt-4 text-sm text-mute">
            Oficina: <strong className="text-ink">{oficina.telefone}</strong>
          </p>
        )}
      </main>
    </div>
  )
}

export default function PaginaAssinatura() {
  const { codigo: bruto } = useParams()
  const codigo = normalizarCodigo(bruto)
  const quadro = useRef(null)

  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroRede, setErroRede] = useState('')
  const [aviso, setAviso] = useState('')
  const [desenhou, setDesenhou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  // Página pública: fora dos buscadores, mesmo que o cabeçalho HTTP falhe.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const carregar = useCallback(
    () =>
      obterOsParaAssinatura(codigo)
        .then((r) => { setDados(r); setErroRede(''); return r })
        .catch(() => {
          setErroRede('Não foi possível carregar o orçamento. Confira a conexão.')
          return null
        })
        .finally(() => setCarregando(false)),
    [codigo],
  )

  // Sem código válido na URL não há o que consultar: a tela de link inválido
  // é derivada na renderização, não gravada em estado por um efeito.
  useEffect(() => { if (codigo) carregar() }, [codigo, carregar])

  async function confirmar() {
    const desenho = quadro.current?.exportar()
    if (!desenho) {
      setAviso('Desenhe a sua assinatura no quadro antes de confirmar.')
      return
    }
    setEnviando(true)
    setAviso('')
    try {
      await registrarAceite({
        codigo,
        assinatura: desenho,
        totalVisto: dados.os.total_centavos,
        versao: dados.versao,
      })
      setConcluido(true)
      await carregar()
    } catch (e) {
      const acao = acaoParaErro(e.codigo || e.message)
      if (acao.tipo === 'recarregar') {
        // Não é falha: a tela passa a mostrar o estado real (já assinado,
        // valores atualizados, link vencido).
        const r = await carregar()
        if (!r) {
          // A releitura falhou (sem rede): sem aviso, a tela voltaria ao
          // formulário parecendo que nada aconteceu.
          setAviso('Não foi possível confirmar agora. Confira a conexão e toque em Confirmar de novo.')
        } else if (acao.texto && r.situacao === 'valido') {
          setAviso(acao.texto)
        }
      } else {
        setAviso(acao.texto)
      }
    } finally {
      setEnviando(false)
    }
  }

  if (!codigo) {
    return (
      <Mensagem
        titulo="Este link não é mais válido"
        texto="Peça um novo link à oficina para assinar o orçamento."
      />
    )
  }

  if (carregando) {
    return <div className="grid min-h-dvh place-items-center text-mute">Carregando…</div>
  }

  if (erroRede && !dados) {
    return <Mensagem titulo="Sem conexão" texto={erroRede} />
  }

  const { situacao, os, oficina } = dados || {}

  if (situacao === 'invalido') {
    return (
      <Mensagem
        titulo="Este link não é mais válido"
        texto="Peça um novo link à oficina para assinar o orçamento."
        oficina={oficina}
      />
    )
  }

  if (situacao === 'assinado' || concluido) {
    const quando = dados?.aceite_em ? formatarDataHora(dados.aceite_em) : ''
    return (
      <Mensagem
        titulo="Orçamento assinado"
        texto={quando
          ? `Assinado em ${quando}. Obrigado! A oficina já recebeu a sua aprovação.`
          : 'Obrigado! A oficina já recebeu a sua aprovação.'}
        oficina={oficina}
      />
    )
  }

  const podeAssinar = situacao === 'valido'
  const meses = oficina?.garantia_meses ?? 3

  return (
    <div className="min-h-dvh bg-[#F6F4F2] pb-28">
      <Cabecalho oficina={oficina} />

      <main className="mx-auto max-w-xl p-4">
        <p className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          Orçamento
        </p>
        <h1 className="mb-3 text-2xl font-extrabold tracking-tight">
          Nº {os.numero ?? '—'}
        </h1>

        <dl className="mb-3 rounded-xl border border-linha bg-paper p-3 text-[13px]">
          {[
            ['Data', formatarData(os.data_os)],
            ['Cliente', os.cliente_nome],
            ['Veículo', os.veiculo_descricao],
            ['Placa', formatarPlaca(os.veiculo_placa)],
          ].map(([r, v], i, l) => (
            <div
              key={r}
              className={`flex justify-between py-1.5 ${i < l.length - 1 ? 'border-b border-linha' : ''}`}
            >
              <dt className="text-mute">{r}</dt>
              <dd className="font-bold">{v}</dd>
            </div>
          ))}
        </dl>

        <ListaDeItens itens={os.itens} />

        <div className="mb-3 flex items-baseline justify-between rounded-xl border border-linha bg-paper px-3 py-3">
          <span className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
            {rotuloDoTotal(os.itens)}
          </span>
          <strong className="text-3xl font-extrabold tracking-tight">
            {formatarBRL(os.total_centavos)}
          </strong>
        </div>

        {oficina?.texto_garantia && (
          <p className="mb-4 rounded-xl border border-[#F3C7BF] bg-red-tint px-3 py-2.5 text-[11.5px] leading-snug text-red-dark">
            <strong>{oficina.texto_garantia}</strong>
            <br />
            Garantia de {meses} {meses === 1 ? 'mês' : 'meses'}.
          </p>
        )}

        {!podeAssinar && (
          <p className="rounded-xl border border-linha bg-paper p-3 text-sm text-[#4A4846]">
            {situacao === 'cancelada'
              ? 'Esta ordem de serviço foi cancelada pela oficina.'
              : 'Esta ordem de serviço já foi concluída.'}
          </p>
        )}

        {podeAssinar && (
          <>
            <p className="mb-2 text-[14px] leading-snug">
              Eu, <strong>{os.cliente_nome}</strong>, estou de acordo com este
              orçamento no valor de <strong>{formatarBRL(os.total_centavos)}</strong>.
            </p>

            <QuadroAssinatura ref={quadro} aoMudar={setDesenhou} />

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-mute">Assine com o dedo no quadro acima.</span>
              <button
                type="button"
                onClick={() => quadro.current?.limpar()}
                className="h-10 px-2 text-sm font-semibold text-red"
              >
                Limpar
              </button>
            </div>

            {aviso && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-[#FEF3C7] px-3 py-2 text-sm font-semibold text-[#7A4A06]"
              >
                {aviso}
              </p>
            )}
          </>
        )}
      </main>

      {podeAssinar && (
        <div className="fixed inset-x-0 bottom-0 border-t border-linha bg-paper px-4 pt-3 pb-4">
          <div className="mx-auto max-w-xl">
            <button
              type="button"
              onClick={confirmar}
              disabled={!desenhou || enviando}
              className="h-14 w-full rounded-xl bg-red text-base font-bold text-white disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Confirmar e assinar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
