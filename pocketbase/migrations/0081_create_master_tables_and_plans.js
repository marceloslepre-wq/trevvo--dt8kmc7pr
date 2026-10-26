/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    // 1. Criar coleção planos_catalogo
    // Campos: nome, etiqueta, descricao, valor_mensal, limite_empresas, limite_usuarios, permite_nfe, permite_nfce, permite_sped, exclusivo_master, ativo
    // Regras de acesso:
    // - Global: só o master altera; os demais usuários leem só os registros ativos e não exclusivos do master
    // listRule: "@request.auth.id != '' && (exclusivo_master = false && ativo = true || @request.auth.tipo = 'master')"
    // viewRule: "@request.auth.id != '' && (exclusivo_master = false && ativo = true || @request.auth.tipo = 'master')"
    // createRule, updateRule, deleteRule: "@request.auth.id != '' && @request.auth.tipo = 'master'"
    const planosCollection = new Collection({
      name: 'planos_catalogo',
      type: 'base',
      listRule:
        "@request.auth.id != '' && ((exclusivo_master = false && ativo = true) || @request.auth.tipo = 'master')",
      viewRule:
        "@request.auth.id != '' && ((exclusivo_master = false && ativo = true) || @request.auth.tipo = 'master')",
      createRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
      updateRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
      deleteRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'etiqueta', type: 'text' },
        { name: 'descricao', type: 'text' },
        { name: 'valor_mensal', type: 'number' },
        { name: 'limite_empresas', type: 'number' },
        { name: 'limite_usuarios', type: 'number' },
        { name: 'permite_nfe', type: 'bool' },
        { name: 'permite_nfce', type: 'bool' },
        { name: 'permite_sped', type: 'bool' },
        { name: 'exclusivo_master', type: 'bool' },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_planos_catalogo_ativo ON planos_catalogo (ativo)',
        'CREATE INDEX idx_planos_catalogo_exclusivo ON planos_catalogo (exclusivo_master)',
      ],
    })
    app.save(planosCollection)

    const planosColSaved = app.findCollectionByNameOrId('planos_catalogo')
    const planosColId = planosColSaved.id

    // 2. Alterar coleção assinantes: transformar plano_id em relação com planos_catalogo
    // Como não podemos trocar o tipo de text para relation diretamente em um campo existente se PocketBase validar,
    // ou removemos o campo plano_id de texto e criamos como RelationField.
    const assinantesCol = app.findCollectionByNameOrId('assinantes')
    const oldPlanoField = assinantesCol.fields.getByName('plano_id')
    if (oldPlanoField) {
      assinantesCol.fields.removeByName('plano_id')
    }
    assinantesCol.fields.add(
      new RelationField({
        name: 'plano_id',
        collectionId: planosColId,
        maxSelect: 1,
        cascadeDelete: false,
      }),
    )
    app.save(assinantesCol)

    const assinantesColSaved = app.findCollectionByNameOrId('assinantes')
    const assinantesColId = assinantesColSaved.id

    // 3. Criar coleção licencas_eventos
    // Campos: assinante_id, numero_licenca, tipo, plano_id, validade_ate, descricao, criado_por, created, updated
    // tipo: select (valores: Criação, Trial, Renovação +30d, Reativação, Mudança de plano, Pausa, Expiração, Edição)
    // Leitura: o próprio assinante e o master
    // listRule: "@request.auth.id != '' && (@request.auth.tipo = 'master' || assinante_id = @request.auth.assinante_id)"
    // viewRule: "@request.auth.id != '' && (@request.auth.tipo = 'master' || assinante_id = @request.auth.assinante_id)"
    // Gravação: só pelo backend (createRule, updateRule, deleteRule = null)
    const eventosCollection = new Collection({
      name: 'licencas_eventos',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.tipo = 'master' || assinante_id = @request.auth.assinante_id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.tipo = 'master' || assinante_id = @request.auth.assinante_id)",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'assinante_id',
          type: 'relation',
          collectionId: assinantesColId,
          required: true,
          maxSelect: 1,
        },
        { name: 'numero_licenca', type: 'text', required: true },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: [
            'Criação',
            'Trial',
            'Renovação +30d',
            'Reativação',
            'Mudança de plano',
            'Pausa',
            'Expiração',
            'Edição',
          ],
          maxSelect: 1,
        },
        {
          name: 'plano_id',
          type: 'relation',
          collectionId: planosColId,
          maxSelect: 1,
        },
        { name: 'validade_ate', type: 'text' },
        { name: 'descricao', type: 'text' },
        {
          name: 'criado_por',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_licencas_eventos_ass ON licencas_eventos (assinante_id)',
        'CREATE INDEX idx_licencas_eventos_lic ON licencas_eventos (numero_licenca)',
        'CREATE INDEX idx_licencas_eventos_tipo ON licencas_eventos (tipo)',
      ],
    })
    app.save(eventosCollection)

    // 4. Criar coleção config_master (registro único, só o master)
    // dias_trial, padrão 15
    const configMasterCollection = new Collection({
      name: 'config_master',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
      viewRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
      createRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
      updateRule: "@request.auth.id != '' && @request.auth.tipo = 'master'",
      deleteRule: null,
      fields: [
        { name: 'dias_trial', type: 'number', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(configMasterCollection)

    // Seed registro único em config_master
    const configMasterRec = new Record(app.findCollectionByNameOrId('config_master'))
    configMasterRec.set('dias_trial', 15)
    app.save(configMasterRec)

    // 5. Inserir Planos Iniciais:
    // - "Plano Master" (exclusivo master, isento valor_mensal=0, ilimitado limite_empresas=0 limite_usuarios=null, todos os recursos: nfe, nfce, sped = true, ativo = true)
    // - 3 planos de exemplo que o usuário edita depois:
    //   * Básico: etiqueta "Essencial", valor 149.00, limite_empresas 1, limite_usuarios 3, nfe true, nfce true, sped false, exclusivo_master false, ativo true
    //   * Profissional: etiqueta "Recomendado", valor 299.00, limite_empresas 3, limite_usuarios 10, nfe true, nfce true, sped true, exclusivo_master false, ativo true
    //   * Completo: etiqueta "Enterprise", valor 599.00, limite_empresas 10, limite_usuarios null, nfe true, nfce true, sped true, exclusivo_master false, ativo true
    const planosCol = app.findCollectionByNameOrId('planos_catalogo')

    const planoMaster = new Record(planosCol)
    planoMaster.set('nome', 'Plano Master')
    planoMaster.set('etiqueta', 'Exclusivo Master')
    planoMaster.set(
      'descricao',
      'Plano administrativo ilimitado e irrestrito para o proprietário do SaaS.',
    )
    planoMaster.set('valor_mensal', 0)
    planoMaster.set('limite_empresas', 0)
    planoMaster.set('limite_usuarios', 0)
    planoMaster.set('permite_nfe', true)
    planoMaster.set('permite_nfce', true)
    planoMaster.set('permite_sped', true)
    planoMaster.set('exclusivo_master', true)
    planoMaster.set('ativo', true)
    app.save(planoMaster)

    const planoBasico = new Record(planosCol)
    planoBasico.set('nome', 'Básico')
    planoBasico.set('etiqueta', 'Essencial')
    planoBasico.set(
      'descricao',
      'Plano inicial para micro e pequenas empresas com emissão fiscal simplificada.',
    )
    planoBasico.set('valor_mensal', 149)
    planoBasico.set('limite_empresas', 1)
    planoBasico.set('limite_usuarios', 3)
    planoBasico.set('permite_nfe', true)
    planoBasico.set('permite_nfce', true)
    planoBasico.set('permite_sped', false)
    planoBasico.set('exclusivo_master', false)
    planoBasico.set('ativo', true)
    app.save(planoBasico)

    const planoProfissional = new Record(planosCol)
    planoProfissional.set('nome', 'Profissional')
    planoProfissional.set('etiqueta', 'Recomendado')
    planoProfissional.set(
      'descricao',
      'Ideal para empresas em crescimento, até 3 filiais e entrega completa de SPED.',
    )
    planoProfissional.set('valor_mensal', 299)
    planoProfissional.set('limite_empresas', 3)
    planoProfissional.set('limite_usuarios', 10)
    planoProfissional.set('permite_nfe', true)
    planoProfissional.set('permite_nfce', true)
    planoProfissional.set('permite_sped', true)
    planoProfissional.set('exclusivo_master', false)
    planoProfissional.set('ativo', true)
    app.save(planoProfissional)

    const planoCompleto = new Record(planosCol)
    planoCompleto.set('nome', 'Completo')
    planoCompleto.set('etiqueta', 'Enterprise')
    planoCompleto.set(
      'descricao',
      'Solução corporativa multi-empresa com usuários ilimitados e todos os módulos.',
    )
    planoCompleto.set('valor_mensal', 599)
    planoCompleto.set('limite_empresas', 10)
    planoCompleto.set('limite_usuarios', 0)
    planoCompleto.set('permite_nfe', true)
    planoCompleto.set('permite_nfce', true)
    planoCompleto.set('permite_sped', true)
    planoCompleto.set('exclusivo_master', false)
    planoCompleto.set('ativo', true)
    app.save(planoCompleto)

    // 6. Vincular assinantes existentes aos respectivos planos:
    // - HOSPITAL HOME -> Plano Master
    // - TESTE B -> Plano Básico
    const masterUser = app.findFirstRecordByFilter('users', "tipo = 'master'")
    const masterUserId = masterUser ? masterUser.id : ''

    const assinantesParaAtualizar = app.findRecordsByFilter('assinantes', '', '', 50, 0)
    const eventosCol = app.findCollectionByNameOrId('licencas_eventos')

    for (let i = 0; i < assinantesParaAtualizar.length; i++) {
      const ass = assinantesParaAtualizar[i]
      const licenca = ass.getString('numero_licenca')
      const nomeAss = ass.getString('nome')

      if (
        ass.getBool('origem') ||
        licenca === 'HH-RFR8HF' ||
        nomeAss.indexOf('HOSPITAL HOME') >= 0
      ) {
        ass.set('plano_id', planoMaster.id)
        app.save(ass)

        // Registrar evento Criação da HOSPITAL HOME
        const evHh = new Record(eventosCol)
        evHh.set('assinante_id', ass.id)
        evHh.set('numero_licenca', licenca)
        evHh.set('tipo', 'Criação')
        evHh.set('plano_id', planoMaster.id)
        evHh.set('validade_ate', ass.getString('data_expiracao') || '')
        evHh.set(
          'descricao',
          'Criação inicial da conta master do SaaS HOSPITAL HOME (plano vitalício/isento).',
        )
        if (masterUserId) evHh.set('criado_por', masterUserId)
        app.save(evHh)
      } else if (licenca === 'TB-VWYWK6' || nomeAss.indexOf('TESTE B') >= 0) {
        ass.set('plano_id', planoBasico.id)
        app.save(ass)

        // Registrar evento Criação do TESTE B
        const evTb = new Record(eventosCol)
        evTb.set('assinante_id', ass.id)
        evTb.set('numero_licenca', licenca)
        evTb.set('tipo', 'Criação')
        evTb.set('plano_id', planoBasico.id)
        evTb.set('validade_ate', ass.getString('data_expiracao') || '')
        evTb.set(
          'descricao',
          'Criação do assinante de homologação multi-tenant TESTE B vinculado ao plano Básico.',
        )
        if (masterUserId) evTb.set('criado_por', masterUserId)
        app.save(evTb)
      }
    }
  },
  (app) => {
    try {
      const evCol = app.findCollectionByNameOrId('licencas_eventos')
      app.delete(evCol)
    } catch (_) {}

    try {
      const cfgCol = app.findCollectionByNameOrId('config_master')
      app.delete(cfgCol)
    } catch (_) {}

    try {
      const plCol = app.findCollectionByNameOrId('planos_catalogo')
      app.delete(plCol)
    } catch (_) {}
  },
)
