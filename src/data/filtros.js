// O valor de `or=` do PostgREST é uma lista separada por vírgula, com grupos
// entre parênteses. Qualquer um desses caracteres no termo de busca corta a
// condição no meio e a consulta volta 400. Aspas duplas em volta do valor
// tornam tudo literal; dentro delas, só aspa e barra invertida precisam de
// escape.
export function condicaoIlike(coluna, termo) {
  const escapado = String(termo ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
  return `${coluna}.ilike."%${escapado}%"`
}
