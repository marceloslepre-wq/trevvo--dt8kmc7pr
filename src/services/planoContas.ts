import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export type TipoContaPlano = 'Receita' | 'Despesa' | 'Sem resultado'
export type NaturezaContaPlano = 'Sintética' | 'Analítica'
export type GrupoDrePlano =
  | 'Receita bruta'
  | 'Deduções da receita'
  | 'Custo das mercadorias'
  | 'Despesas operacionais'
  | 'Resultado financeiro'
  | 'Outras receitas e despesas'
  | 'Fora da DRE'

export interface PlanoConta {
  id: string
  codigo: string
  descricao: string
  tipo: TipoContaPlano
  natureza: NaturezaContaPlano
  conta_pai_id?: string
  grupo_dre: GrupoDrePlano
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    conta_pai_id?: PlanoConta
  }
}

export interface PlanoContaNoArvore extends PlanoConta {
  filhos: PlanoContaNoArvore[]
  nivel: number
}

export interface ListarPlanoContasParams {
  busca?: string
  tipo?: TipoContaPlano | 'todos'
  natureza?: NaturezaContaPlano | 'todos'
  situacao?: 'todos' | 'ativos' | 'inativos'
  apenasAnaliticas?: boolean
}

export async function listarTodasContasPlano(
  params: ListarPlanoContasParams = {},
): Promise<PlanoConta[]> {
  const condicoes: string[] = []

  if (params.situacao === 'ativos' || !params.situacao) {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  if (params.tipo && params.tipo !== 'todos') {
    condicoes.push(`tipo = '${params.tipo}'`)
  }

  if (params.natureza && params.natureza !== 'todos') {
    condicoes.push(`natureza = '${params.natureza}'`)
  }

  if (params.apenasAnaliticas) {
    condicoes.push("natureza = 'Analítica'")
  }

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(codigo ~ '${b}' || descricao ~ '${b}')`)
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''

  const res = await pb.collection('plano_contas').getFullList<PlanoConta>({
    filter,
    sort: 'codigo',
    expand: 'conta_pai_id',
  })

  return res
}

export async function obterContaPlanoPorId(id: string): Promise<PlanoConta> {
  return await pb.collection('plano_contas').getOne<PlanoConta>(id, {
    expand: 'conta_pai_id',
  })
}

export async function obterContaPlanoPorCodigo(codigo: string): Promise<PlanoConta | null> {
  try {
    const rec = await pb
      .collection('plano_contas')
      .getFirstListItem<PlanoConta>(`codigo = '${codigo.trim()}'`)
    return rec
  } catch {
    return null
  }
}

export async function verificarSeContaPossuiFilhos(id: string): Promise<boolean> {
  try {
    const total = await pb.collection('plano_contas').getList(1, 1, {
      filter: `conta_pai_id = '${id}' && ativo = true`,
    })
    return total.totalItems > 0
  } catch {
    return false
  }
}

/**
 * Verifica se a conta já possui lançamentos ou vínculos no sistema.
 * Por enquanto, as tabelas de títulos a pagar, receber e movimentações bancárias
 * ainda não existem (serão criadas em etapas futuras). A verificação estrutural
 * já fica pronta aqui e retorna false até que essas tabelas sejam adicionadas.
 */
export async function verificarSeContaPossuiLancamentos(id: string): Promise<boolean> {
  // Verificação contra contas a pagar/receber/movimentos quando existirem
  const tabelasMovimento = ['titulos_pagar', 'titulos_receber', 'movimentos_bancarios']
  for (const tab of tabelasMovimento) {
    try {
      const res = await pb.collection(tab).getList(1, 1, {
        filter: `plano_contas_id = '${id}'`,
      })
      if (res.totalItems > 0) return true
    } catch {
      // Coleção ainda não criada nesta etapa — continua
    }
  }

  // Verifica se é referenciada em configurações financeiras
  try {
    const configs = await pb.collection('config_financeira_empresa').getList(1, 1, {
      filter: `plano_compras_revenda_id = '${id}' || plano_industrializacao_id = '${id}' || plano_uso_consumo_id = '${id}' || plano_imobilizado_id = '${id}' || plano_outras_entradas_id = '${id}' || plano_vendas_id = '${id}' || plano_juros_recebidos_id = '${id}' || plano_juros_pagos_id = '${id}' || plano_descontos_obtidos_id = '${id}' || plano_descontos_concedidos_id = '${id}' || plano_transferencias_id = '${id}'`,
    })
    if (configs.totalItems > 0) return true
  } catch {
    // ignora
  }

  return false
}

export async function salvarContaPlano(dados: Partial<PlanoConta>): Promise<PlanoConta> {
  const ehEdicao = Boolean(dados.id)
  let antes: PlanoConta | null = null

  // Validações
  if (!dados.codigo || !dados.codigo.trim()) {
    throw new Error('O código da conta é obrigatório.')
  }
  if (!dados.descricao || !dados.descricao.trim()) {
    throw new Error('A descrição da conta é obrigatória.')
  }
  if (!dados.tipo) {
    throw new Error('O tipo da conta é obrigatório.')
  }
  if (!dados.natureza) {
    throw new Error('A natureza da conta é obrigatória.')
  }
  if (!dados.grupo_dre) {
    throw new Error('O grupo da DRE é obrigatório.')
  }

  const codigoLimpo = dados.codigo.trim()

  // Verifica unicidade do código
  const existente = await obterContaPlanoPorCodigo(codigoLimpo)
  if (existente && (!ehEdicao || existente.id !== dados.id)) {
    throw new Error(`Já existe uma conta cadastrada com o código "${codigoLimpo}".`)
  }

  const payload: Record<string, unknown> = {
    codigo: codigoLimpo,
    descricao: dados.descricao.trim(),
    tipo: dados.tipo,
    natureza: dados.natureza,
    conta_pai_id: dados.conta_pai_id || null,
    grupo_dre: dados.grupo_dre,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: PlanoConta
  if (ehEdicao && dados.id) {
    antes = await obterContaPlanoPorId(dados.id)
    salva = await pb.collection('plano_contas').update<PlanoConta>(dados.id, payload)

    await registrarAuditoria({
      tabela: 'plano_contas',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salva = await pb.collection('plano_contas').create<PlanoConta>(payload)

    await registrarAuditoria({
      tabela: 'plano_contas',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarContaPlano(id: string): Promise<void> {
  const antes = await obterContaPlanoPorId(id)

  const atualizado = await pb.collection('plano_contas').update<PlanoConta>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'plano_contas',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarContaPlano(id: string): Promise<void> {
  const antes = await obterContaPlanoPorId(id)

  const atualizado = await pb.collection('plano_contas').update<PlanoConta>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'plano_contas',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function excluirOuInativarContaPlano(
  id: string,
): Promise<{ acao: 'excluido' | 'inativado'; mensagem: string }> {
  const temFilhos = await verificarSeContaPossuiFilhos(id)
  if (temFilhos) {
    throw new Error(
      'Não é possível excluir nem inativar esta conta pois existem contas filhas vinculadas a ela.',
    )
  }

  const temLancamentos = await verificarSeContaPossuiLancamentos(id)
  if (temLancamentos) {
    // Conta com lançamentos não pode ser excluída fisicamente, só inativada
    await inativarContaPlano(id)
    return {
      acao: 'inativado',
      mensagem: 'Esta conta possui vínculos no sistema e foi inativada para manter o histórico.',
    }
  }

  // Se não tem lançamentos nem filhos, exclui fisicamente ou inativa conforme padrão
  const antes = await obterContaPlanoPorId(id)
  await pb.collection('plano_contas').delete(id)

  await registrarAuditoria({
    tabela: 'plano_contas',
    registro_id: id,
    acao: 'exclusao',
    valores_antes: antes as unknown as Record<string, unknown>,
  })

  return {
    acao: 'excluido',
    mensagem: 'Conta excluída com sucesso.',
  }
}

/**
 * Monta a estrutura em árvore a partir da lista plana de contas
 */
export function montarArvorePlanoContas(contas: PlanoConta[]): PlanoContaNoArvore[] {
  const mapa: Record<string, PlanoContaNoArvore> = {}
  const raizes: PlanoContaNoArvore[] = []

  // Inicializa mapa
  for (const c of contas) {
    mapa[c.id] = {
      ...c,
      filhos: [],
      nivel: c.codigo.split('.').length,
    }
  }

  // Liga filhos aos pais
  for (const c of contas) {
    const no = mapa[c.id]
    if (c.conta_pai_id && mapa[c.conta_pai_id]) {
      mapa[c.conta_pai_id].filhos.push(no)
    } else {
      raizes.push(no)
    }
  }

  // Ordena por código
  const ordenarNos = (lista: PlanoContaNoArvore[]) => {
    lista.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
    lista.forEach((item) => ordenarNos(item.filhos))
  }

  ordenarNos(raizes)
  return raizes
}

/**
 * Exporta as contas em formato CSV (colunas: codigo;descricao;tipo;natureza;codigo_pai;grupo_dre)
 */
export function exportarPlanoContasCsv(contas: PlanoConta[]): string {
  const colunas = ['codigo', 'descricao', 'tipo', 'natureza', 'codigo_pai', 'grupo_dre']
  const mapaCodigoPorId: Record<string, string> = {}
  contas.forEach((c) => {
    mapaCodigoPorId[c.id] = c.codigo
  })

  const linhas = [colunas.join(';')]

  const ordenadas = [...contas].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
  )

  for (const c of ordenadas) {
    const codigoPai = c.conta_pai_id ? mapaCodigoPorId[c.conta_pai_id] || '' : ''
    const row = [
      c.codigo,
      `"${c.descricao.replace(/"/g, '""')}"`,
      c.tipo,
      c.natureza,
      codigoPai,
      c.grupo_dre,
    ]
    linhas.push(row.join(';'))
  }

  return linhas.join('\n')
}

export interface ItemImportacaoPlanoConta {
  codigo: string
  descricao: string
  tipo: TipoContaPlano
  natureza: NaturezaContaPlano
  codigo_pai?: string
  grupo_dre: GrupoDrePlano
}

export interface ResultadoImportacaoPlanoContas {
  totalLidos: number
  criados: number
  atualizados: number
  erros: { linha: number; erro: string }[]
}

/**
 * Importa contas a partir do conteúdo de um CSV (separador ';' ou ',')
 */
export async function importarPlanoContasCsv(
  csvTexto: string,
): Promise<ResultadoImportacaoPlanoContas> {
  const linhas = csvTexto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (linhas.length <= 1) {
    throw new Error('O arquivo CSV está vazio ou contém apenas o cabeçalho.')
  }

  // Detecta separador da primeira linha
  const primeiraLinha = linhas[0]
  const separador = primeiraLinha.includes(';') ? ';' : ','

  const cabecalhos = primeiraLinha
    .split(separador)
    .map((c) => c.replace(/["']/g, '').trim().toLowerCase())
  const idxCodigo = cabecalhos.indexOf('codigo')
  const idxDescricao = cabecalhos.indexOf('descricao')
  const idxTipo = cabecalhos.indexOf('tipo')
  const idxNatureza = cabecalhos.indexOf('natureza')
  const idxCodigoPai = cabecalhos.indexOf('codigo_pai')
  const idxGrupoDre = cabecalhos.indexOf('grupo_dre')

  if (idxCodigo === -1 || idxDescricao === -1) {
    throw new Error('Cabeçalho inválido. As colunas "codigo" e "descricao" são obrigatórias.')
  }

  const resultado: ResultadoImportacaoPlanoContas = {
    totalLidos: linhas.length - 1,
    criados: 0,
    atualizados: 0,
    erros: [],
  }

  // Carrega todas as contas existentes para resolver IDs por código
  const contasExistentes = await pb.collection('plano_contas').getFullList<PlanoConta>()
  const mapaExistentes: Record<string, PlanoConta> = {}
  contasExistentes.forEach((c) => {
    mapaExistentes[c.codigo] = c
  })

  // Primeiro passo: parse de todas as linhas válidas
  const itensParaSalvar: { linhaNum: number; item: ItemImportacaoPlanoConta }[] = []

  for (let i = 1; i < linhas.length; i++) {
    const rawLinha = linhas[i]
    const partes: string[] = []
    let dentroAspas = false
    let buffer = ''
    for (let c = 0; c < rawLinha.length; c++) {
      const char = rawLinha[c]
      if (char === '"') {
        dentroAspas = !dentroAspas
      } else if (char === separador && !dentroAspas) {
        partes.push(buffer.trim())
        buffer = ''
      } else {
        buffer += char
      }
    }
    partes.push(buffer.trim())

    const codigo = partes[idxCodigo]?.replace(/["']/g, '').trim()
    const descricao = partes[idxDescricao]?.replace(/["']/g, '').trim()
    const tipoRaw = idxTipo !== -1 ? partes[idxTipo]?.replace(/["']/g, '').trim() : 'Despesa'
    const naturezaRaw =
      idxNatureza !== -1 ? partes[idxNatureza]?.replace(/["']/g, '').trim() : 'Analítica'
    const codigoPai = idxCodigoPai !== -1 ? partes[idxCodigoPai]?.replace(/["']/g, '').trim() : ''
    const grupoDreRaw =
      idxGrupoDre !== -1 ? partes[idxGrupoDre]?.replace(/["']/g, '').trim() : 'Fora da DRE'

    if (!codigo || !descricao) {
      resultado.erros.push({ linha: i + 1, erro: 'Código e descrição são obrigatórios.' })
      continue
    }

    let tipo: TipoContaPlano = 'Despesa'
    if (tipoRaw.toLowerCase().startsWith('rec')) tipo = 'Receita'
    else if (tipoRaw.toLowerCase().startsWith('sem')) tipo = 'Sem resultado'

    let natureza: NaturezaContaPlano = 'Analítica'
    if (naturezaRaw.toLowerCase().startsWith('sin')) natureza = 'Sintética'

    let grupo_dre: GrupoDrePlano = 'Fora da DRE'
    const gLow = grupoDreRaw.toLowerCase()
    if (gLow.includes('bruta')) grupo_dre = 'Receita bruta'
    else if (gLow.includes('dedu')) grupo_dre = 'Deduções da receita'
    else if (gLow.includes('custo')) grupo_dre = 'Custo das mercadorias'
    else if (gLow.includes('operaciona')) grupo_dre = 'Despesas operacionais'
    else if (gLow.includes('resultado financeiro') || gLow.includes('financeir'))
      grupo_dre = 'Resultado financeiro'
    else if (gLow.includes('outras')) grupo_dre = 'Outras receitas e despesas'

    itensParaSalvar.push({
      linhaNum: i + 1,
      item: {
        codigo,
        descricao,
        tipo,
        natureza,
        codigo_pai: codigoPai || undefined,
        grupo_dre,
      },
    })
  }

  // Ordena por código para criar pais antes de filhos
  itensParaSalvar.sort((a, b) =>
    a.item.codigo.localeCompare(b.item.codigo, undefined, { numeric: true }),
  )

  for (const entry of itensParaSalvar) {
    try {
      const { item } = entry
      let contaPaiId: string | undefined = undefined
      if (item.codigo_pai) {
        if (mapaExistentes[item.codigo_pai]) {
          contaPaiId = mapaExistentes[item.codigo_pai].id
        }
      }

      const contaExistente = mapaExistentes[item.codigo]
      if (contaExistente) {
        const salva = await salvarContaPlano({
          id: contaExistente.id,
          codigo: item.codigo,
          descricao: item.descricao,
          tipo: item.tipo,
          natureza: item.natureza,
          conta_pai_id: contaPaiId,
          grupo_dre: item.grupo_dre,
          ativo: true,
        })
        mapaExistentes[item.codigo] = salva
        resultado.atualizados++
      } else {
        const salva = await salvarContaPlano({
          codigo: item.codigo,
          descricao: item.descricao,
          tipo: item.tipo,
          natureza: item.natureza,
          conta_pai_id: contaPaiId,
          grupo_dre: item.grupo_dre,
          ativo: true,
        })
        mapaExistentes[item.codigo] = salva
        resultado.criados++
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar linha'
      resultado.erros.push({ linha: entry.linhaNum, erro: msg })
    }
  }

  return resultado
}
