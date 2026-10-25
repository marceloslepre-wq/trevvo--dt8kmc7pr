// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0075: Etapa 9 Multi-tenant (Prompt 9.4)
 *
 * 1. Campo auth_user_id em usuarios_empresas e backfill automático.
 * 2. Regras de list/view/create/update/delete para coleções com empresa_id:
 *    - estoque_saldos, estoque_movimentos, lotes
 *    - pedidos_compra, pedidos_compra_itens
 *    - notas_entrada, notas_entrada_itens, notas_entrada_parcelas
 *    - contas_financeiras, contas_pagar, contas_receber, pagamentos_lotes, pagamentos_baixas,
 *      movimentacoes_financeiras, extratos_linhas
 *    - vendas, vendas_itens, vendas_pagamentos
 *    - pdv_terminais, caixa_sessoes, caixa_sessoes_movimentos
 *    - transferencias, transferencias_itens (origem OU destino)
 *    - inventarios, inventarios_itens
 *    - vales_troca
 *    - documentos_fiscais, documentos_fiscais_itens, documentos_fiscais_cartas, inutilizacoes
 *    - sped_arquivos, sped_ajustes_apuracao
 *    - config_fiscal_empresa, config_financeira_empresa, config_vendas_empresa,
 *      config_emissao_fiscal, config_sped_empresa
 *    - logs_auditoria
 */

migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const ueCol = app.findCollectionByNameOrId('usuarios_empresas')

    // 1. Campo auth_user_id em usuarios_empresas para joins rápidos nas API Rules
    if (!ueCol.fields.getByName('auth_user_id')) {
      ueCol.fields.add(
        new RelationField({
          name: 'auth_user_id',
          required: false,
          collectionId: usersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      app.save(ueCol)
    }

    // Backfill de auth_user_id em usuarios_empresas
    try {
      const ues = app.findRecordsByFilter('usuarios_empresas', '', '', 1000, 0)
      for (let i = 0; i < ues.length; i++) {
        const item = ues[i]
        const usrId = item.getString('usuario_id')
        if (usrId) {
          try {
            const uRec = app.findRecordById('usuarios', usrId)
            const aId = uRec ? uRec.getString('auth_user_id') : ''
            if (aId && item.getString('auth_user_id') !== aId) {
              item.set('auth_user_id', aId)
              app.save(item)
            }
          } catch (_) {}
        }
      }
    } catch (errBfUe) {
      console.warn('[0075] Erro no backfill de usuarios_empresas:', errBfUe)
    }

    // Regra base por empresa_id:
    // Usuário de outro assinante não lê nada.
    // Admin ou Master do assinante lê todas as empresas do assinante.
    // Usuário comum lê apenas empresas ativas onde possui vínculo ativo em usuarios_empresas.
    const condAcessoEmpresa = (campoEmpresa = 'empresa_id') =>
      `@request.auth.id != '' && ${campoEmpresa}.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= ${campoEmpresa} && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))`

    const condAcessoPai = (campoPaiEmpresa) =>
      `@request.auth.id != '' && ${campoPaiEmpresa}.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= ${campoPaiEmpresa} && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))`

    const condTransfOrigemDestino = `@request.auth.id != '' && ((empresa_origem_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= empresa_origem_id && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))) || (empresa_destino_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= empresa_destino_id && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))))`

    const condTransfItens = `@request.auth.id != '' && ((transferencia_id.empresa_origem_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= transferencia_id.empresa_origem_id && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))) || (transferencia_id.empresa_destino_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= transferencia_id.empresa_destino_id && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))))`

    // 2. Aplicar regras nas coleções de leitura e movimentação direta por empresa_id
    const colRegraDireta = [
      'estoque_saldos',
      'estoque_movimentos',
      'lotes',
      'pagamentos_lotes',
      'pagamentos_baixas',
      'movimentacoes_financeiras',
      'extratos_linhas',
      'caixa_sessoes',
      'caixa_sessoes_movimentos',
      'documentos_fiscais',
      'inutilizacoes',
      'sped_arquivos',
      'sped_ajustes_apuracao',
    ]

    for (const name of colRegraDireta) {
      try {
        const c = app.findCollectionByNameOrId(name)
        c.listRule = condAcessoEmpresa('empresa_id')
        c.viewRule = condAcessoEmpresa('empresa_id')
        app.save(c)
      } catch (err) {
        console.error(`[0075] Erro ao aplicar regra em ${name}:`, err)
        throw err
      }
    }

    // 3. Coleções filhas (join PocketBase pelo pai)
    const filhasPai = [
      { col: 'pedidos_compra_itens', paiCampo: 'pedido_id.empresa_id' },
      { col: 'notas_entrada_itens', paiCampo: 'nota_id.empresa_id' },
      { col: 'notas_entrada_parcelas', paiCampo: 'nota_id.empresa_id' },
      { col: 'vendas_itens', paiCampo: 'venda_id.empresa_id' },
      { col: 'vendas_pagamentos', paiCampo: 'venda_id.empresa_id' },
      { col: 'documentos_fiscais_itens', paiCampo: 'documento_id.empresa_id' },
      { col: 'documentos_fiscais_cartas', paiCampo: 'documento_id.empresa_id' },
      { col: 'inventarios_itens', paiCampo: 'inventario_id.empresa_id' },
    ]

    for (const f of filhasPai) {
      try {
        const c = app.findCollectionByNameOrId(f.col)
        c.listRule = condAcessoPai(f.paiCampo)
        c.viewRule = condAcessoPai(f.paiCampo)
        if (c.createRule) c.createRule = condAcessoPai(f.paiCampo)
        if (c.updateRule) c.updateRule = condAcessoPai(f.paiCampo)
        if (c.deleteRule) c.deleteRule = condAcessoPai(f.paiCampo)
        app.save(c)
      } catch (err) {
        console.error(`[0075] Erro na coleção filha ${f.col}:`, err)
        throw err
      }
    }

    // 4. Transferências e itens de transferência (origem OU destino)
    try {
      const transfCol = app.findCollectionByNameOrId('transferencias')
      transfCol.listRule = condTransfOrigemDestino
      transfCol.viewRule = condTransfOrigemDestino
      transfCol.createRule = condAcessoEmpresa('empresa_origem_id')
      transfCol.updateRule = condTransfOrigemDestino
      transfCol.deleteRule = condAcessoEmpresa('empresa_origem_id')
      app.save(transfCol)
    } catch (eTrf) {
      console.error('[0075] Erro em transferencias:', eTrf)
      throw eTrf
    }

    try {
      const transfItensCol = app.findCollectionByNameOrId('transferencias_itens')
      transfItensCol.listRule = condTransfItens
      transfItensCol.viewRule = condTransfItens
      transfItensCol.createRule = condTransfItens
      transfItensCol.updateRule = condTransfItens
      transfItensCol.deleteRule = condTransfItens
      app.save(transfItensCol)
    } catch (eTrfIt) {
      console.error('[0075] Erro em transferencias_itens:', eTrfIt)
      throw eTrfIt
    }

    // 5. Inventários
    try {
      const invCol = app.findCollectionByNameOrId('inventarios')
      invCol.listRule = condAcessoEmpresa('empresa_id')
      invCol.viewRule = condAcessoEmpresa('empresa_id')
      invCol.createRule = condAcessoEmpresa('empresa_id')
      invCol.updateRule = condAcessoEmpresa('empresa_id')
      invCol.deleteRule = condAcessoEmpresa('empresa_id')
      app.save(invCol)
    } catch (eInv) {
      console.error('[0075] Erro em inventarios:', eInv)
      throw eInv
    }

    // 6. Pedidos de compra e Notas de entrada
    try {
      const pcCol = app.findCollectionByNameOrId('pedidos_compra')
      pcCol.listRule = condAcessoEmpresa('empresa_id')
      pcCol.viewRule = condAcessoEmpresa('empresa_id')
      pcCol.createRule = condAcessoEmpresa('empresa_id')
      pcCol.updateRule = condAcessoEmpresa('empresa_id')
      pcCol.deleteRule = condAcessoEmpresa('empresa_id')
      app.save(pcCol)
    } catch (ePc) {
      console.error('[0075] Erro em pedidos_compra:', ePc)
      throw ePc
    }

    try {
      const neCol = app.findCollectionByNameOrId('notas_entrada')
      neCol.listRule = condAcessoEmpresa('empresa_id')
      neCol.viewRule = condAcessoEmpresa('empresa_id')
      neCol.createRule = condAcessoEmpresa('empresa_id')
      neCol.updateRule = `${condAcessoEmpresa('empresa_id')} && status != 'Lançada'`
      neCol.deleteRule = `${condAcessoEmpresa('empresa_id')} && status != 'Lançada'`
      app.save(neCol)
    } catch (eNe) {
      console.error('[0075] Erro em notas_entrada:', eNe)
      throw eNe
    }

    // 7. Financeiro: contas_financeiras, contas_pagar, contas_receber
    try {
      const cfCol = app.findCollectionByNameOrId('contas_financeiras')
      cfCol.listRule = condAcessoEmpresa('empresa_id')
      cfCol.viewRule = condAcessoEmpresa('empresa_id')
      cfCol.createRule = condAcessoEmpresa('empresa_id')
      cfCol.updateRule = condAcessoEmpresa('empresa_id')
      cfCol.deleteRule = condAcessoEmpresa('empresa_id')
      app.save(cfCol)
    } catch (eCf) {
      console.error('[0075] Erro em contas_financeiras:', eCf)
      throw eCf
    }

    try {
      const cpCol = app.findCollectionByNameOrId('contas_pagar')
      cpCol.listRule = condAcessoEmpresa('empresa_id')
      cpCol.viewRule = condAcessoEmpresa('empresa_id')
      cpCol.createRule = condAcessoEmpresa('empresa_id')
      cpCol.updateRule = condAcessoEmpresa('empresa_id')
      app.save(cpCol)
    } catch (eCp) {
      console.error('[0075] Erro em contas_pagar:', eCp)
      throw eCp
    }

    try {
      const crCol = app.findCollectionByNameOrId('contas_receber')
      crCol.listRule = condAcessoEmpresa('empresa_id')
      crCol.viewRule = condAcessoEmpresa('empresa_id')
      crCol.createRule = condAcessoEmpresa('empresa_id')
      crCol.updateRule = condAcessoEmpresa('empresa_id')
      app.save(crCol)
    } catch (eCr) {
      console.error('[0075] Erro em contas_receber:', eCr)
      throw eCr
    }

    // 8. Vendas, PDV Terminais e Vales Troca
    try {
      const vCol = app.findCollectionByNameOrId('vendas')
      vCol.listRule = condAcessoEmpresa('empresa_id')
      vCol.viewRule = condAcessoEmpresa('empresa_id')
      vCol.createRule = condAcessoEmpresa('empresa_id')
      vCol.updateRule = `${condAcessoEmpresa('empresa_id')} && @request.body.status:isset = false && @request.body.documento_fiscal_status:isset = false && @request.body.custo_total:isset = false && @request.body.data_finalizacao:isset = false && @request.body.caixa_sessao_id:isset = false`
      vCol.deleteRule = condAcessoEmpresa('empresa_id')
      app.save(vCol)
    } catch (eVnd) {
      console.error('[0075] Erro em vendas:', eVnd)
      throw eVnd
    }

    try {
      const ptCol = app.findCollectionByNameOrId('pdv_terminais')
      ptCol.listRule = condAcessoEmpresa('empresa_id')
      ptCol.viewRule = condAcessoEmpresa('empresa_id')
      ptCol.createRule = condAcessoEmpresa('empresa_id')
      ptCol.updateRule = condAcessoEmpresa('empresa_id')
      ptCol.deleteRule = condAcessoEmpresa('empresa_id')
      app.save(ptCol)
    } catch (ePt) {
      console.error('[0075] Erro em pdv_terminais:', ePt)
      throw ePt
    }

    try {
      const vtCol = app.findCollectionByNameOrId('vales_troca')
      vtCol.listRule = condAcessoEmpresa('empresa_id')
      vtCol.viewRule = condAcessoEmpresa('empresa_id')
      vtCol.createRule = condAcessoEmpresa('empresa_id')
      vtCol.updateRule = condAcessoEmpresa('empresa_id')
      vtCol.deleteRule = condAcessoEmpresa('empresa_id')
      app.save(vtCol)
    } catch (eVt) {
      console.error('[0075] Erro em vales_troca:', eVt)
      throw eVt
    }

    // 9. Configurações por Empresa
    const configsCol = [
      { name: 'config_fiscal_empresa', deleteAllowed: true },
      { name: 'config_financeira_empresa', deleteAllowed: true },
      { name: 'config_vendas_empresa', deleteAllowed: true },
      { name: 'config_emissao_fiscal', deleteAllowed: false },
      { name: 'config_sped_empresa', deleteAllowed: false },
    ]

    for (const cfg of configsCol) {
      try {
        const c = app.findCollectionByNameOrId(cfg.name)
        c.listRule = condAcessoEmpresa('empresa_id')
        c.viewRule = condAcessoEmpresa('empresa_id')
        c.createRule = condAcessoEmpresa('empresa_id')
        c.updateRule = condAcessoEmpresa('empresa_id')
        if (cfg.deleteAllowed) {
          c.deleteRule = condAcessoEmpresa('empresa_id')
        }
        app.save(c)
      } catch (errCfg) {
        console.error(`[0075] Erro em ${cfg.name}:`, errCfg)
        throw errCfg
      }
    }

    // 10. logs_auditoria
    try {
      const laCol = app.findCollectionByNameOrId('logs_auditoria')
      laCol.listRule = `@request.auth.id != '' && (empresa_id = '' || (${condAcessoEmpresa('empresa_id')}))`
      laCol.viewRule = `@request.auth.id != '' && (empresa_id = '' || (${condAcessoEmpresa('empresa_id')}))`
      laCol.createRule = `@request.auth.id != '' && (empresa_id = '' || (${condAcessoEmpresa('empresa_id')}))`
      app.save(laCol)
    } catch (eLa) {
      console.error('[0075] Erro em logs_auditoria:', eLa)
      throw eLa
    }
  },
  (app) => {
    // Reversão incremental
  },
)
