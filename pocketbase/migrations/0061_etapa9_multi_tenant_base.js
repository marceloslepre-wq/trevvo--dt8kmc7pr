// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0061: Etapa 9 Multi-tenant (Prompt 9.1)
 *
 * 1. Coleção 'assinantes':
 *    - numero_licenca (código curto único)
 *    - nome, documento, email_contato, telefone, whatsapp_contato
 *    - status ('Trial', 'Ativa', 'Pausada', 'Expirada', 'Cancelada')
 *    - origem (bool: assinante original do dono do SaaS)
 *    - plano_id (text por enquanto)
 *    - data_inicio, data_expiracao
 *    - limites_personalizados (bool), limite_usuarios (number), limite_empresas (number)
 *    - observacoes (text)
 *    Regras: listRule/viewRule "@request.auth.tipo = 'master'", createRule/deleteRule: null, updateRule "@request.auth.tipo = 'master'"
 *
 * 2. Campo 'tipo' em users ('_pb_users_auth_'): select 'master' | 'usuario', padrão 'usuario'.
 *    Atualização das regras de users para impedir alteração de tipo e impedir alteração de email do master pelo navegador.
 *
 * 3. Campo 'assinante_id' (relação com assinantes) em:
 *    - empresas
 *    - usuarios
 *    - perfis_acesso
 *
 * 4. Dados existentes (idempotente):
 *    - Criação do assinante 'HOSPITAL HOME' (origem = true, status = 'Ativa', numero_licenca gerado)
 *    - Associação de TODAS as empresas, usuarios e perfis_acesso ao assinante HOSPITAL HOME
 *
 * 5. Acesso Master (marceloslepre@gmail.com):
 *    - Marca users.tipo = 'master'
 *    - Garante usuarios com perfil de administrador, assinante HOSPITAL HOME, e usuarios_empresas para todas as filiais.
 */

migrate(
  (app) => {
    const usersAuthCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // -------------------------------------------------------------------------
    // 1. Campo 'tipo' em users se não existir
    // -------------------------------------------------------------------------
    let usersFieldTipo = usersAuthCol.fields.getByName('tipo')
    if (!usersFieldTipo) {
      usersAuthCol.fields.add(
        new SelectField({
          name: 'tipo',
          required: false,
          values: ['master', 'usuario'],
          maxSelect: 1,
        }),
      )
    }

    // Regras de segurança de users:
    // Não permitir que o navegador envie alteração de 'tipo' nem altere o email do master
    // updateRule: @request.auth.id = id && @request.body.tipo:isset = false && (@request.auth.tipo != 'master' || @request.body.email:isset = false || @request.body.email = email)
    usersAuthCol.updateRule =
      "@request.auth.id = id && @request.body.tipo:isset = false && (@request.auth.tipo != 'master' || @request.body.email:isset = false || @request.body.email = email)"
    app.save(usersAuthCol)

    // -------------------------------------------------------------------------
    // 2. Criar coleção 'assinantes' se não existir
    // -------------------------------------------------------------------------
    let assinantesCol
    try {
      assinantesCol = app.findCollectionByNameOrId('assinantes')
    } catch (_) {
      assinantesCol = null
    }

    if (!assinantesCol) {
      assinantesCol = new Collection({
        name: 'assinantes',
        type: 'base',
        // Acesso restrito ao master ou backend:
        listRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
        viewRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
        createRule: null,
        updateRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
        deleteRule: null,
        fields: [
          { name: 'numero_licenca', type: 'text', required: true },
          { name: 'nome', type: 'text', required: true },
          { name: 'documento', type: 'text', required: false },
          { name: 'email_contato', type: 'text', required: false },
          { name: 'telefone', type: 'text', required: false },
          { name: 'whatsapp_contato', type: 'text', required: false },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Trial', 'Ativa', 'Pausada', 'Expirada', 'Cancelada'],
            maxSelect: 1,
          },
          { name: 'origem', type: 'bool', required: false },
          { name: 'plano_id', type: 'text', required: false },
          { name: 'data_inicio', type: 'text', required: false },
          { name: 'data_expiracao', type: 'text', required: false },
          { name: 'limites_personalizados', type: 'bool', required: false },
          { name: 'limite_usuarios', type: 'number', required: false },
          { name: 'limite_empresas', type: 'number', required: false },
          { name: 'observacoes', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_assinantes_licenca ON assinantes (numero_licenca)',
          'CREATE INDEX idx_assinantes_status ON assinantes (status)',
          'CREATE INDEX idx_assinantes_origem ON assinantes (origem)',
        ],
      })
      app.save(assinantesCol)
    }

    const assinantesId = assinantesCol.id

    // -------------------------------------------------------------------------
    // 3. Adicionar campo 'assinante_id' em empresas, usuarios e perfis_acesso
    // -------------------------------------------------------------------------
    const empresasCol = app.findCollectionByNameOrId('empresas')
    if (!empresasCol.fields.getByName('assinante_id')) {
      empresasCol.fields.add(
        new RelationField({
          name: 'assinante_id',
          required: false, // preencheremos os dados antes de tornar obrigatório se necessário
          collectionId: assinantesId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      if (!empresasCol.indexes.some((idx) => idx.includes('idx_empresas_assinante'))) {
        empresasCol.indexes.push('CREATE INDEX idx_empresas_assinante ON empresas (assinante_id)')
      }
      app.save(empresasCol)
    }

    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    if (!usuariosCol.fields.getByName('assinante_id')) {
      usuariosCol.fields.add(
        new RelationField({
          name: 'assinante_id',
          required: false,
          collectionId: assinantesId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      if (!usuariosCol.indexes.some((idx) => idx.includes('idx_usuarios_assinante'))) {
        usuariosCol.indexes.push('CREATE INDEX idx_usuarios_assinante ON usuarios (assinante_id)')
      }
      app.save(usuariosCol)
    }

    const perfisCol = app.findCollectionByNameOrId('perfis_acesso')
    if (!perfisCol.fields.getByName('assinante_id')) {
      perfisCol.fields.add(
        new RelationField({
          name: 'assinante_id',
          required: false,
          collectionId: assinantesId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      if (!perfisCol.indexes.some((idx) => idx.includes('idx_perfis_assinante'))) {
        perfisCol.indexes.push('CREATE INDEX idx_perfis_assinante ON perfis_acesso (assinante_id)')
      }
      app.save(perfisCol)
    }

    // -------------------------------------------------------------------------
    // 4. Assinante 'HOSPITAL HOME' (idempotente)
    // -------------------------------------------------------------------------
    let assinanteHome = null
    const assinantesExistentes = app.findRecordsByFilter(
      'assinantes',
      "origem = true || nome = 'HOSPITAL HOME'",
      '-created',
      1,
      0,
    )
    if (assinantesExistentes.length > 0) {
      assinanteHome = assinantesExistentes[0]
    } else {
      assinanteHome = new Record(assinantesCol)
      const numLic = 'HH-' + $security.randomString(6).toUpperCase()
      assinanteHome.set('numero_licenca', numLic)
      assinanteHome.set('nome', 'HOSPITAL HOME')
      assinanteHome.set('documento', '10.893.738/0001-89')
      assinanteHome.set('email_contato', 'financeiro@hospitalhome.com.br')
      assinanteHome.set('telefone', '(27) 3026-3300')
      assinanteHome.set('status', 'Ativa')
      assinanteHome.set('origem', true)
      assinanteHome.set('data_inicio', new Date().toISOString().slice(0, 10))
      assinanteHome.set('data_expiracao', '')
      assinanteHome.set('limites_personalizados', false)
      assinanteHome.set('observacoes', 'Assinante de origem do dono do SaaS')
      app.save(assinanteHome)
    }

    const assinanteHomeId = assinanteHome.id

    // Vincular todas as empresas existentes ao assinante HOSPITAL HOME
    try {
      app
        .db()
        .newQuery(
          "UPDATE empresas SET assinante_id = '{:assId}' WHERE assinante_id IS NULL OR assinante_id = ''",
        )
        .bind({ assId: assinanteHomeId })
        .execute()
    } catch (errEmp) {
      console.warn('Aviso ao vincular empresas ao assinante:', errEmp)
    }

    // Vincular todos os perfis_acesso existentes ao assinante HOSPITAL HOME
    try {
      app
        .db()
        .newQuery(
          "UPDATE perfis_acesso SET assinante_id = '{:assId}' WHERE assinante_id IS NULL OR assinante_id = ''",
        )
        .bind({ assId: assinanteHomeId })
        .execute()
    } catch (errPerfis) {
      console.warn('Aviso ao vincular perfis_acesso ao assinante:', errPerfis)
    }

    // Vincular todos os usuarios existentes ao assinante HOSPITAL HOME
    try {
      app
        .db()
        .newQuery(
          "UPDATE usuarios SET assinante_id = '{:assId}' WHERE assinante_id IS NULL OR assinante_id = ''",
        )
        .bind({ assId: assinanteHomeId })
        .execute()
    } catch (errUsrs) {
      console.warn('Aviso ao vincular usuarios ao assinante:', errUsrs)
    }

    // Padrão users.tipo = 'usuario' para quem não tem tipo definido
    try {
      app
        .db()
        .newQuery("UPDATE users SET tipo = 'usuario' WHERE tipo IS NULL OR tipo = ''")
        .execute()
    } catch (errTipoUsers) {
      console.warn('Aviso ao definir tipo padrão de users:', errTipoUsers)
    }

    // -------------------------------------------------------------------------
    // 5. Acesso Master (marceloslepre@gmail.com)
    // -------------------------------------------------------------------------
    const masterEmail = 'marceloslepre@gmail.com'
    let masterAuth = null

    try {
      masterAuth = app.findAuthRecordByEmail('_pb_users_auth_', masterEmail)
    } catch (_) {
      masterAuth = null
    }

    // Localizar perfil Administrador com administrador=true
    let adminPerfil = null
    try {
      const perfis = app.findRecordsByFilter(
        'perfis_acesso',
        "administrador = true && ativo = true && (assinante_id = '" +
          assinanteHomeId +
          "' || assinante_id = '' || assinante_id IS NULL)",
        '-created',
        1,
        0,
      )
      if (perfis.length > 0) adminPerfil = perfis[0]
    } catch (_) {}

    if (!adminPerfil) {
      try {
        adminPerfil = app.findFirstRecordByData('perfis_acesso', 'administrador', true)
      } catch (_) {}
    }

    if (masterAuth) {
      // Já existia: marcar como master, sem alterar senha
      masterAuth.set('tipo', 'master')
      app.save(masterAuth)

      // Atualizar ou criar na tabela 'usuarios'
      let masterUsuario = null
      try {
        const uRecs = app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + masterAuth.id + "' || email = '" + masterEmail + "'",
          '-created',
          1,
          0,
        )
        if (uRecs.length > 0) masterUsuario = uRecs[0]
      } catch (_) {}

      if (!masterUsuario) {
        masterUsuario = new Record(usuariosCol)
        masterUsuario.set('nome', masterAuth.getString('name') || 'Marcelo Lepre')
        masterUsuario.set('email', masterEmail)
        masterUsuario.set('auth_user_id', masterAuth.id)
      }

      masterUsuario.set('ativo', true)
      masterUsuario.set('assinante_id', assinanteHomeId)
      if (adminPerfil) {
        masterUsuario.set('perfil_id', adminPerfil.id)
      }

      // Empresa padrão: primeira empresa do assinante
      const empHome = app.findRecordsByFilter(
        'empresas',
        "assinante_id = '" + assinanteHomeId + "' && ativo = true",
        'codigo',
        1,
        0,
      )
      if (empHome.length > 0) {
        masterUsuario.set('empresa_padrao_id', empHome[0].id)
      }
      app.save(masterUsuario)

      // Garantir vínculos em usuarios_empresas para todas as empresas do assinante
      const todasEmpresasAssinante = app.findRecordsByFilter(
        'empresas',
        "assinante_id = '" + assinanteHomeId + "'",
        'codigo',
        100,
        0,
      )
      const usuariosEmpresasCol = app.findCollectionByNameOrId('usuarios_empresas')
      for (let e = 0; e < todasEmpresasAssinante.length; e++) {
        const emp = todasEmpresasAssinante[e]
        const jaTem = app.findRecordsByFilter(
          'usuarios_empresas',
          "usuario_id = '" + masterUsuario.id + "' && empresa_id = '" + emp.id + "'",
          '',
          1,
          0,
        )
        if (jaTem.length === 0) {
          const ue = new Record(usuariosEmpresasCol)
          ue.set('usuario_id', masterUsuario.id)
          ue.set('empresa_id', emp.id)
          ue.set('ativo', true)
          app.save(ue)
        }
      }
    } else {
      // NÃO existia: criar com a senha MASTER_SENHA_INICIAL
      let senhaInicial = ''
      try {
        senhaInicial = ($os.getenv('MASTER_SENHA_INICIAL') || '').trim()
      } catch (_) {}

      if (!senhaInicial) {
        throw new Error(
          'A variável de ambiente MASTER_SENHA_INICIAL é obrigatória para criar o usuário master.',
        )
      }

      masterAuth = new Record(usersAuthCol)
      masterAuth.setEmail(masterEmail)
      masterAuth.setPassword(senhaInicial)
      masterAuth.setVerified(true)
      masterAuth.set('name', 'Marcelo Lepre')
      masterAuth.set('tipo', 'master')
      app.save(masterAuth)

      const masterUsuario = new Record(usuariosCol)
      masterUsuario.set('nome', 'Marcelo Lepre')
      masterUsuario.set('email', masterEmail)
      masterUsuario.set('auth_user_id', masterAuth.id)
      masterUsuario.set('ativo', true)
      masterUsuario.set('assinante_id', assinanteHomeId)
      if (adminPerfil) {
        masterUsuario.set('perfil_id', adminPerfil.id)
      }

      const empHome = app.findRecordsByFilter(
        'empresas',
        "assinante_id = '" + assinanteHomeId + "' && ativo = true",
        'codigo',
        1,
        0,
      )
      if (empHome.length > 0) {
        masterUsuario.set('empresa_padrao_id', empHome[0].id)
      }
      app.save(masterUsuario)

      const todasEmpresasAssinante = app.findRecordsByFilter(
        'empresas',
        "assinante_id = '" + assinanteHomeId + "'",
        'codigo',
        100,
        0,
      )
      const usuariosEmpresasCol = app.findCollectionByNameOrId('usuarios_empresas')
      for (let e = 0; e < todasEmpresasAssinante.length; e++) {
        const emp = todasEmpresasAssinante[e]
        const ue = new Record(usuariosEmpresasCol)
        ue.set('usuario_id', masterUsuario.id)
        ue.set('empresa_id', emp.id)
        ue.set('ativo', true)
        app.save(ue)
      }
    }
  },
  (app) => {
    // Reversão
  },
)
