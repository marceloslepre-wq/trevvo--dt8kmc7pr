/// <reference path="../types.d.ts" />

/**
 * Endpoints backend do SPED Fiscal (EFD ICMS/IPI).
 *
 * 1) POST /backend/v1/sped/marcar-entregue
 *    Permite ao Administrador registrar que um arquivo SPED foi entregue à Receita Federal / SEFAZ,
 *    anotando o recibo de entrega e a data de entrega.
 *    A tabela sped_arquivos tem createRule/updateRule = null, então esta gravação
 *    é feita exclusivamente por este endpoint com privilégio de superusuário do backend ($app).
 */
routerAdd(
  'POST',
  '/backend/v1/sped/marcar-entregue',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const userId = authRecord.id

    // Verificar se o usuário autenticado é Administrador via perfis_acesso
    // Regra do projeto: perfis_acesso.administrador = true via usuários vinculado ao login; NUNCA por e-mail fixo
    try {
      const usuarios = $app.findRecordsByFilter(
        'usuarios',
        `auth_user_id = '${userId}' && ativo = true`,
        '',
        1,
        0,
      )
      if (usuarios.length === 0) {
        return c.json(403, {
          sucesso: false,
          message: 'Acesso restrito: usuário ERP não vinculado ao login.',
        })
      }

      const usuarioErp = usuarios[0]
      const perfilId = usuarioErp.getString('perfil_id')
      if (!perfilId) {
        return c.json(403, { sucesso: false, message: 'Acesso restrito: perfil não informado.' })
      }

      const perfil = $app.findRecordById('perfis_acesso', perfilId)
      if (!perfil || !perfil.getBool('administrador')) {
        return c.json(403, {
          sucesso: false,
          message:
            'Acesso restrito: apenas Administradores podem marcar arquivo SPED como entregue.',
        })
      }
    } catch (errAuth) {
      return c.json(403, {
        sucesso: false,
        message:
          'Falha ao validar privilégios de administrador: ' + (errAuth.message || String(errAuth)),
      })
    }

    const body = c.requestInfo().body || {}
    const arquivoId = (body.arquivo_id || body.id || '').trim()
    const reciboEntrega = (body.recibo_entrega || '').trim()
    const entregueEm = (body.entregue_em || '').trim() || new Date().toISOString()
    const observacoes = (body.observacoes || '').trim()

    if (!arquivoId) {
      return c.json(400, { sucesso: false, message: 'arquivo_id é obrigatório.' })
    }

    if (!reciboEntrega) {
      return c.json(400, {
        sucesso: false,
        message: 'O recibo de entrega da EFD ICMS/IPI é obrigatório.',
      })
    }

    try {
      const arquivoRec = $app.findRecordById('sped_arquivos', arquivoId)
      if (!arquivoRec) {
        return c.json(404, { sucesso: false, message: 'Registro de arquivo SPED não encontrado.' })
      }

      arquivoRec.set('status', 'Entregue')
      arquivoRec.set('recibo_entrega', reciboEntrega)
      arquivoRec.set('entregue_em', entregueEm)
      if (observacoes) {
        const obsAtual = arquivoRec.getString('observacoes')
        arquivoRec.set('observacoes', obsAtual ? `${obsAtual} | ${observacoes}` : observacoes)
      }

      $app.save(arquivoRec)

      // Registrar em logs_auditoria se a tabela existir
      try {
        if ($app.hasTable('logs_auditoria')) {
          const logsCol = $app.findCollectionByNameOrId('logs_auditoria')
          const logRec = new Record(logsCol)
          logRec.set('usuario_id', userId)
          logRec.set('empresa_id', arquivoRec.getString('empresa_id'))
          logRec.set('acao', 'SPED_MARCAR_ENTREGUE')
          logRec.set('tabela', 'sped_arquivos')
          logRec.set('registro_id', arquivoId)
          logRec.set(
            'detalhes',
            JSON.stringify({
              periodo: arquivoRec.getString('periodo'),
              recibo_entrega: reciboEntrega,
              entregue_em: entregueEm,
            }),
          )
          $app.save(logRec)
        }
      } catch (_) {}

      return c.json(200, {
        sucesso: true,
        message: 'Arquivo SPED marcado como Entregue com sucesso.',
        arquivo: {
          id: arquivoRec.id,
          empresa_id: arquivoRec.getString('empresa_id'),
          periodo: arquivoRec.getString('periodo'),
          status: 'Entregue',
          recibo_entrega: reciboEntrega,
          entregue_em: entregueEm,
        },
      })
    } catch (err) {
      return c.json(400, {
        sucesso: false,
        message: 'Erro ao marcar arquivo como entregue: ' + (err.message || String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
