export default function Campo({
  rotulo,
  id,
  tipo = 'text',
  inputMode,
  valor,
  aoMudar,
  sufixo,
  erro,
  className = '',
  ...props
}) {
  return (
    <div className="mb-3">
      {rotulo && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
        >
          {rotulo}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          id={id}
          type={tipo}
          inputMode={inputMode}
          value={valor ?? ''}
          onChange={(e) => aoMudar?.(e.target.value)}
          className={`h-12 w-full rounded-xl border-[1.5px] bg-paper px-3.5 text-base font-semibold focus:outline-none ${erro ? 'border-red' : 'border-linha focus:border-ink'} ${className}`}
          {...props}
        />
        {sufixo && <span className="shrink-0 text-sm text-mute">{sufixo}</span>}
      </div>
      {erro && <p className="mt-1 text-xs font-semibold text-red">{erro}</p>}
    </div>
  )
}
