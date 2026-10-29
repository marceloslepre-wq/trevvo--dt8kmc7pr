// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0094: Cadastro da classificação real de produtos da HOSPITAL HOME (Prompt G2)
 *
 * Assinante: HOSPITAL HOME (id: wqxiw7olvkup3sm)
 * Totais: 8 grupos, 36 categorias e 30 subcategorias.
 *
 * Características:
 * - Totalmente idempotente (pode rodar várias vezes sem duplicar).
 * - Reaproveita registros caso já existam no mesmo pai com mesmo nome.
 * - Códigos sequenciais (1..8 para grupos, 1..36 para categorias, 1..30 para subcategorias).
 * - margem_padrao_percentual = null, ativo = true.
 * - Atualiza os contadores de sequencias da HOSPITAL HOME para os maiores códigos gravados:
 *     tipo = 'codigo_grupos' -> maior código de grupos
 *     tipo = 'codigo_categorias' -> maior código de categorias
 *     tipo = 'codigo_subcategorias' -> maior código de subcategorias
 */
migrate(
  (app) => {
    const assinanteHHId = 'wqxiw7olvkup3sm'

    // 1. Validar existência do assinante HOSPITAL HOME
    let assinanteHH = null
    try {
      assinanteHH = app.findRecordById('assinantes', assinanteHHId)
    } catch (_) {
      try {
        assinanteHH = app.findFirstRecordByFilter(
          'assinantes',
          "origem = true || id = '" + assinanteHHId + "' || nome = 'HOSPITAL HOME'",
        )
      } catch (eAss) {
        console.log('[0094] Assinante HOSPITAL HOME não localizado. Migration ignorada.')
        return
      }
    }

    const realAssinanteId = assinanteHH ? assinanteHH.id : assinanteHHId

    // Coleções necessárias
    const gruposCol = app.findCollectionByNameOrId('grupos')
    const categoriasCol = app.findCollectionByNameOrId('categorias')
    const subcategoriasCol = app.findCollectionByNameOrId('subcategorias')
    const sequenciasCol = app.findCollectionByNameOrId('sequencias')

    // Estrutura completa da classificação da HOSPITAL HOME
    const classificacao = [
      {
        grupo: 'Descartáveis',
        categorias: [
          {
            categoria: 'Fraldas, Absorventes e Lenços',
            subcategorias: [
              'Fralda geriátrica',
              'Absorvente geriátrico',
              'Lenços e toalhas umedecidas',
            ],
          },
          {
            categoria: 'Luvas de Procedimento',
            subcategorias: ['Luva de látex', 'Luva de vinil', 'Luva nitrílica', 'Luva cirúrgica'],
          },
          {
            categoria: 'Agulhas, Seringas e Coletores',
            subcategorias: ['Agulhas', 'Seringas', 'Coletores'],
          },
          {
            categoria: 'Sondas, Cateteres e Scalps',
            subcategorias: ['Sondas', 'Cateteres', 'Scalps', 'Equipos'],
          },
          {
            categoria: 'Curativos',
            subcategorias: ['Fitas micropore', 'Algodão', 'Compressas de gaze', 'Ataduras'],
          },
          {
            categoria: 'Tratamento',
            subcategorias: [
              'Curativos diversos',
              'Pomadas diversas',
              'Óleos diversos',
              'Géis diversos',
              'Bolsas de colostomia e urostomia',
              'Álcool diversos',
            ],
          },
          {
            categoria: 'Acessórios',
            subcategorias: [
              'Aventais',
              'Lençóis descartáveis',
              'Frascos',
              'EPIs',
              'Eletrodos',
              'Caixas coletoras',
            ],
          },
          {
            categoria: 'Outros',
            subcategorias: [],
          },
        ],
      },
      {
        grupo: 'Órteses e Ortopédicos',
        categorias: [
          { categoria: 'Joelho', subcategorias: [] },
          { categoria: 'Tornozelo e Pé', subcategorias: [] },
          { categoria: 'Braço e Antebraço', subcategorias: [] },
          { categoria: 'Tipoias e Educadores Posturais', subcategorias: [] },
          { categoria: 'Faixas, Coletes e Colares', subcategorias: [] },
          { categoria: 'Outros Membros', subcategorias: [] },
        ],
      },
      {
        grupo: 'Cadeiras de Rodas e Acessibilidade',
        categorias: [
          { categoria: 'Cadeira de Rodas', subcategorias: [] },
          { categoria: 'Cadeira de Banho', subcategorias: [] },
          { categoria: 'Assento para Banho', subcategorias: [] },
          { categoria: 'Andadores, Muletas e Bengalas', subcategorias: [] },
          { categoria: 'Outros', subcategorias: [] },
        ],
      },
      {
        grupo: 'Camas e Móveis Hospitalares',
        categorias: [
          { categoria: 'Cama Hospitalar', subcategorias: [] },
          { categoria: 'Móvel Hospitalar', subcategorias: [] },
          { categoria: 'Outros', subcategorias: [] },
        ],
      },
      {
        grupo: 'Aparelhos e Equipamentos de Medição',
        categorias: [
          { categoria: 'Estetoscópios e Esfigmomanômetros', subcategorias: [] },
          { categoria: 'Aparelhos de Pressão e Oxímetros', subcategorias: [] },
          { categoria: 'Nebulizadores e Aspiradores de Secreção', subcategorias: [] },
          { categoria: 'Balanças, Glicosímetros e Termômetros', subcategorias: [] },
          { categoria: 'Outros', subcategorias: [] },
        ],
      },
      {
        grupo: 'Fisioterapia e Fitness',
        categorias: [
          { categoria: 'Acessórios', subcategorias: [] },
          { categoria: 'Equipamentos', subcategorias: [] },
          { categoria: 'Esporte', subcategorias: [] },
          { categoria: 'Outros', subcategorias: [] },
        ],
      },
      {
        grupo: 'Cuidados Pessoais',
        categorias: [
          { categoria: 'Colchões', subcategorias: [] },
          { categoria: 'Travesseiros, Encostos e Almofadas', subcategorias: [] },
          { categoria: 'Outros', subcategorias: [] },
        ],
      },
      {
        grupo: 'Meias de Compressão',
        categorias: [
          { categoria: 'Panturrilha', subcategorias: [] },
          { categoria: 'Meia-coxa', subcategorias: [] },
        ],
      },
    ]

    // Helpers para calcular próximo código numérico sequencial por assinante
    function obterMaiorCodigoNumerico(colecaoNome, filtroBase) {
      let maior = 0
      try {
        const registros = app.findRecordsByFilter(colecaoNome, filtroBase, '', 5000, 0)
        for (let i = 0; i < registros.length; i++) {
          const codStr = registros[i].getString('codigo') || ''
          const num = parseInt(codStr, 10)
          if (!isNaN(num) && num > maior) {
            maior = num
          }
        }
      } catch (e) {
        console.log('[0094] Erro ao obter maior código de ' + colecaoNome + ': ' + e.message)
      }
      return maior
    }

    let proximoCodigoGrupo = obterMaiorCodigoNumerico(
      'grupos',
      "assinante_id = '" + realAssinanteId + "'",
    )
    let proximoCodigoCategoria = obterMaiorCodigoNumerico(
      'categorias',
      "assinante_id = '" + realAssinanteId + "'",
    )
    let proximoCodigoSubcategoria = obterMaiorCodigoNumerico(
      'subcategorias',
      "assinante_id = '" + realAssinanteId + "'",
    )

    let gruposInseridos = 0
    let gruposReaproveitados = 0
    let categoriasInseridas = 0
    let categoriasReaproveitadas = 0
    let subcategoriasInseridas = 0
    let subcategoriasReaproveitadas = 0

    const gruposInfo = []

    // Processamento da Classificação
    for (let gIdx = 0; gIdx < classificacao.length; gIdx++) {
      const gItem = classificacao[gIdx]
      const gNome = gItem.grupo.trim()

      // 1. Buscar se grupo já existe para o assinante pelo nome
      let grupoRec = null
      try {
        const achados = app.findRecordsByFilter(
          'grupos',
          "assinante_id = '" + realAssinanteId + "' && nome = '" + gNome.replace(/'/g, "\\'") + "'",
          '',
          1,
          0,
        )
        if (achados && achados.length > 0) {
          grupoRec = achados[0]
        }
      } catch (_) {}

      if (grupoRec) {
        gruposReaproveitados++
        console.log(
          '[0094] Grupo reaproveitado: ' + gNome + ' (código ' + grupoRec.getString('codigo') + ')',
        )
      } else {
        proximoCodigoGrupo++
        grupoRec = new Record(gruposCol)
        grupoRec.set('assinante_id', realAssinanteId)
        grupoRec.set('codigo', String(proximoCodigoGrupo))
        grupoRec.set('nome', gNome)
        grupoRec.set('ativo', true)
        grupoRec.set('margem_padrao_percentual', null)
        app.save(grupoRec)
        gruposInseridos++
        console.log('[0094] Grupo inserido: ' + gNome + ' com código ' + proximoCodigoGrupo)
      }

      gruposInfo.push({
        nome: gNome,
        codigo: grupoRec.getString('codigo'),
        id: grupoRec.id,
      })

      // 2. Processar categorias do grupo
      for (let cIdx = 0; cIdx < gItem.categorias.length; cIdx++) {
        const cItem = gItem.categorias[cIdx]
        const cNome = cItem.categoria.trim()

        let categoriaRec = null
        try {
          const achadosCat = app.findRecordsByFilter(
            'categorias',
            "assinante_id = '" +
              realAssinanteId +
              "' && grupo_id = '" +
              grupoRec.id +
              "' && nome = '" +
              cNome.replace(/'/g, "\\'") +
              "'",
            '',
            1,
            0,
          )
          if (achadosCat && achadosCat.length > 0) {
            categoriaRec = achadosCat[0]
          }
        } catch (_) {}

        if (categoriaRec) {
          categoriasReaproveitadas++
          console.log(
            '[0094] Categoria reaproveitada: ' +
              gNome +
              ' > ' +
              cNome +
              ' (código ' +
              categoriaRec.getString('codigo') +
              ')',
          )
        } else {
          proximoCodigoCategoria++
          categoriaRec = new Record(categoriasCol)
          categoriaRec.set('assinante_id', realAssinanteId)
          categoriaRec.set('grupo_id', grupoRec.id)
          categoriaRec.set('codigo', String(proximoCodigoCategoria))
          categoriaRec.set('nome', cNome)
          categoriaRec.set('ativo', true)
          categoriaRec.set('margem_padrao_percentual', null)
          app.save(categoriaRec)
          categoriasInseridas++
          console.log(
            '[0094] Categoria inserida: ' +
              gNome +
              ' > ' +
              cNome +
              ' com código ' +
              proximoCodigoCategoria,
          )
        }

        // 3. Processar subcategorias da categoria
        for (let sIdx = 0; sIdx < cItem.subcategorias.length; sIdx++) {
          const sNome = cItem.subcategorias[sIdx].trim()

          let subcategoriaRec = null
          try {
            const achadosSub = app.findRecordsByFilter(
              'subcategorias',
              "categoria_id = '" +
                categoriaRec.id +
                "' && nome = '" +
                sNome.replace(/'/g, "\\'") +
                "'",
              '',
              1,
              0,
            )
            if (achadosSub && achadosSub.length > 0) {
              subcategoriaRec = achadosSub[0]
            }
          } catch (_) {}

          if (subcategoriaRec) {
            subcategoriasReaproveitadas++
            console.log(
              '[0094] Subcategoria reaproveitada: ' +
                cNome +
                ' > ' +
                sNome +
                ' (código ' +
                subcategoriaRec.getString('codigo') +
                ')',
            )
          } else {
            proximoCodigoSubcategoria++
            subcategoriaRec = new Record(subcategoriasCol)
            subcategoriaRec.set('assinante_id', realAssinanteId)
            subcategoriaRec.set('categoria_id', categoriaRec.id)
            subcategoriaRec.set('codigo', String(proximoCodigoSubcategoria))
            subcategoriaRec.set('nome', sNome)
            subcategoriaRec.set('ativo', true)
            subcategoriaRec.set('margem_padrao_percentual', null)
            app.save(subcategoriaRec)
            subcategoriasInseridas++
            console.log(
              '[0094] Subcategoria inserida: ' +
                cNome +
                ' > ' +
                sNome +
                ' com código ' +
                proximoCodigoSubcategoria,
            )
          }
        }
      }
    }

    // 4. Calcular o maior código gravado real em cada nível para a HOSPITAL HOME
    const maiorCodigoFinalGrupos = obterMaiorCodigoNumerico(
      'grupos',
      "assinante_id = '" + realAssinanteId + "'",
    )
    const maiorCodigoFinalCategorias = obterMaiorCodigoNumerico(
      'categorias',
      "assinante_id = '" + realAssinanteId + "'",
    )
    const maiorCodigoFinalSubcategorias = obterMaiorCodigoNumerico(
      'subcategorias',
      "assinante_id = '" + realAssinanteId + "'",
    )

    // 5. Atualizar contadores na tabela sequencias para a HOSPITAL HOME
    function atualizarOuCriarSequencia(tipo, valor) {
      const filtro =
        "assinante_id = '" +
        realAssinanteId +
        "' && tipo = '" +
        tipo +
        "' && (empresa_id = '' || empresa_id = null)"

      let seqRec = null
      try {
        const exist = app.findRecordsByFilter('sequencias', filtro, '', 1, 0)
        if (exist && exist.length > 0) {
          seqRec = exist[0]
        }
      } catch (_) {}

      if (!seqRec) {
        seqRec = new Record(sequenciasCol)
        seqRec.set('assinante_id', realAssinanteId)
        seqRec.set('empresa_id', null)
        seqRec.set('tipo', tipo)
      }

      seqRec.set('ultimo_numero', valor)
      app.save(seqRec)
      console.log(
        '[0094] Sequencia atualizada: assinante=' +
          realAssinanteId +
          ', tipo=' +
          tipo +
          ', ultimo_numero=' +
          valor,
      )
    }

    atualizarOuCriarSequencia('codigo_grupos', maiorCodigoFinalGrupos)
    atualizarOuCriarSequencia('codigo_categorias', maiorCodigoFinalCategorias)
    atualizarOuCriarSequencia('codigo_subcategorias', maiorCodigoFinalSubcategorias)

    console.log(
      '[0094] Migração 0094 concluída com sucesso!' +
        ' Grupos: inseridos=' +
        gruposInseridos +
        ', reaproveitados=' +
        gruposReaproveitados +
        ', maiorCodigo=' +
        maiorCodigoFinalGrupos +
        ' | Categorias: inseridas=' +
        categoriasInseridas +
        ', reaproveitadas=' +
        categoriasReaproveitadas +
        ', maiorCodigo=' +
        maiorCodigoFinalCategorias +
        ' | Subcategorias: inseridas=' +
        subcategoriasInseridas +
        ', reaproveitadas=' +
        subcategoriasReaproveitadas +
        ', maiorCodigo=' +
        maiorCodigoFinalSubcategorias,
    )
  },
  (app) => {
    // Reversão incremental não necessária em produção
  },
)
