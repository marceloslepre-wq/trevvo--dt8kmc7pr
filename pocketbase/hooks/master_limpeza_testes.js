/// <reference path="../pb_data/types.d.ts" />
/**
 * Limpeza dos dados de teste do assinante do usuário Master (uso único, antes da carga real).
 *
 * POST /backend/v1/master/limpeza-testes-v2
 *   body { acao: 'previa' }                         -> contagem do que será apagado/ajustado
 *   body { acao: 'backup' }                         -> JSON com todos os registros que serão apagados
 *   body { acao: 'executar', confirmacao: 'LIMPAR' } -> apaga tudo numa transação
 *
 * Mantém configurações e tabelas reais (empresas, fiscal/Focus, NCM/CEST/CFOP, perfis HH,
 * classificação, formas/condições de pagamento, plano de contas, contas financeiras,
 * terminais, perfis de acesso, integrações, logs de auditoria).
 * Apaga movimento, produtos, fornecedores, clientes (menos o "Consumidor Final"),
 * o perfil tributário "Teste Normal 00", os usuários do assinante (menos o Master)
 * e zera os contadores de numeração dos cadastros/movimentos apagados.
 *
 * Exclusões por SQL direto (ignora os hooks de "nunca apagar", de propósito).
 * Helpers dentro do callback, sem require, sem spread.
 */
routerAdd(
  'POST',
  '/backend/v1/master/limpeza-testes-v2',
  (c) => {
    function exigirMaster(auth) {
      if (!auth || !auth.id) {
        throw new ForbiddenError('Acesso restrito ao usuário Master.')
      }
      let userRec = null
      try {
        userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      } catch (_) {
        throw new ForbiddenError('Usuário não localizado.')
      }
      if (!userRec || userRec.getString('tipo') !== 'master') {
        throw new ForbiddenError(
          'Acesso negado. Apenas o usuário Master pode limpar os dados de teste.',
        )
      }
      return userRec
    }

    function assinanteDoMaster(auth) {
      let recs = []
      try {
        recs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + auth.id + "'",
          '-created',
          1,
          0,
        )
      } catch (_) {}
      if ((!recs || recs.length === 0) && auth.getString('email')) {
        try {
          recs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + auth.getString('email') + "'",
            '-created',
            1,
            0,
          )
        } catch (_) {}
      }
      if (!recs || recs.length === 0 || !recs[0].getString('assinante_id')) {
        throw new BadRequestError('Não encontrei o assinante do usuário Master.')
      }
      return $app.findRecordById('assinantes', recs[0].getString('assinante_id'))
    }

    function contar(app, tabela, where) {
      const m = new DynamicModel({ total: 0 })
      app
        .db()
        .newQuery('SELECT COUNT(*) AS total FROM ' + tabela + ' WHERE ' + where)
        .one(m)
      return m.total || 0
    }

    function listarIds(app, tabela, where) {
      const rows = arrayOf(new DynamicModel({ id: '' }))
      app
        .db()
        .newQuery('SELECT id FROM ' + tabela + ' WHERE ' + where + ' LIMIT 20000')
        .all(rows)
      const ids = []
      for (let i = 0; i < rows.length; i++) ids.push(rows[i].id)
      return ids
    }

    function montarPlano(ass, authId, emailMaster) {
      const A = "'" + ass.id + "'"
      const empresas = $app.findRecordsByFilter('empresas', 'assinante_id = ' + A, 'codigo', 500, 0)
      const empIds = []
      for (let i = 0; i < empresas.length; i++) empIds.push("'" + empresas[i].id + "'")
      const E = empIds.length > 0 ? empIds.join(',') : "''"

      // Cliente que fica: "Consumidor Final" de menor código
      let consumidor = null
      try {
        const cons = $app.findRecordsByFilter(
          'clientes',
          'assinante_id = ' + A + " && nome_razao_social ~ 'consumidor final'",
          'codigo',
          1,
          0,
        )
        if (cons && cons.length > 0) consumidor = cons[0]
      } catch (_) {}
      const consId = consumidor ? consumidor.id : ''

      // Nunca apaga o Master: protege pelo auth_user_id e pelo e-mail
      const naoMaster =
        'assinante_id = ' +
        A +
        " AND (auth_user_id IS NULL OR auth_user_id = '' OR auth_user_id != '" +
        authId +
        "')" +
        " AND LOWER(COALESCE(email, '')) != '" +
        emailMaster +
        "'"
      const perfilTeste = 'assinante_id = ' + A + " AND LOWER(nome) LIKE 'teste normal%'"

      // Ordem: filhos antes dos pais. [grupo, tabela, where]
      const apagar = [
        [
          'Fiscal',
          'documentos_fiscais_itens',
          'documento_id IN (SELECT id FROM documentos_fiscais WHERE empresa_id IN (' + E + '))',
        ],
        [
          'Fiscal',
          'documentos_fiscais_cartas',
          'documento_id IN (SELECT id FROM documentos_fiscais WHERE empresa_id IN (' + E + '))',
        ],
        ['Fiscal', 'documentos_fiscais', 'empresa_id IN (' + E + ')'],
        ['Fiscal', 'inutilizacoes', 'empresa_id IN (' + E + ')'],
        ['SPED', 'sped_ajustes_apuracao', 'empresa_id IN (' + E + ')'],
        ['SPED', 'sped_arquivos', 'empresa_id IN (' + E + ')'],
        [
          'Vendas',
          'vendas_pagamentos',
          'venda_id IN (SELECT id FROM vendas WHERE empresa_id IN (' + E + '))',
        ],
        [
          'Vendas',
          'vendas_itens',
          'venda_id IN (SELECT id FROM vendas WHERE empresa_id IN (' + E + '))',
        ],
        ['Vendas', 'vales_troca', 'empresa_id IN (' + E + ')'],
        ['Vendas', 'vendas', 'empresa_id IN (' + E + ')'],
        [
          'Caixa',
          'caixa_sessoes_movimentos',
          'caixa_sessao_id IN (SELECT id FROM caixa_sessoes WHERE empresa_id IN (' +
            E +
            ')) OR empresa_id IN (' +
            E +
            ')',
        ],
        ['Caixa', 'caixa_sessoes', 'empresa_id IN (' + E + ')'],
        ['Financeiro', 'extratos_linhas', 'empresa_id IN (' + E + ')'],
        ['Financeiro', 'pagamentos_baixas', 'empresa_id IN (' + E + ')'],
        ['Financeiro', 'movimentacoes_financeiras', 'empresa_id IN (' + E + ')'],
        ['Financeiro', 'contas_receber', 'empresa_id IN (' + E + ')'],
        ['Financeiro', 'contas_pagar', 'empresa_id IN (' + E + ')'],
        ['Financeiro', 'pagamentos_lotes', 'empresa_id IN (' + E + ')'],
        [
          'Compras',
          'notas_entrada_parcelas',
          'nota_id IN (SELECT id FROM notas_entrada WHERE empresa_id IN (' + E + '))',
        ],
        [
          'Compras',
          'notas_entrada_itens',
          'nota_id IN (SELECT id FROM notas_entrada WHERE empresa_id IN (' + E + '))',
        ],
        ['Compras', 'notas_entrada', 'empresa_id IN (' + E + ')'],
        [
          'Compras',
          'pedidos_compra_itens',
          'pedido_id IN (SELECT id FROM pedidos_compra WHERE empresa_id IN (' + E + '))',
        ],
        ['Compras', 'pedidos_compra', 'empresa_id IN (' + E + ')'],
        [
          'Estoque',
          'inventarios_itens',
          'inventario_id IN (SELECT id FROM inventarios WHERE empresa_id IN (' + E + '))',
        ],
        ['Estoque', 'inventarios', 'empresa_id IN (' + E + ')'],
        [
          'Estoque',
          'transferencias_itens',
          'transferencia_id IN (SELECT id FROM transferencias WHERE empresa_origem_id IN (' +
            E +
            ') OR empresa_destino_id IN (' +
            E +
            '))',
        ],
        [
          'Estoque',
          'transferencias',
          'empresa_origem_id IN (' + E + ') OR empresa_destino_id IN (' + E + ')',
        ],
        ['Estoque', 'lotes', 'empresa_id IN (' + E + ')'],
        ['Estoque', 'estoque_movimentos', 'empresa_id IN (' + E + ')'],
        ['Estoque', 'estoque_saldos', 'empresa_id IN (' + E + ')'],
        [
          'Integrações',
          'mercadolivre_notificacoes',
          'assinante_id = ' + A + ' OR empresa_id IN (' + E + ')',
        ],
        [
          'Cadastros',
          'produtos_kit_itens',
          'produto_kit_id IN (SELECT id FROM produtos WHERE assinante_id = ' +
            A +
            ') OR produto_item_id IN (SELECT id FROM produtos WHERE assinante_id = ' +
            A +
            ')',
        ],
        [
          'Cadastros',
          'produtos_fornecedores',
          'produto_id IN (SELECT id FROM produtos WHERE assinante_id = ' + A + ')',
        ],
        [
          'Cadastros',
          'produtos_conversoes_unidade',
          'produto_id IN (SELECT id FROM produtos WHERE assinante_id = ' + A + ')',
        ],
        [
          'Cadastros',
          'produtos_historico',
          'produto_id IN (SELECT id FROM produtos WHERE assinante_id = ' + A + ')',
        ],
        ['Cadastros', 'produtos', 'assinante_id = ' + A],
        ['Cadastros', 'fornecedores', 'assinante_id = ' + A],
        [
          'Cadastros',
          'clientes',
          'assinante_id = ' + A + (consId ? " AND id != '" + consId + "'" : ''),
        ],
        [
          'Fiscal',
          'perfis_tributarios_regras',
          'perfil_id IN (SELECT id FROM perfis_tributarios WHERE ' + perfilTeste + ')',
        ],
        ['Fiscal', 'perfis_tributarios', perfilTeste],
        // users antes de usuarios (o filtro de users lê usuarios)
        [
          'Usuários',
          'users',
          "tipo != 'master' AND id != '" +
            authId +
            "' AND id IN (SELECT auth_user_id FROM usuarios WHERE " +
            naoMaster +
            ')',
        ],
        [
          'Usuários',
          'usuarios_empresas',
          'usuario_id IN (SELECT id FROM usuarios WHERE ' + naoMaster + ')',
        ],
        ['Usuários', 'usuarios', naoMaster],
        [
          'Numeração',
          'sequencias',
          'assinante_id = ' +
            A +
            " AND tipo IN ('vendas','pedidos_compra','transferencias','inventarios','codigo_produtos','codigo_clientes','codigo_fornecedores')",
        ],
      ]

      const atualizar = [
        [
          'Financeiro',
          'contas_financeiras',
          'saldo_atual = saldo_inicial',
          'empresa_id IN (' + E + ')',
          'Saldo atual volta ao saldo inicial',
        ],
        [
          'Vendas',
          'config_vendas_empresa',
          "cliente_padrao_id = '" + consId + "'",
          'empresa_id IN (' + E + ')',
          'Cliente padrão = Consumidor Final',
        ],
      ]

      return {
        empresas: empresas,
        consumidor: consumidor,
        apagar: apagar,
        atualizar: atualizar,
        naoMaster: naoMaster,
      }
    }

    const auth = c.auth || c.get('authRecord')

    try {
      exigirMaster(auth)
      const ass = assinanteDoMaster(auth)

      let body = {}
      try {
        body = c.requestInfo().body || {}
      } catch (_) {}
      const acao = (body.acao || 'previa').toString()

      const emailMaster = (auth.getString('email') || '').toLowerCase().replace(/'/g, "''")
      const plano = montarPlano(ass, auth.id, emailMaster)

      if (acao === 'previa') {
        const itens = []
        const erros = []
        for (let i = 0; i < plano.apagar.length; i++) {
          const p = plano.apagar[i]
          try {
            if (!$app.hasTable(p[1])) continue
            itens.push({
              grupo: p[0],
              tabela: p[1],
              registros: contar($app, p[1], p[2]),
              acao: 'apagar',
            })
          } catch (e) {
            erros.push({ tabela: p[1], erro: (e && e.message) || String(e) })
          }
        }
        for (let j = 0; j < plano.atualizar.length; j++) {
          const u = plano.atualizar[j]
          try {
            if (!$app.hasTable(u[1])) continue
            itens.push({
              grupo: u[0],
              tabela: u[1],
              registros: contar($app, u[1], u[3]),
              acao: 'ajustar',
              detalhe: u[4],
            })
          } catch (e) {
            erros.push({ tabela: u[1], erro: (e && e.message) || String(e) })
          }
        }

        const usuariosRemovidos = []
        try {
          const us = $app.findRecordsByFilter(
            'usuarios',
            "assinante_id = '" + ass.id + "' && auth_user_id != '" + auth.id + "'",
            'nome',
            500,
            0,
          )
          for (let k = 0; k < us.length; k++) {
            if (
              (us[k].getString('email') || '').toLowerCase() ===
              (auth.getString('email') || '').toLowerCase()
            )
              continue
            usuariosRemovidos.push({
              nome: us[k].getString('nome'),
              email: us[k].getString('email'),
            })
          }
        } catch (_) {}

        const empresas = []
        for (let k = 0; k < plano.empresas.length; k++) {
          empresas.push({
            id: plano.empresas[k].id,
            nome:
              plano.empresas[k].getString('nome_fantasia') ||
              plano.empresas[k].getString('razao_social'),
          })
        }

        return c.json(200, {
          sucesso: true,
          versao_hook: 'limpeza-v2',
          assinante: { id: ass.id, nome: ass.getString('nome') },
          empresas: empresas,
          cliente_mantido: plano.consumidor
            ? { id: plano.consumidor.id, nome: plano.consumidor.getString('nome_razao_social') }
            : null,
          usuarios_removidos: usuariosRemovidos,
          itens: itens,
          erros: erros,
        })
      }

      if (acao === 'backup') {
        const tabelas = {}
        for (let i = 0; i < plano.apagar.length; i++) {
          const p = plano.apagar[i]
          if (!$app.hasTable(p[1])) continue
          const ids = listarIds($app, p[1], p[2])
          if (ids.length === 0) continue
          let recs = []
          try {
            recs = $app.findRecordsByIds(p[1], ids)
          } catch (e) {
            tabelas[p[1]] = { erro: (e && e.message) || String(e), ids: ids }
            continue
          }
          tabelas[p[1]] = recs
        }
        return c.json(200, {
          sucesso: true,
          gerado_em: new Date().toISOString(),
          assinante: { id: ass.id, nome: ass.getString('nome') },
          tabelas: tabelas,
        })
      }

      if (acao === 'executar') {
        if ((body.confirmacao || '').toString().trim().toUpperCase() !== 'LIMPAR') {
          return c.json(400, {
            sucesso: false,
            message: 'Para executar, digite LIMPAR no campo de confirmação.',
          })
        }

        const resultado = []
        $app.runInTransaction((tx) => {
          for (let i = 0; i < plano.apagar.length; i++) {
            const p = plano.apagar[i]
            if (!tx.hasTable(p[1])) continue
            const antes = contar(tx, p[1], p[2])
            if (antes > 0) {
              tx.db()
                .newQuery('DELETE FROM ' + p[1] + ' WHERE ' + p[2])
                .execute()
            }
            resultado.push({ tabela: p[1], apagados: antes })
          }
          for (let j = 0; j < plano.atualizar.length; j++) {
            const u = plano.atualizar[j]
            if (!tx.hasTable(u[1])) continue
            tx.db()
              .newQuery('UPDATE ' + u[1] + ' SET ' + u[2] + ' WHERE ' + u[3])
              .execute()
            resultado.push({ tabela: u[1], ajustado: u[4] })
          }
          // Restos de autenticação dos usuários apagados
          const sistema = ['_authOrigins', '_externalAuths', '_mfas', '_otps']
          for (let k = 0; k < sistema.length; k++) {
            try {
              if (!tx.hasTable(sistema[k])) continue
              tx.db()
                .newQuery(
                  'DELETE FROM ' +
                    sistema[k] +
                    " WHERE collectionRef = '_pb_users_auth_' AND recordRef NOT IN (SELECT id FROM users)",
                )
                .execute()
            } catch (_) {}
          }
        })

        try {
          const laCol = $app.findCollectionByNameOrId('logs_auditoria')
          const logRec = new Record(laCol)
          logRec.set('usuario_id', auth.id)
          logRec.set(
            'usuario_nome',
            (auth.getString('name') || auth.getString('email')) + ' (modo master)',
          )
          logRec.set('tabela', 'limpeza_dados_teste')
          logRec.set('registro_id', ass.id)
          logRec.set('acao', 'exclusao')
          logRec.set('valores_depois', {
            evento: 'Limpeza dos dados de teste',
            resultado: resultado,
          })
          $app.save(logRec)
        } catch (errLog) {
          console.warn('[master/limpeza-testes] Não gravou o log de auditoria: ' + errLog)
        }

        return c.json(200, {
          sucesso: true,
          message: 'Limpeza concluída. Os dados de teste foram apagados.',
          resultado: resultado,
        })
      }

      return c.json(400, {
        sucesso: false,
        message: 'Ação inválida. Use previa, backup ou executar.',
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, { sucesso: false, message: err.message })
      }
      console.error('[master/limpeza-testes] ' + ((err && err.message) || err))
      return c.json(500, {
        sucesso: false,
        message: 'Erro na limpeza dos dados de teste: ' + ((err && err.message) || String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
