import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export const MODULOS_SISTEMA = [
  { id: 'painel', label: 'Painel Geral' },
  { id: 'empresas', label: 'Empresas e Filiais' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'perfis_acesso', label: 'Perfis de Acesso' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'fornecedores', label: 'Fornecedores' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'marcas', label: 'Marcas' },
  { id: 'grupos_categorias', label: 'Grupos e Categorias' },
  { id: 'unidades_medida', label: 'Unidades de Medida' },
  { id: 'tabelas_fiscais', label: 'Tabelas Fiscais' },
  { id: 'condicoes_pagamento', label: 'Condições de Pagamento' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'compras', label: 'Compras' },
  { id: 'notas_entrada', label: 'Notas de Entrada' },
  { id: 'financeiro_bancos', label: 'Contas Bancárias e Cadastros Financeiros' },
  { id: 'financeiro_pagar', label: 'Contas a Pagar' },
  { id: 'financeiro_receber', label: 'Contas a Receber' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'pdv', label: 'PDV' },
  { id: 'caixa', label: 'Caixa' },
  { id: 'notas_saida', label: 'Notas de Saída' },
  { id: 'sped', label: 'SPED Fiscal' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'configuracoes', label: 'Configurações' },
  { id: 'config_fiscal', label: 'Configurações Fiscais' },
] as const

export type ModuloSistema = (typeof MODULOS_SISTEMA)[number]['id']

export interface PerfilAcesso {
  id: string
  ativo: boolean
  nome: string
  descricao: string
  administrador: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface PermissaoModulo {
  id?: string
  perfil_id: string
  modulo: ModuloSistema
  pode_ver: boolean
  pode_criar: boolean
  pode_editar: boolean
  pode_excluir: boolean
}

export interface ListarPerfisParams {
  busca?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  page?: number
  perPage?: number
  ordenacao?: string
}

export async function listarPerfis(params: ListarPerfisParams = {}) {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(nome ~ '${b}' || descricao ~ '${b}')`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'nome'

  const res = await pb.collection('perfis_acesso').getList<PerfilAcesso>(page, perPage, {
    filter,
    sort,
  })

  return res
}

export async function listarTodosPerfisAtivos(): Promise<PerfilAcesso[]> {
  return await pb.collection('perfis_acesso').getFullList<PerfilAcesso>({
    filter: 'ativo = true',
    sort: 'nome',
  })
}

export async function obterPerfil(id: string): Promise<PerfilAcesso> {
  return await pb.collection('perfis_acesso').getOne<PerfilAcesso>(id)
}

export async function obterPermissoesPorPerfil(
  perfilId: string,
): Promise<Record<string, PermissaoModulo>> {
  const list = await pb.collection('permissoes').getFullList<PermissaoModulo>({
    filter: `perfil_id = '${perfilId}'`,
  })

  const mapa: Record<string, PermissaoModulo> = {}
  list.forEach((item) => {
    mapa[item.modulo] = item
  })

  // Preenche valores default se algum módulo novo ainda não estiver na collection
  MODULOS_SISTEMA.forEach((m) => {
    if (!mapa[m.id]) {
      mapa[m.id] = {
        perfil_id: perfilId,
        modulo: m.id,
        pode_ver: false,
        pode_criar: false,
        pode_editar: false,
        pode_excluir: false,
      }
    }
  })

  return mapa
}

export async function salvarPerfilComPermissoes(
  dadosPerfil: Partial<PerfilAcesso>,
  permissoes: Record<
    string,
    { pode_ver: boolean; pode_criar: boolean; pode_editar: boolean; pode_excluir: boolean }
  >,
): Promise<PerfilAcesso> {
  const ehEdicao = Boolean(dadosPerfil.id)
  let perfilSalvo: PerfilAcesso
  let antes: PerfilAcesso | null = null

  if (ehEdicao && dadosPerfil.id) {
    antes = await obterPerfil(dadosPerfil.id)
    perfilSalvo = await pb.collection('perfis_acesso').update<PerfilAcesso>(dadosPerfil.id, {
      nome: dadosPerfil.nome?.trim(),
      descricao: dadosPerfil.descricao?.trim() || '',
      administrador: Boolean(dadosPerfil.administrador),
      ativo: dadosPerfil.ativo !== undefined ? dadosPerfil.ativo : true,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'perfis_acesso',
      registro_id: perfilSalvo.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: perfilSalvo as unknown as Record<string, unknown>,
    })
  } else {
    perfilSalvo = await pb.collection('perfis_acesso').create<PerfilAcesso>({
      nome: dadosPerfil.nome?.trim(),
      descricao: dadosPerfil.descricao?.trim() || '',
      administrador: Boolean(dadosPerfil.administrador),
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'perfis_acesso',
      registro_id: perfilSalvo.id,
      acao: 'inclusao',
      valores_depois: perfilSalvo as unknown as Record<string, unknown>,
    })
  }

  // Sincronizar permissões
  const permsExistentes = await pb.collection('permissoes').getFullList<PermissaoModulo>({
    filter: `perfil_id = '${perfilSalvo.id}'`,
  })
  const mapExistentes: Record<string, PermissaoModulo> = {}
  permsExistentes.forEach((p) => {
    mapExistentes[p.modulo] = p
  })

  for (const mod of MODULOS_SISTEMA) {
    const modId = mod.id
    const config = permissoes[modId] || {
      pode_ver: false,
      pode_criar: false,
      pode_editar: false,
      pode_excluir: false,
    }
    const jaExiste = mapExistentes[modId]

    // Se perfil for administrador, tudo true
    const isAdmin = Boolean(perfilSalvo.administrador)

    const payload = {
      perfil_id: perfilSalvo.id,
      modulo: modId,
      pode_ver: isAdmin ? true : Boolean(config.pode_ver),
      pode_criar: isAdmin ? true : Boolean(config.pode_criar),
      pode_editar: isAdmin ? true : Boolean(config.pode_editar),
      pode_excluir: isAdmin ? true : Boolean(config.pode_excluir),
      ativo: true,
      updated_by: pb.authStore.record?.id || null,
    }

    if (jaExiste && jaExiste.id) {
      await pb.collection('permissoes').update(jaExiste.id, payload)
    } else {
      await pb.collection('permissoes').create({
        ...payload,
        created_by: pb.authStore.record?.id || null,
      })
    }
  }

  return perfilSalvo
}

export async function inativarPerfil(id: string): Promise<void> {
  const antes = await obterPerfil(id)
  const atualizado = await pb.collection('perfis_acesso').update<PerfilAcesso>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'perfis_acesso',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarPerfil(id: string): Promise<void> {
  const antes = await obterPerfil(id)
  const atualizado = await pb.collection('perfis_acesso').update<PerfilAcesso>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'perfis_acesso',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function verificarUsoPerfil(id: string): Promise<number> {
  try {
    const total = await pb.collection('usuarios').getList(1, 1, {
      filter: `perfil_id = '${id}'`,
    })
    return total.totalItems
  } catch {
    return 0
  }
}
