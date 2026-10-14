import { useEffect, useImperativeHandle, useRef } from 'react'
import {
  caixaDoDesenho, tracoSuficiente, dimensionarParaExportar, precisaRedimensionar,
} from './desenho.js'

const LARGURA_EXPORTADA = 500
const COR_TRACO = '#141414'

// O quadro guarda o traço em pixels reais da tela (devicePixelRatio) para
// ficar nítido, e exporta recortado e reduzido, para o PNG ficar leve.
export default function QuadroAssinatura({ ref, aoMudar }) {
  const canvasRef = useRef(null)
  const estado = useRef({ desenhando: false, ultimo: null, comprimento: 0 })
  const tamanhoAtual = useRef(null)

  function contexto() {
    return canvasRef.current.getContext('2d')
  }

  // O callback mais recente, lido pelo efeito sem refazer a assinatura do
  // evento de resize a cada render.
  const aoMudarRef = useRef(aoMudar)
  useEffect(() => { aoMudarRef.current = aoMudar })

  useEffect(() => {
    function ajustarTamanho() {
      const canvas = canvasRef.current
      if (!canvas) return
      const caixa = canvas.getBoundingClientRect()
      const tamanho = { w: caixa.width, h: caixa.height }

      // Atribuir canvas.width limpa o quadro. O resize dispara no celular até
      // quando a barra de endereço some ao rolar, sem o quadro mudar de
      // tamanho: só se refaz o canvas quando o tamanho mudou de verdade.
      if (!precisaRedimensionar(tamanhoAtual.current, tamanho)) return
      const eraPrimeira = tamanhoAtual.current === null
      tamanhoAtual.current = tamanho

      // Mudou de verdade (por exemplo, o celular girou): o desenho se perdeu,
      // então o estado e o botão têm de refletir isso, senão um toque
      // acidental somava ao comprimento antigo e virava assinatura.
      if (!eraPrimeira) {
        estado.current = { desenhando: false, ultimo: null, comprimento: 0 }
        aoMudarRef.current?.(false)
      }

      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(caixa.width * dpr)
      canvas.height = Math.round(caixa.height * dpr)
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.6
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = COR_TRACO
    }

    ajustarTamanho()
    window.addEventListener('resize', ajustarTamanho)
    return () => window.removeEventListener('resize', ajustarTamanho)
  }, [])

  function ponto(e) {
    const caixa = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top }
  }

  function aoPressionar(e) {
    canvasRef.current.setPointerCapture(e.pointerId)
    const p = ponto(e)
    estado.current = { desenhando: true, ultimo: p, comprimento: estado.current.comprimento }
    const ctx = contexto()
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.01, p.y + 0.01)
    ctx.stroke()
  }

  function aoMover(e) {
    const s = estado.current
    if (!s.desenhando) return
    const p = ponto(e)
    const ctx = contexto()
    ctx.beginPath()
    ctx.moveTo(s.ultimo.x, s.ultimo.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    s.comprimento += Math.hypot(p.x - s.ultimo.x, p.y - s.ultimo.y)
    s.ultimo = p
    aoMudar?.(tracoSuficiente(s.comprimento))
  }

  function aoSoltar() {
    estado.current.desenhando = false
  }

  useImperativeHandle(ref, () => ({
    limpar() {
      const canvas = canvasRef.current
      contexto().clearRect(0, 0, canvas.width, canvas.height)
      estado.current = { desenhando: false, ultimo: null, comprimento: 0 }
      aoMudar?.(false)
    },

    // PNG recortado na tinta e reduzido. Nulo se não há desenho de verdade.
    exportar() {
      if (!tracoSuficiente(estado.current.comprimento)) return null
      const canvas = canvasRef.current
      const ctx = contexto()
      const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const caixa = caixaDoDesenho(imagem)
      if (!caixa) return null

      const margem = 6
      const x = Math.max(0, caixa.x - margem)
      const y = Math.max(0, caixa.y - margem)
      const w = Math.min(canvas.width - x, caixa.w + margem * 2)
      const h = Math.min(canvas.height - y, caixa.h + margem * 2)
      const { w: ws, h: hs } = dimensionarParaExportar(w, h, LARGURA_EXPORTADA)

      const saida = document.createElement('canvas')
      saida.width = ws
      saida.height = hs
      saida.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, ws, hs)
      return saida.toDataURL('image/png')
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onPointerLeave={aoSoltar}
      aria-label="Quadro de assinatura. Desenhe com o dedo."
      className="block h-[180px] w-full touch-none rounded-xl border-[1.5px] border-dashed border-[#CFCBC7] bg-white"
    />
  )
}
