import { formatarBRL, centavosParaTexto } from '../lib/dinheiro.js'
import { ehModoValorTotal, itemSemPreco } from '../os/valorTotal.js'

// Os itens como o cliente os vê na página de assinatura. No modo "Valor
// total" aparecem só os serviços: a linha de fechamento fica de fora porque o
// valor já é o bloco "Valor total" logo abaixo, e repeti-la só confundiria.
export default function ListaDeItens({ itens }) {
  const total = ehModoValorTotal(itens)
  const visiveis = total ? itens.slice(0, -1) : itens

  return (
    <ul className="mb-3">
      {visiveis.map((i) => (
        <li
          key={i.posicao}
          className="mb-2 rounded-xl border border-linha bg-paper px-3 py-2.5"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-extrabold text-red">
              {String(i.quantidade).replace('.', ',')}×
            </span>
            <span className="text-[13px] font-semibold">{i.descricao}</span>
          </div>
          {!itemSemPreco(i) && (
            <div className="mt-1.5 flex justify-between border-t border-dashed border-linha pt-1.5 text-[11.5px] text-mute">
              <span>Unit. {centavosParaTexto(i.valor_unitario_centavos)}</span>
              <strong className="text-[13px] text-ink">
                {formatarBRL(i.valor_total_centavos)}
              </strong>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
