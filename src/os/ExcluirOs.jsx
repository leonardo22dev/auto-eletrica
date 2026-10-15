import { Trash2 } from 'lucide-react'
import Botao from '../ui/Botao.jsx'
import { ehAdmin } from '../auth/perfil.js'

// A tela esconde o botão de quem não pode usá-lo; quem barra de verdade é o
// banco (a função excluir_os confere que é administrador).
export function BotaoExcluirOs({ perfil, aoClicar, desabilitado = false }) {
  if (!ehAdmin(perfil)) return null
  return (
    <Botao
      type="button"
      variante="perigo"
      tamanho="pequeno"
      onClick={aoClicar}
      disabled={desabilitado}
    >
      <Trash2 size={16} aria-hidden="true" /> Excluir OS
    </Botao>
  )
}

// Exclusão não tem volta. A confirmação diz o que some e o que fica, e avisa
// quando a OS já foi assinada pelo cliente (o aceite também é apagado).
export default function ConfirmarExclusao({ os, aoConfirmar, aoCancelar, ocupado }) {
  const quem = os.numero != null ? `OS nº ${os.numero}` : 'esta OS'
  const assinada = Boolean(os.aceite_em)

  return (
    <div className="rounded-xl border border-red/40 bg-paper p-3">
      <p className="font-bold">
        Excluir {quem} de {os.cliente_nome}?
      </p>
      <p className="mt-1 text-[13px] leading-snug text-mute">
        Isto apaga a OS, os itens e a atividade, e não tem volta. Fica só um registro
        mínimo (quem excluiu, quando, número, cliente, placa e total), visível ao
        administrador.
      </p>
      {assinada && (
        <p className="mt-2 rounded-lg bg-red/10 px-3 py-2 text-[13px] font-semibold text-red">
          O cliente assinou esta OS: o aceite dele (data, hora e desenho) será apagado
          junto.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Botao type="button" variante="fantasma" tamanho="pequeno" onClick={aoCancelar}
          disabled={ocupado}>
          Voltar
        </Botao>
        <Botao type="button" variante="perigo" tamanho="pequeno" onClick={aoConfirmar}
          disabled={ocupado}>
          {ocupado ? 'Excluindo…' : 'Excluir de vez'}
        </Botao>
      </div>
    </div>
  )
}
