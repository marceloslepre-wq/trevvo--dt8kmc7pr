import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface Grupo {
  id: string
  ativo: boolean
  codigo: string
  nome: string
  margem_padrao_percentual?: number | null
  perfil_tributario_id?: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface Categoria {
  id: string
  ativo: boolean
  grupo_id: string
  codigo?: string
  nome: string
  margem_padrao_percentual?: number | null
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    grupo_id?: Grupo
  }
}

export interface GrupoComCategorias extends Grupo {
  categorias: CategoriaComContagem[]
  quantidade_produtos: number
}

export interface CategoriaComContagem extends Categoria {
  quantidade_produtos: number
}

// -------------------------------------------------------------
// GRUPOS
// -------------------------------------------------------------

export async function listarGrupos(
  params: {
    busca?: string
    situacao?: 'todos' | 'ativos' | 'inativos'
    ordenacao?: string
  } = {},
): Promise<Grupo[]> {
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(codigo ~ '${b}' || nome ~ '${b}')`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'codigo'

  return await pb.collection('grupos').getFullList<Grupo>({
    filter,
    sort,
  })
}

export async function listarTodosGruposAtivos(): Promise<Grupo[]> {
  return await pb.collection('grupos').getFullList<Grupo>({
    filter: 'ativo = true',
    sort: 'codigo',
  })
}

export async function obterGrupo(id: string): Promise<Grupo> {
  return await pb.collection('grupos').getOne<Grupo>(id)
}

export async function salvarGrupo(dados: {
  id?: string
  codigo: string
  nome: string
  margem_padrao_percentual?: number | null
  perfil_tributario_id?: string
  ativo?: boolean
}): Promise<Grupo> {
  const codigoFormatado = dados.codigo.trim().toUpperCase()
  const nomeFormatado = dados.nome.trim()

  if (!codigoFormatado) {
    throw new Error('O código do grupo é obrigatório.')
  }
  if (!nomeFormatado) {
    throw new Error('O nome do grupo é obrigatório.')
  }

  // Validação de unicidade de código
  const dupCodigo = await pb.collection('grupos').getList<Grupo>(1, 1, {
    filter: dados.id
      ? `codigo = '${codigoFormatado.replace(/'/g, "\\'")}' && id != '${dados.id}'`
      : `codigo = '${codigoFormatado.replace(/'/g, "\\'")}'`,
  })
  if (dupCodigo.totalItems > 0) {
    throw new Error(`O código de grupo "${codigoFormatado}" já está em uso.`)
  }

  // Validação de unicidade de nome
  const dupNome = await pb.collection('grupos').getList<Grupo>(1, 1, {
    filter: dados.id
      ? `nome = '${nomeFormatado.replace(/'/g, "\\'")}' && id != '${dados.id}'`
      : `nome = '${nomeFormatado.replace(/'/g, "\\'")}'`,
  })
  if (dupNome.totalItems > 0) {
    throw new Error(`O nome de grupo "${nomeFormatado}" já está em uso.`)
  }

  let salvo: Grupo
  if (dados.id) {
    const antes = await obterGrupo(dados.id)
    salvo = await pb.collection('grupos').update<Grupo>(dados.id, {
      codigo: codigoFormatado,
      nome: nomeFormatado,
      margem_padrao_percentual:
        dados.margem_padrao_percentual !== undefined && dados.margem_padrao_percentual !== null
          ? Number(dados.margem_padrao_percentual)
          : null,
      perfil_tributario_id: dados.perfil_tributario_id?.trim() || '',
      ativo: dados.ativo !== undefined ? dados.ativo : antes.ativo,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'grupos',
      registro_id: salvo.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  } else {
    salvo = await pb.collection('grupos').create<Grupo>({
      codigo: codigoFormatado,
      nome: nomeFormatado,
      margem_padrao_percentual:
        dados.margem_padrao_percentual !== undefined && dados.margem_padrao_percentual !== null
          ? Number(dados.margem_padrao_percentual)
          : null,
      perfil_tributario_id: dados.perfil_tributario_id?.trim() || '',
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'grupos',
      registro_id: salvo.id,
      acao: 'inclusao',
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  }

  return salvo
}

export async function contarCategoriasAtivasDoGrupo(grupoId: string): Promise<number> {
  const res = await pb.collection('categorias').getList(1, 1, {
    filter: `grupo_id = '${grupoId}' && ativo = true`,
  })
  return res.totalItems
}

export async function inativarGrupo(id: string): Promise<void> {
  // Regra de negócio obrigatória: não permitir inativar um grupo com categorias ativas
  const ativas = await contarCategoriasAtivasDoGrupo(id)
  if (ativas > 0) {
    throw new Error(
      `Não é possível inativar este grupo pois ele possui ${ativas} categoria(s) ativa(s). Inative ou transfira as categorias antes de inativar o grupo.`,
    )
  }

  const antes = await obterGrupo(id)
  const atualizado = await pb.collection('grupos').update<Grupo>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'grupos',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarGrupo(id: string): Promise<void> {
  const antes = await obterGrupo(id)
  const atualizado = await pb.collection('grupos').update<Grupo>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'grupos',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

// -------------------------------------------------------------
// CATEGORIAS
// -------------------------------------------------------------

export async function listarCategoriasPorGrupo(
  grupoId: string,
  somenteAtivos = true,
): Promise<Categoria[]> {
  const condicoes: string[] = [`grupo_id = '${grupoId}'`]
  if (somenteAtivos) {
    condicoes.push('ativo = true')
  }

  return await pb.collection('categorias').getFullList<Categoria>({
    filter: condicoes.join(' && '),
    sort: 'codigo,nome',
  })
}

export async function listarTodasCategoriasAtivas(): Promise<Categoria[]> {
  return await pb.collection('categorias').getFullList<Categoria>({
    filter: 'ativo = true',
    sort: 'nome',
    expand: 'grupo_id',
  })
}

export async function obterCategoria(id: string): Promise<Categoria> {
  return await pb.collection('categorias').getOne<Categoria>(id, {
    expand: 'grupo_id',
  })
}

export async function salvarCategoria(dados: {
  id?: string
  grupo_id: string
  codigo?: string
  nome: string
  margem_padrao_percentual?: number | null
  ativo?: boolean
}): Promise<Categoria> {
  const nomeFormatado = dados.nome.trim()
  const codigoFormatado = dados.codigo?.trim().toUpperCase() || ''
  const grupoId = dados.grupo_id.trim()

  if (!grupoId) {
    throw new Error('O grupo é obrigatório para cadastrar a categoria.')
  }
  if (!nomeFormatado) {
    throw new Error('O nome da categoria é obrigatório.')
  }

  // Verificar se o grupo está ativo
  const grupo = await obterGrupo(grupoId)
  if (!grupo.ativo) {
    throw new Error('Não é possível adicionar uma categoria a um grupo inativo.')
  }

  // Regra: nome único DENTRO do grupo
  const dupNome = await pb.collection('categorias').getList<Categoria>(1, 1, {
    filter: dados.id
      ? `grupo_id = '${grupoId}' && nome = '${nomeFormatado.replace(/'/g, "\\'")}' && id != '${dados.id}'`
      : `grupo_id = '${grupoId}' && nome = '${nomeFormatado.replace(/'/g, "\\'")}'`,
  })
  if (dupNome.totalItems > 0) {
    throw new Error(`Já existe uma categoria com o nome "${nomeFormatado}" dentro deste grupo.`)
  }

  let salva: Categoria
  if (dados.id) {
    const antes = await obterCategoria(dados.id)
    salva = await pb.collection('categorias').update<Categoria>(dados.id, {
      grupo_id: grupoId,
      codigo: codigoFormatado,
      nome: nomeFormatado,
      margem_padrao_percentual:
        dados.margem_padrao_percentual !== undefined && dados.margem_padrao_percentual !== null
          ? Number(dados.margem_padrao_percentual)
          : null,
      ativo: dados.ativo !== undefined ? dados.ativo : antes.ativo,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'categorias',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    salva = await pb.collection('categorias').create<Categoria>({
      grupo_id: grupoId,
      codigo: codigoFormatado,
      nome: nomeFormatado,
      margem_padrao_percentual:
        dados.margem_padrao_percentual !== undefined && dados.margem_padrao_percentual !== null
          ? Number(dados.margem_padrao_percentual)
          : null,
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'categorias',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarCategoria(id: string): Promise<void> {
  const antes = await obterCategoria(id)
  const atualizada = await pb.collection('categorias').update<Categoria>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'categorias',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

export async function ativarCategoria(id: string): Promise<void> {
  const antes = await obterCategoria(id)
  // Verificar se o grupo está ativo
  const grupo = await obterGrupo(antes.grupo_id)
  if (!grupo.ativo) {
    throw new Error('Não é possível reativar uma categoria cujo grupo principal está inativo.')
  }

  const atualizada = await pb.collection('categorias').update<Categoria>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'categorias',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

// -------------------------------------------------------------
// ÁRVORE MERCADOLÓGICA (Grupos com Categorias e contagem futura de produtos)
// -------------------------------------------------------------

export async function carregarArvoreMercadologica(
  params: {
    busca?: string
    situacao?: 'todos' | 'ativos' | 'inativos'
  } = {},
): Promise<GrupoComCategorias[]> {
  // 1. Carrega todos os grupos
  const grupos = await listarGrupos({
    situacao: params.situacao,
    ordenacao: 'codigo,nome',
  })

  // 2. Carrega todas as categorias
  const condicoesCat: string[] = []
  if (params.situacao === 'ativos') {
    condicoesCat.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoesCat.push('ativo = false')
  }
  const categorias = await pb.collection('categorias').getFullList<Categoria>({
    filter: condicoesCat.length > 0 ? condicoesCat.join(' && ') : '',
    sort: 'codigo,nome',
  })

  // 3. Agrupar categorias por grupo_id
  const mapaCategorias: Record<string, Categoria[]> = {}
  categorias.forEach((cat) => {
    if (!mapaCategorias[cat.grupo_id]) {
      mapaCategorias[cat.grupo_id] = []
    }
    mapaCategorias[cat.grupo_id].push(cat)
  })

  // 3.1 Contagem real de produtos por grupo e por categoria
  const contagemGrupo: Record<string, number> = {}
  const contagemCategoria: Record<string, number> = {}
  try {
    const prods = await pb.collection('produtos').getFullList<{
      id: string
      grupo_id?: string
      categoria_id?: string
      ativo: boolean
    }>({
      fields: 'id,grupo_id,categoria_id,ativo',
      filter: 'ativo = true',
    })
    for (const p of prods) {
      if (p.grupo_id) {
        contagemGrupo[p.grupo_id] = (contagemGrupo[p.grupo_id] || 0) + 1
      }
      if (p.categoria_id) {
        contagemCategoria[p.categoria_id] = (contagemCategoria[p.categoria_id] || 0) + 1
      }
    }
  } catch (errProd) {
    console.warn('Não foi possível obter contagem de produtos:', errProd)
  }

  // 4. Montar estrutura em árvore com contagem real de produtos
  const arvore: GrupoComCategorias[] = grupos.map((g) => {
    const catsDoGrupo = (mapaCategorias[g.id] || []).map((cat) => ({
      ...cat,
      quantidade_produtos: contagemCategoria[cat.id] || 0,
    }))
    return {
      ...g,
      categorias: catsDoGrupo,
      quantidade_produtos: contagemGrupo[g.id] || 0,
    }
  })

  // 5. Aplicar filtro de busca sobre grupo ou categorias
  if (params.busca && params.busca.trim()) {
    const termo = params.busca.trim().toLowerCase()
    return arvore
      .map((g) => {
        const grupoCombina =
          g.nome.toLowerCase().includes(termo) || g.codigo.toLowerCase().includes(termo)
        const catsFiltradas = g.categorias.filter(
          (c) =>
            c.nome.toLowerCase().includes(termo) ||
            (c.codigo && c.codigo.toLowerCase().includes(termo)),
        )

        if (grupoCombina) {
          // Se o grupo combina com o termo, mostra ele e todas as suas categorias (ou as que batem se tiver)
          return g
        }

        if (catsFiltradas.length > 0) {
          // Se alguma categoria combina, mostra o grupo com apenas as categorias que combinam
          return {
            ...g,
            categorias: catsFiltradas,
          }
        }

        return null
      })
      .filter((item): item is GrupoComCategorias => item !== null)
  }

  return arvore
}
