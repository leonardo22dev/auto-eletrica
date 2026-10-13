const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const FUSO = 'America/Sao_Paulo'

// Datas puras são tratadas como texto, nunca como Date.
// Date interpreta 'YYYY-MM-DD' como UTC e devolve o dia anterior aqui.
function partes(iso) {
  if (typeof iso !== 'string') return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return { ano: m[1], mes: m[2], dia: m[3] }
}

export function hojeISO() {
  const agora = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(agora)
}

export function formatarData(iso) {
  const p = partes(iso)
  if (!p) return ''
  return `${p.dia}/${p.mes}/${p.ano}`
}

export function dataPorExtenso(iso) {
  const p = partes(iso)
  if (!p) return { dia: '', mes: '', ano: '' }
  return { dia: p.dia, mes: MESES[Number(p.mes) - 1], ano: p.ano }
}

// Timestamps, ao contrário, carregam o instante e podem virar Date.
export function formatarDataHora(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const partesFmt = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  )
  return `${partesFmt.day}/${partesFmt.month}/${partesFmt.year} às ${partesFmt.hour}:${partesFmt.minute}`
}
