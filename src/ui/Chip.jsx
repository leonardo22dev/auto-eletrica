import { STATUS, rotuloStatus } from '../lib/status.js'

const CORES = {
  [STATUS.ORCAMENTO]: 'bg-[#FEF3C7] text-[#B45309]',
  [STATUS.APROVADA]: 'bg-[#DBEAFE] text-[#1D4ED8]',
  [STATUS.FINALIZADA]: 'bg-[#DCFCE7] text-[#15803D]',
  [STATUS.CANCELADA]: 'bg-[#EFEDEB] text-mute',
}

export default function Chip({ status }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-[0.07em] uppercase ${CORES[status] || CORES[STATUS.CANCELADA]}`}
    >
      {rotuloStatus(status) || '—'}
    </span>
  )
}
