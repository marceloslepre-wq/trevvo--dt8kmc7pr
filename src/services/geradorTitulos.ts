import pb from '@/lib/pocketbase/client'
import { salvarContaPagar, ContaPagar } from './financeiro'
import { salvarContaReceber, ContaReceber } from './contasReceber'

export type TipoTituloFinanceiro = 'Pagar' | 'Receber'

export interface ParcelaTituloInput {
  numero_parcela: number
  total_parcelas?: number
  dias_vencimento?: number
  data_vencimento: string
  valor: number
  percentual?: number
  forma_pagamento_id?: string
  observacao?: string
}

export interface GerarTitulosParcelasInput {
  tipo: TipoTituloFinanceiro
  empresa_id: string
  // No Contas a Pagar:
  fornecedor_id?: string
  // No Contas a Receber:
  cliente_id?: string
  numero_documento_base: string
  descricao_base: string
  data_emissao: string
  data_competencia?: string
  plano_conta_id: string
  centro_custo_id?: string
  forma_pagamento_id?: string
  origem: 'Manual' | 'NF Entrada' | 'Venda' | 'PDV' | 'Recorrência' | 'Outro'
  origem_id?: string
  nota_entrada_parcela_id?: string
  venda_parcela_id?: string
  parcelas: ParcelaTituloInput[]
}

export interface ResultadoGeracaoTitulos {
  titulos_pagar?: ContaPagar[]
  titulos_receber?: ContaReceber[]
  total_titulos: number
  valor_total: number
}

/**
 * Serviço central e genérico de geração de títulos a pagar e a receber a partir de parcelas.
 * Usado tanto pelas Notas de Entrada (Compras) para gerar contas_pagar quanto
 * futuramente pela Etapa 5 (Vendas e PDV) para gerar contas_receber.
 */
export async function gerarTitulosFromParcelas(
  input: GerarTitulosParcelasInput,
): Promise<ResultadoGeracaoTitulos> {
  const {
    tipo,
    empresa_id,
    fornecedor_id,
    cliente_id,
    numero_documento_base,
    descricao_base,
    data_emissao,
    data_competencia,
    plano_conta_id,
    centro_custo_id,
    forma_pagamento_id,
    origem,
    origem_id,
    parcelas,
  } = input

  if (!empresa_id) throw new Error('ID da empresa é obrigatório para gerar títulos.')
  if (!plano_conta_id) throw new Error('Plano de contas é obrigatório para gerar títulos.')
  if (!parcelas || parcelas.length === 0) {
    throw new Error('Nenhuma parcela fornecida para geração de títulos.')
  }

  const totalParcelas = parcelas.length
  let valorTotal = 0

  if (tipo === 'Pagar') {
    if (!fornecedor_id) throw new Error('Fornecedor é obrigatório para títulos a pagar.')

    const titulosCriados: ContaPagar[] = []
    for (let i = 0; i < parcelas.length; i++) {
      const p = parcelas[i]
      const numParcela = p.numero_parcela || i + 1
      const parcelaLabel = `${numParcela}/${p.total_parcelas || totalParcelas}`
      const valor = Number(p.valor) || 0
      valorTotal += valor

      const titulo = await salvarContaPagar({
        empresa_id,
        fornecedor_id,
        numero_documento: `${numero_documento_base}-${numParcela}`,
        parcela: parcelaLabel,
        descricao: `${descricao_base} - Parc. ${parcelaLabel}`,
        data_emissao,
        data_competencia: data_competencia || data_emissao,
        data_vencimento: p.data_vencimento,
        plano_conta_id,
        centro_custo_id: centro_custo_id || undefined,
        forma_pagamento_prevista_id: p.forma_pagamento_id || forma_pagamento_id || undefined,
        valor_original: valor,
        valor_pago: 0,
        saldo: valor,
        status: 'Em aberto',
        origem: origem as 'Manual' | 'NF Entrada' | 'Recorrência' | 'Outro',
        origem_id: origem_id || undefined,
        nota_entrada_parcela_id: input.nota_entrada_parcela_id,
        observacao: p.observacao || '',
        ativo: true,
      })
      titulosCriados.push(titulo)
    }

    return {
      titulos_pagar: titulosCriados,
      total_titulos: titulosCriados.length,
      valor_total: valorTotal,
    }
  } else {
    // Tipo: 'Receber'
    if (!cliente_id) throw new Error('Cliente é obrigatório para títulos a receber.')

    const titulosCriados: ContaReceber[] = []
    for (let i = 0; i < parcelas.length; i++) {
      const p = parcelas[i]
      const numParcela = p.numero_parcela || i + 1
      const parcelaLabel = `${numParcela}/${p.total_parcelas || totalParcelas}`
      const valor = Number(p.valor) || 0
      valorTotal += valor

      const titulo = await salvarContaReceber({
        empresa_id,
        cliente_id,
        numero_documento: `${numero_documento_base}-${numParcela}`,
        parcela: parcelaLabel,
        descricao: `${descricao_base} - Parc. ${parcelaLabel}`,
        data_emissao,
        data_competencia: data_competencia || data_emissao,
        data_vencimento: p.data_vencimento,
        plano_conta_id,
        centro_custo_id: centro_custo_id || undefined,
        forma_pagamento_prevista_id: p.forma_pagamento_id || forma_pagamento_id || undefined,
        valor_original: valor,
        valor_recebido: 0,
        saldo: valor,
        status: 'Aberto',
        origem: origem as 'Manual' | 'Venda' | 'PDV' | 'Recorrência' | 'Outro',
        origem_id: origem_id || undefined,
        venda_parcela_id: input.venda_parcela_id,
        observacao: p.observacao || '',
        ativo: true,
      })
      titulosCriados.push(titulo)
    }

    return {
      titulos_receber: titulosCriados,
      total_titulos: titulosCriados.length,
      valor_total: valorTotal,
    }
  }
}
