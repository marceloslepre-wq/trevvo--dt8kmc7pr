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

export interface Subcategoria {
  id: string
  ativo: boolean
  categoria_id: string
  codigo?: string
  nome: string
  margem_padrao_percentual?: number | null
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    categoria_id?: Categoria
  }
}

export interface SubcategoriaComContagem extends Subcategoria {
  quantidade_produtos: number
}

export interface CategoriaComContagem extends Categoria {
  quantidade_produtos: number
  subcategorias?: SubcategoriaComContagem[]
}

export interface GrupoComCategorias extends Grupo {
  categorias: CategoriaComContagem[]
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
    assinante_id?: string
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

  if (params.assinante_id) {
    condicoes.push(`assinante_id = '${params.assinante_id}'`)
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'codigo'

  return await pb.collection('grupos').getFullList<Grupo>({
    filter,
    sort,
  })
}

export async function listarTodosGruposAtivos(assinanteId?: string): Promise<Grupo[]> {
  const conds = ['ativo = true']
  if (assinanteId) {
    conds.push(`assinante_id = '${assinanteId}'`)
  }
  return await pb.collection('grupos').getFullList<Grupo>({
    filter: conds.join(' && '),
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
  assinanteId?: string,
): Promise<Categoria[]> {
  const condicoes: string[] = [`grupo_id = '${grupoId}'`]
  if (somenteAtivos) {
    condicoes.push('ativo = true')
  }
  if (assinanteId) {
    condicoes.push(`assinante_id = '${assinanteId}'`)
  }

  return await pb.collection('categorias').getFullList<Categoria>({
    filter: condicoes.join(' && '),
    sort: 'codigo,nome',
  })
}

export async function listarTodasCategoriasAtivas(assinanteId?: string): Promise<Categoria[]> {
  const conds = ['ativo = true']
  if (assinanteId) {
    conds.push(`assinante_id = '${assinanteId}'`)
  }
  return await pb.collection('categorias').getFullList<Categoria>({
    filter: conds.join(' && '),
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

export async function contarSubcategoriasAtivasDaCategoria(categoriaId: string): Promise<number> {
  const res = await pb.collection('subcategorias').getList(1, 1, {
    filter: `categoria_id = '${categoriaId}' && ativo = true`,
  })
  return res.totalItems
}

export async function inativarCategoria(id: string): Promise<void> {
  // Regra de negócio obrigatória: não permitir inativar uma categoria com subcategorias ativas
  const subcatAtivas = await contarSubcategoriasAtivasDaCategoria(id)
  if (subcatAtivas > 0) {
    throw new Error(
      `Não é possível inativar esta categoria pois ela possui ${subcatAtivas} subcategoria(s) ativa(s). Inative as subcategorias antes de inativar a categoria.`,
    )
  }

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
// SUBCATEGORIAS (Nível 3)
// -------------------------------------------------------------

export async function listarSubcategoriasPorCategoria(
  categoriaId: string,
  somenteAtivos = true,
  assinanteId?: string,
): Promise<Subcategoria[]> {
  const condicoes: string[] = [`categoria_id = '${categoriaId}'`]
  if (somenteAtivos) {
    condicoes.push('ativo = true')
  }
  if (assinanteId) {
    condicoes.push(`assinante_id = '${assinanteId}'`)
  }

  return await pb.collection('subcategorias').getFullList<Subcategoria>({
    filter: condicoes.join(' && '),
    sort: 'codigo,nome',
  })
}

export async function listarTodasSubcategoriasAtivas(
  assinanteId?: string,
): Promise<Subcategoria[]> {
  const conds = ['ativo = true']
  if (assinanteId) {
    conds.push(`assinante_id = '${assinanteId}'`)
  }
  return await pb.collection('subcategorias').getFullList<Subcategoria>({
    filter: conds.join(' && '),
    sort: 'nome',
    expand: 'categoria_id',
  })
}

export async function obterSubcategoria(id: string): Promise<Subcategoria> {
  return await pb.collection('subcategorias').getOne<Subcategoria>(id, {
    expand: 'categoria_id',
  })
}

export async function salvarSubcategoria(dados: {
  id?: string
  categoria_id: string
  codigo?: string
  nome: string
  margem_padrao_percentual?: number | null
  ativo?: boolean
}): Promise<Subcategoria> {
  const nomeFormatado = dados.nome.trim()
  const codigoFormatado = dados.codigo?.trim().toUpperCase() || ''
  const categoriaId = dados.categoria_id.trim()

  if (!categoriaId) {
    throw new Error('A categoria é obrigatória para cadastrar a subcategoria.')
  }
  if (!nomeFormatado) {
    throw new Error('O nome da subcategoria é obrigatório.')
  }

  // Verificar se a categoria pai está ativa
  const categoria = await obterCategoria(categoriaId)
  if (!categoria.ativo) {
    throw new Error('Não é possível adicionar uma subcategoria a uma categoria inativa.')
  }

  // Regra: nome único DENTRO da categoria
  const dupNome = await pb.collection('subcategorias').getList<Subcategoria>(1, 1, {
    filter: dados.id
      ? `categoria_id = '${categoriaId}' && nome = '${nomeFormatado.replace(/'/g, "\\'")}' && id != '${dados.id}'`
      : `categoria_id = '${categoriaId}' && nome = '${nomeFormatado.replace(/'/g, "\\'")}'`,
  })
  if (dupNome.totalItems > 0) {
    throw new Error(
      `Já existe uma subcategoria com o nome "${nomeFormatado}" dentro desta categoria.`,
    )
  }

  let salva: Subcategoria
  if (dados.id) {
    const antes = await obterSubcategoria(dados.id)
    salva = await pb.collection('subcategorias').update<Subcategoria>(dados.id, {
      categoria_id: categoriaId,
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
      tabela: 'subcategorias',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    salva = await pb.collection('subcategorias').create<Subcategoria>({
      categoria_id: categoriaId,
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
      tabela: 'subcategorias',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarSubcategoria(id: string): Promise<void> {
  const antes = await obterSubcategoria(id)
  const atualizada = await pb.collection('subcategorias').update<Subcategoria>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'subcategorias',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

export async function ativarSubcategoria(id: string): Promise<void> {
  const antes = await obterSubcategoria(id)
  // Verificar se a categoria pai está ativa
  const categoria = await obterCategoria(antes.categoria_id)
  if (!categoria.ativo) {
    throw new Error('Não é possível reativar uma subcategoria cuja categoria pai está inativa.')
  }

  const atualizada = await pb.collection('subcategorias').update<Subcategoria>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'subcategorias',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

// -------------------------------------------------------------
// ÁRVORE MERCADOLÓGICA (Grupos > Categorias > Subcategorias com contagem de produtos)
// -------------------------------------------------------------

export async function carregarArvoreMercadologica(
  params: {
    busca?: string
    situacao?: 'todos' | 'ativos' | 'inativos'
    assinante_id?: string
  } = {},
): Promise<GrupoComCategorias[]> {
  // 1. Carrega todos os grupos
  const grupos = await listarGrupos({
    situacao: params.situacao,
    ordenacao: 'codigo,nome',
    assinante_id: params.assinante_id,
  })

  // 2. Carrega todas as categorias
  const condicoesCat: string[] = []
  if (params.situacao === 'ativos') {
    condicoesCat.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoesCat.push('ativo = false')
  }
  if (params.assinante_id) {
    condicoesCat.push(`assinante_id = '${params.assinante_id}'`)
  }
  const categorias = await pb.collection('categorias').getFullList<Categoria>({
    filter: condicoesCat.length > 0 ? condicoesCat.join(' && ') : '',
    sort: 'codigo,nome',
  })

  // 3. Carrega todas as subcategorias
  const condicoesSubcat: string[] = []
  if (params.situacao === 'ativos') {
    condicoesSubcat.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoesSubcat.push('ativo = false')
  }
  if (params.assinante_id) {
    condicoesSubcat.push(`assinante_id = '${params.assinante_id}'`)
  }
  const subcategorias = await pb.collection('subcategorias').getFullList<Subcategoria>({
    filter: condicoesSubcat.length > 0 ? condicoesSubcat.join(' && ') : '',
    sort: 'codigo,nome',
  })

  // 4. Agrupar subcategorias por categoria_id
  const mapaSubcategorias: Record<string, Subcategoria[]> = {}
  subcategorias.forEach((sub) => {
    if (!mapaSubcategorias[sub.categoria_id]) {
      mapaSubcategorias[sub.categoria_id] = []
    }
    mapaSubcategorias[sub.categoria_id].push(sub)
  })

  // 5. Agrupar categorias por grupo_id
  const mapaCategorias: Record<string, Categoria[]> = {}
  categorias.forEach((cat) => {
    if (!mapaCategorias[cat.grupo_id]) {
      mapaCategorias[cat.grupo_id] = []
    }
    mapaCategorias[cat.grupo_id].push(cat)
  })

  // 5.1 Contagem real de produtos por grupo, por categoria e por subcategoria
  const contagemGrupo: Record<string, number> = {}
  const contagemCategoria: Record<string, number> = {}
  const contagemSubcategoria: Record<string, number> = {}
  try {
    const prods = await pb.collection('produtos').getFullList<{
      id: string
      grupo_id?: string
      categoria_id?: string
      subcategoria_id?: string
      ativo: boolean
    }>({
      fields: 'id,grupo_id,categoria_id,subcategoria_id,ativo',
      filter: 'ativo = true',
    })
    for (const p of prods) {
      if (p.grupo_id) {
        contagemGrupo[p.grupo_id] = (contagemGrupo[p.grupo_id] || 0) + 1
      }
      if (p.categoria_id) {
        contagemCategoria[p.categoria_id] = (contagemCategoria[p.categoria_id] || 0) + 1
      }
      if (p.subcategoria_id) {
        contagemSubcategoria[p.subcategoria_id] = (contagemSubcategoria[p.subcategoria_id] || 0) + 1
      }
    }
  } catch (errProd) {
    console.warn('Não foi possível obter contagem de produtos:', errProd)
  }

  // 6. Montar estrutura em árvore de 3 níveis com contagem real de produtos
  const arvore: GrupoComCategorias[] = grupos.map((g) => {
    const catsDoGrupo: CategoriaComContagem[] = (mapaCategorias[g.id] || []).map((cat) => {
      const subsDaCat: SubcategoriaComContagem[] = (mapaSubcategorias[cat.id] || []).map((sub) => ({
        ...sub,
        quantidade_produtos: contagemSubcategoria[sub.id] || 0,
      }))
      return {
        ...cat,
        subcategorias: subsDaCat,
        quantidade_produtos: contagemCategoria[cat.id] || 0,
      }
    })
    return {
      ...g,
      categorias: catsDoGrupo,
      quantidade_produtos: contagemGrupo[g.id] || 0,
    }
  })

  // 7. Aplicar filtro de busca sobre grupo, categorias ou subcategorias
  if (params.busca && params.busca.trim()) {
    const termo = params.busca.trim().toLowerCase()
    return arvore
      .map((g) => {
        const grupoCombina =
          g.nome.toLowerCase().includes(termo) || g.codigo.toLowerCase().includes(termo)

        const catsFiltradas = g.categorias
          .map((cat) => {
            const catCombina =
              cat.nome.toLowerCase().includes(termo) ||
              (cat.codigo && cat.codigo.toLowerCase().includes(termo))

            const subsFiltradas = (cat.subcategorias || []).filter(
              (s) =>
                s.nome.toLowerCase().includes(termo) ||
                (s.codigo && s.codigo.toLowerCase().includes(termo)),
            )

            if (catCombina || grupoCombina) {
              return cat
            }

            if (subsFiltradas.length > 0) {
              return {
                ...cat,
                subcategorias: subsFiltradas,
              }
            }

            return null
          })
          .filter((c): c is CategoriaComContagem => c !== null)

        if (grupoCombina) {
          return g
        }

        if (catsFiltradas.length > 0) {
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
