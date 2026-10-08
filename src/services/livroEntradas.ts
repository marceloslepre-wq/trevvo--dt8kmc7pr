/**
 * Serviço de Apuração Fiscal do Livro de Entradas (Reg. C190 do SPED Fiscal)
 *
 * Utilizado pelo relatório / conferência do Livro de Entradas (Etapa 3)
 * e reutilizado na geração do SPED Fiscal (Etapa 7).
 */

import { pb } from '@/lib/pocketbase/client'
import { NotaEntrada, NotaEntradaItem } from './notasEntrada'

export interface LinhaLivroEntrada {
  id: string
  data_entrada: string
  modelo: string
  serie: string
  numero: number
  data_emissao: string
  fornecedor_nome: string
  fornecedor_cnpj: string
  fornecedor_uf: string
  valor_contabil: number // valor_total da nota
  chave_acesso?: string
  status: string
}

export interface RegistroApuracaoC190 {
  cfop: string
  cst: string
  aliquota: number
  valorOperacao: number
  baseIcms: number
  valorIcms: number
  baseIcmsSt: number
  valorIcmsSt: number
  valorIpi: number
  outrasDespesas?: number
  isentasOutras?: number // valorOperacao - baseIcms - valorIpi - valorIcmsSt
}

export interface TotaisLivroEntradas {
  totalNotas: number
  valorContabilTotal: number
  baseIcmsTotal: number
  valorIcmsTotal: number
  baseIcmsStTotal: number
  valorIcmsStTotal: number
  valorIpiTotal: number
  isentasOutrasTotal: number
}

export interface RelatorioLivroEntradasResultado {
  periodo: {
    inicio: string
    fim: string
  }
  empresa: {
    id: string
    razao_social?: string
    nome_fantasia?: string
    cnpj?: string
    uf?: string
    inscricao_estadual?: string
  }
  notas: LinhaLivroEntrada[]
  resumoC190: RegistroApuracaoC190[]
  totaisPorCfop: Array<{
    cfop: string
    descricao?: string
    valorOperacao: number
    baseIcms: number
    valorIcms: number
    baseIcmsSt: number
    valorIcmsSt: number
    valorIpi: number
    isentasOutras: number
  }>
  totaisGerais: TotaisLivroEntradas
}

export interface FiltrosLivroEntradas {
  empresaId: string
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
}

/**
 * Monta o resumo C190 a partir de uma lista de itens de nota de entrada
 */
export function calcularResumoFiscalC190(itens: NotaEntradaItem[]): RegistroApuracaoC190[] {
  const mapa = new Map<string, RegistroApuracaoC190>()

  for (const it of itens) {
    const cfop = it.cfop_entrada || it.cfop_fornecedor || '0000'
    const cst = it.cst_icms_entrada || it.cst_icms_fornecedor || '00'
    const aliq = Number(it.aliquota_icms) || 0
    const chave = `${cfop}_${cst}_${aliq.toFixed(2)}`

    const valorOp =
      (Number(it.valor_produto) || 0) -
      (Number(it.valor_desconto) || 0) +
      (Number(it.valor_frete) || 0) +
      (Number(it.valor_seguro) || 0) +
      (Number(it.valor_outras) || 0) +
      (Number(it.valor_ipi) || 0) +
      (Number(it.valor_icms_st) || 0)

    const baseIcms = Number(it.base_icms) || 0
    const valorIcms = Number(it.valor_icms) || 0
    const baseIcmsSt = Number(it.base_icms_st) || 0
    const valorIcmsSt = Number(it.valor_icms_st) || 0
    const valorIpi = Number(it.valor_ipi) || 0

    // Isentas / Outras: parcela da operação não tributada por ICMS
    const isentas = Math.max(0, valorOp - baseIcms - valorIcmsSt - valorIpi)

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        cfop,
        cst,
        aliquota: aliq,
        valorOperacao: valorOp,
        baseIcms,
        valorIcms,
        baseIcmsSt,
        valorIcmsSt,
        valorIpi,
        isentasOutras: isentas,
      })
    } else {
      const reg = mapa.get(chave)!
      reg.valorOperacao += valorOp
      reg.baseIcms += baseIcms
      reg.valorIcms += valorIcms
      reg.baseIcmsSt += baseIcmsSt
      reg.valorIcmsSt += valorIcmsSt
      reg.valorIpi += valorIpi
      reg.isentasOutras = (reg.isentasOutras || 0) + isentas
    }
  }

  // Ordenar por CFOP e CST
  return Array.from(mapa.values()).sort((a, b) => {
    if (a.cfop !== b.cfop) return a.cfop.localeCompare(b.cfop)
    if (a.cst !== b.cst) return a.cst.localeCompare(b.cst)
    return a.aliquota - b.aliquota
  })
}

/**
 * Função central de apuração do Livro de Entradas
 * Recebe empresaId + período (filtrado por data_entrada) e devolve o relatório consolidado
 */
export async function obterRelatorioLivroEntradas(
  filtros: FiltrosLivroEntradas,
): Promise<RelatorioLivroEntradasResultado> {
  const { empresaId, dataInicio, dataFim } = filtros

  // 1. Obter dados da empresa
  let dadosEmpresa: RelatorioLivroEntradasResultado['empresa'] = { id: empresaId }
  try {
    const empRec = await pb.collection('empresas').getOne(empresaId)
    dadosEmpresa = {
      id: empRec.id,
      razao_social: empRec.razao_social,
      nome_fantasia: empRec.nome_fantasia,
      cnpj: empRec.cnpj,
      uf: empRec.uf,
      inscricao_estadual: empRec.inscricao_estadual,
    }
  } catch (err) {
    console.warn('Erro ao carregar dados da empresa para o Livro de Entradas:', err)
  }

  // 2. Buscar notas LANÇADAS filtradas pela DATA DE ENTRADA
  const condicoes = [`empresa_id = '${empresaId}'`, `status = 'Lançada'`, `ativo = true`]
  if (dataInicio) {
    condicoes.push(`data_entrada >= '${dataInicio}'`)
  }
  if (dataFim) {
    condicoes.push(`data_entrada <= '${dataFim}'`)
  }

  const filterNotas = condicoes.join(' && ')

  const notas = await pb.collection('notas_entrada').getFullList<NotaEntrada>({
    filter: filterNotas,
    sort: 'data_entrada,numero',
    expand: 'fornecedor_id',
  })

  // Mapear linhas do livro
  const linhasNotas: LinhaLivroEntrada[] = notas.map((n) => {
    const f = n.expand?.fornecedor_id
    return {
      id: n.id,
      data_entrada: n.data_entrada,
      modelo: n.modelo || '55',
      serie: n.serie || '',
      numero: n.numero,
      data_emissao: n.data_emissao,
      fornecedor_nome: f?.razao_social || f?.nome_fantasia || 'Não informado',
      fornecedor_cnpj: f?.cpf_cnpj || '',
      fornecedor_uf: f?.uf || '',
      valor_contabil: Number(n.valor_total) || 0,
      chave_acesso: n.chave_acesso,
      status: n.status,
    }
  })

  // 3. Buscar todos os itens dessas notas para apuração C190
  const notaIds = notas.map((n) => n.id)
  let todosItens: NotaEntradaItem[] = []

  if (notaIds.length > 0) {
    // Buscar em lotes de 50 notas para não estourar URL filter
    const tamanhoLote = 40
    for (let i = 0; i < notaIds.length; i += tamanhoLote) {
      const lote = notaIds.slice(i, i + tamanhoLote)
      const loteFilter = lote.map((id) => `nota_id = '${id}'`).join(' || ')
      try {
        const itensLote = await pb.collection('notas_entrada_itens').getFullList<NotaEntradaItem>({
          filter: `(${loteFilter}) && ativo = true`,
        })
        todosItens = todosItens.concat(itensLote)
      } catch (err) {
        console.warn('Erro ao carregar lote de itens para Livro de Entradas:', err)
      }
    }
  }

  // 4. Calcular C190 geral
  const resumoC190 = calcularResumoFiscalC190(todosItens)

  // 5. Agrupar totais por CFOP
  const mapaCfop = new Map<
    string,
    {
      cfop: string
      valorOperacao: number
      baseIcms: number
      valorIcms: number
      baseIcmsSt: number
      valorIcmsSt: number
      valorIpi: number
      isentasOutras: number
    }
  >()

  for (const reg of resumoC190) {
    if (!mapaCfop.has(reg.cfop)) {
      mapaCfop.set(reg.cfop, {
        cfop: reg.cfop,
        valorOperacao: reg.valorOperacao,
        baseIcms: reg.baseIcms,
        valorIcms: reg.valorIcms,
        baseIcmsSt: reg.baseIcmsSt,
        valorIcmsSt: reg.valorIcmsSt,
        valorIpi: reg.valorIpi,
        isentasOutras: reg.isentasOutras || 0,
      })
    } else {
      const g = mapaCfop.get(reg.cfop)!
      g.valorOperacao += reg.valorOperacao
      g.baseIcms += reg.baseIcms
      g.valorIcms += reg.valorIcms
      g.baseIcmsSt += reg.baseIcmsSt
      g.valorIcmsSt += reg.valorIcmsSt
      g.valorIpi += reg.valorIpi
      g.isentasOutras += reg.isentasOutras || 0
    }
  }

  const totaisPorCfop = Array.from(mapaCfop.values()).sort((a, b) => a.cfop.localeCompare(b.cfop))

  // 6. Totais gerais
  const totaisGerais: TotaisLivroEntradas = {
    totalNotas: linhasNotas.length,
    valorContabilTotal: linhasNotas.reduce((acc, n) => acc + n.valor_contabil, 0),
    baseIcmsTotal: resumoC190.reduce((acc, r) => acc + r.baseIcms, 0),
    valorIcmsTotal: resumoC190.reduce((acc, r) => acc + r.valorIcms, 0),
    baseIcmsStTotal: resumoC190.reduce((acc, r) => acc + r.baseIcmsSt, 0),
    valorIcmsStTotal: resumoC190.reduce((acc, r) => acc + r.valorIcmsSt, 0),
    valorIpiTotal: resumoC190.reduce((acc, r) => acc + r.valorIpi, 0),
    isentasOutrasTotal: resumoC190.reduce((acc, r) => acc + (r.isentasOutras || 0), 0),
  }

  return {
    periodo: {
      inicio: dataInicio,
      fim: dataFim,
    },
    empresa: dadosEmpresa,
    notas: linhasNotas,
    resumoC190,
    totaisPorCfop,
    totaisGerais,
  }
}
