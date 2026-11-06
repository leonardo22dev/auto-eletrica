import { rotuloDoMes } from '../lib/meses.js'
import { formatarBRL } from '../lib/dinheiro.js'
import { totalDoPeriodo } from './periodo.js'

export function SeletorDeMes({ meses, valor, aoMudar }) {
  return (
    <select
      aria-label="Mês das ordens de serviço"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      className="mb-3 h-11 w-full rounded-xl border-[1.5px] border-linha bg-paper px-3 text-[13px] font-bold"
    >
      <option value="">Todos os meses</option>
      {meses.map((m) => (
        <option key={m} value={m}>{rotuloDoMes(m)}</option>
      ))}
    </select>
  )
}

export function ResumoDoPeriodo({ mes, ordens }) {
  if (!mes) return null
  const quantas = (ordens || []).length

  return (
    <div className="mb-3 flex items-baseline justify-between gap-2 rounded-xl border border-linha bg-paper px-3 py-2.5">
      <span className="text-[12px] font-bold text-mute">{rotuloDoMes(mes)}</span>
      {quantas === 0 ? (
        <span className="text-[12px] text-mute">Nenhuma OS neste mês</span>
      ) : (
        <span className="text-right">
          <span className="block text-[11px] text-mute">{`${quantas} OS`}</span>
          <strong className="text-[15px] font-extrabold">
            {formatarBRL(totalDoPeriodo(ordens))}
          </strong>
        </span>
      )}
    </div>
  )
}
