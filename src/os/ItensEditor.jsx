import { Trash2, Plus } from 'lucide-react'
import { totalDoItem, formatarBRL } from '../lib/dinheiro.js'
import { ITEM_VAZIO } from './item.js'
import CampoDinheiro from '../ui/CampoDinheiro.jsx'

export default function ItensEditor({ itens, aoMudar, somenteLeitura = false }) {
  function mudarItem(indice, chave, valor) {
    aoMudar(itens.map((item, i) => (i === indice ? { ...item, [chave]: valor } : item)))
  }

  function remover(indice) {
    aoMudar(itens.filter((_, i) => i !== indice))
  }

  function adicionar() {
    aoMudar([...itens, { ...ITEM_VAZIO }])
  }

  return (
    <div>
      {itens.map((item, i) => (
        <div
          key={i}
          className="mb-2 rounded-xl border border-linha bg-paper px-3 py-2.5"
        >
          <div className="mb-2 flex items-start gap-2">
            <input
              aria-label={`Quantidade do item ${i + 1}`}
              inputMode="decimal"
              disabled={somenteLeitura}
              value={item.quantidade ?? ''}
              onChange={(e) => mudarItem(i, 'quantidade', e.target.value)}
              className="h-12 w-16 shrink-0 rounded-lg border-[1.5px] border-linha px-2 text-center text-sm font-extrabold text-red focus:border-ink focus:outline-none"
            />
            <input
              aria-label={`Discriminação do item ${i + 1}`}
              disabled={somenteLeitura}
              value={item.descricao ?? ''}
              onChange={(e) => mudarItem(i, 'descricao', e.target.value)}
              placeholder="Discriminação do serviço ou peça"
              className="h-12 w-full rounded-lg border-[1.5px] border-linha px-2.5 text-sm font-semibold focus:border-ink focus:outline-none"
            />
            {!somenteLeitura && (
              <button
                type="button"
                onClick={() => remover(i)}
                aria-label={`Remover item ${i + 1}`}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-mute"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-dashed border-linha pt-2">
            <label className="flex items-center gap-2 text-[11.5px] text-mute">
              Unit.
              <CampoDinheiro
                rotulo={`Valor unitário do item ${i + 1}`}
                centavos={item.valor_unitario_centavos}
                desabilitado={somenteLeitura}
                aoMudar={(c) => mudarItem(i, 'valor_unitario_centavos', c)}
              />
            </label>
            <span className="text-[13px] font-extrabold">
              {formatarBRL(totalDoItem(item.quantidade, item.valor_unitario_centavos))}
            </span>
          </div>
        </div>
      ))}

      {!somenteLeitura && (
        <button
          type="button"
          onClick={adicionar}
          className="grid h-12 w-full place-items-center rounded-xl border-[1.5px] border-dashed border-[#CFCBC7] text-[13px] font-bold text-red"
        >
          <span className="flex items-center gap-1.5">
            <Plus size={16} aria-hidden="true" /> Adicionar item
          </span>
        </button>
      )}
    </div>
  )
}
