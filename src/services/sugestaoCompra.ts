import pb from '@/lib/pocketbase/client'

export interface ItemSugestaoCompra {
  produto_id: string
  produto_codigo: string | number
  produto_descricao: string
  unidade_sigla: string
  saldo_atual: number
  estoque_minimo: number
  estoque_maximo: number | null
  quantidade_sugerida: number
  custo_medio: number
  custo_total_estimado: number
  fornecedor_id: string
  fornecedor_nome: string
  fornecedor_cnpj?: string
  fornecedor_telefone?: string
}

export interface GrupoFornecedorSugestao {
  fornecedor_id: string
  fornecedor_nome: string
  fornecedor_cnpj?: string
  fornecedor_telefone?: string
  total_itens: number
  quantidade_total: number
  valor_total_estimado: number
  itens: ItemSugestaoCompra[]
}

export interface ResumoSugestaoCompra {
  empresa_id: string
  total_produtos_analisados: number
  total_itens_sugeridos: number
  quantidade_total_sugerida: number
  valor_total_estimado: number
  gruposPorFornecedor: GrupoFornecedorSugestao[]
  itensGerais: ItemSugestaoCompra[]
}

/**
 * Calcula a sugestão de compra para uma empresa ativa:
 * Produtos abaixo do mínimo com quantidade sugerida =
 *   estoque_maximo - saldo (ou estoque_minimo * 2 - saldo, se estoque_maximo não estiver preenchido).
 * Agrupados por fornecedor principal com custo estimado (custo médio ponderado atual ou preço de custo).
 */
export async function obterSugestaoCompra(empresaId: string): Promise<ResumoSugestaoCompra> {
  if (!empresaId) {
    return {
      empresa_id: '',
      total_produtos_analisados: 0,
      total_itens_sugeridos: 0,
      quantidade_total_sugerida: 0,
      valor_total_estimado: 0,
      gruposPorFornecedor: [],
      itensGerais: [],
    }
  }

  // 1. Buscar todos os produtos ativos do catálogo
  const produtos = await pb.collection('produtos').getFullList<any>({
    filter: 'ativo = true',
    expand: 'fornecedor_principal_id,unidade_id',
    sort: 'descricao',
  })

  // 2. Buscar saldos de estoque ativos para a empresa ativa
  const saldos = await pb.collection('estoque_saldos').getFullList<any>({
    filter: `empresa_id = '${empresaId}' && ativo = true`,
  })

  // Mapa de saldo e custo por produto_id
  const mapaSaldos = new Map<string, { quantidade: number; custo_medio: number }>()
  saldos.forEach((s) => {
    mapaSaldos.set(s.produto_id, {
      quantidade: Number(s.quantidade) || 0,
      custo_medio: Number(s.custo_medio) || 0,
    })
  })

  const itensSugeridos: ItemSugestaoCompra[] = []

  for (const prod of produtos) {
    const estoqueMinimo = Number(prod.estoque_minimo) || 0

    // Se o produto não tem estoque mínimo definido (> 0), não entra na regra de reposição por mínimo
    if (estoqueMinimo <= 0) {
      continue
    }

    const saldoInfo = mapaSaldos.get(prod.id)
    const saldoAtual = saldoInfo ? saldoInfo.quantidade : 0

    // Regra: produtos abaixo do mínimo (saldo < estoque_minimo)
    if (saldoAtual < estoqueMinimo) {
      const estoqueMaximo =
        prod.estoque_maximo !== undefined &&
        prod.estoque_maximo !== null &&
        Number(prod.estoque_maximo) > 0
          ? Number(prod.estoque_maximo)
          : null

      // Fórmula solicitada:
      // quantidade sugerida = estoque_maximo - saldo (ou estoque_minimo × 2 - saldo, se o máximo estiver vazio)
      let qtdSugerida = 0
      if (estoqueMaximo !== null && estoqueMaximo > 0) {
        qtdSugerida = estoqueMaximo - saldoAtual
      } else {
        qtdSugerida = estoqueMinimo * 2 - saldoAtual
      }

      if (qtdSugerida < 0) {
        qtdSugerida = 0
      }

      // Custo estimado: custo médio ponderado da empresa ou preco_custo cadastrado no produto
      const custoUnitario =
        (saldoInfo && saldoInfo.custo_medio > 0
          ? saldoInfo.custo_medio
          : Number(prod.preco_custo)) || 0
      const custoTotalEstimado = Math.round(qtdSugerida * custoUnitario * 100) / 100

      const fornecedor = prod.expand?.fornecedor_principal_id
      const fornecedorId = fornecedor?.id || 'sem_fornecedor'
      const fornecedorNome =
        fornecedor?.razao_social || fornecedor?.nome_fantasia || 'Sem fornecedor principal'
      const fornecedorCnpj = fornecedor?.cpf_cnpj || fornecedor?.cnpj || ''
      const fornecedorTelefone = fornecedor?.telefone || fornecedor?.celular || ''

      itensSugeridos.push({
        produto_id: prod.id,
        produto_codigo: prod.codigo || '',
        produto_descricao: prod.descricao || '',
        unidade_sigla: prod.expand?.unidade_id?.sigla || 'UN',
        saldo_atual: saldoAtual,
        estoque_minimo: estoqueMinimo,
        estoque_maximo: estoqueMaximo,
        quantidade_sugerida: qtdSugerida,
        custo_medio: custoUnitario,
        custo_total_estimado: custoTotalEstimado,
        fornecedor_id: fornecedorId,
        fornecedor_nome: fornecedorNome,
        fornecedor_cnpj: fornecedorCnpj,
        fornecedor_telefone: fornecedorTelefone,
      })
    }
  }

  // Agrupamento por fornecedor principal
  const gruposMap = new Map<string, GrupoFornecedorSugestao>()

  itensSugeridos.forEach((item) => {
    let grupo = gruposMap.get(item.fornecedor_id)
    if (!grupo) {
      grupo = {
        fornecedor_id: item.fornecedor_id,
        fornecedor_nome: item.fornecedor_nome,
        fornecedor_cnpj: item.fornecedor_cnpj,
        fornecedor_telefone: item.fornecedor_telefone,
        total_itens: 0,
        quantidade_total: 0,
        valor_total_estimado: 0,
        itens: [],
      }
      gruposMap.set(item.fornecedor_id, grupo)
    }

    grupo.itens.push(item)
    grupo.total_itens += 1
    grupo.quantidade_total += item.quantidade_sugerida
    grupo.valor_total_estimado =
      Math.round((grupo.valor_total_estimado + item.custo_total_estimado) * 100) / 100
  })

  // Converter para array e ordenar (fornecedores com mais itens primeiro)
  const gruposArray = Array.from(gruposMap.values()).sort((a, b) => {
    if (a.fornecedor_id === 'sem_fornecedor') return 1
    if (b.fornecedor_id === 'sem_fornecedor') return -1
    return b.valor_total_estimado - a.valor_total_estimado
  })

  const quantidadeTotalSugerida = itensSugeridos.reduce((acc, i) => acc + i.quantidade_sugerida, 0)
  const valorTotalEstimado = itensSugeridos.reduce((acc, i) => acc + i.custo_total_estimado, 0)

  return {
    empresa_id: empresaId,
    total_produtos_analisados: produtos.length,
    total_itens_sugeridos: itensSugeridos.length,
    quantidade_total_sugerida: quantidadeTotalSugerida,
    valor_total_estimado: Math.round(valorTotalEstimado * 100) / 100,
    gruposPorFornecedor: gruposArray,
    itensGerais: itensSugeridos,
  }
}
