// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0138: canais de venda para o simulador "Margem por canal" (aba Preços do produto)
 *
 * Cada canal define como calcular a margem líquida de um produto naquele canal:
 *   - modo_icms: 'perfil' (alíquota do cenário de venda interna do perfil tributário do produto)
 *                ou 'fixo' (aliquota_icms_fixa, ex.: 1,1% de carga efetiva com COMPETE-ES)
 *   - comissao_percentual / taxa_fixa: comissão e taxa por venda do marketplace
 *   - despesas_percentual: outras despesas variáveis de venda
 * PIS/COFINS sempre vêm do perfil do produto (base = preço − ICMS).
 *
 * Seeds (só quando o assinante ainda não tem nenhum canal):
 *   Loja física (perfil), Loja virtual (fixo 1,1), Mercado Livre, Shopee, Amazon (fixo 1,1,
 *   comissão em branco para o usuário preencher).
 * Idempotente.
 */
migrate(
  (app) => {
    let col = null
    try {
      col = app.findCollectionByNameOrId('canais_margem')
    } catch (_) {
      col = null
    }

    if (!col) {
      const assinantesCol = app.findCollectionByNameOrId('assinantes')
      let empresasCol = null
      try {
        empresasCol = app.findCollectionByNameOrId('empresas')
      } catch (_) {}

      const regraAssinante = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"

      col = new Collection({
        name: 'canais_margem',
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
          { name: 'nome', type: 'text', required: true, max: 80 },
          {
            name: 'empresa_id',
            type: 'relation',
            required: false,
            collectionId: empresasCol ? empresasCol.id : 'empresas',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'modo_icms',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['perfil', 'fixo'],
          },
          { name: 'aliquota_icms_fixa', type: 'number', required: false },
          { name: 'comissao_percentual', type: 'number', required: false },
          { name: 'taxa_fixa', type: 'number', required: false },
          { name: 'despesas_percentual', type: 'number', required: false },
          { name: 'ordem', type: 'number', required: false },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'observacao', type: 'text', required: false, max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_canais_margem_assinante ON canais_margem (assinante_id)'],
      })
      app.save(col)
    }

    // Seeds por assinante
    let assinantes = []
    try {
      assinantes = app.findAllRecords('assinantes')
    } catch (_) {
      assinantes = []
    }

    const padroes = [
      {
        nome: 'Loja física',
        modo: 'perfil',
        icms: 0,
        obs: 'ICMS pela alíquota de venda interna do perfil tributário do produto.',
      },
      {
        nome: 'Loja virtual',
        modo: 'fixo',
        icms: 1.1,
        obs: 'Venda não presencial para outros estados com COMPETE-ES (carga efetiva 1,1%).',
      },
      { nome: 'Mercado Livre', modo: 'fixo', icms: 1.1, obs: 'Preencha comissão e taxa fixa.' },
      { nome: 'Shopee', modo: 'fixo', icms: 1.1, obs: 'Preencha comissão e taxa fixa.' },
      { nome: 'Amazon', modo: 'fixo', icms: 1.1, obs: 'Preencha comissão e taxa fixa.' },
    ]

    // Hospital Home: médias reais de outubro/2026 (relatório de repasses dos marketplaces).
    // comissão = comissão + outros (descontos, reembolsos, taxas); despesas = frete.
    const mediasHH = {
      'Mercado Livre': {
        com: 16.89,
        desp: 17.0,
        obs: 'Média out/2026: frete 17,0%, comissão 13,5%, outros 3,6% (recebe 65,9%).',
      },
      Amazon: {
        com: 13.73,
        desp: 14.25,
        obs: 'Média out/2026: frete 14,3%, comissão 13,9%, outros -0,2% (recebe 72,0%).',
      },
      Shopee: {
        com: 32.6,
        desp: 0,
        obs: 'Média out/2026: comissão 24,8%, outros 7,8%, frete 0% (recebe 67,4%).',
      },
    }
    const assinanteHHId = 'wqxiw7olvkup3sm'

    for (let i = 0; i < assinantes.length; i++) {
      const a = assinantes[i]
      let existentes = []
      try {
        existentes = app.findRecordsByFilter(
          'canais_margem',
          "assinante_id = '" + a.id + "'",
          '',
          1,
          0,
        )
      } catch (_) {
        existentes = []
      }
      if (existentes && existentes.length > 0) continue

      for (let j = 0; j < padroes.length; j++) {
        const p = padroes[j]
        try {
          const r = new Record(col)
          r.set('assinante_id', a.id)
          r.set('nome', p.nome)
          r.set('modo_icms', p.modo)
          r.set('aliquota_icms_fixa', p.icms)
          const media = a.id === assinanteHHId ? mediasHH[p.nome] : null
          r.set('comissao_percentual', media ? media.com : 0)
          r.set('taxa_fixa', 0)
          r.set('despesas_percentual', media ? media.desp : 0)
          r.set('ordem', j + 1)
          r.set('ativo', true)
          r.set('observacao', media ? media.obs : p.obs)
          app.save(r)
        } catch (eSeed) {
          console.log(
            '[0138] erro ao criar canal ' + p.nome + ' para assinante ' + a.id + ': ' + eSeed,
          )
        }
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('canais_margem')
      app.delete(col)
    } catch (_) {}
  },
)
