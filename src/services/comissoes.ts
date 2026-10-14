import pb from '@/lib/pocketbase/client'

export interface ItemComissaoVendedor {
  vendedor_id: string
  vendedor_nome: string
  vendedor_email?: string
  percentual_comissao: number
  total_vendas_bruto: number
  total_devolucoes: number
  base_calculo: number
  valor_comissao: number
  quantidade_vendas: number
  quantidade_devolucoes: number
  vendas_detalhe: VendaComissaoDetalhe[]
}

export interface VendaComissaoDetalhe {
  venda_id: string
  numero: number
  data_emissao: string
  cliente_nome: string
  tipo: string
  valor_venda: number
  valor_devolucao: number
  base_comissao: number
  valor_comissao: number
  status_recebimento?: 'Recebido total' | 'Pendente' | 'Parcial'
}

export interface FiltrosComissao {
  empresa_id: string
  data_inicio: string
  data_fim: string
  vendedor_id?: string
  base_calculo: 'Venda finalizada' | 'Venda recebida'
}

/**
 * Apura comissões por vendedor no período selecionado, descontando as devoluções.
 */
export async function apurarComissoes(filtros: FiltrosComissao): Promise<ItemComissaoVendedor[]> {
  const { empresa_id, data_inicio, data_fim, vendedor_id, base_calculo } = filtros

  // 1. Carregar todos os usuários vendedores ativos
  let condsVendedores = ['ativo = true']
  if (vendedor_id && vendedor_id !== 'todos') {
    condsVendedores.push(`id = '${vendedor_id}'`)
  }

  const usuariosList = await pb.collection('usuarios').getFullList({
    filter: condsVendedores.join(' && '),
    sort: 'name',
  })

  const mapaVendedores = new Map<string, (typeof usuariosList)[0]>()
  usuariosList.forEach((u) => mapaVendedores.set(u.id, u))

  // 2. Buscar vendas no período (tanto Venda normal quanto Devolução)
  const condsVendas = [
    `empresa_id = '${empresa_id}'`,
    'ativo = true',
    `status = 'Finalizada'`,
    `data_emissao >= '${data_inicio}'`,
    `data_emissao <= '${data_fim}'`,
  ]

  if (vendedor_id && vendedor_id !== 'todos') {
    condsVendas.push(`vendedor_id = '${vendedor_id}'`)
  }

  const vendasPeriodo = await pb.collection('vendas').getFullList({
    filter: condsVendas.join(' && '),
    sort: 'data_emissao,numero',
    expand: 'cliente_id,vendedor_id,venda_origem_id',
  })

  // Se base for "Venda recebida", precisamos buscar o status de recebimento dos títulos em contas_receber
  const titulosPorVenda = new Map<string, { total: number; recebido: number }>()
  if (base_calculo === 'Venda recebida') {
    const titulos = await pb.collection('contas_receber').getFullList({
      filter: `empresa_id = '${empresa_id}' && ativo = true`,
      fields: 'origem_id,valor_original,valor_recebido,saldo,status',
    })

    titulos.forEach((t) => {
      const vId = (t as any).origem_id
      if (vId) {
        const atual = titulosPorVenda.get(vId) || { total: 0, recebido: 0 }
        atual.total += Number((t as any).valor_original) || 0
        atual.recebido += Number((t as any).valor_recebido) || 0
        titulosPorVenda.set(vId, atual)
      }
    })
  }

  // 3. Agrupar por vendedor
  const acumuladorPorVendedor = new Map<string, ItemComissaoVendedor>()

  // Inicializa com vendedores que possuem comissão cadastrada
  for (const u of usuariosList) {
    const pct = Number((u as any).comissao_percentual) || 0
    acumuladorPorVendedor.set(u.id, {
      vendedor_id: u.id,
      vendedor_nome: (u as any).name || (u as any).email || 'Vendedor',
      vendedor_email: (u as any).email,
      percentual_comissao: pct,
      total_vendas_bruto: 0,
      total_devolucoes: 0,
      base_calculo: 0,
      valor_comissao: 0,
      quantidade_vendas: 0,
      quantidade_devolucoes: 0,
      vendas_detalhe: [],
    })
  }

  // Processar vendas e devoluções
  for (const v of vendasPeriodo) {
    const vId = (v as any).vendedor_id
    if (!vId) continue

    let itemVend = acumuladorPorVendedor.get(vId)
    if (!itemVend) {
      const uRec = (v.expand as any)?.vendedor_id
      const pct = Number(uRec?.comissao_percentual) || 0
      itemVend = {
        vendedor_id: vId,
        vendedor_nome: uRec?.name || uRec?.email || 'Vendedor',
        vendedor_email: uRec?.email,
        percentual_comissao: pct,
        total_vendas_bruto: 0,
        total_devolucoes: 0,
        base_calculo: 0,
        valor_comissao: 0,
        quantidade_vendas: 0,
        quantidade_devolucoes: 0,
        vendas_detalhe: [],
      }
      acumuladorPorVendedor.set(vId, itemVend)
    }

    const tipo = (v as any).tipo || 'Pedido'
    const valorTotal = Number((v as any).valor_total) || 0
    const clienteExpand = (v.expand as any)?.cliente_id
    const clienteNome =
      clienteExpand?.nome_razao_social ||
      clienteExpand?.nome ||
      (v as any).cpf_cnpj_consumidor ||
      'Consumidor'

    if (tipo === 'Devolução') {
      itemVend.total_devolucoes += valorTotal
      itemVend.quantidade_devolucoes += 1

      const comissaoEstorno = Number((valorTotal * (itemVend.percentual_comissao / 100)).toFixed(2))

      itemVend.vendas_detalhe.push({
        venda_id: v.id,
        numero: Number((v as any).numero) || 0,
        data_emissao: (v as any).data_emissao || (v.created ? v.created.slice(0, 10) : ''),
        cliente_nome: clienteNome,
        tipo: 'Devolução',
        valor_venda: 0,
        valor_devolucao: valorTotal,
        base_comissao: -valorTotal,
        valor_comissao: -comissaoEstorno,
      })
    } else {
      // Venda normal (Pedido, PDV etc.)
      let baseVenda = valorTotal
      let statusReceb: 'Recebido total' | 'Pendente' | 'Parcial' = 'Recebido total'

      if (base_calculo === 'Venda recebida') {
        const infoTit = titulosPorVenda.get(v.id)
        if (infoTit) {
          baseVenda = Math.min(valorTotal, infoTit.recebido)
          if (infoTit.recebido <= 0.009) {
            statusReceb = 'Pendente'
          } else if (infoTit.recebido < infoTit.total - 0.01) {
            statusReceb = 'Parcial'
          }
        }
      }

      itemVend.total_vendas_bruto += valorTotal
      itemVend.quantidade_vendas += 1

      const comissaoItem = Number((baseVenda * (itemVend.percentual_comissao / 100)).toFixed(2))

      itemVend.vendas_detalhe.push({
        venda_id: v.id,
        numero: Number((v as any).numero) || 0,
        data_emissao: (v as any).data_emissao || (v.created ? v.created.slice(0, 10) : ''),
        cliente_nome: clienteNome,
        tipo,
        valor_venda: valorTotal,
        valor_devolucao: 0,
        base_comissao: baseVenda,
        valor_comissao: comissaoItem,
        status_recebimento: statusReceb,
      })
    }
  }

  // 4. Calcular bases líquidas e comissão final de cada vendedor
  const resultado: ItemComissaoVendedor[] = []

  for (const item of acumuladorPorVendedor.values()) {
    // Se não teve vendas nem devoluções e nem percentual, omite se filtro específico não foi pedido
    if (
      item.quantidade_vendas === 0 &&
      item.quantidade_devolucoes === 0 &&
      (!vendedor_id || vendedor_id === 'todos')
    ) {
      continue
    }

    const baseLiq = Math.max(0, item.total_vendas_bruto - item.total_devolucoes)
    item.base_calculo = Number(baseLiq.toFixed(2))
    item.total_vendas_bruto = Number(item.total_vendas_bruto.toFixed(2))
    item.total_devolucoes = Number(item.total_devolucoes.toFixed(2))
    item.valor_comissao = Number((item.base_calculo * (item.percentual_comissao / 100)).toFixed(2))

    // Ordenar vendas detalhe por data decrescente
    item.vendas_detalhe.sort((a, b) => b.numero - a.numero)

    resultado.push(item)
  }

  resultado.sort((a, b) => b.valor_comissao - a.valor_comissao)

  return resultado
}

/**
 * Cria título em contas_pagar no plano 2.5.01 "Comissões" com o vendedor como fornecedor.
 * Se o fornecedor não existir para o vendedor, cria-o automaticamente a partir dos dados do usuário.
 */
export async function gerarContaPagarComissao(params: {
  empresa_id: string
  vendedor_id: string
  valor_comissao: number
  data_vencimento: string
  periodo_referencia: string
}): Promise<{ conta_pagar_id: string; fornecedor_id: string }> {
  const { empresa_id, vendedor_id, valor_comissao, data_vencimento, periodo_referencia } = params

  if (valor_comissao <= 0) {
    throw new Error('O valor da comissão deve ser maior que zero.')
  }

  // 1. Obter dados do vendedor
  const usuario = await pb.collection('usuarios').getOne(vendedor_id)
  const nomeVendedor = (usuario as any).name || 'Vendedor'
  const cpfVendedor = (usuario as any).cpf || (usuario as any).cpf_cnpj || ''
  const emailVendedor = (usuario as any).email || ''

  // 2. Buscar ou criar fornecedor para este vendedor
  let fornecedorId = ''
  try {
    const achados = await pb.collection('fornecedores').getList(1, 1, {
      filter: `ativo = true && (nome ~ '${nomeVendedor}' || razao_social ~ '${nomeVendedor}' || email = '${emailVendedor}')`,
    })
    if (achados.items.length > 0) {
      fornecedorId = achados.items[0].id
    }
  } catch {
    //
  }

  if (!fornecedorId) {
    // Criar fornecedor
    const novoForn = await pb.collection('fornecedores').create({
      nome: nomeVendedor,
      razao_social: nomeVendedor,
      tipo_pessoa: cpfVendedor && cpfVendedor.replace(/\D/g, '').length > 11 ? 'PJ' : 'PF',
      cpf_cnpj: cpfVendedor || undefined,
      email: emailVendedor || undefined,
      ativo: true,
      observacao: `Fornecedor criado automaticamente para pagamento de comissão (Usuário ID: ${vendedor_id})`,
    })
    fornecedorId = novoForn.id
  }

  // 3. Buscar conta analítica 2.5.01 Comissões
  let planoComissaoId = ''
  try {
    const cRec = await pb
      .collection('plano_contas')
      .getFirstListItem("codigo = '2.5.01' && ativo = true")
    planoComissaoId = cRec.id
  } catch {
    const cRec = await pb
      .collection('plano_contas')
      .getFirstListItem("grupo_dre = 'Despesas operacionais' && ativo = true")
    planoComissaoId = cRec.id
  }

  const hojeIso = new Date().toISOString().slice(0, 10)
  const numeroDoc = `COM-${periodo_referencia.replace(/\D/g, '')}-${Date.now().toString().slice(-4)}`

  // 4. Criar registro em contas_pagar
  const authUserId = pb.authStore.record?.id || undefined
  const contaPagar = await pb.collection('contas_pagar').create({
    empresa_id,
    fornecedor_id: fornecedorId,
    numero_documento: numeroDoc,
    descricao: `Comissão de Vendas - ${nomeVendedor} (${periodo_referencia})`,
    data_emissao: hojeIso,
    data_competencia: hojeIso,
    data_vencimento,
    valor_original: valor_comissao,
    saldo: valor_comissao,
    valor_pago: 0,
    status: 'Em aberto',
    plano_conta_id: planoComissaoId,
    ativo: true,
    created_by: authUserId,
  })

  return {
    conta_pagar_id: contaPagar.id,
    fornecedor_id: fornecedorId,
  }
}

/**
 * Exporta listagem de comissões em formato CSV (pt-BR)
 */
export function exportarComissoesCsv(comissoes: ItemComissaoVendedor[], periodo: string): string {
  const formatarValor = (v: number) => v.toFixed(2).replace('.', ',')
  const linhas: string[] = []

  linhas.push(`RELATÓRIO DE COMISSÕES DE VENDAS - PERÍODO: ${periodo}`)
  linhas.push('')
  linhas.push(
    'Vendedor;E-mail;% Comissão;Total Vendas (R$);Devoluções (R$);Base Líquida (R$);Comissão (R$);Qtd Vendas;Qtd Devoluções',
  )

  for (const c of comissoes) {
    linhas.push(
      [
        `"${c.vendedor_nome}"`,
        `"${c.vendedor_email || ''}"`,
        formatarValor(c.percentual_comissao),
        formatarValor(c.total_vendas_bruto),
        formatarValor(c.total_devolucoes),
        formatarValor(c.base_calculo),
        formatarValor(c.valor_comissao),
        c.quantidade_vendas,
        c.quantidade_devolucoes,
      ].join(';'),
    )
  }

  return linhas.join('\r\n')
}
