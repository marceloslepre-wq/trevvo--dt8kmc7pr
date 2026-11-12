import pb from '@/lib/pocketbase/client'
import { salvarFornecedor } from '@/services/fornecedores'
import { montarFiltroEmpresas } from '@/services/filtroMultiempresa'

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
  /** Quebra do vendedor por empresa (um vendedor pode vender em mais de uma empresa) */
  por_empresa: VendaComissaoPorEmpresa[]
}

export interface VendaComissaoPorEmpresa {
  empresa_id: string
  total_vendas_bruto: number
  total_devolucoes: number
  base_calculo: number
  valor_comissao: number
  quantidade_vendas: number
  quantidade_devolucoes: number
}

export interface TotaisComissaoPorEmpresa {
  empresa_id: string
  total_vendas_bruto: number
  total_devolucoes: number
  base_calculo: number
  valor_comissao: number
  quantidade_vendas: number
  quantidade_devolucoes: number
  quantidade_vendedores: number
}

export interface ApuracaoComissoesResultado {
  /** Lista consolidada por vendedor (o total dele soma todas as empresas) */
  comissoes: ItemComissaoVendedor[]
  /** Quebra por empresa (painel "Totais por Empresa") */
  totais_por_empresa: TotaisComissaoPorEmpresa[]
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
  empresa_id?: string
  status_recebimento?: 'Recebido total' | 'Pendente' | 'Parcial'
}

export interface FiltrosComissao {
  /** Lista de empresas marcadas no filtro (multiempresa) */
  empresa_ids?: string[]
  /** @deprecated legado: use empresa_ids (multiempresa) */
  empresa_id?: string
  data_inicio: string
  data_fim: string
  vendedor_id?: string
  base_calculo: 'Venda finalizada' | 'Venda recebida'
}

/** Normaliza a lista de empresas do filtro (aceita o legado empresa_id singular) */
export function normalizarEmpresasComissao(filtros: FiltrosComissao): string[] {
  const plural = (filtros.empresa_ids || []).filter(Boolean)
  if (plural.length > 0) return plural
  return filtros.empresa_id ? [filtros.empresa_id] : []
}

/**
 * Apura comissões por vendedor no período selecionado, descontando as devoluções.
 */
export async function apurarComissoes(filtros: FiltrosComissao): Promise<ItemComissaoVendedor[]> {
  const res = await apurarComissoesDetalhado(filtros)
  return res.comissoes
}

/**
 * Apuração completa: comissões por vendedor + quebra por empresa.
 * As vendas respeitam TODAS as empresas marcadas no filtro (filtro OR),
 * sempre dentro das regras de acesso (assinante_id) das coleções.
 */
export async function apurarComissoesDetalhado(
  filtros: FiltrosComissao,
): Promise<ApuracaoComissoesResultado> {
  const { data_inicio, data_fim, vendedor_id, base_calculo } = filtros
  const empresaIds = normalizarEmpresasComissao(filtros)

  if (empresaIds.length === 0) {
    return { comissoes: [], totais_por_empresa: [] }
  }

  const filtroEmpresa = montarFiltroEmpresas(empresaIds)

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
    filtroEmpresa,
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
      filter: `${filtroEmpresa} && ativo = true`,
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

  // 3. Agrupar por vendedor (consolidado) e por vendedor dentro de cada empresa
  const acumuladorPorVendedor = new Map<string, ItemComissaoVendedor>()

  const criarItemVendedor = (u: any): ItemComissaoVendedor => ({
    vendedor_id: u.id,
    vendedor_nome: u?.name || u?.email || 'Vendedor',
    vendedor_email: u?.email,
    percentual_comissao: Number(u?.comissao_percentual) || 0,
    total_vendas_bruto: 0,
    total_devolucoes: 0,
    base_calculo: 0,
    valor_comissao: 0,
    quantidade_vendas: 0,
    quantidade_devolucoes: 0,
    vendas_detalhe: [],
    por_empresa: [],
  })

  // Inicializa com vendedores que possuem comissão cadastrada
  for (const u of usuariosList) {
    acumuladorPorVendedor.set(u.id, criarItemVendedor(u))
  }

  // Processar vendas e devoluções
  for (const v of vendasPeriodo) {
    const vId = (v as any).vendedor_id
    if (!vId) continue
    const empId = (v as any).empresa_id || '(sem empresa)'

    let itemVend = acumuladorPorVendedor.get(vId)
    if (!itemVend) {
      const uRec = (v.expand as any)?.vendedor_id
      itemVend = criarItemVendedor(uRec)
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

    const ehDevolucao = tipo === 'Devolução'

    let baseVenda = valorTotal
    let statusReceb: 'Recebido total' | 'Pendente' | 'Parcial' = 'Recebido total'

    if (!ehDevolucao && base_calculo === 'Venda recebida') {
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

    const comissaoItem = Number((baseVenda * (itemVend.percentual_comissao / 100)).toFixed(2))

    if (ehDevolucao) {
      itemVend.total_devolucoes += valorTotal
      itemVend.quantidade_devolucoes += 1
      itemVend.vendas_detalhe.push({
        venda_id: v.id,
        numero: Number((v as any).numero) || 0,
        data_emissao: (v as any).data_emissao || (v.created ? v.created.slice(0, 10) : ''),
        cliente_nome: clienteNome,
        tipo: 'Devolução',
        valor_venda: 0,
        valor_devolucao: valorTotal,
        base_comissao: -valorTotal,
        valor_comissao: -comissaoItem,
        empresa_id: empId,
      })
    } else {
      // Venda normal (Pedido, PDV etc.)
      itemVend.total_vendas_bruto += valorTotal
      itemVend.quantidade_vendas += 1
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
        empresa_id: empId,
        status_recebimento: statusReceb,
      })
    }

    // Quebra do vendedor por empresa
    let quebra = itemVend.por_empresa.find((q) => q.empresa_id === empId)
    if (!quebra) {
      quebra = {
        empresa_id: empId,
        total_vendas_bruto: 0,
        total_devolucoes: 0,
        base_calculo: 0,
        valor_comissao: 0,
        quantidade_vendas: 0,
        quantidade_devolucoes: 0,
      }
      itemVend.por_empresa.push(quebra)
    }
    if (ehDevolucao) {
      quebra.total_devolucoes += valorTotal
      quebra.quantidade_devolucoes += 1
    } else {
      quebra.total_vendas_bruto += valorTotal
      quebra.quantidade_vendas += 1
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

    // Fechar a quebra por empresa do vendedor
    for (const q of item.por_empresa) {
      const baseLiqEmp = Math.max(0, q.total_vendas_bruto - q.total_devolucoes)
      q.base_calculo = Number(baseLiqEmp.toFixed(2))
      q.total_vendas_bruto = Number(q.total_vendas_bruto.toFixed(2))
      q.total_devolucoes = Number(q.total_devolucoes.toFixed(2))
      q.valor_comissao = Number((q.base_calculo * (item.percentual_comissao / 100)).toFixed(2))
    }
    item.por_empresa.sort((a, b) => b.base_calculo - a.base_calculo)

    // Ordenar vendas detalhe por data decrescente
    item.vendas_detalhe.sort((a, b) => b.numero - a.numero)

    resultado.push(item)
  }

  resultado.sort((a, b) => b.valor_comissao - a.valor_comissao)

  // 5. Quebra por empresa (painel "Totais por Empresa"), a partir dos detalhes
  const mapaEmpresa = new Map<string, TotaisComissaoPorEmpresa>()
  for (const item of resultado) {
    for (const q of item.por_empresa) {
      const chave = q.empresa_id || '(sem empresa)'
      const atual = mapaEmpresa.get(chave) || {
        empresa_id: chave,
        total_vendas_bruto: 0,
        total_devolucoes: 0,
        base_calculo: 0,
        valor_comissao: 0,
        quantidade_vendas: 0,
        quantidade_devolucoes: 0,
        quantidade_vendedores: 0,
      }
      atual.total_vendas_bruto += q.total_vendas_bruto
      atual.total_devolucoes += q.total_devolucoes
      atual.base_calculo += q.base_calculo
      atual.valor_comissao += q.valor_comissao
      atual.quantidade_vendas += q.quantidade_vendas
      atual.quantidade_devolucoes += q.quantidade_devolucoes
      atual.quantidade_vendedores += 1
      mapaEmpresa.set(chave, atual)
    }
  }

  const totaisPorEmpresa = Array.from(mapaEmpresa.values())
    .map((t) => ({
      ...t,
      total_vendas_bruto: Number(t.total_vendas_bruto.toFixed(2)),
      total_devolucoes: Number(t.total_devolucoes.toFixed(2)),
      base_calculo: Number(t.base_calculo.toFixed(2)),
      valor_comissao: Number(t.valor_comissao.toFixed(2)),
    }))
    .sort((a, b) => b.base_calculo - a.base_calculo)

  return { comissoes: resultado, totais_por_empresa: totaisPorEmpresa }
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
    // Criar fornecedor passando pelo serviço corrigido com assinante_id
    const tipoPessoa =
      cpfVendedor && cpfVendedor.replace(/\D/g, '').length > 11 ? 'Jurídica' : 'Física'
    const novoForn = await salvarFornecedor({
      nome_fantasia: nomeVendedor,
      razao_social: nomeVendedor,
      tipo_pessoa: tipoPessoa,
      cpf_cnpj: cpfVendedor || undefined,
      email: emailVendedor || undefined,
      ativo: true,
      observacoes: `Fornecedor criado automaticamente para pagamento de comissão (Usuário ID: ${vendedor_id})`,
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
