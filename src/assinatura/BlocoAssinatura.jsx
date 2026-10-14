import { formatarDataHora } from '../lib/datas.js'
import { situacaoDoLink } from './estado.js'
import Botao from '../ui/Botao.jsx'

const ROTULOS = {
  nao_enviada: ['Não enviada', 'O link nasce no primeiro envio pelo WhatsApp.'],
  aguardando: ['Aguardando assinatura', null],
  vencido: ['Link vencido', 'Gere um novo link e envie de novo.'],
  indisponivel: ['Indisponível', 'Só orçamento e OS aprovada aceitam assinatura.'],
}

export default function BlocoAssinatura({ os, aoCopiar, aoRenovar, ocupado }) {
  const situacao = situacaoDoLink(os)

  if (situacao === 'assinada') {
    return (
      <div className="mt-3 rounded-xl border border-[#BCE5C8] bg-[#F0FAF2] p-3">
        <h2 className="mb-1 text-[10px] font-bold tracking-[0.14em] text-[#15803D] uppercase">
          Assinada pelo cliente
        </h2>
        <p className="mb-2 text-[12.5px] text-[#3D6B4B]">
          {os.aceite_nome} · {formatarDataHora(os.aceite_em)}
        </p>
        {os.aceite_assinatura && (
          <img
            src={os.aceite_assinatura}
            alt="Assinatura do cliente"
            className="h-16 rounded-lg border border-linha bg-white p-1"
          />
        )}
        <p className="mt-2 text-xs text-[#3D6B4B]">
          Itens e valores estão travados. Para alterar, cancele e duplique.
        </p>
      </div>
    )
  }

  const [titulo, nota] = ROTULOS[situacao]
  const detalhe = situacao === 'aguardando' && os.assinatura_expira_em
    ? `Válido até ${formatarDataHora(os.assinatura_expira_em)}.`
    : nota

  return (
    <div className="mt-3 rounded-xl border border-linha bg-paper p-3">
      <h2 className="mb-1 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        Assinatura do cliente
      </h2>
      <p className="text-[13px] font-bold">{titulo}</p>
      {detalhe && <p className="mt-0.5 text-xs text-mute">{detalhe}</p>}

      {(situacao === 'aguardando' || situacao === 'vencido') && (
        <div className="mt-2 flex gap-2">
          {situacao === 'aguardando' && (
            <Botao variante="fantasma" tamanho="pequeno" onClick={aoCopiar} disabled={ocupado}>
              Copiar link
            </Botao>
          )}
          <Botao variante="fantasma" tamanho="pequeno" onClick={aoRenovar} disabled={ocupado}>
            Gerar novo link
          </Botao>
        </div>
      )}
    </div>
  )
}
