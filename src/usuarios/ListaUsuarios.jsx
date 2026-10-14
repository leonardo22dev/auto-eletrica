import { rotuloPapel } from '../auth/perfil.js'
import { acoesDoUsuario } from './regras.js'
import Botao from '../ui/Botao.jsx'
import EstadoVazio from '../ui/EstadoVazio.jsx'

const CORES = {
  admin: 'bg-ink text-white',
  atendente: 'bg-[#EFEDEB] text-mute',
  ativo: 'bg-[#DCFCE7] text-[#15803D]',
  bloqueado: 'bg-[#FEE2E2] text-red',
}

function Selo({ children, tom }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-[0.07em] uppercase ${CORES[tom]}`}
    >
      {children}
    </span>
  )
}

export default function ListaUsuarios({
  usuarios, euId, aoEditar, aoBloquear, aoReativar, aoRedefinir,
}) {
  if (usuarios.length === 0) {
    return <EstadoVazio titulo="Nenhum usuário" />
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {usuarios.map((u) => {
        const { ehVoce, podeBloquear, podeReativar } = acoesDoUsuario({ alvo: u, euId })
        return (
          <li key={u.user_id} className="rounded-xl border border-linha bg-paper p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {u.nome}
                  {ehVoce && <span className="ml-1.5 text-xs font-semibold text-mute">Você</span>}
                </p>
                <p className="text-sm text-mute">{`@${u.usuario}`}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Selo tom={u.papel}>{rotuloPapel(u.papel)}</Selo>
                <Selo tom={u.ativo ? 'ativo' : 'bloqueado'}>
                  {u.ativo ? 'Ativo' : 'Bloqueado'}
                </Selo>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Botao variante="fantasma" tamanho="pequeno" type="button"
                onClick={() => aoEditar(u)}>
                Editar
              </Botao>
              <Botao variante="fantasma" tamanho="pequeno" type="button"
                onClick={() => aoRedefinir(u)}>
                Redefinir senha
              </Botao>
              {podeBloquear && (
                <Botao variante="perigo" tamanho="pequeno" type="button"
                  className="col-span-2" onClick={() => aoBloquear(u)}>
                  Bloquear
                </Botao>
              )}
              {podeReativar && (
                <Botao variante="primario" tamanho="pequeno" type="button"
                  className="col-span-2" onClick={() => aoReativar(u)}>
                  Reativar
                </Botao>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
