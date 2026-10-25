// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0069: Seed Assinante TESTE B (Prompt 9.3 item 7)
 *
 * Cria de forma idempotente:
 * 1. Assinante 'TESTE B' (licença TESTEB-XXXXXX, Ativa, 10 usuarios, 5 empresas)
 * 2. Perfil de Acesso 'Administrador' pertencente ao assinante TESTE B
 * 3. Permissões completas para o perfil Administrador do TESTE B
 * 4. Empresa Matriz do TESTE B ('TESTE B MATRIZ LTDA', codigo 1, assinante TESTE B)
 * 5. Usuário admin do TESTE B em _pb_users_auth_ (email: admin@testeb.com, tipo: usuario, is_admin: true, assinante: TESTE B)
 * 6. Registro em usuarios (admin@testeb.com, assinante TESTE B, perfil Administrador)
 * 7. Vínculo em usuarios_empresas para a empresa matriz do TESTE B
 * 8. Produto de teste pertencente exclusivamente ao TESTE B ('PRODUTO EXCLUSIVO TESTE B')
 */

migrate(
  (app) => {
    const assinantesCol = app.findCollectionByNameOrId('assinantes')
    const perfisCol = app.findCollectionByNameOrId('perfis_acesso')
    const permissoesCol = app.findCollectionByNameOrId('permissoes')
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const usersAuthCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    const ueCol = app.findCollectionByNameOrId('usuarios_empresas')
    const produtosCol = app.findCollectionByNameOrId('produtos')

    // 1. Assinante TESTE B
    let assB = null
    try {
      const exist = app.findRecordsByFilter(
        'assinantes',
        "nome = 'TESTE B' || email_contato = 'contato@testeb.com'",
        '-created',
        1,
        0,
      )
      if (exist && exist.length > 0) assB = exist[0]
    } catch (_) {}

    if (!assB) {
      assB = new Record(assinantesCol)
      assB.set('nome', 'TESTE B')
      assB.set('numero_licenca', 'TB-' + $security.randomString(6).toUpperCase())
      assB.set('documento', '00.000.000/0002-00')
      assB.set('email_contato', 'contato@testeb.com')
      assB.set('telefone', '(11) 99999-8888')
      assB.set('status', 'Ativa')
      assB.set('origem', false)
      assB.set('data_inicio', new Date().toISOString().slice(0, 10))
      assB.set('limites_personalizados', true)
      assB.set('limite_usuarios', 10)
      assB.set('limite_empresas', 5)
      assB.set('observacoes', 'Assinante B para validação de isolamento multi-tenant Prompt 9.3')
      app.save(assB)
    }

    const assBId = assB.id

    // 2. Perfil Administrador do TESTE B
    let perfilAdminB = null
    try {
      const existP = app.findRecordsByFilter(
        'perfis_acesso',
        `assinante_id = '${assBId}' && administrador = true`,
        '-created',
        1,
        0,
      )
      if (existP && existP.length > 0) perfilAdminB = existP[0]
    } catch (_) {}

    if (!perfilAdminB) {
      perfilAdminB = new Record(perfisCol)
      perfilAdminB.set('nome', 'Administrador')
      perfilAdminB.set('descricao', 'Administrador do Assinante TESTE B')
      perfilAdminB.set('administrador', true)
      perfilAdminB.set('ativo', true)
      perfilAdminB.set('assinante_id', assBId)
      app.save(perfilAdminB)

      // Permissões nos módulos
      const modulos = [
        'painel',
        'empresas',
        'usuarios',
        'perfis_acesso',
        'clientes',
        'fornecedores',
        'produtos',
        'marcas',
        'grupos_categorias',
        'unidades_medida',
        'tabelas_fiscais',
        'condicoes_pagamento',
        'estoque',
        'compras',
        'notas_entrada',
        'financeiro_pagar',
        'financeiro_receber',
        'vendas',
        'pdv',
        'caixa',
        'notas_saida',
        'sped',
        'relatorios',
        'configuracoes',
        'financeiro_bancos',
      ]

      for (const mod of modulos) {
        try {
          const perm = new Record(permissoesCol)
          perm.set('perfil_id', perfilAdminB.id)
          perm.set('modulo', mod)
          perm.set('pode_ver', true)
          perm.set('pode_criar', true)
          perm.set('pode_editar', true)
          perm.set('pode_excluir', true)
          perm.set('ativo', true)
          app.save(perm)
        } catch (_) {}
      }
    }

    // 3. Empresa Matriz do TESTE B
    let empB = null
    try {
      const existE = app.findRecordsByFilter(
        'empresas',
        `assinante_id = '${assBId}' && cnpj = '11.222.333/0001-99'`,
        '-created',
        1,
        0,
      )
      if (existE && existE.length > 0) empB = existE[0]
    } catch (_) {}

    if (!empB) {
      empB = new Record(empresasCol)
      empB.set('tipo', 'Matriz')
      empB.set('codigo', 1001)
      empB.set('razao_social', 'TESTE B COMERCIO E SERVICOS LTDA')
      empB.set('nome_fantasia', 'TESTE B MATRIZ')
      empB.set('cnpj', '11.222.333/0001-99')
      empB.set('inscricao_estadual', 'ISENTO')
      empB.set('codigo_municipio_ibge', '3550308') // São Paulo
      empB.set('crt', 1) // Simples Nacional
      empB.set('ativo', true)
      empB.set('assinante_id', assBId)
      app.save(empB)
    }

    // 4. Usuário admin do TESTE B em _pb_users_auth_
    const emailAdminB = 'admin@testeb.com'
    let authB = null
    try {
      authB = app.findAuthRecordByEmail('_pb_users_auth_', emailAdminB)
    } catch (_) {}

    if (!authB) {
      authB = new Record(usersAuthCol)
      authB.setEmail(emailAdminB)
      // Senha forte segura de teste
      authB.setPassword('TesteB#Admin2026!Sec')
      authB.setVerified(true)
      authB.set('name', 'Admin Teste B')
      authB.set('tipo', 'usuario')
      authB.set('assinante_id', assBId)
      authB.set('is_admin', true)
      app.save(authB)
    } else {
      authB.set('assinante_id', assBId)
      authB.set('is_admin', true)
      app.save(authB)
    }

    // 5. Registro em usuarios
    let usuarioB = null
    try {
      const existU = app.findRecordsByFilter(
        'usuarios',
        `email = '${emailAdminB}'`,
        '-created',
        1,
        0,
      )
      if (existU && existU.length > 0) usuarioB = existU[0]
    } catch (_) {}

    if (!usuarioB) {
      usuarioB = new Record(usuariosCol)
      usuarioB.set('nome', 'Admin Teste B')
      usuarioB.set('email', emailAdminB)
      usuarioB.set('auth_user_id', authB.id)
      usuarioB.set('perfil_id', perfilAdminB.id)
      usuarioB.set('empresa_padrao_id', empB.id)
      usuarioB.set('ativo', true)
      usuarioB.set('assinante_id', assBId)
      app.save(usuarioB)
    } else {
      usuarioB.set('assinante_id', assBId)
      usuarioB.set('perfil_id', perfilAdminB.id)
      app.save(usuarioB)
    }

    // 6. usuarios_empresas
    try {
      const existUe = app.findRecordsByFilter(
        'usuarios_empresas',
        `usuario_id = '${usuarioB.id}' && empresa_id = '${empB.id}'`,
        '',
        1,
        0,
      )
      if (!existUe || existUe.length === 0) {
        const ue = new Record(ueCol)
        ue.set('usuario_id', usuarioB.id)
        ue.set('empresa_id', empB.id)
        ue.set('ativo', true)
        app.save(ue)
      }
    } catch (_) {}

    // 7. Produto de teste pertencente exclusivamente ao TESTE B
    let prodB = null
    try {
      const existP = app.findRecordsByFilter(
        'produtos',
        `assinante_id = '${assBId}' && codigo = 9001`,
        '',
        1,
        0,
      )
      if (existP && existP.length > 0) prodB = existP[0]
    } catch (_) {}

    if (!prodB) {
      prodB = new Record(produtosCol)
      prodB.set('codigo', 9001)
      prodB.set('descricao', 'PRODUTO EXCLUSIVO TESTE B')
      prodB.set('tipo', 'Produto')
      prodB.set('preco_venda', 150)
      prodB.set('preco_custo', 80)
      prodB.set('ativo', true)
      prodB.set('assinante_id', assBId)
      app.save(prodB)
    }
  },
  (app) => {
    // Reversão
  },
)
