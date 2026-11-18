import { useEffect, useRef, useState } from 'react'
import { gerarLinkAssinatura, obterOsParaAssinatura, registrarAceite } from '../data/assinatura.js'
import { acaoParaErro } from './erros.js'
import QuadroAssinatura from './QuadroAssinatura.jsx'
import { TEXTO_ENTREGUE } from './presencial.js'
import { formatarBRL } from '../lib/dinheiro.js'
import { formatarPlaca } from '../lib/placa.js'
import Botao from '../ui/Botao.jsx'

// O cliente assina no balcão, no aparelho do próprio funcionário. É o mesmo
// aceite do link enviado por WhatsApp: mesmo código, mesma função no banco,
// mesma trava de itens depois. Muda só onde a pessoa assina.
//
// Fica dentro da tela da OS, sem navegar para lugar nenhum: entregar o celular
// numa página do sistema logado deixaria o resto do app ao alcance do cliente.
export default function AssinaturaPresencial({ os, aoConcluir, aoCancelar }) {
  const quadro = useRef(null)
  const [vista, setVista] = useState(null)   // o que o banco diz que o cliente vê
  const [desenhou, setDesenhou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  // Pega o código e a versão do que vai ser assinado. A versão é o que impede
  // o aceite de valer para uma OS que mudou entre abrir e assinar.
  useEffect(() => {
    let cancelado = false
    gerarLinkAssinatura(os.id)
      .then(({ codigo }) => obterOsParaAssinatura(codigo)
        .then((dados) => ({ codigo, dados })))
      .then(({ codigo, dados }) => {
        if (cancelado) return
        if (dados?.situacao !== 'valido') {
          setErro('Esta OS não está disponível para assinatura. Recarregue a tela.')
          return
        }
        setVista({ codigo, ...dados })
      })
      .catch((e) => { if (!cancelado) setErro(e.message) })
    return () => { cancelado = true }
  }, [os.id])

  async function confirmar() {
    const desenho = quadro.current?.exportar()
    if (!desenho) { setErro('Assine no quadro antes de confirmar.'); return }

    setEnviando(true)
    setErro('')
    try {
      await registrarAceite({
        codigo: vista.codigo,
        assinatura: desenho,
        totalVisto: vista.os.total_centavos,
        versao: vista.versao,
      })
      aoConcluir()
    } catch (e) {
      const acao = acaoParaErro(e.detalhe ?? e.message)
      setErro(acao.texto || e.message)
      // Mudou a OS entre abrir e assinar: o que estava na tela já não vale.
      if (acao.tipo === 'recarregar') aoConcluir()
    } finally {
      setEnviando(false)
    }
  }

  if (erro && !vista) {
    return (
      <div className="mt-3 rounded-xl border border-red/40 bg-paper p-3">
        <p role="alert" className="text-sm font-semibold text-red">{erro}</p>
        <div className="mt-3">
          <Botao variante="fantasma" tamanho="pequeno" onClick={aoCancelar}>Fechar</Botao>
        </div>
      </div>
    )
  }

  if (!vista) {
    return <p className="mt-3 text-sm text-mute">Preparando a assinatura…</p>
  }

  return (
    <div className="mt-3 rounded-xl border-[1.5px] border-ink bg-paper p-3">
      <p className="text-[13px] font-bold">{TEXTO_ENTREGUE}</p>

      <dl className="my-3 rounded-xl bg-[#F6F4F2] px-3 py-2 text-[12.5px]">
        <div className="flex justify-between py-0.5">
          <dt className="text-mute">Cliente</dt>
          <dd className="font-bold">{vista.os.cliente_nome}</dd>
        </div>
        <div className="flex justify-between py-0.5">
          <dt className="text-mute">Veículo</dt>
          <dd className="font-bold">
            {`${vista.os.veiculo_descricao} · ${formatarPlaca(vista.os.veiculo_placa)}`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-linha pt-1.5">
          <dt className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">Total</dt>
          <dd className="text-xl font-extrabold">{formatarBRL(vista.os.total_centavos)}</dd>
        </div>
      </dl>

      <p className="mb-1.5 text-[12px] text-mute">
        Li e estou de acordo com os serviços e valores acima.
      </p>

      <QuadroAssinatura ref={quadro} aoMudar={setDesenhou} />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-mute">Assine com o dedo no quadro.</span>
        <button
          type="button"
          onClick={() => quadro.current?.limpar()}
          className="h-10 px-2 text-sm font-semibold text-red"
        >
          Limpar
        </button>
      </div>

      {erro && (
        <p role="alert" className="mt-2 rounded-lg bg-[#FEF3C7] px-3 py-2 text-sm font-semibold text-[#7A4A06]">
          {erro}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Botao variante="fantasma" tamanho="pequeno" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao tamanho="pequeno" onClick={confirmar} disabled={!desenhou || enviando}>
          {enviando ? 'Registrando…' : 'Confirmar assinatura'}
        </Botao>
      </div>
    </div>
  )
}
