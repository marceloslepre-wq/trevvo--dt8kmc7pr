// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0139: preço de venda por loja (empresa) e preço / valor recebido por canal
 *
 * 1. produtos_precos_empresa: preço de venda próprio de um produto numa empresa
 *    (ex.: loja 02 com COMPETE vende mais barato que a loja 01). Sem registro = vale
 *    o preço geral produtos.preco_venda. PDV, pedido e Trevvo Móvel usam o preço da
 *    empresa que está vendendo.
 * 2. produtos_precos_canal: por produto e canal de venda (canais_margem), um preço
 *    próprio no canal (ex.: Shopee digitado à mão) e o valor recebido líquido
 *    (ex.: "Você recebe" do Mercado Livre), usados na margem por canal.
 * 3. canais_margem.acrescimo_percentual: regra de preço do canal = preço da empresa
 *    do canal + X% (como a regra de precificação da Tray).
 * 4. Hospital Home: canal Loja física -> loja 01 (0005-02); demais -> loja 02 (0003-40),
 *    só onde o canal ainda não tem empresa.
 * Idempotente.
 */
migrate(
  (app) => {
    const regraAssinante = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
    const assinantesCol = app.findCollectionByNameOrId('assinantes')
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const canaisCol = app.findCollectionByNameOrId('canais_margem')

    function existe(nome) {
      try {
        app.findCollectionByNameOrId(nome)
        return true
      } catch (_) {
        return false
      }
    }

    // 1. produtos_precos_empresa
    if (!existe('produtos_precos_empresa')) {
      const col = new Collection({
        name: 'produtos_precos_empresa',
        type: 'base',
        listRule: regraAssinante,
        viewRule: regraAssinante,
        createRule: regraAssinante,
        updateRule: regraAssinante + ' && @request.body.assinante_id:isset = false',
        deleteRule: regraAssinante,
        fields: [
          {
            name: 'assinante_id',
            type: 'relation',
            required: true,
            collectionId: assinantesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'produto_id',
            type: 'relation',
            required: true,
            collectionId: produtosCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'empresa_id',
            type: 'relation',
            required: true,
            collectionId: empresasCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'preco_venda', type: 'number', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_ppe_produto_empresa ON produtos_precos_empresa (produto_id, empresa_id)',
          'CREATE INDEX idx_ppe_empresa ON produtos_precos_empresa (empresa_id)',
        ],
      })
      app.save(col)
    }

    // 2. produtos_precos_canal
    if (!existe('produtos_precos_canal')) {
      const col = new Collection({
        name: 'produtos_precos_canal',
        type: 'base',
        listRule: regraAssinante,
        viewRule: regraAssinante,
        createRule: regraAssinante,
        updateRule: regraAssinante + ' && @request.body.assinante_id:isset = false',
        deleteRule: regraAssinante,
        fields: [
          {
            name: 'assinante_id',
            type: 'relation',
            required: true,
            collectionId: assinantesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'produto_id',
            type: 'relation',
            required: true,
            collectionId: produtosCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'canal_id',
            type: 'relation',
            required: true,
            collectionId: canaisCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'preco', type: 'number', required: false },
          { name: 'valor_recebido', type: 'number', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_ppc_produto_canal ON produtos_precos_canal (produto_id, canal_id)',
        ],
      })
      app.save(col)
    }

    // 3. canais_margem.acrescimo_percentual
    const canais = app.findCollectionByNameOrId('canais_margem')
    if (!canais.fields.getByName('acrescimo_percentual')) {
      canais.fields.add(new NumberField({ name: 'acrescimo_percentual', required: false }))
      app.save(canais)
    }

    // 4. Hospital Home: empresa de cada canal
    const assinanteHHId = 'wqxiw7olvkup3sm'
    function empresaPorCnpj(digitos, formatado) {
      try {
        const e = app.findFirstRecordByFilter(
          'empresas',
          "assinante_id = '" +
            assinanteHHId +
            "' && (cnpj = '" +
            digitos +
            "' || cnpj = '" +
            formatado +
            "')",
        )
        return e ? e.id : ''
      } catch (_) {
        return ''
      }
    }
    const loja01 = empresaPorCnpj('10893738000502', '10.893.738/0005-02')
    const loja02 = empresaPorCnpj('10893738000340', '10.893.738/0003-40')

    let canaisHH = []
    try {
      canaisHH = app.findRecordsByFilter(
        'canais_margem',
        "assinante_id = '" + assinanteHHId + "'",
        '',
        100,
        0,
      )
    } catch (_) {
      canaisHH = []
    }
    for (let i = 0; i < canaisHH.length; i++) {
      const c = canaisHH[i]
      if (c.getString('empresa_id')) continue
      const alvo = c.getString('nome') === 'Loja física' ? loja01 : loja02
      if (!alvo) continue
      try {
        c.set('empresa_id', alvo)
        app.save(c)
      } catch (eC) {
        console.log('[0139] erro ao definir empresa do canal ' + c.getString('nome') + ': ' + eC)
      }
    }
    console.log('[0139] loja01=' + loja01 + ' loja02=' + loja02 + ' canais HH=' + canaisHH.length)
  },
  (app) => {
    const nomes = ['produtos_precos_canal', 'produtos_precos_empresa']
    for (let i = 0; i < nomes.length; i++) {
      try {
        app.delete(app.findCollectionByNameOrId(nomes[i]))
      } catch (_) {}
    }
  },
)
