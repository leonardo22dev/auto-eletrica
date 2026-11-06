import { MESES } from './datas.js'

// Quantos meses o seletor oferece, no máximo. A oficina pode ter anos de OS;
// uma lista sem fim não ajuda ninguém a achar nada.
export const MAXIMO_DE_MESES = 36

const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Mês é texto 'AAAA-MM', como as datas puras do sistema: nada de Date, que
// interpreta 'AAAA-MM-DD' em UTC e devolve o dia anterior aqui.
function partes(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? ''))
  if (!m) return null
  const ano = Number(m[1])
  const numero = Number(m[2])
  if (numero < 1 || numero > 12) return null
  return { ano, numero }
}

function bissexto(ano) {
  return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0)
}

function diasNoMes(ano, numero) {
  if (numero === 2 && bissexto(ano)) return 29
  return DIAS[numero - 1]
}

const doisDigitos = (n) => String(n).padStart(2, '0')

export function limitesDoMes(mes) {
  const p = partes(mes)
  if (!p) return null
  const fim = doisDigitos(diasNoMes(p.ano, p.numero))
  return { de: `${mes}-01`, ate: `${mes}-${fim}` }
}

export function rotuloDoMes(mes) {
  const p = partes(mes)
  if (!p) return ''
  const nome = MESES[p.numero - 1]
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${p.ano}`
}

export function mesDaData(dataISO) {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(String(dataISO ?? ''))
  return m ? `${m[1]}-${m[2]}` : ''
}

// Os meses que o seletor mostra: do mês de hoje até o da OS mais antiga,
// do mais recente para o mais antigo.
export function mesesDesde(dataMaisAntiga, hojeISO) {
  const hoje = partes(mesDaData(hojeISO))
  if (!hoje) return []

  const antiga = partes(mesDaData(dataMaisAntiga))
  const lista = []
  let { ano, numero } = hoje

  while (lista.length < MAXIMO_DE_MESES) {
    lista.push(`${ano}-${doisDigitos(numero)}`)
    // Sem OS antiga, ou já alcançada (inclusive se ela for do futuro), para.
    if (!antiga || ano * 12 + numero <= antiga.ano * 12 + antiga.numero) break
    numero -= 1
    if (numero === 0) { numero = 12; ano -= 1 }
  }
  return lista
}
