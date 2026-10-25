import pb from '@/lib/pocketbase/client'
import { saldoEmData, movimentarEstoque, ItemMovimentacaoEstoque } from '@/services/estoque'
import { Produto } from '@/services/produtos'
import { Lote } from '@/services/lotes'
import { Usuario } from '@/services/usuarios'

export type TipoInventario = 'Geral' | 'Parcial' | 'Anual (Bloco H)'
export type StatusInventario = 'Aberto' | 'Em contagem' | 'Finalizado' | 'Cancelado'

export const MOTIVOS_BLOCO_H = [
  '01 No final do período',
  '02 Na mudança de forma de tributação da mercadoria (ICMS)',
  '03 Na solicitação da baixa cadastral, paralisação temporária e outras situações',
  '04 Na alteração de regime de pagamento – condição do contribuinte',
  '05 Por determinação dos fiscos',
  '06 Para controle das mercadorias sujeitas ao regime de substituição tributária – restituição/ressarcimento/complementação',
] as const

export type MotivoBlocoH = (typeof MOTIVOS_BLOCO_H)[number]

export interface FiltrosInventarioParcial {
  grupo_id?: string
  categoria_id?: string
  marca_id?: string
  localizacao?: string
}

export interface Inventario {
  id: string
  empresa_id: string
  numero: number
  descricao: string
  data_referencia: string
  tipo: TipoInventario
  filtros_usados?: FiltrosInventarioParcial | null
  status: StatusInventario
  motivo_bloco_h?: MotivoBlocoH | string
  usuario_abertura_id?: string
  usuario_finalizacao_id?: string
  data_finalizacao?: string
  observacao?: string
  ativo?: boolean
  created?: string
  updated?: string
  created_by?: string
  updated_by?: string
  expand?: {
    usuario_abertura_id?: Usuario
    usuario_finalizacao_id?: Usuario
  }
}

export interface InventarioItem {
  id: string
  inventario_id: string
  produto_id: string
  lote_id?: string
  saldo_sistema: number
  quantidade_contada?: number | null
  diferenca?: number | null
  custo_unitario?: number | null
  valor_diferenca?: number | null
  contado_por?: string
  contado_em?: string
  ativo?: boolean
  created?: string
  updated?: string
  created_by?: string
  updated_by?: string
  expand?: {
    produto_id?: Produto
    lote_id?: Lote
    contado_por?: Usuario
  }
}

export interface AbrirInventarioInput {
  empresa_id: string
  descricao: string
  data_referencia: string
  tipo: TipoInventario
  filtros_usados?: FiltrosInventarioParcial
  motivo_bloco_h?: string
  observacao?: string
  incluir_zerados?: boolean
  usuario_id?: string
}

export interface FinalizarInventarioInput {
  inventario_id: string
  acao_itens_nao_contados: 'zerar' | 'manter_saldo'
  somente_registrar_posicao?: boolean
  usuario_id?: string
}

export interface RegistroH010Item {
  cod_item: string | number
  descricao: string
  unid: string
  qtd: number
  vl_unit: number
  vl_item: number
  ind_prop: '0'
  ncm?: string
}

export interface RegistroH005Totais {
  dt_inv: string
  vl_inv: number
  mot_inv: string
  itens: RegistroH010Item[]
}

/**
 * Lista inventários da empresa ativa com filtros
 */
export async function listarInventarios(params: {
  empresa_id: string
  status?: StatusInventario | 'todos'
  tipo?: TipoInventario | 'todos'
  busca?: string
  page?: number
  perPage?: number
}) {
  const conds: string[] = [`empresa_id = '${params.empresa_id}'`]

  if (params.status && params.status !== 'todos') {
    conds.push(`status = '${params.status}'`)
  }
  if (params.tipo && params.tipo !== 'todos') {
    conds.push(`tipo = '${params.tipo}'`)
  }
  if (params.busca) {
    const b = params.busca.replace(/'/g, "\\'")
    conds.push(`(descricao ~ '${b}' || observacao ~ '${b}')`)
  }

  return await pb
    .collection('inventarios')
    .getList<Inventario>(params.page || 1, params.perPage || 20, {
      filter: conds.join(' && '),
      sort: '-numero,-created',
      expand: 'usuario_abertura_id,usuario_finalizacao_id',
    })
}

/**
 * Obtém inventário por ID com expansão dos usuários
 */
export async function obterInventario(id: string): Promise<Inventario> {
  return await pb.collection('inventarios').getOne<Inventario>(id, {
    expand: 'usuario_abertura_id,usuario_finalizacao_id',
  })
}

/**
 * Lista itens de um inventário com produtos e lotes expandidos
 */
export async function listarItensInventario(inventarioId: string): Promise<InventarioItem[]> {
  return await pb.collection('inventarios_itens').getFullList<InventarioItem>({
    filter: `inventario_id = '${inventarioId}'`,
    sort: 'created',
    expand: 'produto_id,lote_id,contado_por',
  })
}

/**
 * Abre um novo inventário:
 * - Gera o registro do inventário
 * - Busca os produtos elegíveis (conforme tipo, filtros e se inclui produtos zerados)
 * - Congela o saldo_sistema na data de referência via saldoEmData
 * - Insere as linhas em inventarios_itens
 */
export async function abrirInventario(input: AbrirInventarioInput): Promise<Inventario> {
  const motivoBlocoH =
    input.tipo === 'Anual (Bloco H)'
      ? input.motivo_bloco_h || '01 No final do período'
      : input.motivo_bloco_h || '01 No final do período'

  // 1. Criar o cabeçalho do inventário (número gerado no backend pelo hook onRecordCreate)
  const novoInventario = await pb.collection('inventarios').create<Inventario>({
    empresa_id: input.empresa_id,
    descricao: input.descricao.trim(),
    data_referencia: input.data_referencia,
    tipo: input.tipo,
    filtros_usados: input.tipo === 'Parcial' ? input.filtros_usados || {} : null,
    status: 'Aberto',
    motivo_bloco_h: motivoBlocoH,
    usuario_abertura_id: input.usuario_id || null,
    observacao: input.observacao?.trim() || '',
    ativo: true,
  })

  // 2. Buscar produtos candidatos
  const condsProdutos: string[] = ['ativo = true', 'controla_estoque = true']

  if (input.tipo === 'Parcial' && input.filtros_usados) {
    const f = input.filtros_usados
    if (f.grupo_id) condsProdutos.push(`grupo_id = '${f.grupo_id}'`)
    if (f.categoria_id) condsProdutos.push(`categoria_id = '${f.categoria_id}'`)
    if (f.marca_id) condsProdutos.push(`marca_id = '${f.marca_id}'`)
    if (f.localizacao) {
      const loc = f.localizacao.replace(/'/g, "\\'")
      condsProdutos.push(`localizacao ~ '${loc}'`)
    }
  }

  const produtos = await pb.collection('produtos').getFullList<Produto>({
    filter: condsProdutos.join(' && '),
    sort: 'codigo,descricao',
  })

  // 3. Para cada produto, calcular saldo e custo na data de referência
  // Se incluir_zerados = false e saldo = 0, ignora
  for (const prod of produtos) {
    const posicao = await saldoEmData(input.empresa_id, prod.id, input.data_referencia)
    const saldoQtd = posicao.quantidade || 0
    const custo = posicao.custo_medio || prod.preco_custo || 0

    if (!input.incluir_zerados && saldoQtd === 0) {
      continue
    }

    await pb.collection('inventarios_itens').create({
      inventario_id: novoInventario.id,
      produto_id: prod.id,
      saldo_sistema: saldoQtd,
      quantidade_contada: null,
      diferenca: null,
      custo_unitario: custo,
      valor_diferenca: null,
      contado_por: null,
      contado_em: null,
      ativo: true,
    })
  }

  return novoInventario
}

/**
 * Atualiza a contagem de um item do inventário
 */
export async function registrarContagemItem(params: {
  itemId: string
  quantidade_contada: number
  saldo_sistema: number
  custo_unitario?: number
  usuario_id?: string
  inventario_id?: string
}): Promise<InventarioItem> {
  const diferenca = params.quantidade_contada - params.saldo_sistema
  const custo = params.custo_unitario || 0
  const valorDiferenca = Math.round(diferenca * custo * 100) / 100
  const agora = new Date().toISOString()

  const atualizado = await pb
    .collection('inventarios_itens')
    .update<InventarioItem>(params.itemId, {
      quantidade_contada: params.quantidade_contada,
      diferenca,
      valor_diferenca: valorDiferenca,
      contado_por: params.usuario_id || null,
      contado_em: agora,
    })

  // Se o inventário estava "Aberto", muda para "Em contagem"
  if (params.inventario_id) {
    try {
      const inv = await pb.collection('inventarios').getOne<Inventario>(params.inventario_id)
      if (inv.status === 'Aberto') {
        await pb.collection('inventarios').update(params.inventario_id, {
          status: 'Em contagem',
        })
      }
    } catch (e) {
      console.warn('Erro ao atualizar status do inventário para Em contagem:', e)
    }
  }

  return atualizado
}

/**
 * Bipar produto no inventário: soma 1 ou adiciona quantidade
 */
export async function biparProdutoInventario(params: {
  inventario_id: string
  produto_id: string
  incremento?: number
  usuario_id?: string
}): Promise<InventarioItem | null> {
  const itens = await pb.collection('inventarios_itens').getList<InventarioItem>(1, 1, {
    filter: `inventario_id = '${params.inventario_id}' && produto_id = '${params.produto_id}'`,
  })

  if (itens.items.length === 0) {
    return null
  }

  const item = itens.items[0]
  const contadaAtual =
    item.quantidade_contada !== null && item.quantidade_contada !== undefined
      ? item.quantidade_contada
      : 0
  const novaContada = contadaAtual + (params.incremento || 1)

  return await registrarContagemItem({
    itemId: item.id,
    quantidade_contada: novaContada,
    saldo_sistema: item.saldo_sistema,
    custo_unitario: item.custo_unitario || 0,
    usuario_id: params.usuario_id,
    inventario_id: params.inventario_id,
  })
}

/**
 * Finaliza o inventário:
 * - Trata itens não contados (zerar ou manter o saldo)
 * - Para tipo diferente de Anual ou quando somente_registrar_posicao = false, chama movimentarEstoque
 *   gerando INVENTARIO_ENTRADA (sobra) e INVENTARIO_SAIDA (falta)
 * - Atualiza status para Finalizado
 */
export async function finalizarInventario(input: FinalizarInventarioInput): Promise<{
  inventario: Inventario
  ajustesGerados: number
  totalSobra: number
  totalFalta: number
}> {
  const inv = await obterInventario(input.inventario_id)
  if (inv.status === 'Finalizado' || inv.status === 'Cancelado') {
    throw new Error(`Este inventário já está ${inv.status.toLowerCase()}.`)
  }

  const itens = await listarItensInventario(input.inventario_id)
  const agora = new Date().toISOString()

  let totalSobraQtd = 0
  let totalSobraVl = 0
  let totalFaltaQtd = 0
  let totalFaltaVl = 0

  const itensParaMovimentar: ItemMovimentacaoEstoque[] = []

  // Tratar cada item
  for (const item of itens) {
    let contada = item.quantidade_contada
    const custo = item.custo_unitario || 0

    // Item não contado
    if (contada === null || contada === undefined) {
      if (input.acao_itens_nao_contados === 'zerar') {
        contada = 0
      } else {
        contada = item.saldo_sistema
      }

      const diff = contada - item.saldo_sistema
      const valDiff = Math.round(diff * custo * 100) / 100

      await pb.collection('inventarios_itens').update(item.id, {
        quantidade_contada: contada,
        diferenca: diff,
        valor_diferenca: valDiff,
        contado_por: item.contado_por || input.usuario_id || null,
        contado_em: item.contado_em || agora,
      })
    }

    const diferencaFinal = contada - item.saldo_sistema

    if (diferencaFinal > 0) {
      totalSobraQtd += diferencaFinal
      totalSobraVl += Math.round(diferencaFinal * custo * 100) / 100
    } else if (diferencaFinal < 0) {
      const faltaQtd = Math.abs(diferencaFinal)
      totalFaltaQtd += faltaQtd
      totalFaltaVl += Math.round(faltaQtd * custo * 100) / 100
    }

    // Se NÃO for "somente registrar posição", prepara o movimento de estoque
    if (!input.somente_registrar_posicao && diferencaFinal !== 0) {
      const dataMov = inv.data_referencia.includes('T')
        ? inv.data_referencia
        : `${inv.data_referencia}T23:59:59.000Z`

      if (diferencaFinal > 0) {
        // Sobra física → INVENTARIO_ENTRADA
        itensParaMovimentar.push({
          empresa_id: inv.empresa_id,
          produto_id: item.produto_id,
          tipo: 'Entrada',
          origem: 'INVENTARIO_ENTRADA',
          quantidade: diferencaFinal,
          custo_unitario: custo,
          data_movimento: dataMov,
          documento_tipo: 'Inventário',
          documento_id: inv.id,
          documento_numero: `INV-${inv.numero}`,
          motivo: `Ajuste de sobra no inventário nº ${inv.numero} (${inv.descricao})`,
        })
      } else {
        // Falta física → INVENTARIO_SAIDA
        itensParaMovimentar.push({
          empresa_id: inv.empresa_id,
          produto_id: item.produto_id,
          tipo: 'Saída',
          origem: 'INVENTARIO_SAIDA',
          quantidade: Math.abs(diferencaFinal),
          custo_unitario: custo,
          data_movimento: dataMov,
          documento_tipo: 'Inventário',
          documento_id: inv.id,
          documento_numero: `INV-${inv.numero}`,
          motivo: `Ajuste de falta no inventário nº ${inv.numero} (${inv.descricao})`,
        })
      }
    }
  }

  // Se houver movimentações, chama o serviço central
  let movimentosGerados = 0
  if (itensParaMovimentar.length > 0) {
    const resMov = await movimentarEstoque(itensParaMovimentar)
    if (!resMov.sucesso) {
      throw new Error(`Falha ao gerar movimentações de estoque do inventário: ${resMov.message}`)
    }
    movimentosGerados = resMov.total
  }

  // Atualiza o inventário para Finalizado
  const atualizado = await pb.collection('inventarios').update<Inventario>(inv.id, {
    status: 'Finalizado',
    data_finalizacao: agora,
    usuario_finalizacao_id: input.usuario_id || null,
  })

  return {
    inventario: atualizado,
    ajustesGerados: movimentosGerados,
    totalSobra: totalSobraVl,
    totalFalta: totalFaltaVl,
  }
}

/**
 * Cancela o inventário (somente antes de finalizar)
 */
export async function cancelarInventario(id: string): Promise<Inventario> {
  const inv = await obterInventario(id)
  if (inv.status === 'Finalizado') {
    throw new Error('Não é possível cancelar um inventário que já foi finalizado.')
  }
  return await pb.collection('inventarios').update<Inventario>(id, {
    status: 'Cancelado',
  })
}

/**
 * Prepara dados no formato oficial do Registro H010 e H005 do SPED Fiscal
 */
export async function obterDadosSpedBlocoH(inventarioId: string): Promise<RegistroH005Totais> {
  const inv = await obterInventario(inventarioId)
  const itens = await listarItensInventario(inventarioId)

  let valorTotalInventario = 0
  const itensH010: RegistroH010Item[] = []

  for (const it of itens) {
    const prod = it.expand?.produto_id
    const qtd =
      it.quantidade_contada !== null && it.quantidade_contada !== undefined
        ? it.quantidade_contada
        : inv.status === 'Finalizado'
          ? 0
          : it.saldo_sistema
    if (qtd <= 0 && inv.status === 'Finalizado') {
      continue
    }
    const vlUnit = it.custo_unitario || 0
    const vlItem = Math.round(qtd * vlUnit * 100) / 100

    valorTotalInventario += vlItem

    // Unidade de medida
    let unidSigla = 'UN'
    if (prod?.expand?.unidade_id?.sigla) {
      unidSigla = prod.expand.unidade_id.sigla
    }

    itensH010.push({
      cod_item: prod?.codigo || it.produto_id,
      descricao: prod?.descricao || 'Produto',
      unid: unidSigla,
      qtd,
      vl_unit: vlUnit,
      vl_item: vlItem,
      ind_prop: '0',
      ncm: prod?.ncm || '',
    })
  }

  // Código motivo Bloco H (ex: "01 No final do período" -> "01")
  const motCodigo = (inv.motivo_bloco_h || '01').slice(0, 2)

  // Data formatada ddmmaaaa para o SPED
  const dataLimpa = inv.data_referencia.slice(0, 10).replace(/-/g, '')
  const ddmmaaaa =
    dataLimpa.length === 8
      ? `${dataLimpa.slice(6, 8)}${dataLimpa.slice(4, 6)}${dataLimpa.slice(0, 4)}`
      : inv.data_referencia

  return {
    dt_inv: ddmmaaaa,
    vl_inv: Math.round(valorTotalInventario * 100) / 100,
    mot_inv: motCodigo,
    itens: itensH010,
  }
}

/**
 * Exporta CSV do inventário físico padrão
 */
export function gerarCsvInventario(
  inventario: Inventario,
  itens: InventarioItem[],
  modoCego = false,
): string {
  const cabecalho = [
    'Código',
    'Descrição',
    'Unidade',
    'NCM',
    ...(modoCego ? [] : ['Saldo Sistema']),
    'Qtd Contada',
    ...(modoCego ? [] : ['Diferença', 'Custo Unitário (R$)', 'Valor Total (R$)']),
    'Contado Por',
    'Data Contagem',
  ]

  const linhas = itens.map((it) => {
    const prod = it.expand?.produto_id
    const user = it.expand?.contado_por
    const qtdContada =
      it.quantidade_contada !== null && it.quantidade_contada !== undefined
        ? it.quantidade_contada
        : ''
    const custo = it.custo_unitario || 0
    const qtdFinal =
      it.quantidade_contada !== null && it.quantidade_contada !== undefined
        ? it.quantidade_contada
        : it.saldo_sistema
    const vlTotal = Math.round(qtdFinal * custo * 100) / 100

    const row = [
      `"${prod?.codigo || ''}"`,
      `"${(prod?.descricao || '').replace(/"/g, '""')}"`,
      `"${prod?.expand?.unidade_id?.sigla || 'UN'}"`,
      `"${prod?.ncm || ''}"`,
    ]

    if (!modoCego) {
      row.push(it.saldo_sistema.toFixed(4).replace('.', ','))
    }

    row.push(qtdContada !== '' ? Number(qtdContada).toFixed(4).replace('.', ',') : '')

    if (!modoCego) {
      row.push(
        it.diferenca !== null && it.diferenca !== undefined
          ? it.diferenca.toFixed(4).replace('.', ',')
          : '',
      )
      row.push(custo.toFixed(4).replace('.', ','))
      row.push(vlTotal.toFixed(2).replace('.', ','))
    }

    row.push(`"${user?.nome || ''}"`)
    row.push(`"${it.contado_em ? new Date(it.contado_em).toLocaleString('pt-BR') : ''}"`)

    return row.join(';')
  })

  return [cabecalho.join(';'), ...linhas].join('\r\n')
}

/**
 * Exporta CSV do inventário no formato SPED Fiscal Bloco H (H005 e H010)
 */
export function gerarCsvSpedBlocoH(dados: RegistroH005Totais): string {
  const linhas: string[] = []

  // Linha de cabeçalho explicativo
  linhas.push('REGISTRO;CAMPO_1;CAMPO_2;CAMPO_3;CAMPO_4;CAMPO_5;CAMPO_6;CAMPO_7')
  // Linha H005 (Totais do Inventário)
  // Formato Guia Prático: |H005|DT_INV|VL_INV|MOT_INV|
  linhas.push(
    `H005;${dados.dt_inv};${dados.vl_inv.toFixed(2).replace('.', ',')};${dados.mot_inv};;;;`,
  )

  // Linhas H010 (Itens do Inventário)
  // Formato Guia Prático: |H010|COD_ITEM|UNID|QTD|VL_UNIT|VL_ITEM|IND_PROP|COD_PART|TXT_COMPL|COD_CTA|
  dados.itens.forEach((it) => {
    linhas.push(
      `H010;${it.cod_item};${it.unid};${it.qtd.toFixed(4).replace('.', ',')};${it.vl_unit.toFixed(4).replace('.', ',')};${it.vl_item.toFixed(2).replace('.', ',')};0;`,
    )
  })

  return linhas.join('\r\n')
}
