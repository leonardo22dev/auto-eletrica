// Alterar o status para finalizada e gravar o carimbo acontecem na mesma
// operação, então `atualizado_em` nasce alguns milissegundos depois de
// `finalizada_em`. A folga evita marcar como editada uma OS que acabou de
// ser finalizada e mais nada.
const TOLERANCIA_MS = 5000

export function editadaDepoisDeEmitida(os) {
  if (!os?.finalizada_em || !os?.atualizado_em) return false
  const emitida = new Date(os.finalizada_em).getTime()
  const alterada = new Date(os.atualizado_em).getTime()
  if (Number.isNaN(emitida) || Number.isNaN(alterada)) return false
  return alterada - emitida > TOLERANCIA_MS
}
