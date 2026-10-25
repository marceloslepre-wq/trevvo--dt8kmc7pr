import pb from '@/lib/pocketbase/client'
import { Empresa } from '@/services/empresas'
import { Produto } from '@/services/produtos'
import { Lote } from '@/services/lotes'
import { Usuario } from '@/services/usuarios'
import {
  movimentarEstoque,
  estornarMovimento,
  ItemMovimentacaoEstoque,
  EstoqueMovimento,
} from '@/services/estoque'
import { registrarAuditoria } from '@/services/auditoria'

export type StatusTransferencia = 'Rascunho' | 'Enviada' | 'Recebida' | 'Cancelada'

export interface Transferencia {
  id: string
  numero: number
  empresa_origem_id: string
  empresa_destino_id: string
  data_envio?: string
  data_recebimento?: string
  status: StatusTransferencia
  nota_fiscal_numero?: string
  nota_fiscal_chave?: string
  observacao?: string
  usuario_envio_id?: string
  usuario_recebimento_id?: string
  ativo: boolean
  created?: string
  updated?: string
  created_by?: string
  updated_by?: string
  expand?: {
    empresa_origem_id?: Empresa
    empresa_destino_id?: Empresa
    usuario_envio_id?: Usuario
    usuario_recebimento_id?: Usuario
  }
}

export interface TransferenciaItem {
  id: string
  transferencia_id: string
  produto_id: string
  lote_id?: string
  quantidade: number
  custo_unitario: number
  quantidade_recebida: number
  divergencia: number
  ativo: boolean
  created?: string
  updated?: string
  created_by?: string
  updated_by?: string
  expand?: {
    produto_id?: Produto
    lote_id?: Lote
  }
}

export interface TransferenciaCompleta extends Transferencia {
  itens: TransferenciaItem[]
}

export interface ListarTransferenciasParams {
  empresaId: string
  status?: string
  empresaOrigemId?: string
  empresaDestinoId?: string
  dataInicio?: string
  dataFim?: string
  busca?: string
  pagina?: number
  itensPorPagina?: number
}

export interface ResultadoPaginadoTransferencias {
  items: Transferencia[]
  totalItems: number
  page: number
  perPage: number
  totalPages: number
}

export interface NovoItemTransferenciaInput {
  id?: string
  produto_id: string
  lote_id?: string
  quantidade: number
  custo_unitario?: number
}

export interface SalvarRascunhoTransferenciaInput {
  id?: string
  empresa_origem_id: string
  empresa_destino_id: string
  observacao?: string
  nota_fiscal_numero?: string
  nota_fiscal_chave?: string
  itens: NovoItemTransferenciaInput[]
}

/**
 * Conta quantas transferências estão Enviadas aguardando recebimento na empresa ativa
 */
export async function contarTransferenciasAguardandoRecebimento(
  empresaDestinoId: string,
): Promise<number> {
  if (!empresaDestinoId) return 0
  try {
    const res = await pb.collection('transferencias').getList(1, 1, {
      filter: `empresa_destino_id = '${empresaDestinoId}' && status = 'Enviada' && ativo != false`,
    })
    return res.totalItems
  } catch (err) {
    console.error('Erro ao contar transferencias aguardando recebimento:', err)
    return 0
  }
}

/**
 * Lista transferências envolvendo a empresa ativa (como origem ou como destino)
 */
export async function listarTransferencias(
  params: ListarTransferenciasParams,
): Promise<ResultadoPaginadoTransferencias> {
  const {
    empresaId,
    status,
    empresaOrigemId,
    empresaDestinoId,
    dataInicio,
    dataFim,
    busca,
    pagina = 1,
    itensPorPagina = 20,
  } = params

  const filters: string[] = ['ativo != false']

  if (empresaOrigemId && empresaDestinoId) {
    filters.push(
      `empresa_origem_id = '${empresaOrigemId}' && empresa_destino_id = '${empresaDestinoId}'`,
    )
  } else if (empresaOrigemId) {
    filters.push(`empresa_origem_id = '${empresaOrigemId}'`)
  } else if (empresaDestinoId) {
    filters.push(`empresa_destino_id = '${empresaDestinoId}'`)
  } else if (empresaId) {
    // Empresa ativa vê as que enviou ou que tem para receber
    filters.push(`(empresa_origem_id = '${empresaId}' || empresa_destino_id = '${empresaId}')`)
  }

  if (status && status !== 'todos') {
    filters.push(`status = '${status}'`)
  }

  if (dataInicio) {
    filters.push(`created >= '${dataInicio} 00:00:00'`)
  }
  if (dataFim) {
    filters.push(`created <= '${dataFim} 23:59:59'`)
  }

  if (busca && busca.trim()) {
    const b = busca.trim()
    const num = parseInt(b, 10)
    if (!isNaN(num)) {
      filters.push(`(numero = ${num} || observacao ~ '${b}' || nota_fiscal_numero ~ '${b}')`)
    } else {
      filters.push(
        `(observacao ~ '${b}' || nota_fiscal_numero ~ '${b}' || nota_fiscal_chave ~ '${b}')`,
      )
    }
  }

  const res = await pb.collection('transferencias').getList<Transferencia>(pagina, itensPorPagina, {
    filter: filters.join(' && '),
    sort: '-created',
    expand: 'empresa_origem_id,empresa_destino_id,usuario_envio_id,usuario_recebimento_id',
  })

  return {
    items: res.items,
    totalItems: res.totalItems,
    page: res.page,
    perPage: res.perPage,
    totalPages: res.totalPages,
  }
}

/**
 * Obtém uma transferência por ID com seus itens completos e expansões
 */
export async function obterTransferenciaPorId(id: string): Promise<TransferenciaCompleta> {
  const transf = await pb.collection('transferencias').getOne<Transferencia>(id, {
    expand: 'empresa_origem_id,empresa_destino_id,usuario_envio_id,usuario_recebimento_id',
  })

  const itensRes = await pb.collection('transferencias_itens').getFullList<TransferenciaItem>({
    filter: `transferencia_id = '${id}' && ativo != false`,
    expand: 'produto_id,produto_id.unidade_id,lote_id',
  })

  return {
    ...transf,
    itens: itensRes,
  }
}

/**
 * Salva ou atualiza uma transferência no status Rascunho
 */
export async function salvarRascunhoTransferencia(
  input: SalvarRascunhoTransferenciaInput,
  usuarioERPId?: string,
): Promise<TransferenciaCompleta> {
  if (input.empresa_origem_id === input.empresa_destino_id) {
    throw new Error('A empresa de destino deve ser diferente da empresa de origem.')
  }

  if (!input.itens || input.itens.length === 0) {
    throw new Error('Adicione ao menos um produto à transferência.')
  }

  let transfId = input.id
  let numero = 0
  const isNovo = !transfId

  if (isNovo) {
    const criada = await pb.collection('transferencias').create<Transferencia>({
      empresa_origem_id: input.empresa_origem_id,
      empresa_destino_id: input.empresa_destino_id,
      status: 'Rascunho',
      observacao: input.observacao || '',
      nota_fiscal_numero: input.nota_fiscal_numero || '',
      nota_fiscal_chave: input.nota_fiscal_chave || '',
      ativo: true,
    })
    transfId = criada.id
    numero = criada.numero

    await registrarAuditoria({
      acao: 'inclusao',
      tabela: 'transferencias',
      registro_id: transfId,
      empresa_id: input.empresa_origem_id,
      valores_depois: {
        numero,
        empresa_destino_id: input.empresa_destino_id,
        qtd_itens: input.itens.length,
      },
    })
  } else {
    // Atualiza cabeçalho
    const transfExistente = await pb.collection('transferencias').getOne<Transferencia>(transfId!)
    if (transfExistente.status !== 'Rascunho') {
      throw new Error(
        `Apenas transferências em Rascunho podem ser alteradas (atual: ${transfExistente.status}).`,
      )
    }
    numero = transfExistente.numero

    await pb.collection('transferencias').update(transfId!, {
      empresa_destino_id: input.empresa_destino_id,
      observacao: input.observacao || '',
      nota_fiscal_numero: input.nota_fiscal_numero || '',
      nota_fiscal_chave: input.nota_fiscal_chave || '',
      ativo: true,
    })

    // Remove itens anteriores para recriar
    const itensAntigos = await pb.collection('transferencias_itens').getFullList({
      filter: `transferencia_id = '${transfId}'`,
      fields: 'id',
    })
    for (const item of itensAntigos) {
      await pb.collection('transferencias_itens').delete(item.id)
    }

    await registrarAuditoria({
      acao: 'alteracao',
      tabela: 'transferencias',
      registro_id: transfId!,
      empresa_id: input.empresa_origem_id,
      valores_depois: {
        numero,
        empresa_destino_id: input.empresa_destino_id,
        qtd_itens: input.itens.length,
      },
    })
  }

  // Criação dos itens com custo médio da origem
  for (const item of input.itens) {
    if (item.quantidade <= 0) {
      throw new Error('A quantidade de cada item deve ser maior que zero.')
    }

    // Busca custo médio atual da origem se não passado
    let custoUnitario = Number(item.custo_unitario || 0)
    if (custoUnitario <= 0) {
      try {
        const saldoRes = await pb.collection('estoque_saldos').getList(1, 1, {
          filter: `empresa_id = '${input.empresa_origem_id}' && produto_id = '${item.produto_id}'`,
        })
        if (saldoRes.items.length > 0) {
          custoUnitario = Number(saldoRes.items[0].custo_medio || 0)
        }
      } catch {
        /* fallback */
      }
      if (custoUnitario <= 0) {
        const prod = await pb.collection('produtos').getOne<Produto>(item.produto_id)
        custoUnitario = Number(prod.preco_custo || 0)
      }
    }

    await pb.collection('transferencias_itens').create({
      transferencia_id: transfId,
      produto_id: item.produto_id,
      lote_id: item.lote_id || null,
      quantidade: item.quantidade,
      custo_unitario: custoUnitario,
      quantidade_recebida: 0,
      divergencia: item.quantidade,
      ativo: true,
    })
  }

  return obterTransferenciaPorId(transfId!)
}

/**
 * Envia uma transferência (Rascunho -> Enviada).
 * Executa saída pelo serviço central de movimentação na empresa de origem.
 */
export async function enviarTransferencia(
  transferenciaId: string,
  empresaAtivaId: string,
  usuarioERPId?: string,
): Promise<TransferenciaCompleta> {
  const transf = await obterTransferenciaPorId(transferenciaId)

  if (transf.status !== 'Rascunho') {
    throw new Error(
      `Apenas transferências em Rascunho podem ser enviadas (atual: ${transf.status}).`,
    )
  }

  if (transf.empresa_origem_id !== empresaAtivaId) {
    throw new Error('Apenas a empresa de origem pode enviar a transferência.')
  }

  if (transf.itens.length === 0) {
    throw new Error('A transferência não possui itens para envio.')
  }

  // Monta itens para o serviço central de estoque
  const itensMovimento: ItemMovimentacaoEstoque[] = transf.itens.map((item) => ({
    empresa_id: empresaAtivaId,
    produto_id: item.produto_id,
    lote_id: item.lote_id || undefined,
    quantidade: item.quantidade,
    custo_unitario: item.custo_unitario,
    tipo: 'Saída',
    origem: 'TRANSFERENCIA_SAIDA',
    documento_tipo: 'Transferência',
    documento_id: transf.id,
    documento_numero: `TR-${transf.numero}`,
    observacao: `Envio de transferência TR-${transf.numero} para filial destino`,
  }))

  // Dispara movimentação no estoque central da empresa de origem.
  // Se houver saldo insuficiente ou erro de validação, uma exceção é lançada
  // e o status da transferência continua como Rascunho intacto!
  await movimentarEstoque(itensMovimento)

  const agoraIso = new Date().toISOString()
  await pb.collection('transferencias').update(transf.id, {
    status: 'Enviada',
    data_envio: agoraIso,
    usuario_envio_id: usuarioERPId || null,
  })

  await registrarAuditoria({
    acao: 'alteracao',
    tabela: 'transferencias',
    registro_id: transf.id,
    empresa_id: transf.empresa_origem_id,
    valores_depois: {
      acao_fluxo: 'ENVIO',
      numero: transf.numero,
      data_envio: agoraIso,
      itens_total: transf.itens.length,
    },
  })

  return obterTransferenciaPorId(transf.id)
}

export interface ItemConferenciaRecebimento {
  item_id: string
  quantidade_recebida: number
}

/**
 * Recebe uma transferência (Enviada -> Recebida).
 * Executado APENAS pela empresa de destino.
 * Regras:
 * - Se quantidade_recebida > quantidade enviada: ERRO (não permitido).
 * - Se quantidade_recebida == quantidade enviada: TRANSFERENCIA_ENTRADA da quantidade total.
 * - Se quantidade_recebida < quantidade enviada: TRANSFERENCIA_ENTRADA da quantidade enviada e
 *   lançamento imediato de PERDA no destino com a diferença (motivo: "Divergência na transferência N").
 */
export async function receberTransferencia(
  transferenciaId: string,
  empresaAtivaId: string,
  conferencias: ItemConferenciaRecebimento[],
  usuarioERPId?: string,
): Promise<TransferenciaCompleta> {
  const transf = await obterTransferenciaPorId(transferenciaId)

  if (transf.status !== 'Enviada') {
    throw new Error(
      `Apenas transferências com status "Enviada" podem ser recebidas (atual: ${transf.status}).`,
    )
  }

  if (transf.empresa_destino_id !== empresaAtivaId) {
    throw new Error('Apenas a empresa de destino ativa pode receber a transferência.')
  }

  const mapaConferencia = new Map<string, number>()
  for (const c of conferencias) {
    if (c.quantidade_recebida < 0) {
      throw new Error('Quantidade recebida não pode ser negativa.')
    }
    mapaConferencia.set(c.item_id, c.quantidade_recebida)
  }

  // Validações prévias
  for (const item of transf.itens) {
    const recebida = mapaConferencia.has(item.id) ? mapaConferencia.get(item.id)! : item.quantidade
    if (recebida > item.quantidade) {
      const descProd = item.expand?.produto_id?.descricao || item.produto_id
      throw new Error(
        `Quantidade recebida (${recebida}) do produto "${descProd}" não pode ser maior que a quantidade enviada (${item.quantidade}).`,
      )
    }
  }

  const itensEntrada: ItemMovimentacaoEstoque[] = []
  const itensPerdaDivergencia: ItemMovimentacaoEstoque[] = []

  // Prepara movimentações com o MESMO custo_unitario da origem
  for (const item of transf.itens) {
    const recebida = mapaConferencia.has(item.id) ? mapaConferencia.get(item.id)! : item.quantidade
    const diferencaPerda = Number((item.quantidade - recebida).toFixed(4))

    // Se o produto controla lote na origem, precisamos garantir lote correspondente no destino
    let loteDestinoId = item.lote_id
    if (item.lote_id && item.expand?.lote_id) {
      const loteOrigem = item.expand.lote_id
      // Procura se já existe lote com mesmo numero na empresa de destino
      try {
        const lotesDestino = await pb.collection('lotes').getList<Lote>(1, 1, {
          filter: `empresa_id = '${transf.empresa_destino_id}' && produto_id = '${item.produto_id}' && numero_lote = '${loteOrigem.numero_lote}'`,
        })
        if (lotesDestino.items.length > 0) {
          loteDestinoId = lotesDestino.items[0].id
        } else {
          // Cria o lote correspondente no destino com mesma validade
          const novoLote = await pb.collection('lotes').create<Lote>({
            empresa_id: transf.empresa_destino_id,
            produto_id: item.produto_id,
            numero_lote: loteOrigem.numero_lote,
            data_fabricacao: loteOrigem.data_fabricacao || '',
            data_validade: loteOrigem.data_validade,
            observacao: `Criado automaticamente pela transferência TR-${transf.numero}`,
            ativo: true,
            quantidade: 0,
          })
          loteDestinoId = novoLote.id
        }
      } catch (err) {
        console.warn('Erro ao sincronizar lote de destino:', err)
      }
    }

    // Regra: se recebido for menor que enviado: dar entrada da quantidade ENVIADA no destino
    // e, em seguida, lançar automaticamente uma PERDA no destino com a diferença.
    // Se recebido for igual: dar entrada da quantidade enviada.
    itensEntrada.push({
      empresa_id: transf.empresa_destino_id,
      produto_id: item.produto_id,
      lote_id: loteDestinoId || undefined,
      quantidade: item.quantidade,
      custo_unitario: item.custo_unitario,
      tipo: 'Entrada',
      origem: 'TRANSFERENCIA_ENTRADA',
      documento_tipo: 'Transferência',
      documento_id: transf.id,
      documento_numero: `TR-${transf.numero}`,
      observacao: `Recebimento de transferência TR-${transf.numero} da matriz/filial de origem`,
    })

    if (diferencaPerda > 0) {
      itensPerdaDivergencia.push({
        empresa_id: transf.empresa_destino_id,
        produto_id: item.produto_id,
        lote_id: loteDestinoId || undefined,
        quantidade: diferencaPerda,
        custo_unitario: item.custo_unitario,
        tipo: 'Saída',
        origem: 'PERDA',
        documento_tipo: 'Transferência',
        documento_id: transf.id,
        documento_numero: `TR-${transf.numero}`,
        motivo: `Divergência na transferência ${transf.numero}`,
        observacao: `Divergência na transferência ${transf.numero}`,
      })
    }
  }

  // 1. Movimenta entrada de todos os itens no destino
  await movimentarEstoque(itensEntrada)

  // 2. Se houver divergências (perdas), movimenta perda no destino
  if (itensPerdaDivergencia.length > 0) {
    await movimentarEstoque(itensPerdaDivergencia)
  }

  // 3. Atualiza os itens com as quantidades recebidas e divergências
  for (const item of transf.itens) {
    const recebida = mapaConferencia.has(item.id) ? mapaConferencia.get(item.id)! : item.quantidade
    const divergencia = Number((item.quantidade - recebida).toFixed(4))

    await pb.collection('transferencias_itens').update(item.id, {
      quantidade_recebida: recebida,
      divergencia,
    })
  }

  // 4. Atualiza cabeçalho da transferência
  const agoraIso = new Date().toISOString()
  await pb.collection('transferencias').update(transf.id, {
    status: 'Recebida',
    data_recebimento: agoraIso,
    usuario_recebimento_id: usuarioERPId || null,
  })

  // 5. Auditoria completa com divergências
  const divergenciasAudit = transf.itens
    .map((i) => {
      const rec = mapaConferencia.has(i.id) ? mapaConferencia.get(i.id)! : i.quantidade
      return {
        produto_id: i.produto_id,
        enviado: i.quantidade,
        recebido: rec,
        divergencia: Number((i.quantidade - rec).toFixed(4)),
      }
    })
    .filter((d) => d.divergencia > 0)

  await registrarAuditoria({
    acao: 'alteracao',
    tabela: 'transferencias',
    registro_id: transf.id,
    empresa_id: transf.empresa_destino_id,
    valores_depois: {
      acao_fluxo: 'RECEBIMENTO',
      numero: transf.numero,
      data_recebimento: agoraIso,
      divergencias: divergenciasAudit,
    },
  })

  return obterTransferenciaPorId(transf.id)
}

/**
 * Cancela uma transferência.
 * - Rascunho: cancelado livremente por qualquer empresa envolvida.
 * - Enviada: cancelada APENAS pela empresa de origem antes do recebimento, estornando cada movimento gerado no envio.
 * - Recebida: NÃO pode ser cancelada.
 */
export async function cancelarTransferencia(
  transferenciaId: string,
  empresaAtivaId: string,
  motivoCancelamento: string,
  usuarioERPId?: string,
): Promise<TransferenciaCompleta> {
  const transf = await obterTransferenciaPorId(transferenciaId)

  if (transf.status === 'Recebida') {
    throw new Error('Transferências com status "Recebida" não podem ser canceladas.')
  }

  // Verifica se o documento fiscal vinculado à transferência está Autorizado
  try {
    const docsFiscais = await pb.collection('documentos_fiscais').getList(1, 1, {
      filter: `transferencia_id = '${transf.id}' && status = 'Autorizada' && ativo = true`,
    })
    if (docsFiscais.totalItems > 0) {
      throw new Error('Cancele a nota fiscal antes de cancelar a transferência.')
    }
  } catch (err: any) {
    if (err?.message?.includes('Cancele a nota fiscal')) {
      throw err
    }
  }

  if (transf.status === 'Cancelada') {
    throw new Error('Esta transferência já está cancelada.')
  }

  if (!motivoCancelamento || !motivoCancelamento.trim()) {
    throw new Error('Informe o motivo do cancelamento.')
  }

  if (transf.status === 'Enviada') {
    if (transf.empresa_origem_id !== empresaAtivaId) {
      throw new Error('Apenas a empresa de origem pode cancelar uma transferência já enviada.')
    }

    // Busca os movimentos gerados pelo envio desta transferência para realizar o estorno
    const movimentosOrigem = await pb
      .collection('estoque_movimentos')
      .getFullList<EstoqueMovimento>({
        filter: `empresa_id = '${transf.empresa_origem_id}' && documento_id = '${transf.id}' && estornado = false`,
      })

    for (const mov of movimentosOrigem) {
      await estornarMovimento(
        mov.id,
        `Estorno por cancelamento da TR-${transf.numero}: ${motivoCancelamento.trim()}`,
      )
    }
  }

  const observacaoAtualizada = transf.observacao
    ? `${transf.observacao}\n[Cancelamento: ${motivoCancelamento.trim()}]`
    : `[Cancelamento: ${motivoCancelamento.trim()}]`

  await pb.collection('transferencias').update(transf.id, {
    status: 'Cancelada',
    observacao: observacaoAtualizada,
  })

  await registrarAuditoria({
    acao: 'exclusao',
    tabela: 'transferencias',
    registro_id: transf.id,
    empresa_id: empresaAtivaId,
    valores_depois: {
      acao_fluxo: 'CANCELAMENTO',
      numero: transf.numero,
      status_anterior: transf.status,
      motivo: motivoCancelamento.trim(),
    },
  })

  return obterTransferenciaPorId(transf.id)
}
