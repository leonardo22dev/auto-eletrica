import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const VERMELHO = '#CC2E1E'
const PRETO = '#000000'

const s = StyleSheet.create({
  pagina: { paddingVertical: 28, paddingHorizontal: 30, fontFamily: 'Helvetica', fontSize: 9 },

  moldura: {
    borderWidth: 1.4, borderColor: PRETO, borderRadius: 6,
    paddingVertical: 8, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  logo: { width: 76, height: 76, objectFit: 'contain' },
  blocoFone: { justifyContent: 'center' },
  fone: { fontFamily: 'Helvetica', fontWeight: 700, fontSize: 17 },
  colunaEmpresa: { flex: 1, alignItems: 'flex-end' },
  razao: { fontFamily: 'Times-Roman', fontWeight: 700, fontSize: 21, textAlign: 'right' },
  linhaServico: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  servico: { fontSize: 6.6, fontWeight: 700, textAlign: 'right', lineHeight: 1.6 },
  bullet: { width: 2.6, height: 2.6, borderRadius: 1.3, backgroundColor: VERMELHO },

  endereco: {
    borderTopWidth: 0.7, borderTopColor: PRETO,
    marginTop: 5, paddingTop: 4, fontSize: 7.4, textAlign: 'center', lineHeight: 1.5,
  },
  linhaIds: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 3, paddingTop: 4, paddingBottom: 7, fontSize: 7.6,
  },

  bloco: { borderWidth: 1.4, borderColor: PRETO, borderRadius: 6, padding: 10 },
  linhaTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  titulo: { fontWeight: 700, fontSize: 14 },
  numero: { fontWeight: 700, fontSize: 17 },
  data: { fontSize: 9.5 },

  campoLinha: { flexDirection: 'row', gap: 14, marginTop: 8 },
  campo: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  campoRotulo: { fontSize: 9.5 },
  campoValor: {
    flex: 1, fontSize: 9.5, fontWeight: 700, paddingHorizontal: 3, paddingBottom: 1,
    borderBottomWidth: 0.8, borderBottomColor: '#444444',
  },

  garantia: {
    color: VERMELHO, fontWeight: 700, fontSize: 12.5,
    textAlign: 'center', marginTop: 10, marginBottom: 2,
  },

  tabela: { marginTop: 7, borderWidth: 1, borderColor: PRETO },
  linha: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: PRETO },
  linhaUltima: { flexDirection: 'row' },
  celQuant: { width: '9%', borderRightWidth: 1, borderRightColor: PRETO, padding: 4, textAlign: 'center' },
  celDesc: { flex: 1, borderRightWidth: 1, borderRightColor: PRETO, padding: 4 },
  celUnit: { width: '14%', borderRightWidth: 1, borderRightColor: PRETO, padding: 4, textAlign: 'right' },
  celTotal: { width: '14%', padding: 4, textAlign: 'right' },
  cabecalhoCel: { fontWeight: 700, fontSize: 8 },
  corpoCel: { fontSize: 8.6, minHeight: 10 },

  blocoTotal: {
    flexDirection: 'row', justifyContent: 'flex-end',
    alignItems: 'center', gap: 10, marginTop: 9,
  },
  rotuloTotal: { fontSize: 13, fontWeight: 700 },
  valorTotal: {
    fontSize: 16, fontWeight: 700, textAlign: 'right',
    borderWidth: 1, borderColor: PRETO,
    paddingVertical: 4, paddingHorizontal: 16, minWidth: 120,
  },

  assinatura: { marginTop: 18, alignItems: 'center' },
  riscoAssinatura: { borderTopWidth: 0.8, borderTopColor: PRETO, width: 200, marginBottom: 3 },
  rotuloAssinatura: { fontSize: 8 },
  imagemAssinatura: { height: 46, objectFit: 'contain', marginBottom: 2 },
  textoAssinado: { fontSize: 7, marginTop: 2, color: '#444444' },
})

function Celula({ estilo, children }) {
  return (
    <View style={estilo}>
      <Text style={s.corpoCel}>{children || ' '}</Text>
    </View>
  )
}

export default function DocumentoOS({ dados, logoSrc }) {
  const { empresa, data, cliente, veiculo, linhas } = dados

  return (
    <Document title={`${dados.titulo} ${dados.numero}`}>
      <Page size="A4" style={s.pagina}>
        <View style={s.moldura}>
          {logoSrc ? <Image style={s.logo} src={logoSrc} /> : <View style={s.logo} />}

          <View style={s.blocoFone}>
            <Text style={s.fone}>{empresa.telefone}</Text>
          </View>

          <View style={s.colunaEmpresa}>
            <Text style={[s.razao, { fontSize: empresa.tamanhoRazao }]}>{empresa.razaoSocial}</Text>
            {/* O bullet do talão é desenhado, não escrito: as fontes padrão
                do PDF não têm o caractere e ele sairia em branco. */}
            {empresa.servicos.map((servico) => (
              <View key={servico} style={s.linhaServico}>
                <Text style={s.servico}>{servico}</Text>
                <View style={s.bullet} />
              </View>
            ))}
          </View>
        </View>

        <Text style={s.endereco}>
          {empresa.endereco} - {empresa.cidadeUf}
          {empresa.email ? `\nE-mail: ${empresa.email}` : ''}
        </Text>

        <View style={s.linhaIds}>
          <Text>CNPJ {empresa.cnpj}</Text>
          <Text>Inscr. Estadual nº {empresa.inscricaoEstadual}</Text>
        </View>

        <View style={s.bloco}>
          <View style={s.linhaTitulo}>
            <Text style={s.titulo}>
              {dados.titulo} Nº <Text style={s.numero}>{dados.numero}</Text>
            </Text>
            <Text style={s.data}>
              Data {data.dia} de {data.mes} de {data.ano}
            </Text>
          </View>

          <View style={s.campoLinha}>
            <View style={[s.campo, { flex: 2 }]}>
              <Text style={s.campoRotulo}>Ilmo Sr.</Text>
              <Text style={s.campoValor}>{cliente.nome}</Text>
            </View>
            <View style={[s.campo, { flex: 1 }]}>
              <Text style={s.campoRotulo}>Tel.</Text>
              <Text style={s.campoValor}>{cliente.telefone}</Text>
            </View>
          </View>

          <View style={s.campoLinha}>
            <View style={[s.campo, { flex: 2 }]}>
              <Text style={s.campoRotulo}>Veículo</Text>
              <Text style={s.campoValor}>{veiculo.descricao}</Text>
            </View>
            <View style={[s.campo, { flex: 1 }]}>
              <Text style={s.campoRotulo}>Placa</Text>
              <Text style={s.campoValor}>{veiculo.placa}</Text>
            </View>
          </View>

          <Text style={s.garantia}>{dados.textoGarantia}</Text>

          <View style={s.tabela}>
            <View style={s.linha}>
              <View style={s.celQuant}>
                <Text style={s.cabecalhoCel}>Quant.</Text>
              </View>
              <View style={s.celDesc}>
                <Text style={s.cabecalhoCel}>Discriminação</Text>
              </View>
              <View style={s.celUnit}>
                <Text style={s.cabecalhoCel}>Unitário</Text>
              </View>
              <View style={s.celTotal}>
                <Text style={s.cabecalhoCel}>Total</Text>
              </View>
            </View>

            {linhas.map((linha, i) => (
              <View key={i} style={i === linhas.length - 1 ? s.linhaUltima : s.linha}>
                <Celula estilo={s.celQuant}>{linha.quantidade}</Celula>
                <Celula estilo={s.celDesc}>{linha.descricao}</Celula>
                <Celula estilo={s.celUnit}>{linha.unitario}</Celula>
                <Celula estilo={s.celTotal}>{linha.total}</Celula>
              </View>
            ))}
          </View>

          <View style={s.blocoTotal}>
            <Text style={s.rotuloTotal}>TOTAL R$</Text>
            <Text style={s.valorTotal}>{dados.total}</Text>
          </View>

          <View style={s.assinatura}>
            {dados.assinatura && (
              <Image style={s.imagemAssinatura} src={dados.assinatura.imagem} />
            )}
            <View style={s.riscoAssinatura} />
            <Text style={s.rotuloAssinatura}>Assinatura do Cliente</Text>
            {dados.assinatura && (
              <Text style={s.textoAssinado}>{dados.assinatura.textoData}</Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  )
}
