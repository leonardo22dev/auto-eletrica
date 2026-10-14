import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import ItensEditor from './ItensEditor.jsx'
import CampoDinheiro from '../ui/CampoDinheiro.jsx'
import { ITEM_VAZIO } from './item.js'
import { formatarBRL } from '../lib/dinheiro.js'
import {
  ROTULO_VALOR_TOTAL,
  ehModoValorTotal,
  paraModoValorTotal,
  paraModoDetalhado,
  totalDeQuemSaiu,
  separarValorTotal,
} from './valorTotal.js'

const CLASSE_CAMPO_TOTAL =
  'h-12 w-44 rounded-lg border-[1.5px] border-linha px-3 text-right text-lg font-extrabold focus:border-ink focus:outline-none disabled:bg-transparent'

function Opcao({ ativo, aoEscolher, children }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoEscolher}
      className={`h-11 flex-1 rounded-lg text-[13px] font-bold ${
        ativo ? 'bg-ink text-white' : 'text-mute'
      }`}
    >
      {children}
    </button>
  )
}

// Os itens da OS em dois jeitos: com o preço de cada item, ou só com os
// serviços e um valor total. O modo vem dos próprios itens (ehModoValorTotal);
// trocar de modo converte os itens, sem estado paralelo para manter.
export default function EditorDeItens({ itens, aoMudar, somenteLeitura = false }) {
  const modoTotal = ehModoValorTotal(itens)
  const [aviso, setAviso] = useState('')

  function escolherValorTotal() {
    setAviso('')
    const convertidos = paraModoValorTotal(itens)
    // Sem nenhum serviço, deixa uma linha pronta para digitar.
    const { servicos } = separarValorTotal(convertidos)
    aoMudar(servicos.length === 0 ? [{ ...ITEM_VAZIO }, ...convertidos] : convertidos)
  }

  function escolherDetalhado() {
    const perdido = totalDeQuemSaiu(itens)
    aoMudar(paraModoDetalhado(itens))
    setAviso(
      perdido > 0
        ? `O valor total era ${formatarBRL(perdido)}. Informe o preço de cada item.`
        : '',
    )
  }

  const troca = !somenteLeitura && (
    <div className="mb-3 flex gap-1 rounded-xl bg-[#EFEDEB] p-1">
      <Opcao ativo={!modoTotal} aoEscolher={escolherDetalhado}>Detalhar valores</Opcao>
      <Opcao ativo={modoTotal} aoEscolher={escolherValorTotal}>{ROTULO_VALOR_TOTAL}</Opcao>
    </div>
  )

  if (!modoTotal) {
    return (
      <div>
        {troca}
        {aviso && (
          <p role="status" className="mb-2 rounded-lg bg-[#FEF3C7] px-3 py-2 text-[12.5px] font-semibold text-[#7A4A06]">
            {aviso}
          </p>
        )}
        <ItensEditor itens={itens} aoMudar={aoMudar} somenteLeitura={somenteLeitura} />
      </div>
    )
  }

  const { servicos, totalCentavos } = separarValorTotal(itens)

  function mudarServico(indice, chave, valor) {
    aoMudar(itens.map((item, i) => (i === indice ? { ...item, [chave]: valor } : item)))
  }

  function remover(indice) {
    aoMudar(itens.filter((_, i) => i !== indice))
  }

  function adicionarServico() {
    // Antes da linha de fechamento, que é sempre a última.
    aoMudar([...servicos, { ...ITEM_VAZIO }, itens.at(-1)])
  }

  function mudarTotal(centavos) {
    aoMudar(itens.map((item, i) => (
      i === itens.length - 1 ? { ...item, valor_unitario_centavos: centavos } : item
    )))
  }

  return (
    <div>
      {troca}

      {servicos.map((servico, i) => (
        <div
          key={i}
          className="mb-2 flex items-start gap-2 rounded-xl border border-linha bg-paper px-3 py-2.5"
        >
          <input
            aria-label={`Quantidade do serviço ${i + 1}`}
            inputMode="decimal"
            disabled={somenteLeitura}
            value={servico.quantidade ?? ''}
            onChange={(e) => mudarServico(i, 'quantidade', e.target.value)}
            className="h-12 w-16 shrink-0 rounded-lg border-[1.5px] border-linha px-2 text-center text-sm font-extrabold text-red focus:border-ink focus:outline-none"
          />
          <input
            aria-label={`Descrição do serviço ${i + 1}`}
            disabled={somenteLeitura}
            value={servico.descricao ?? ''}
            onChange={(e) => mudarServico(i, 'descricao', e.target.value)}
            placeholder="Serviço ou peça"
            className="h-12 w-full rounded-lg border-[1.5px] border-linha px-2.5 text-sm font-semibold focus:border-ink focus:outline-none"
          />
          {!somenteLeitura && (
            <button
              type="button"
              onClick={() => remover(i)}
              aria-label={`Remover serviço ${i + 1}`}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-mute"
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}

      {!somenteLeitura && (
        <button
          type="button"
          onClick={adicionarServico}
          className="grid h-12 w-full place-items-center rounded-xl border-[1.5px] border-dashed border-[#CFCBC7] text-[13px] font-bold text-red"
        >
          <span className="flex items-center gap-1.5">
            <Plus size={16} aria-hidden="true" /> Adicionar serviço
          </span>
        </button>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-linha bg-paper px-3 py-3">
        <span className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          {ROTULO_VALOR_TOTAL}
        </span>
        <CampoDinheiro
          rotulo={ROTULO_VALOR_TOTAL}
          centavos={totalCentavos}
          desabilitado={somenteLeitura}
          aoMudar={mudarTotal}
          className={CLASSE_CAMPO_TOTAL}
        />
      </div>
    </div>
  )
}
