import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export const TIPOS_TABELAS_FISCAIS = [
  {
    tipo: 'ORIGEM',
    titulo: 'Origem da Mercadoria',
    descricao: 'Origem nacional ou estrangeira (0 a 8)',
  },
  {
    tipo: 'CST_ICMS',
    titulo: 'CST ICMS (Regime Normal)',
    descricao: 'Códigos de Situação Tributária do ICMS',
  },
  {
    tipo: 'CSOSN',
    titulo: 'CSOSN (Simples Nacional)',
    descricao: 'Código de Situação da Operação no Simples Nacional',
  },
  {
    tipo: 'MOD_BC_ICMS',
    titulo: 'Modalidade BC ICMS',
    descricao: 'Modalidades de determinação da base de cálculo do ICMS',
  },
  {
    tipo: 'MOD_BC_ICMS_ST',
    titulo: 'Modalidade BC ICMS ST',
    descricao: 'Modalidades da base de cálculo do ICMS ST',
  },
  { tipo: 'CST_IPI', titulo: 'CST IPI', descricao: 'Códigos de Situação Tributária do IPI' },
  {
    tipo: 'CST_PIS_COFINS',
    titulo: 'CST PIS / COFINS',
    descricao: 'Tabela unificada para apuração de PIS e COFINS',
  },
  {
    tipo: 'TIPO_ITEM_SPED',
    titulo: 'Tipo do Item (SPED 0200)',
    descricao: 'Classificação física do produto no Registro 0200',
  },
  { tipo: 'CRT', titulo: 'CRT', descricao: 'Código de Regime Tributário' },
  {
    tipo: 'IND_IE_DEST',
    titulo: 'Indicador IE Destinatário',
    descricao: 'Indicador da Inscrição Estadual do Destinatário',
  },
  {
    tipo: 'CST_IBS_CBS',
    titulo: 'CST IBS / CBS (Reforma)',
    descricao: 'Situações tributárias do IBS e CBS',
  },
  {
    tipo: 'CCLASSTRIB',
    titulo: 'CCLASSTRIB (Reforma)',
    descricao: 'Código de Classificação Tributária',
  },
] as const

export type TipoTabelaFiscal = (typeof TIPOS_TABELAS_FISCAIS)[number]['tipo'] | string

export interface CodigoFiscal {
  id: string
  ativo: boolean
  tipo: string
  codigo: string
  descricao: string
  observacao?: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarCodigosFiscaisParams {
  tipo?: string
  busca?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  page?: number
  perPage?: number
  ordenacao?: string
}

export interface ResultadoPaginado<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

export interface ItemImportacaoCSV {
  tipo: string
  codigo: string
  descricao: string
  observacao?: string
}

export interface ResumoImportacaoCSV {
  totalLidos: number
  novos: number
  atualizados: number
  erros: { linha: number; mensagem: string }[]
  itensValidos: ItemImportacaoCSV[]
}

export async function listarCodigosFiscais(
  params: ListarCodigosFiscaisParams = {},
): Promise<ResultadoPaginado<CodigoFiscal>> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.tipo && params.tipo !== 'TODOS') {
    condicoes.push(`tipo = '${params.tipo.trim()}'`)
  }

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(codigo ~ '${b}' || descricao ~ '${b}' || observacao ~ '${b}')`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'codigo'

  const res = await pb.collection('tabelas_fiscais_codigos').getList<CodigoFiscal>(page, perPage, {
    filter,
    sort,
  })

  return res
}

export async function listarCodigosPorTipo(
  tipo: string,
  somenteAtivos = true,
): Promise<CodigoFiscal[]> {
  const condicoes = [`tipo = '${tipo.trim()}'`]
  if (somenteAtivos) {
    condicoes.push('ativo = true')
  }
  return await pb.collection('tabelas_fiscais_codigos').getFullList<CodigoFiscal>({
    filter: condicoes.join(' && '),
    sort: 'codigo',
  })
}

export async function obterCodigoFiscal(id: string): Promise<CodigoFiscal> {
  return await pb.collection('tabelas_fiscais_codigos').getOne<CodigoFiscal>(id)
}

export async function salvarCodigoFiscal(dados: {
  id?: string
  tipo: string
  codigo: string
  descricao: string
  observacao?: string
  ativo?: boolean
}): Promise<CodigoFiscal> {
  const tipoFormatado = dados.tipo.trim().toUpperCase()
  const codigoFormatado = dados.codigo.trim()
  const descricaoFormatada = dados.descricao.trim()
  const observacaoFormatada = (dados.observacao || '').trim()

  if (!tipoFormatado) {
    throw new Error('O tipo da tabela fiscal é obrigatório.')
  }
  if (!codigoFormatado) {
    throw new Error('O código fiscal é obrigatório.')
  }
  if (!descricaoFormatada) {
    throw new Error('A descrição é obrigatória.')
  }

  // Checa unicidade no par (tipo, codigo)
  const duplicados = await pb.collection('tabelas_fiscais_codigos').getList<CodigoFiscal>(1, 1, {
    filter: dados.id
      ? `tipo = '${tipoFormatado}' && codigo = '${codigoFormatado}' && id != '${dados.id}'`
      : `tipo = '${tipoFormatado}' && codigo = '${codigoFormatado}'`,
  })

  if (duplicados.totalItems > 0) {
    throw new Error(
      `O código "${codigoFormatado}" já está cadastrado para o tipo "${tipoFormatado}".`,
    )
  }

  let salvo: CodigoFiscal
  if (dados.id) {
    const antes = await obterCodigoFiscal(dados.id)
    salvo = await pb.collection('tabelas_fiscais_codigos').update<CodigoFiscal>(dados.id, {
      tipo: tipoFormatado,
      codigo: codigoFormatado,
      descricao: descricaoFormatada,
      observacao: observacaoFormatada,
      ativo: dados.ativo !== undefined ? dados.ativo : antes.ativo,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'tabelas_fiscais_codigos',
      registro_id: salvo.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  } else {
    salvo = await pb.collection('tabelas_fiscais_codigos').create<CodigoFiscal>({
      tipo: tipoFormatado,
      codigo: codigoFormatado,
      descricao: descricaoFormatada,
      observacao: observacaoFormatada,
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'tabelas_fiscais_codigos',
      registro_id: salvo.id,
      acao: 'inclusao',
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  }

  return salvo
}

export async function inativarCodigoFiscal(id: string): Promise<void> {
  const antes = await obterCodigoFiscal(id)
  const atualizado = await pb.collection('tabelas_fiscais_codigos').update<CodigoFiscal>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'tabelas_fiscais_codigos',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarCodigoFiscal(id: string): Promise<void> {
  const antes = await obterCodigoFiscal(id)
  const atualizado = await pb.collection('tabelas_fiscais_codigos').update<CodigoFiscal>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'tabelas_fiscais_codigos',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

/**
 * Faz a análise prévia do CSV de Códigos Fiscais (colunas: tipo;codigo;descricao;observacao)
 */
export async function analisarCSV(conteudoCSV: string): Promise<ResumoImportacaoCSV> {
  const linhas = conteudoCSV.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const erros: { linha: number; mensagem: string }[] = []
  const itensValidos: ItemImportacaoCSV[] = []

  let indiceInicio = 0
  if (linhas.length > 0) {
    const primeiraLinha = linhas[0].toLowerCase()
    if (
      primeiraLinha.includes('tipo') &&
      primeiraLinha.includes('codigo') &&
      primeiraLinha.includes('descricao')
    ) {
      indiceInicio = 1
    }
  }

  for (let i = indiceInicio; i < linhas.length; i++) {
    const numeroLinha = i + 1
    const linhaTexto = linhas[i].trim()
    if (!linhaTexto) continue

    // Suporte a separador ; ou ,
    const partes = linhaTexto.includes(';') ? linhaTexto.split(';') : linhaTexto.split(',')
    if (partes.length < 3) {
      erros.push({
        linha: numeroLinha,
        mensagem: 'Número insuficiente de colunas. Esperado: tipo;codigo;descricao;observacao',
      })
      continue
    }

    const tipo =
      partes[0]
        ?.trim()
        .toUpperCase()
        .replace(/^["']|["']$/g, '') || ''
    const codigo = partes[1]?.trim().replace(/^["']|["']$/g, '') || ''
    const descricao = partes[2]?.trim().replace(/^["']|["']$/g, '') || ''
    const observacao = partes[3]
      ? partes
          .slice(3)
          .join(';')
          .trim()
          .replace(/^["']|["']$/g, '')
      : ''

    if (!tipo) {
      erros.push({ linha: numeroLinha, mensagem: 'Coluna "tipo" está vazia.' })
      continue
    }
    if (!codigo) {
      erros.push({ linha: numeroLinha, mensagem: 'Coluna "codigo" está vazia.' })
      continue
    }
    if (!descricao) {
      erros.push({ linha: numeroLinha, mensagem: 'Coluna "descricao" está vazia.' })
      continue
    }

    itensValidos.push({ tipo, codigo, descricao, observacao })
  }

  // Consulta no banco os existentes para calcular novos vs atualizados
  let novos = 0
  let atualizados = 0

  for (const item of itensValidos) {
    try {
      const exist = await pb.collection('tabelas_fiscais_codigos').getList<CodigoFiscal>(1, 1, {
        filter: `tipo = '${item.tipo}' && codigo = '${item.codigo}'`,
      })
      if (exist.totalItems > 0) {
        atualizados++
      } else {
        novos++
      }
    } catch {
      novos++
    }
  }

  return {
    totalLidos: linhas.length - indiceInicio,
    novos,
    atualizados,
    erros,
    itensValidos,
  }
}

/**
 * Confirma a importação dos itens válidos no banco com auditoria
 */
export async function executarImportacaoCSV(
  itens: ItemImportacaoCSV[],
  onProgresso?: (processados: number, total: number) => void,
): Promise<{ inseridos: number; atualizados: number }> {
  let inseridos = 0
  let atualizados = 0

  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx]
    const exist = await pb.collection('tabelas_fiscais_codigos').getList<CodigoFiscal>(1, 1, {
      filter: `tipo = '${item.tipo}' && codigo = '${item.codigo}'`,
    })

    if (exist.totalItems > 0) {
      const idExistente = exist.items[0].id
      const antes = exist.items[0]
      const salvo = await pb
        .collection('tabelas_fiscais_codigos')
        .update<CodigoFiscal>(idExistente, {
          descricao: item.descricao,
          observacao: item.observacao || antes.observacao || '',
          ativo: true,
          updated_by: pb.authStore.record?.id || null,
        })

      await registrarAuditoria({
        tabela: 'tabelas_fiscais_codigos',
        registro_id: salvo.id,
        acao: 'alteracao',
        valores_antes: antes as unknown as Record<string, unknown>,
        valores_depois: salvo as unknown as Record<string, unknown>,
      })
      atualizados++
    } else {
      const salvo = await pb.collection('tabelas_fiscais_codigos').create<CodigoFiscal>({
        tipo: item.tipo,
        codigo: item.codigo,
        descricao: item.descricao,
        observacao: item.observacao || '',
        ativo: true,
        created_by: pb.authStore.record?.id || null,
        updated_by: pb.authStore.record?.id || null,
      })

      await registrarAuditoria({
        tabela: 'tabelas_fiscais_codigos',
        registro_id: salvo.id,
        acao: 'inclusao',
        valores_depois: salvo as unknown as Record<string, unknown>,
      })
      inseridos++
    }

    if (onProgresso) {
      onProgresso(idx + 1, itens.length)
    }
  }

  return { inseridos, atualizados }
}
