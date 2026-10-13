const VARIANTES = {
  primario: 'bg-red text-white',
  fantasma: 'bg-paper text-ink border-[1.5px] border-linha',
  whatsapp: 'bg-[#1FA855] text-white',
  perigo: 'bg-paper text-red border-[1.5px] border-red/40',
}

const TAMANHOS = {
  normal: 'h-12 text-base',
  pequeno: 'h-11 text-[13px]',
}

export default function Botao({
  variante = 'primario',
  tamanho = 'normal',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 font-bold disabled:opacity-60 ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
