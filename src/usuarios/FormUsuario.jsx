import { useState } from 'react'
import Campo from '../ui/Campo.jsx'
import Botao from '../ui/Botao.jsx'
import { PAPEIS, validarNovoUsuario, validarSenha, normalizarUsuario } from './regras.js'

const TITULOS = {
  novo: 'Novo usuário',
  editar: 'Editar usuário',
  senha: 'Redefinir senha',
}

// Um formulário para as três ações. `aoSalvar` recebe só o que a ação usa.
export default function FormUsuario({ modo, alvo, aoSalvar, aoCancelar, enviando, erro }) {
  const [usuario, setUsuario] = useState('')
  const [nome, setNome] = useState(alvo?.nome ?? '')
  const [papel, setPapel] = useState(alvo?.papel ?? 'atendente')
  const [senha, setSenha] = useState('')
  const [erros, setErros] = useState({})

  function enviar(e) {
    e.preventDefault()
    if (modo === 'novo') {
      const encontrados = validarNovoUsuario({ usuario, nome, senha, papel })
      setErros(encontrados)
      if (Object.keys(encontrados).length > 0) return
      aoSalvar({ usuario: normalizarUsuario(usuario), nome: nome.trim(), senha, papel })
    } else if (modo === 'editar') {
      if (nome.trim() === '') { setErros({ nome: 'Informe o nome.' }); return }
      aoSalvar({ nome: nome.trim(), papel })
    } else {
      const s = validarSenha(senha)
      if (s) { setErros({ senha: s }); return }
      aoSalvar({ senha })
    }
  }

  return (
    <form onSubmit={enviar} className="mb-4 rounded-xl border border-linha bg-paper p-3">
      <h2 className="mb-3 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        {TITULOS[modo]}{alvo ? ` · @${alvo.usuario}` : ''}
      </h2>

      {modo === 'novo' && (
        <Campo
          id="novo-usuario" rotulo="Usuário (o que a pessoa digita para entrar)"
          valor={usuario} aoMudar={setUsuario} erro={erros.usuario}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          autoComplete="off"
        />
      )}

      {modo !== 'senha' && (
        <Campo id="usuario-nome" rotulo="Nome" valor={nome} aoMudar={setNome}
          erro={erros.nome} autoComplete="off" />
      )}

      {modo !== 'senha' && (
        <div className="mb-3">
          <label htmlFor="usuario-papel"
            className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase">
            Nível de acesso
          </label>
          <select id="usuario-papel" value={papel} onChange={(e) => setPapel(e.target.value)}
            className="h-12 w-full rounded-xl border-[1.5px] border-linha bg-paper px-3.5 text-base font-semibold">
            {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
          {erros.papel && <p className="mt-1 text-xs font-semibold text-red">{erros.papel}</p>}
        </div>
      )}

      {modo !== 'editar' && (
        <Campo
          id="usuario-senha" rotulo={modo === 'senha' ? 'Nova senha' : 'Senha'}
          tipo="password" valor={senha} aoMudar={setSenha} erro={erros.senha}
          autoComplete="new-password"
        />
      )}

      {erro && (
        <p role="alert" className="mb-3 rounded-lg bg-red/10 px-3 py-2 text-sm font-semibold text-red">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Botao variante="fantasma" type="button" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </form>
  )
}
