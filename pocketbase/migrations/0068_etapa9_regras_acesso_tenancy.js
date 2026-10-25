// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0068: Etapa 9 Multi-tenant (Prompt 9.3)
 *
 * 1. Campos em _pb_users_auth_ (users):
 *    - assinante_id (relation -> assinantes)
 *    - is_admin (bool)
 *    - Backfill de users existentes a partir de usuarios e perfis_acesso
 *
 * 2. Regras de users:
 *    - listRule / viewRule: id = @request.auth.id
 *    - updateRule: impede tocar tipo, assinante_id, is_admin e impede trocar email do master
 *    - createRule: null
 *
 * 3. Regras das 9 tabelas globais (ncm, cest, cfop, cfop_conversao_entrada, icms_aliquotas_uf,
 *    icms_interestadual, tabelas_fiscais_codigos, unidades_medida, intermediadores):
 *    - list/view: qualquer usuário logado (@request.auth.id != '')
 *    - create/update/delete: apenas master (@request.auth.id != '' && @request.auth.tipo = 'master')
 *
 * 4. Regras das coleções com assinante_id:
 *    - empresas, usuarios, perfis_acesso: apenas dentro do assinante, edição/criação apenas admin do assinante
 *    - 15 coleções compartilhadas: apenas dentro do assinante (@request.auth.assinante_id)
 *
 * 5. Regras das coleções filhas:
 *    - produtos_kit_itens, produtos_fornecedores, produtos_conversoes_unidade, produtos_historico:
 *      via produto / produto_kit_id.assinante_id = @request.auth.assinante_id
 *    - formas_pagamento_taxas: forma_pagamento_id.assinante_id = @request.auth.assinante_id
 *    - perfis_tributarios_regras: perfil_id.assinante_id = @request.auth.assinante_id
 *    - permissoes: perfil_id.assinante_id = @request.auth.assinante_id
 *    - usuarios_empresas: usuario_id.assinante_id e empresa_id.assinante_id = @request.auth.assinante_id
 */

migrate(
  (app) => {
    const assinantesCol = app.findCollectionByNameOrId('assinantes')
    const usersAuthCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Campo assinante_id e is_admin em _pb_users_auth_
    if (!usersAuthCol.fields.getByName('assinante_id')) {
      usersAuthCol.fields.add(
        new RelationField({
          name: 'assinante_id',
          required: false,
          collectionId: assinantesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    if (!usersAuthCol.fields.getByName('is_admin')) {
      usersAuthCol.fields.add(
        new BoolField({
          name: 'is_admin',
          required: false,
        }),
      )
    }

    // Regras de users (Prompt 9.3 item 4)
    usersAuthCol.listRule = 'id = @request.auth.id'
    usersAuthCol.viewRule = 'id = @request.auth.id'
    usersAuthCol.createRule = null
    usersAuthCol.updateRule =
      "@request.auth.id = id && @request.body.tipo:isset = false && @request.body.assinante_id:isset = false && @request.body.is_admin:isset = false && (@request.auth.tipo != 'master' || @request.body.email:isset = false || @request.body.email = email)"
    usersAuthCol.deleteRule = "id = @request.auth.id && @request.auth.tipo = 'master'"
    app.save(usersAuthCol)

    // Backfill em users: preencher assinante_id e is_admin a partir de usuarios
    try {
      const todosUsuarios = app.findRecordsByFilter('usuarios', '', '', 1000, 0)
      for (let i = 0; i < todosUsuarios.length; i++) {
        const u = todosUsuarios[i]
        const authId = u.getString('auth_user_id')
        const assId = u.getString('assinante_id')
        const perfilId = u.getString('perfil_id')
        if (authId) {
          try {
            const authRec = app.findRecordById('_pb_users_auth_', authId)
            let isAdmin = authRec.getString('tipo') === 'master'
            if (perfilId) {
              try {
                const p = app.findRecordById('perfis_acesso', perfilId)
                if (p && p.getBool('administrador')) isAdmin = true
              } catch (_) {}
            }
            if (assId) authRec.set('assinante_id', assId)
            authRec.set('is_admin', isAdmin)
            app.save(authRec)
          } catch (_) {}
        }
      }
    } catch (errBfUsers) {
      console.warn('[0068] Aviso no backfill de users:', errBfUsers)
    }

    // 2. Tabelas globais (Prompt 9.3 item 5)
    // ncm, cest, cfop, cfop_conversao_entrada, icms_aliquotas_uf, icms_interestadual, tabelas_fiscais_codigos, unidades_medida, intermediadores
    const tabelasGlobais = [
      'ncm',
      'cest',
      'cfop',
      'cfop_conversao_entrada',
      'icms_aliquotas_uf',
      'icms_interestadual',
      'tabelas_fiscais_codigos',
      'unidades_medida',
      'intermediadores',
    ]

    for (const tName of tabelasGlobais) {
      try {
        const c = app.findCollectionByNameOrId(tName)
        c.listRule = "@request.auth.id != ''"
        c.viewRule = "@request.auth.id != ''"
        c.createRule = "@request.auth.id != '' && @request.auth.tipo = 'master'"
        c.updateRule = "@request.auth.id != '' && @request.auth.tipo = 'master'"
        c.deleteRule = "@request.auth.id != '' && @request.auth.tipo = 'master'"
        app.save(c)
      } catch (errG) {
        console.error(`[0068] Erro na regra global de ${tName}:`, errG)
        throw errG
      }
    }

    // 3. Coleções com assinante_id: empresas, usuarios, perfis_acesso (Prompt 9.3 itens 1, 3 e 6)
    // empresas: leitura assinante; criação/edição admin do assinante; assinante_id não muda
    try {
      const empCol = app.findCollectionByNameOrId('empresas')
      empCol.listRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
      empCol.viewRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
      empCol.createRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      empCol.updateRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && @request.body.assinante_id:isset = false && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      empCol.deleteRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      app.save(empCol)
    } catch (eEmp) {
      console.error('[0068] Erro regras empresas:', eEmp)
      throw eEmp
    }

    // perfis_acesso: leitura assinante; criação/edição admin do assinante
    try {
      const perfisCol = app.findCollectionByNameOrId('perfis_acesso')
      perfisCol.listRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
      perfisCol.viewRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
      perfisCol.createRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      perfisCol.updateRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && @request.body.assinante_id:isset = false && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      perfisCol.deleteRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      app.save(perfisCol)
    } catch (ePerf) {
      console.error('[0068] Erro regras perfis_acesso:', ePerf)
      throw ePerf
    }

    // usuarios: leitura assinante; criação/edição admin do assinante
    try {
      const usrCol = app.findCollectionByNameOrId('usuarios')
      usrCol.listRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
      usrCol.viewRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
      usrCol.createRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      usrCol.updateRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && @request.body.assinante_id:isset = false && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      usrCol.deleteRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      app.save(usrCol)
    } catch (eUsr) {
      console.error('[0068] Erro regras usuarios:', eUsr)
      throw eUsr
    }

    // usuarios_empresas: usuario_id e empresa_id devem pertencer ao mesmo assinante do usuário logado
    try {
      const ueCol = app.findCollectionByNameOrId('usuarios_empresas')
      ueCol.listRule =
        "@request.auth.id != '' && usuario_id.assinante_id = @request.auth.assinante_id && empresa_id.assinante_id = @request.auth.assinante_id"
      ueCol.viewRule =
        "@request.auth.id != '' && usuario_id.assinante_id = @request.auth.assinante_id && empresa_id.assinante_id = @request.auth.assinante_id"
      ueCol.createRule =
        "@request.auth.id != '' && usuario_id.assinante_id = @request.auth.assinante_id && empresa_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      ueCol.updateRule =
        "@request.auth.id != '' && usuario_id.assinante_id = @request.auth.assinante_id && empresa_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      ueCol.deleteRule =
        "@request.auth.id != '' && usuario_id.assinante_id = @request.auth.assinante_id && empresa_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      app.save(ueCol)
    } catch (eUe) {
      console.error('[0068] Erro regras usuarios_empresas:', eUe)
      throw eUe
    }

    // 4. As 15 coleções compartilhadas (Prompt 9.3 item 1)
    const padrao13 = [
      'produtos',
      'clientes',
      'fornecedores',
      'marcas',
      'grupos',
      'categorias',
      'condicoes_pagamento',
      'plano_contas',
      'centros_custo',
      'formas_pagamento',
      'perfis_tributarios',
      'regras_fiscais_ncm',
      'configuracoes',
    ]

    for (const nomeCol of padrao13) {
      try {
        const c = app.findCollectionByNameOrId(nomeCol)
        c.listRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
        c.viewRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
        c.createRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
        c.updateRule =
          "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && @request.body.assinante_id:isset = false"
        c.deleteRule = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
        app.save(c)
      } catch (errPadrao) {
        console.error(`[0068] Erro regras ${nomeCol}:`, errPadrao)
        throw errPadrao
      }
    }

    // relatorios_filtros_salvos
    try {
      const rfs = app.findCollectionByNameOrId('relatorios_filtros_salvos')
      rfs.listRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (usuario_id = @request.auth.id || compartilhado = true)"
      rfs.viewRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (usuario_id = @request.auth.id || compartilhado = true)"
      rfs.createRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && usuario_id = @request.auth.id"
      rfs.updateRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && usuario_id = @request.auth.id && @request.body.assinante_id:isset = false"
      rfs.deleteRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && usuario_id = @request.auth.id"
      app.save(rfs)
    } catch (eRfs) {
      console.error('[0068] Erro regras relatorios_filtros_salvos:', eRfs)
      throw eRfs
    }

    // relatorios_salvos
    try {
      const rs = app.findCollectionByNameOrId('relatorios_salvos')
      rs.listRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (usuario_id = @request.auth.id || compartilhado = true)"
      rs.viewRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (usuario_id = @request.auth.id || compartilhado = true)"
      rs.createRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && usuario_id = @request.auth.id"
      rs.updateRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && usuario_id = @request.auth.id && @request.body.assinante_id:isset = false"
      rs.deleteRule =
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && usuario_id = @request.auth.id"
      app.save(rs)
    } catch (eRs) {
      console.error('[0068] Erro regras relatorios_salvos:', eRs)
      throw eRs
    }

    // 5. Coleções filhas (Prompt 9.3 item 2)
    // produtos_kit_itens
    try {
      const c = app.findCollectionByNameOrId('produtos_kit_itens')
      c.listRule =
        "@request.auth.id != '' && produto_kit_id.assinante_id = @request.auth.assinante_id"
      c.viewRule =
        "@request.auth.id != '' && produto_kit_id.assinante_id = @request.auth.assinante_id"
      c.createRule =
        "@request.auth.id != '' && produto_kit_id.assinante_id = @request.auth.assinante_id"
      c.updateRule =
        "@request.auth.id != '' && produto_kit_id.assinante_id = @request.auth.assinante_id"
      c.deleteRule =
        "@request.auth.id != '' && produto_kit_id.assinante_id = @request.auth.assinante_id"
      app.save(c)
    } catch (eKit) {
      console.error('[0068] Erro regras produtos_kit_itens:', eKit)
      throw eKit
    }

    // produtos_fornecedores
    try {
      const c = app.findCollectionByNameOrId('produtos_fornecedores')
      c.listRule = "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.viewRule = "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.createRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.updateRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.deleteRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      app.save(c)
    } catch (ePf) {
      console.error('[0068] Erro regras produtos_fornecedores:', ePf)
      throw ePf
    }

    // produtos_conversoes_unidade
    try {
      const c = app.findCollectionByNameOrId('produtos_conversoes_unidade')
      c.listRule = "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.viewRule = "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.createRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.updateRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.deleteRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      app.save(c)
    } catch (ePcu) {
      console.error('[0068] Erro regras produtos_conversoes_unidade:', ePcu)
      throw ePcu
    }

    // produtos_historico
    try {
      const c = app.findCollectionByNameOrId('produtos_historico')
      c.listRule = "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.viewRule = "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.createRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.updateRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      c.deleteRule =
        "@request.auth.id != '' && produto_id.assinante_id = @request.auth.assinante_id"
      app.save(c)
    } catch (ePh) {
      console.error('[0068] Erro regras produtos_historico:', ePh)
      throw ePh
    }

    // formas_pagamento_taxas
    try {
      const c = app.findCollectionByNameOrId('formas_pagamento_taxas')
      c.listRule =
        "@request.auth.id != '' && forma_pagamento_id.assinante_id = @request.auth.assinante_id"
      c.viewRule =
        "@request.auth.id != '' && forma_pagamento_id.assinante_id = @request.auth.assinante_id"
      c.createRule =
        "@request.auth.id != '' && forma_pagamento_id.assinante_id = @request.auth.assinante_id"
      c.updateRule =
        "@request.auth.id != '' && forma_pagamento_id.assinante_id = @request.auth.assinante_id"
      c.deleteRule =
        "@request.auth.id != '' && forma_pagamento_id.assinante_id = @request.auth.assinante_id"
      app.save(c)
    } catch (eFpt) {
      console.error('[0068] Erro regras formas_pagamento_taxas:', eFpt)
      throw eFpt
    }

    // perfis_tributarios_regras
    try {
      const c = app.findCollectionByNameOrId('perfis_tributarios_regras')
      c.listRule = "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id"
      c.viewRule = "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id"
      c.createRule = "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id"
      c.updateRule = "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id"
      c.deleteRule = "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id"
      app.save(c)
    } catch (ePtr) {
      console.error('[0068] Erro regras perfis_tributarios_regras:', ePtr)
      throw ePtr
    }

    // permissoes
    try {
      const c = app.findCollectionByNameOrId('permissoes')
      c.listRule = "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id"
      c.viewRule = "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id"
      c.createRule =
        "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      c.updateRule =
        "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      c.deleteRule =
        "@request.auth.id != '' && perfil_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"
      app.save(c)
    } catch (ePerm) {
      console.error('[0068] Erro regras permissoes:', ePerm)
      throw ePerm
    }
  },
  (app) => {
    // Reversão não necessária em produção incremental
  },
)
