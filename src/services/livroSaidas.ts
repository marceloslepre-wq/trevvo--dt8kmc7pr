/**
 * Serviço de Apuração Fiscal do Livro de Registro de Saídas e Resumo do ICMS (Etapa 8 - Prompt 8.1)
 *
 * Consome os endpoints do backend:
 * - POST /backend/v1/relatorios/livro-saidas
 * e integra com livroEntradas / sped_arquivos para o Resumo do ICMS do Mês.
 */

import pb from '@/lib/pocketbase/client'

export type SituacaoLinhaLivroSaida = 'normal' | 'cancelada' | 'denegada' | 'inutilizada'

export interface LinhaLivroSaida {
  id: string
  tipo: 'documento' | 'inutilizacao'
  data: string
  modelo: string
  serie: string
  numero: number
  chave: string
  destinatario_nome: string
  destinatario_cnpj_cpf: string
  destinatario_uf: string
  cfop_principal: string
  valor_contabil: number
  base_icms: number
  valor_icms: number
  base_icms_st: number
  valor_icms_st: number
  valor_ipi: number
  valor_difal: number
  situacao: SituacaoLinhaLivroSaida
  ambiente: 'Homologação' | 'Produção'
}

export interface ResumoCfopCstAliquotaSaida {
  cfop: string
  cst: string
  aliquota: number
  valor_contabil: number
  base_icms: number
  valor_icms: number
  base_icms_st: number
  valor_icms_st: number
  valor_ipi: number
  isentas: number
  outras: number
}

export interface ResumoUfDestinoSaida {
  uf: string
  ehInterestadual: boolean
  quantidade_documentos: number
  valor_contabil: number
  valor_icms: number
  valor_difal: number
}

export interface TotaisLivroSaidas {
  totalLinhas: number
  totalNormais: number
  totalCanceladas: number
  totalDenegadas: number
  totalInutilizadas: number
  valorContabilTotal: number
  baseIcmsTotal: number
  valorIcmsTotal: number
  baseIcmsStTotal: number
  valorIcmsStTotal: number
  valorIpiTotal: number
  valorDifalTotal: number
  isentasTotal: number
  outrasTotal: number
}

export interface RelatorioLivroSaidasResultado {
  sucesso: boolean
  periodo: {
    dataInicio: string
    dataFim: string
  }
  empresa: {
    id: string
    razao_social?: string
    nome_fantasia?: string
    cnpj?: string
    uf?: string
    inscricao_estadual?: string
  }
  incluiNotasTeste: boolean
  linhas: LinhaLivroSaida[]
  resumoCfopCstAliquota: ResumoCfopCstAliquotaSaida[]
  resumoUfDestino: ResumoUfDestinoSaida[]
  totaisGerais: TotaisLivroSaidas
  message?: string
}

export interface FiltrosLivroSaidas {
  empresaId: string
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
  incluirTeste?: boolean
  filtros?: {
    modelo?: '55' | '65' | 'todos'
    cfop?: string
    cst?: string
    situacao?: 'todos' | 'normal' | 'cancelada' | 'denegada' | 'inutilizada'
    ufDestino?: string
    clienteId?: string
  }
}

/**
 * Consulta o backend para obter os 3 quadros consolidados do Livro de Saídas:
 * 1) Linhas por documento (com inutilizações)
 * 2) Resumo por CFOP, CST e alíquota
 * 3) Resumo por UF de destino
 */
export async function obterRelatorioLivroSaidas(
  params: FiltrosLivroSaidas,
): Promise<RelatorioLivroSaidasResultado> {
  const token = pb.authStore.token
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  const res = await fetch(`${pb.baseUrl}/backend/v1/relatorios/livro-saidas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  })

  const json = await res.json()
  if (!res.ok || !json.sucesso) {
    throw new Error(json.message || 'Erro ao gerar relatório do Livro de Saídas.')
  }

  return json as RelatorioLivroSaidasResultado
}

/**
 * Interface do Resumo do ICMS do Mês para conferência gerencial
 */
export interface ResumoIcmsMesResultado {
  periodo: {
    mes: number
    ano: number
    dataInicio: string
    dataFim: string
  }
  empresa: {
    id: string
    razao_social?: string
    cnpj?: string
    uf?: string
  }
  // Débitos (Saídas)
  debitos: {
    valorContabilSaidas: number
    baseIcmsSaidas: number
    icmsProprioSaidas: number
    icmsStSaidas: number
    difalDestino: number
    quantidadeDocumentos: number
  }
  // Créditos (Entradas + Transferências Recebidas)
  creditos: {
    valorContabilEntradas: number
    baseIcmsEntradas: number
    icmsAproveitadoEntradas: number
    icmsTransferenciasRecebidas: number
    icmsAproveitadoTotal: number
    quantidadeNotasEntrada: number
  }
  // Saldo gerencial do mês
  apuracaoGerencial: {
    saldoMes: number // Débitos - Créditos (positivo = a recolher, negativo = credor)
    situacao: 'a_recolher' | 'credor' | 'zerado'
    valorRecolher: number
    saldoCredorTransportar: number
  }
  // Comparativo com arquivo SPED Oficial do mês (se existir)
  spedOficial?: {
    arquivoId: string
    status: string
    entregueEm?: string
    reciboEntrega?: string
    e110Debitos: number
    e110Creditos: number
    e110OutrosCreditos: number
    e110OutrosDebitos: number
    e110SaldoCredorAnterior: number
    e110SaldoApurado: number
    e110IcmsRecolher: number
    e110SaldoCredorTransportar: number
    diferencaDebitos: number
    diferencaCreditos: number
    diferencaRecolher: number
  } | null
}

/**
 * Calcula o Resumo do ICMS do Mês combinando:
 * 1. Livro de Saídas (débitos de ICMS das saídas)
 * 2. Livro de Entradas (créditos aproveitados de ICMS)
 * 3. Transferências recebidas (crédito destacado em transferências)
 * 4. Arquivo SPED do mês (se houver, com o Bloco E110 oficial)
 */
export async function obterResumoIcmsMes(params: {
  empresaId: string
  ano: number
  mes: number
  incluirTeste?: boolean
}): Promise<ResumoIcmsMesResultado> {
  const { empresaId, ano, mes, incluirTeste } = params

  const mesStr = mes < 10 ? `0${mes}` : `${mes}`
  const periodoSped = `${mesStr}${ano}`

  // Primeiro e último dia do mês
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const dataInicio = `${ano}-${mesStr}-01`
  const dataFim = `${ano}-${mesStr}-${ultimoDia < 10 ? `0${ultimoDia}` : ultimoDia}`

  // 1. Obter Livro de Saídas do período
  const livroSaidas = await obterRelatorioLivroSaidas({
    empresaId,
    dataInicio,
    dataFim,
    incluirTeste: Boolean(incluirTeste),
  })

  // 2. Obter Entradas do período (notas_entrada lançadas com aproveita_credito_icms)
  let notasEntradaRecs: any[] = []
  try {
    notasEntradaRecs = await pb.collection('notas_entrada').getFullList({
      filter: `empresa_id = '${empresaId}' && status = 'Lançada' && ativo = true && data_entrada >= '${dataInicio}' && data_entrada <= '${dataFim}'`,
      requestKey: null,
    })
  } catch (errNe) {
    console.warn('Erro ao carregar notas_entrada para resumo ICMS:', errNe)
  }

  // Buscar itens dessas notas para somar o crédito efetivamente aproveitado
  let icmsAproveitadoEntradas = 0
  let baseIcmsEntradas = 0
  let valorContabilEntradas = 0

  for (const ne of notasEntradaRecs) {
    valorContabilEntradas += Number(ne.valor_total) || 0
  }

  const neIds = notasEntradaRecs.map((n) => n.id)
  const tamanhoLote = 35
  for (let i = 0; i < neIds.length; i += tamanhoLote) {
    const lote = neIds.slice(i, i + tamanhoLote)
    const filterLote = lote.map((id) => `nota_id = '${id}'`).join(' || ')
    try {
      const itensNe = await pb.collection('notas_entrada_itens').getFullList({
        filter: `(${filterLote}) && ativo = true`,
        requestKey: null,
      })
      for (const it of itensNe) {
        if (it.aproveita_credito_icms) {
          baseIcmsEntradas += Number(it.base_icms) || 0
          icmsAproveitadoEntradas += Number(it.valor_credito_icms) || 0
        }
      }
    } catch (errItNe) {
      console.warn('Erro ao carregar itens de entrada para resumo ICMS:', errItNe)
    }
  }

  // 3. Transferências Recebidas entre Filiais (se houver, e que não estejam já em notas_entrada)
  let icmsTransferenciasRecebidas = 0
  try {
    const docsTrf = await pb.collection('documentos_fiscais').getFullList({
      filter: `origem ~ 'Transfer' && (status = 'Autorizada' || status = 'Cancelada') && ativo = true`,
      requestKey: null,
    })
    for (const dTrf of docsTrf) {
      if (dTrf.status !== 'Autorizada') continue
      // Verifica se o destino foi a empresa consultada
      if (dTrf.origem_id) {
        try {
          const trf = await pb.collection('transferencias').getOne(dTrf.origem_id)
          if (trf.empresa_destino_id === empresaId) {
            const dtEmissao = (dTrf.data_emissao || dTrf.created || '').substring(0, 10)
            if (dtEmissao >= dataInicio && dtEmissao <= dataFim) {
              // Se a chave não estiver nas notas de entrada
              const jaTemNe = notasEntradaRecs.some(
                (n) => n.chave_acesso && n.chave_acesso === dTrf.chave_acesso,
              )
              if (!jaTemNe) {
                icmsTransferenciasRecebidas += Number(dTrf.valor_icms) || 0
              }
            }
          }
        } catch {
          /* intentionally ignored */
        }
      }
    }
  } catch (errTrf) {
    console.warn('Erro ao verificar transferências para resumo ICMS:', errTrf)
  }

  // Cálculos do Resumo Gerencial
  const icmsProprioSaidas = livroSaidas.totaisGerais.valorIcmsTotal
  const icmsCreditoTotal =
    Math.round((icmsAproveitadoEntradas + icmsTransferenciasRecebidas) * 100) / 100
  const saldoMes = Math.round((icmsProprioSaidas - icmsCreditoTotal) * 100) / 100

  let situacao: 'a_recolher' | 'credor' | 'zerado' = 'zerado'
  let valorRecolher = 0
  let saldoCredorTransportar = 0

  if (saldoMes > 0.005) {
    situacao = 'a_recolher'
    valorRecolher = saldoMes
  } else if (saldoMes < -0.005) {
    situacao = 'credor'
    saldoCredorTransportar = Math.abs(saldoMes)
  }

  // 4. Buscar se já existe arquivo SPED do mês para confronto oficial
  let spedOficialComparativo: ResumoIcmsMesResultado['spedOficial'] = null
  try {
    const arqsSped = await pb.collection('sped_arquivos').getList(1, 5, {
      filter: `empresa_id = '${empresaId}' && periodo = '${periodoSped}'`,
      sort: '-created',
      requestKey: null,
    })

    const arqValido = arqsSped.items.find(
      (a) => a.status === 'Entregue' || a.status === 'Gerado' || a.status === 'Gerado com erros',
    )

    if (arqValido) {
      let apuracaoJson: any = {}
      try {
        apuracaoJson =
          typeof arqValido.resumo_apuracao === 'string'
            ? JSON.parse(arqValido.resumo_apuracao)
            : arqValido.resumo_apuracao || {}
      } catch {
        /* intentionally ignored */
      }

      const icmsProprioSped = apuracaoJson?.icms_proprio || {}
      const e110Deb = Number(icmsProprioSped.total_debitos) || 0
      const e110Cred = Number(icmsProprioSped.total_creditos) || 0
      const e110OutDeb = Number(icmsProprioSped.outros_debitos) || 0
      const e110OutCred = Number(icmsProprioSped.outros_creditos) || 0
      const e110SldAnt = Number(icmsProprioSped.saldo_credor_anterior) || 0
      const e110SldApur = Number(icmsProprioSped.saldo_apurado) || 0
      const e110Recolher = Number(icmsProprioSped.icms_recolher) || 0
      const e110Transp = Number(icmsProprioSped.saldo_credor_transportar) || 0

      spedOficialComparativo = {
        arquivoId: arqValido.id,
        status: arqValido.status,
        entregueEm: arqValido.entregue_em,
        reciboEntrega: arqValido.recibo_entrega,
        e110Debitos: e110Deb,
        e110Creditos: e110Cred,
        e110OutrosDebitos: e110OutDeb,
        e110OutrosCreditos: e110OutCred,
        e110SaldoCredorAnterior: e110SldAnt,
        e110SaldoApurado: e110SldApur,
        e110IcmsRecolher: e110Recolher,
        e110SaldoCredorTransportar: e110Transp,
        diferencaDebitos: Math.round((icmsProprioSaidas - e110Deb) * 100) / 100,
        diferencaCreditos: Math.round((icmsCreditoTotal - e110Cred) * 100) / 100,
        diferencaRecolher: Math.round((valorRecolher - e110Recolher) * 100) / 100,
      }
    }
  } catch (errSped) {
    console.warn('Erro ao consultar SPED para comparativo:', errSped)
  }

  return {
    periodo: {
      mes,
      ano,
      dataInicio,
      dataFim,
    },
    empresa: livroSaidas.empresa,
    debitos: {
      valorContabilSaidas: livroSaidas.totaisGerais.valorContabilTotal,
      baseIcmsSaidas: livroSaidas.totaisGerais.baseIcmsTotal,
      icmsProprioSaidas: icmsProprioSaidas,
      icmsStSaidas: livroSaidas.totaisGerais.valorIcmsStTotal,
      difalDestino: livroSaidas.totaisGerais.valorDifalTotal,
      quantidadeDocumentos: livroSaidas.totaisGerais.totalNormais,
    },
    creditos: {
      valorContabilEntradas: Math.round(valorContabilEntradas * 100) / 100,
      baseIcmsEntradas: Math.round(baseIcmsEntradas * 100) / 100,
      icmsAproveitadoEntradas: Math.round(icmsAproveitadoEntradas * 100) / 100,
      icmsTransferenciasRecebidas: Math.round(icmsTransferenciasRecebidas * 100) / 100,
      icmsAproveitadoTotal: icmsCreditoTotal,
      quantidadeNotasEntrada: notasEntradaRecs.length,
    },
    apuracaoGerencial: {
      saldoMes,
      situacao,
      valorRecolher,
      saldoCredorTransportar,
    },
    spedOficial: spedOficialComparativo,
  }
}
