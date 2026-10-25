// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0064: Etapa 9 Multi-tenant (Prompt 9.2)
 *
 * 1. Campo `assinante_id` (relação com assinantes, obrigatório) nas 15 coleções compartilhadas:
 *    - produtos
 *    - clientes
 *    - fornecedores
 *    - marcas
 *    - grupos
 *    - categorias
 *    - condicoes_pagamento
 *    - plano_contas
 *    - centros_custo
 *    - formas_pagamento
 *    - perfis_tributarios
 *    - regras_fiscais_ncm
 *    - configuracoes
 *    - relatorios_filtros_salvos
 *    - relatorios_salvos
 *
 * 2. Backfill idempotente:
 *    - Vincula todos os registros existentes das 15 coleções com assinante_id vazio
 *      ao assinante HOSPITAL HOME (id: wqxiw7olvkup3sm).
 *
 * 3. Unicidade dentro do assinante (índices únicos compostos assinante_id + campo):
 *    - produtos: codigo (idx_produtos_assinante_codigo) e gtin (idx_produtos_assinante_gtin)
 *    - clientes: codigo (idx_clientes_assinante_codigo) e cpf_cnpj (idx_clientes_assinante_cpf_cnpj)
 *    - fornecedores: codigo (idx_fornecedores_assinante_codigo) e cpf_cnpj (idx_fornecedores_assinante_cpf_cnpj)
 *    - plano_contas: codigo (idx_plano_contas_assinante_codigo)
 *    - marcas: nome (idx_marcas_assinante_nome)
 *    - grupos: nome (idx_grupos_assinante_nome) e codigo (idx_grupos_assinante_codigo)
 *    - categorias: nome dentro do grupo e assinante (idx_categorias_assinante_grupo_nome)
 *    - perfis_acesso: nome (idx_perfis_acesso_assinante_nome)
 *    - condicoes_pagamento: nome (idx_condicoes_pagamento_assinante_nome)
 *    - perfis_tributarios: nome (idx_perfis_tributarios_assinante_nome)
 *    - centros_custo: codigo (idx_centros_custo_assinante_codigo)
 */

migrate(
  (app) => {
    // 1. Identificar assinante HOSPITAL HOME
    let assinanteHomeId = 'wqxiw7olvkup3sm'
    try {
      const assinantes = app.findRecordsByFilter(
        'assinantes',
        "origem = true || id = 'wqxiw7olvkup3sm' || nome = 'HOSPITAL HOME'",
        '-created',
        1,
        0,
      )
      if (assinantes && assinantes.length > 0) {
        assinanteHomeId = assinantes[0].id
      }
    } catch (e) {
      console.warn('[0064] Aviso ao buscar assinante:', e)
    }

    const assinantesCol = app.findCollectionByNameOrId('assinantes')
    const assinantesColId = assinantesCol.id

    const colecoes15 = [
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
      'relatorios_filtros_salvos',
      'relatorios_salvos',
    ]

    // 2. Adicionar o campo assinante_id em cada uma das 15 coleções (inicialmente sem required para permitir backfill seguro)
    for (const colName of colecoes15) {
      try {
        const col = app.findCollectionByNameOrId(colName)
        let campo = col.fields.getByName('assinante_id')
        if (!campo) {
          col.fields.add(
            new RelationField({
              name: 'assinante_id',
              required: false,
              collectionId: assinantesColId,
              cascadeDelete: false,
              maxSelect: 1,
            }),
          )
          app.save(col)
        }
      } catch (err) {
        console.error(`[0064] Erro ao adicionar campo assinante_id em ${colName}:`, err)
        throw err
      }
    }

    // 3. Backfill idempotente dos registros existentes
    for (const colName of colecoes15) {
      try {
        app
          .db()
          .newQuery(
            `UPDATE ${colName} SET assinante_id = '{:assId}' WHERE assinante_id IS NULL OR assinante_id = ''`,
          )
          .bind({ assId: assinanteHomeId })
          .execute()
      } catch (errBf) {
        console.warn(`[0064] Aviso no backfill SQL direto de ${colName}:`, errBf)
        // Fallback via API do PocketBase para garantir
        try {
          const vazios = app.findRecordsByFilter(
            colName,
            "assinante_id = '' || assinante_id = null",
            '',
            1000,
            0,
          )
          for (let i = 0; i < vazios.length; i++) {
            vazios[i].set('assinante_id', assinanteHomeId)
            app.save(vazios[i])
          }
        } catch (_) {}
      }
    }

    // 4. Tornar o campo assinante_id obrigatório (required: true) após o backfill
    for (const colName of colecoes15) {
      try {
        const col = app.findCollectionByNameOrId(colName)
        const campo = col.fields.getByName('assinante_id')
        if (campo && !campo.required) {
          campo.required = true
          app.save(col)
        }
      } catch (errReq) {
        console.error(`[0064] Erro ao marcar assinante_id como obrigatório em ${colName}:`, errReq)
        throw errReq
      }
    }

    // 5. Ajustar índices únicos: trocar índices globais simples por compostos com assinante_id

    // Helper para remover índice se existir no schema da coleção
    const removerIndice = (col, nomeIndice) => {
      const idxs = col.indexes || []
      const novos = idxs.filter((i) => !i.includes(nomeIndice))
      if (novos.length !== idxs.length) {
        col.indexes = novos
      }
    }

    // Helper para adicionar índice se não existir
    const adicionarIndice = (col, indiceSql) => {
      const idxs = col.indexes || []
      const nomeMatch = indiceSql.match(/INDEX\s+([a-zA-Z0-9_]+)/i)
      const nomeIndice = nomeMatch ? nomeMatch[1] : indiceSql
      if (!idxs.some((i) => i.includes(nomeIndice))) {
        col.indexes.push(indiceSql)
      }
    }

    // A) PRODUTOS
    // Remover idx_produtos_codigo
    // Adicionar idx_produtos_assinante_codigo (assinante_id, codigo)
    // Adicionar idx_produtos_assinante_gtin (assinante_id, gtin WHERE gtin != '')
    try {
      const produtosCol = app.findCollectionByNameOrId('produtos')
      removerIndice(produtosCol, 'idx_produtos_codigo')
      adicionarIndice(
        produtosCol,
        'CREATE UNIQUE INDEX idx_produtos_assinante_codigo ON produtos (assinante_id, codigo)',
      )
      adicionarIndice(
        produtosCol,
        "CREATE UNIQUE INDEX idx_produtos_assinante_gtin ON produtos (assinante_id, gtin) WHERE gtin != '' AND gtin IS NOT NULL",
      )
      adicionarIndice(produtosCol, 'CREATE INDEX idx_produtos_assinante ON produtos (assinante_id)')
      app.save(produtosCol)
    } catch (eProd) {
      console.warn('[0064] Aviso índices produtos:', eProd)
    }

    // B) CLIENTES
    // Unicidade dentro do assinante: código e CPF/CNPJ
    try {
      const clientesCol = app.findCollectionByNameOrId('clientes')
      removerIndice(clientesCol, 'idx_clientes_codigo')
      removerIndice(clientesCol, 'idx_clientes_cpf_cnpj')
      adicionarIndice(
        clientesCol,
        'CREATE UNIQUE INDEX idx_clientes_assinante_codigo ON clientes (assinante_id, codigo)',
      )
      adicionarIndice(
        clientesCol,
        "CREATE UNIQUE INDEX idx_clientes_assinante_cpf_cnpj ON clientes (assinante_id, cpf_cnpj) WHERE cpf_cnpj != '' AND cpf_cnpj IS NOT NULL",
      )
      adicionarIndice(clientesCol, 'CREATE INDEX idx_clientes_assinante ON clientes (assinante_id)')
      app.save(clientesCol)
    } catch (eCli) {
      console.warn('[0064] Aviso índices clientes:', eCli)
    }

    // C) FORNECEDORES
    // Unicidade dentro do assinante: código e CPF/CNPJ
    try {
      const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')
      removerIndice(fornecedoresCol, 'idx_fornecedores_codigo')
      removerIndice(fornecedoresCol, 'idx_fornecedores_cpf_cnpj')
      adicionarIndice(
        fornecedoresCol,
        'CREATE UNIQUE INDEX idx_fornecedores_assinante_codigo ON fornecedores (assinante_id, codigo)',
      )
      adicionarIndice(
        fornecedoresCol,
        "CREATE UNIQUE INDEX idx_fornecedores_assinante_cpf_cnpj ON fornecedores (assinante_id, cpf_cnpj) WHERE cpf_cnpj != '' AND cpf_cnpj IS NOT NULL",
      )
      adicionarIndice(
        fornecedoresCol,
        'CREATE INDEX idx_fornecedores_assinante ON fornecedores (assinante_id)',
      )
      app.save(fornecedoresCol)
    } catch (eForn) {
      console.warn('[0064] Aviso índices fornecedores:', eForn)
    }

    // D) PLANO_CONTAS
    // Unicidade dentro do assinante: código
    try {
      const planoCol = app.findCollectionByNameOrId('plano_contas')
      removerIndice(planoCol, 'idx_plano_contas_codigo')
      adicionarIndice(
        planoCol,
        'CREATE UNIQUE INDEX idx_plano_contas_assinante_codigo ON plano_contas (assinante_id, codigo)',
      )
      adicionarIndice(
        planoCol,
        'CREATE INDEX idx_plano_contas_assinante ON plano_contas (assinante_id)',
      )
      app.save(planoCol)
    } catch (ePlano) {
      console.warn('[0064] Aviso índices plano_contas:', ePlano)
    }

    // E) MARCAS
    // Unicidade dentro do assinante: nome
    try {
      const marcasCol = app.findCollectionByNameOrId('marcas')
      removerIndice(marcasCol, 'idx_marcas_nome')
      adicionarIndice(
        marcasCol,
        'CREATE UNIQUE INDEX idx_marcas_assinante_nome ON marcas (assinante_id, nome)',
      )
      adicionarIndice(marcasCol, 'CREATE INDEX idx_marcas_assinante ON marcas (assinante_id)')
      app.save(marcasCol)
    } catch (eMarcas) {
      console.warn('[0064] Aviso índices marcas:', eMarcas)
    }

    // F) GRUPOS
    // Unicidade dentro do assinante: código e nome
    try {
      const gruposCol = app.findCollectionByNameOrId('grupos')
      removerIndice(gruposCol, 'idx_grupos_codigo')
      removerIndice(gruposCol, 'idx_grupos_nome')
      adicionarIndice(
        gruposCol,
        'CREATE UNIQUE INDEX idx_grupos_assinante_codigo ON grupos (assinante_id, codigo)',
      )
      adicionarIndice(
        gruposCol,
        'CREATE UNIQUE INDEX idx_grupos_assinante_nome ON grupos (assinante_id, nome)',
      )
      adicionarIndice(gruposCol, 'CREATE INDEX idx_grupos_assinante ON grupos (assinante_id)')
      app.save(gruposCol)
    } catch (eGrupos) {
      console.warn('[0064] Aviso índices grupos:', eGrupos)
    }

    // G) CATEGORIAS
    // Unicidade dentro do grupo e assinante: (assinante_id, grupo_id, nome)
    try {
      const catCol = app.findCollectionByNameOrId('categorias')
      removerIndice(catCol, 'idx_categorias_grupo_nome')
      adicionarIndice(
        catCol,
        'CREATE UNIQUE INDEX idx_categorias_assinante_grupo_nome ON categorias (assinante_id, grupo_id, nome)',
      )
      adicionarIndice(catCol, 'CREATE INDEX idx_categorias_assinante ON categorias (assinante_id)')
      app.save(catCol)
    } catch (eCat) {
      console.warn('[0064] Aviso índices categorias:', eCat)
    }

    // H) PERFIS_ACESSO
    // Unicidade dentro do assinante: nome
    try {
      const perfisCol = app.findCollectionByNameOrId('perfis_acesso')
      removerIndice(perfisCol, 'idx_perfis_acesso_nome')
      adicionarIndice(
        perfisCol,
        'CREATE UNIQUE INDEX idx_perfis_acesso_assinante_nome ON perfis_acesso (assinante_id, nome)',
      )
      app.save(perfisCol)
    } catch (ePerfis) {
      console.warn('[0064] Aviso índices perfis_acesso:', ePerfis)
    }

    // I) CONDICOES_PAGAMENTO
    // Unicidade dentro do assinante: nome
    try {
      const condCol = app.findCollectionByNameOrId('condicoes_pagamento')
      removerIndice(condCol, 'idx_condicoes_pagamento_nome')
      adicionarIndice(
        condCol,
        'CREATE UNIQUE INDEX idx_condicoes_pagamento_assinante_nome ON condicoes_pagamento (assinante_id, nome)',
      )
      adicionarIndice(
        condCol,
        'CREATE INDEX idx_condicoes_pagamento_assinante ON condicoes_pagamento (assinante_id)',
      )
      app.save(condCol)
    } catch (eCond) {
      console.warn('[0064] Aviso índices condicoes_pagamento:', eCond)
    }

    // J) PERFIS_TRIBUTARIOS
    // Unicidade dentro do assinante: nome
    try {
      const ptCol = app.findCollectionByNameOrId('perfis_tributarios')
      removerIndice(ptCol, 'idx_perfis_trib_nome')
      adicionarIndice(
        ptCol,
        'CREATE UNIQUE INDEX idx_perfis_tributarios_assinante_nome ON perfis_tributarios (assinante_id, nome)',
      )
      adicionarIndice(
        ptCol,
        'CREATE INDEX idx_perfis_tributarios_assinante ON perfis_tributarios (assinante_id)',
      )
      app.save(ptCol)
    } catch (ePt) {
      console.warn('[0064] Aviso índices perfis_tributarios:', ePt)
    }

    // K) CENTROS_CUSTO
    // Unicidade dentro do assinante: codigo
    try {
      const ccCol = app.findCollectionByNameOrId('centros_custo')
      removerIndice(ccCol, 'idx_centros_custo_codigo')
      adicionarIndice(
        ccCol,
        'CREATE UNIQUE INDEX idx_centros_custo_assinante_codigo ON centros_custo (assinante_id, codigo)',
      )
      adicionarIndice(
        ccCol,
        'CREATE INDEX idx_centros_custo_assinante ON centros_custo (assinante_id)',
      )
      app.save(ccCol)
    } catch (eCc) {
      console.warn('[0064] Aviso índices centros_custo:', eCc)
    }

    // L) Índices de performance para assinante_id nas demais coleções
    const demais = [
      'formas_pagamento',
      'regras_fiscais_ncm',
      'configuracoes',
      'relatorios_filtros_salvos',
      'relatorios_salvos',
    ]
    for (const d of demais) {
      try {
        const c = app.findCollectionByNameOrId(d)
        adicionarIndice(c, `CREATE INDEX idx_${d}_assinante ON ${d} (assinante_id)`)
        app.save(c)
      } catch (_) {}
    }
  },
  (app) => {
    // Reversão não necessária em produção incremental
  },
)
