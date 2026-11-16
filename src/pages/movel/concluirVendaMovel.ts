import { obterOuCriarConsumidorFinal } from '@/services/configVendas'
import {
  salvarVenda,
  finalizarVenda,
  type ItemVendaInput,
  type PagamentoVendaInput,
  type FinalizarVendaResponse,
} from '@/services/vendas'
import { emitirNFCeVenda, type EmissaoNFCeVendaResponse } from '@/services/fiscalIntegracao'
import type { ConfigEmissaoFiscal } from '@/services/configEmissaoFiscal'
import type { CaixaSessao } from '@/services/caixa'

/** Item mínimo do carrinho do Móvel (mesma forma da parte 1). */
export type ItemCarrinhoMovel = {
  produtoId: string
  descricao: string
  unidade: string
  quantidade: number
  precoUnitario: number
}

export type ResultadoConclusao = {
  numeroVenda: number
  troco: number
  valorTotal: number
  /** 'Autorizada' | 'Rejeitada' | 'Processando' | 'NaoEmitida' — mesmo vocabulário do PDV */
  statusNfce: 'Autorizada' | 'Rejeitada' | 'Processando' | 'NaoEmitida'
  mensagemNfce: string
  contingencia?: boolean
  /** Dados do cupom quando a NFC-e ficou Autorizada (mesmos campos da resposta do backend) */
  numeroNfce?: number
  serie?: string
  chave?: string
  /** danfe_url do backend (URL base Focus já composta lá) */
  danfeUrl?: string
  urlConsulta?: string
}

/**
 * Conclui a venda do Móvel usando EXATAMENTE as mesmas funções do PDV:
 * salvarVenda → finalizarVenda → emitirNFCeVenda (nenhuma regra duplicada aqui).
 * A lógica de itens/pagamento/venda vem do próprio PdvPage (handleFinalizarVenda),
 * enxugada para o carrinho simples do Móvel (sem descontos/vendedor/crediário).
 */
export async function concluirVendaMovel(params: {
  empresaId: string
  sessaoCaixa: CaixaSessao
  terminalId?: string
  operadorId?: string
  emissaoManual?: boolean
  assinanteId?: string
  carrinho: ItemCarrinhoMovel[]
  totalVenda: number
  pagamentos: PagamentoVendaInput[]
  troco: number
  cpfCnpjConsumidor?: string
  configFiscal: ConfigEmissaoFiscal | null
}): Promise<ResultadoConclusao> {
  const {
    empresaId,
    sessaoCaixa,
    terminalId,
    operadorId,
    emissaoManual,
    assinanteId,
    carrinho,
    totalVenda,
    pagamentos,
    troco,
    cpfCnpjConsumidor,
    configFiscal,
  } = params

  if (!sessaoCaixa?.id) {
    throw new Error('Não há sessão de caixa aberta para registrar os pagamentos.')
  }
  if (carrinho.length === 0) {
    throw new Error('Adicione ao menos um produto à venda.')
  }

  // Cliente: o Móvel não seleciona cliente — usa o "Consumidor Final" do assinante
  // (mesma regra do PDV quando não há cliente identificado).
  const consumidor = await obterOuCriarConsumidorFinal(assinanteId || undefined)

  const itens: ItemVendaInput[] = carrinho.map((it, idx) => ({
    item: idx + 1,
    produto_id: it.produtoId,
    descricao: it.descricao,
    unidade: it.unidade,
    quantidade: it.quantidade,
    preco_unitario: it.precoUnitario,
    preco_tabela: it.precoUnitario,
    desconto_percentual: 0,
    desconto_valor: 0,
    acrescimo_valor: 0,
    valor_total: Number((it.precoUnitario * it.quantidade).toFixed(2)),
  }))

  // 1. Cria a venda pelo serviço central salvarVenda (payload PLANO, tipo PDV)
  const vendaSalva = await salvarVenda({
    empresa_id: empresaId,
    tipo: 'PDV',
    cliente_id: consumidor.id,
    cpf_cnpj_consumidor: cpfCnpjConsumidor || '',
    operador_id: operadorId,
    pdv_terminal_id: sessaoCaixa.pdv_terminal_id || terminalId,
    caixa_sessao_id: sessaoCaixa.id,
    valor_desconto_total: 0,
    itens,
  })

  // 2. Finaliza pelo MESMO endpoint do PDV (baixa estoque, financeiro, caixa)
  const vendaFinalizada: FinalizarVendaResponse = await finalizarVenda({
    venda_id: vendaSalva.id,
    pagamentos,
  })

  // 3. Dispara a NFC-e do mesmo jeito que o PDV (mesma config, mesmo endpoint)
  const podeEmitirNfce =
    configFiscal &&
    configFiscal.emite_documentos_fiscais &&
    configFiscal.emite_nfce &&
    (emissaoManual || configFiscal.emitir_nfce_automaticamente_no_pdv)

  if (!podeEmitirNfce) {
    return {
      numeroVenda: vendaFinalizada.numero,
      troco,
      valorTotal: vendaFinalizada.valor_total ?? totalVenda,
      statusNfce: 'NaoEmitida',
      mensagemNfce: 'NFC-e não está habilitada para esta loja.',
    }
  }

  if (!configFiscal.csc_configurado) {
    return {
      numeroVenda: vendaFinalizada.numero,
      troco,
      valorTotal: vendaFinalizada.valor_total ?? totalVenda,
      statusNfce: 'NaoEmitida',
      mensagemNfce: 'CSC da NFC-e não configurado para esta loja.',
    }
  }

  try {
    const respNfce: EmissaoNFCeVendaResponse = await emitirNFCeVenda({
      vendaId: vendaSalva.id,
      contingencia: Boolean(emissaoManual),
    })

    if (respNfce.sucesso && respNfce.status === 'Autorizada') {
      return {
        numeroVenda: vendaFinalizada.numero,
        troco,
        valorTotal: vendaFinalizada.valor_total ?? totalVenda,
        statusNfce: 'Autorizada',
        mensagemNfce: respNfce.contingencia
          ? 'NFC-e emitida em CONTINGÊNCIA (offline).'
          : 'NFC-e autorizada na SEFAZ.',
        contingencia: respNfce.contingencia,
        numeroNfce: respNfce.numero,
        serie: respNfce.serie,
        chave: respNfce.chave,
        danfeUrl: respNfce.danfe_url,
        urlConsulta: respNfce.url_consulta,
      }
    }

    // Rejeição da SEFAZ ou erro interno do ERP (respNfce.erro_interno)
    return {
      numeroVenda: vendaFinalizada.numero,
      troco,
      valorTotal: vendaFinalizada.valor_total ?? totalVenda,
      statusNfce: 'Rejeitada',
      mensagemNfce: respNfce.message || 'Rejeição na SEFAZ',
      contingencia: false,
    }
  } catch (errNfce: any) {
    console.error('Erro ao emitir NFC-e no Móvel:', errNfce)
    const msg = errNfce?.data?.message || errNfce?.message || 'Falha na emissão da NFC-e.'
    return {
      numeroVenda: vendaFinalizada.numero,
      troco,
      valorTotal: vendaFinalizada.valor_total ?? totalVenda,
      statusNfce: 'Processando',
      mensagemNfce: msg,
      contingencia: false,
    }
  }
}
