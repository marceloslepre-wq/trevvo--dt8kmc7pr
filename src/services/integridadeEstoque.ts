import pb from '@/lib/pocketbase/client'

export interface DivergenciaEstoque {
  id: string
  tipo: 'saldo_vs_movimentos' | 'saldo_vs_lotes'
  empresa_id: string
  empresa_nome: string
  produto_id: string
  produto_codigo: string | number
  produto_descricao: string
  controla_lote_validade: boolean
  valor_esperado: number
  valor_encontrado: number
  diferenca: number
  detalhes: string
}

export interface ResultadoIntegridadeEstoque {
  data_execucao: string
  total_empresas_verificadas: number
  total_produtos_verificados: number
  total_saldos_verificados: number
  total_lotes_verificados: number
  total_movimentos_verificados: number
  divergencias_encontradas: number
  itens_divergentes: DivergenciaEstoque[]
  status: 'ok' | 'divergencias_detectadas'
}

/**
 * Ferramenta administrativa para verificação de integridade do estoque:
 * 1. Para cada empresa e produto, confere se a soma algébrica dos movimentos (kardex)
 *    bate exatamente com o saldo registrado em `estoque_saldos`.
 * 2. Para produtos configurados com controle de lote (`controla_lote_validade = true`),
 *    confere se a soma dos lotes com saldo positivo bate com o saldo registrado em `estoque_saldos`.
 *
 * ⚠ Não realiza nenhuma correção automática — apenas audita e relata divergências.
 */
export async function verificarIntegridadeEstoque(
  empresaIdFiltro?: string,
): Promise<ResultadoIntegridadeEstoque> {
  const agora = new Date().toISOString()
  const divergencias: DivergenciaEstoque[] = []

  // 1. Carregar Empresas
  let filterEmpresas = 'ativo = true'
  if (empresaIdFiltro && empresaIdFiltro !== 'todas') {
    filterEmpresas += ` && id = '${empresaIdFiltro}'`
  }
  const empresas = await pb.collection('empresas').getFullList<any>({ filter: filterEmpresas })
  const mapaEmpresas = new Map<string, string>()
  empresas.forEach((e) =>
    mapaEmpresas.set(e.id, e.nome_fantasia || e.razao_social || `Empresa #${e.codigo}`),
  )

  // 2. Carregar todos os produtos ativos do catálogo
  const produtos = await pb.collection('produtos').getFullList<any>({
    fields: 'id,codigo,descricao,controla_lote_validade,ativo',
  })
  const mapaProdutos = new Map<string, any>()
  produtos.forEach((p) => mapaProdutos.set(p.id, p))

  // 3. Carregar todos os saldos de estoque
  let filterSaldos = 'ativo = true'
  if (empresaIdFiltro && empresaIdFiltro !== 'todas') {
    filterSaldos += ` && empresa_id = '${empresaIdFiltro}'`
  }
  const saldos = await pb.collection('estoque_saldos').getFullList<any>({
    filter: filterSaldos,
  })

  // Mapa de saldos por chave `empresa_id:produto_id`
  const mapaSaldos = new Map<string, any>()
  saldos.forEach((s) => {
    mapaSaldos.set(`${s.empresa_id}:${s.produto_id}`, s)
  })

  // 4. Carregar todos os movimentos de estoque
  let filterMovs = 'ativo = true'
  if (empresaIdFiltro && empresaIdFiltro !== 'todas') {
    filterMovs += ` && empresa_id = '${empresaIdFiltro}'`
  }
  const movimentos = await pb.collection('estoque_movimentos').getFullList<any>({
    filter: filterMovs,
    fields: 'id,empresa_id,produto_id,tipo,quantidade,estornado',
  })

  // Calcular soma de movimentos por `empresa_id:produto_id`
  // Regra: movimentos do tipo 'Entrada' somam, 'Saída' subtraem. Movimentos estornados não entram na soma se estornado = true
  const somaMovimentos = new Map<string, number>()
  movimentos.forEach((m) => {
    // Se o movimento foi marcado como estornado, ele não impacta o saldo físico (ou o movimento de estorno já compensa)
    // No serviço central de estoque: ao estornar, é criado um NOVO movimento com tipo invertido e origem 'ESTORNO',
    // e o original recebe `estornado: true`. Para a soma líquida de todos os registros da tabela:
    // Se o estornado continua gravado e o de estorno também, somar ambos cancela o saldo.
    // Verificamos a soma algébrica de todos os movimentos ativos.
    const chave = `${m.empresa_id}:${m.produto_id}`
    const qtd = Number(m.quantidade) || 0
    const fator = m.tipo === 'Entrada' ? 1 : -1
    const atual = somaMovimentos.get(chave) || 0
    somaMovimentos.set(chave, Math.round((atual + fator * qtd) * 10000) / 10000)
  })

  // 5. Carregar lotes ativos
  let filterLotes = 'ativo = true'
  if (empresaIdFiltro && empresaIdFiltro !== 'todas') {
    filterLotes += ` && empresa_id = '${empresaIdFiltro}'`
  }
  const lotes = await pb.collection('lotes').getFullList<any>({
    filter: filterLotes,
    fields: 'id,empresa_id,produto_id,quantidade_saldo,numero_lote',
  })

  const somaLotes = new Map<string, number>()
  lotes.forEach((l) => {
    const chave = `${l.empresa_id}:${l.produto_id}`
    const qtd = Number(l.quantidade_saldo) || 0
    const atual = somaLotes.get(chave) || 0
    somaLotes.set(chave, Math.round((atual + qtd) * 10000) / 10000)
  })

  // 6. Conferência 1: Para cada saldo existente, bate com a soma de movimentos?
  // Também checar pares (empresa, produto) que têm movimentos mas não têm saldo criado
  const chavesAnalisadas = new Set<string>()

  // A) A partir de estoque_saldos
  saldos.forEach((s) => {
    const chave = `${s.empresa_id}:${s.produto_id}`
    chavesAnalisadas.add(chave)

    const saldoRegistrado = Math.round((Number(s.quantidade) || 0) * 10000) / 10000
    const somaMov = somaMovimentos.get(chave) || 0
    const difMov = Math.round(Math.abs(saldoRegistrado - somaMov) * 10000) / 10000

    const prod = mapaProdutos.get(s.produto_id)
    const empNome = mapaEmpresas.get(s.empresa_id) || s.empresa_id

    // Tolerância para arredondamento float (0.0001)
    if (difMov > 0.0001) {
      divergencias.push({
        id: `div_mov_${chave}`,
        tipo: 'saldo_vs_movimentos',
        empresa_id: s.empresa_id,
        empresa_nome: empNome,
        produto_id: s.produto_id,
        produto_codigo: prod?.codigo || '-',
        produto_descricao: prod?.descricao || 'Produto não encontrado',
        controla_lote_validade: Boolean(prod?.controla_lote_validade),
        valor_esperado: somaMov,
        valor_encontrado: saldoRegistrado,
        diferenca: Math.round((saldoRegistrado - somaMov) * 10000) / 10000,
        detalhes: `Saldo em estoque_saldos (${saldoRegistrado}) difere da soma dos movimentos (${somaMov}).`,
      })
    }

    // Conferência 2: Se o produto controla lote, a soma dos lotes bate com o saldo?
    if (prod && prod.controla_lote_validade) {
      const somaLoteProd = somaLotes.get(chave) || 0
      const difLote = Math.round(Math.abs(saldoRegistrado - somaLoteProd) * 10000) / 10000
      if (difLote > 0.0001) {
        divergencias.push({
          id: `div_lote_${chave}`,
          tipo: 'saldo_vs_lotes',
          empresa_id: s.empresa_id,
          empresa_nome: empNome,
          produto_id: s.produto_id,
          produto_codigo: prod.codigo || '-',
          produto_descricao: prod.descricao || 'Produto não encontrado',
          controla_lote_validade: true,
          valor_esperado: saldoRegistrado,
          valor_encontrado: somaLoteProd,
          diferenca: Math.round((somaLoteProd - saldoRegistrado) * 10000) / 10000,
          detalhes: `Soma dos lotes ativos (${somaLoteProd}) difere do saldo registrado (${saldoRegistrado}).`,
        })
      }
    }
  })

  // B) Checar se existem movimentos órfãos (que não possuem registro correspondente em estoque_saldos)
  somaMovimentos.forEach((somaMov, chave) => {
    if (!chavesAnalisadas.has(chave) && Math.abs(somaMov) > 0.0001) {
      const [empId, prodId] = chave.split(':')
      const prod = mapaProdutos.get(prodId)
      const empNome = mapaEmpresas.get(empId) || empId

      divergencias.push({
        id: `div_orfao_${chave}`,
        tipo: 'saldo_vs_movimentos',
        empresa_id: empId,
        empresa_nome: empNome,
        produto_id: prodId,
        produto_codigo: prod?.codigo || '-',
        produto_descricao: prod?.descricao || 'Produto não encontrado',
        controla_lote_validade: Boolean(prod?.controla_lote_validade),
        valor_esperado: somaMov,
        valor_encontrado: 0,
        diferenca: -somaMov,
        detalhes: `Existem movimentos com soma total ${somaMov}, mas nenhum registro em estoque_saldos para este produto.`,
      })
    }
  })

  return {
    data_execucao: agora,
    total_empresas_verificadas: empresas.length,
    total_produtos_verificados: produtos.length,
    total_saldos_verificados: saldos.length,
    total_lotes_verificados: lotes.length,
    total_movimentos_verificados: movimentos.length,
    divergencias_encontradas: divergencias.length,
    itens_divergentes: divergencias,
    status: divergencias.length === 0 ? 'ok' : 'divergencias_detectadas',
  }
}
