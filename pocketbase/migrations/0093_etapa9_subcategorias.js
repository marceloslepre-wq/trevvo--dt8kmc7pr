// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0093: Etapa 9 Multi-tenant - Terceiro nível de classificação (subcategorias)
 * e produtos.subcategoria_id (Prompt G1)
 */
migrate(
  (app) => {
    const assinantesCol = app.findCollectionByNameOrId('assinantes')
    const categoriasCol = app.findCollectionByNameOrId('categorias')

    // 1. Criar coleção subcategorias
    let subcategoriasCol
    try {
      subcategoriasCol = app.findCollectionByNameOrId('subcategorias')
    } catch (_) {
      subcategoriasCol = new Collection({
        name: 'subcategorias',
        type: 'base',
        fields: [
          {
            name: 'assinante_id',
            type: 'relation',
            collectionId: assinantesCol.id,
            required: false,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'categoria_id',
            type: 'relation',
            collectionId: categoriasCol.id,
            required: true,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'codigo',
            type: 'text',
            required: false,
          },
          {
            name: 'nome',
            type: 'text',
            required: true,
          },
          {
            name: 'margem_padrao_percentual',
            type: 'number',
            required: false,
          },
          {
            name: 'ativo',
            type: 'bool',
            required: false,
          },
          {
            name: 'created_by',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            required: false,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'updated_by',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            required: false,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_subcat_categoria_nome ON subcategorias (categoria_id, nome)',
          "CREATE UNIQUE INDEX idx_subcat_assinante_codigo ON subcategorias (assinante_id, codigo) WHERE codigo != '' AND codigo IS NOT NULL",
          'CREATE INDEX idx_subcat_assinante ON subcategorias (assinante_id)',
          'CREATE INDEX idx_subcat_categoria ON subcategorias (categoria_id)',
          'CREATE INDEX idx_subcat_ativo ON subcategorias (ativo)',
        ],
        listRule: "@request.auth.id != '' && assinante_id = @request.auth.assinante_id",
        viewRule: "@request.auth.id != '' && assinante_id = @request.auth.assinante_id",
        createRule: "@request.auth.id != '' && assinante_id = @request.auth.assinante_id",
        updateRule: "@request.auth.id != '' && assinante_id = @request.auth.assinante_id",
        deleteRule: "@request.auth.id != '' && assinante_id = @request.auth.assinante_id",
      })
      app.save(subcategoriasCol)
    }

    // 2. Adicionar campo subcategoria_id na tabela produtos
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const subcatColSalva = app.findCollectionByNameOrId('subcategorias')
    if (!produtosCol.fields.getByName('subcategoria_id')) {
      produtosCol.fields.add(
        new RelationField({
          name: 'subcategoria_id',
          required: false,
          collectionId: subcatColSalva.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      // Adiciona índice em subcategoria_id
      const indexes = produtosCol.indexes || []
      const idxSubcat = 'CREATE INDEX idx_produtos_subcategoria ON produtos (subcategoria_id)'
      if (!indexes.some((idx) => idx.includes('idx_produtos_subcategoria'))) {
        indexes.push(idxSubcat)
        produtosCol.indexes = indexes
      }
      app.save(produtosCol)
    }
  },
  (app) => {
    // Reversão incremental não necessária em produção
  },
)
