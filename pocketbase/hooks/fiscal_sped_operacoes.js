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
      exigirEmpresaDoUsuario(authRecord, arquivoRec.getString('empresa_id'))

      const modoArquivo = arquivoRec.getString('modo')
      if (modoArquivo === 'Teste') {
        return c.json(400, {
          sucesso: false,
          message: 'Arquivo gerado em modo Teste não pode ser marcado como entregue à SEFAZ.',
        })
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

/**
 * 2) POST /backend/v1/sped/ajustes/salvar
 * Cria ou edita um ajuste manual da apuração em sped_ajustes_apuracao.
 * Bloqueado se o período já tiver arquivo Oficial com status "Entregue".
 */
routerAdd(
  'POST',
  '/backend/v1/sped/ajustes/salvar',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    // Validação de Administrador
    let usuarioErp = null
    try {
      const usuarios = $app.findRecordsByFilter(
        'usuarios',
        `auth_user_id = '${authRecord.id}' && ativo = true`,
        '',
        1,
        0,
      )
      if (usuarios.length === 0) {
        return c.json(403, {
          sucesso: false,
          message: 'Usuário ERP não vinculado ao login ou inativo.',
        })
      }
      usuarioErp = usuarios[0]
      const perfilId = usuarioErp.getString('perfil_id')
      if (!perfilId) {
        return c.json(403, { sucesso: false, message: 'Usuário sem perfil de acesso vinculado.' })
      }
      const perfil = $app.findRecordById('perfis_acesso', perfilId)
      if (!perfil || !perfil.getBool('administrador')) {
        return c.json(403, {
          sucesso: false,
          message: 'Acesso restrito: apenas Administrador pode salvar ajustes da apuração.',
        })
      }
    } catch (errAuth) {
      return c.json(403, {
        sucesso: false,
        message: 'Falha ao validar perfil: ' + (errAuth.message || String(errAuth)),
      })
    }

    const body = c.requestInfo().body || {}
    const ajusteId = (body.id || '').trim()
    const empresaId = (body.empresa_id || '').trim()
    const periodo = (body.periodo || '').trim()
    const codigoAjuste = (body.codigo_ajuste || '').trim().toUpperCase()
    const descricao = (body.descricao || '').trim()
    const valor =
      typeof body.valor === 'number'
        ? body.valor
        : parseFloat(String(body.valor || 0).replace(',', '.'))

    if (!empresaId) return c.json(400, { sucesso: false, message: 'empresa_id é obrigatório.' })
    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
      return c.json(400, { sucesso: false, message: 'periodo deve estar no formato AAAA-MM.' })
    }
    if (!descricao) return c.json(400, { sucesso: false, message: 'descricao é obrigatória.' })
    if (isNaN(valor) || valor <= 0) {
      return c.json(400, { sucesso: false, message: 'valor do ajuste deve ser maior que zero.' })
    }

    // Carrega empresa para pegar a UF
    let empresaRec
    try {
      empresaRec = $app.findRecordById('empresas', empresaId)
    } catch (_) {
      return c.json(404, { sucesso: false, message: 'Empresa não encontrada.' })
    }

    const ufEmpresa = (empresaRec.getString('uf') || 'ES').trim().toUpperCase()

    // Validação de código de ajuste:
    // - 8 caracteres
    // - 2 primeiras letras = UF da empresa
    // - 3º caractere = '0' (ICMS próprio)
    // - 4º caractere de 0 a 5
    if (codigoAjuste.length !== 8) {
      return c.json(400, {
        sucesso: false,
        message: 'O código de ajuste deve conter exatamente 8 caracteres (da tabela 5.1.1).',
      })
    }
    if (codigoAjuste.substring(0, 2) !== ufEmpresa) {
      return c.json(400, {
        sucesso: false,
        message: `As duas primeiras letras do código de ajuste devem ser a UF da empresa (${ufEmpresa}). Código informado: "${codigoAjuste.substring(0, 2)}".`,
      })
    }
    if (codigoAjuste.charAt(2) !== '0') {
      return c.json(400, {
        sucesso: false,
        message: `O 3º caractere do código de ajuste deve ser "0" (ICMS próprio). Código informado: "${codigoAjuste.charAt(2)}".`,
      })
    }
    const quartoChar = codigoAjuste.charAt(3)
    if (['0', '1', '2', '3', '4', '5'].indexOf(quartoChar) === -1) {
      return c.json(400, {
        sucesso: false,
        message: `O 4º caractere do código de ajuste deve ser de 0 a 5 (tipo de ajuste). Código informado: "${quartoChar}".`,
      })
    }

    // Verifica se já existe arquivo Entregue no período
    try {
      const entregues = $app.findRecordsByFilter(
        'sped_arquivos',
        `empresa_id = '${empresaId}' && periodo = '${periodo}' && status = 'Entregue'`,
        '',
        1,
        0,
      )
      if (entregues && entregues.length > 0) {
        return c.json(400, {
          sucesso: false,
          message: `O período ${periodo} já possui arquivo oficial Entregue à SEFAZ. Os ajustes da apuração não podem ser alterados sem retificação.`,
        })
      }
    } catch (errCheck) {
      return c.json(500, {
        sucesso: false,
        message: 'Erro ao validar status do período: ' + errCheck.message,
      })
    }

    try {
      let reg
      if (ajusteId) {
        reg = $app.findRecordById('sped_ajustes_apuracao', ajusteId)
        if (!reg) return c.json(404, { sucesso: false, message: 'Ajuste não encontrado.' })
      } else {
        const col = $app.findCollectionByNameOrId('sped_ajustes_apuracao')
        reg = new Record(col)
        reg.set('empresa_id', empresaId)
        reg.set('periodo', periodo)
        reg.set('criado_por', usuarioErp.id)
      }

      reg.set('codigo_ajuste', codigoAjuste)
      reg.set('descricao', descricao)
      reg.set('valor', Math.round(valor * 100) / 100)
      $app.save(reg)

      return c.json(200, {
        sucesso: true,
        message: 'Ajuste da apuração salvo com sucesso.',
        ajuste: {
          id: reg.id,
          empresa_id: reg.getString('empresa_id'),
          periodo: reg.getString('periodo'),
          codigo_ajuste: reg.getString('codigo_ajuste'),
          descricao: reg.getString('descricao'),
          valor: reg.getFloat('valor'),
        },
      })
    } catch (errSalvar) {
      return c.json(500, {
        sucesso: false,
        message: 'Erro ao salvar ajuste: ' + (errSalvar.message || String(errSalvar)),
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * 3) POST /backend/v1/sped/ajustes/excluir
 * Exclui um ajuste manual de apuração.
 * Bloqueado se o período já tiver arquivo Oficial com status "Entregue".
 */
routerAdd(
  'POST',
  '/backend/v1/sped/ajustes/excluir',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    // Validação de Administrador
    try {
      const usuarios = $app.findRecordsByFilter(
        'usuarios',
        `auth_user_id = '${authRecord.id}' && ativo = true`,
        '',
        1,
        0,
      )
      if (usuarios.length === 0) {
        return c.json(403, {
          sucesso: false,
          message: 'Usuário ERP não vinculado ao login ou inativo.',
        })
      }
      const usuarioErp = usuarios[0]
      const perfilId = usuarioErp.getString('perfil_id')
      if (!perfilId) {
        return c.json(403, { sucesso: false, message: 'Usuário sem perfil de acesso vinculado.' })
      }
      const perfil = $app.findRecordById('perfis_acesso', perfilId)
      if (!perfil || !perfil.getBool('administrador')) {
        return c.json(403, {
          sucesso: false,
          message: 'Acesso restrito: apenas Administrador pode excluir ajustes da apuração.',
        })
      }
    } catch (errAuth) {
      return c.json(403, {
        sucesso: false,
        message: 'Falha ao validar perfil: ' + (errAuth.message || String(errAuth)),
      })
    }

    const body = c.requestInfo().body || {}
    const ajusteId = (body.id || body.ajuste_id || '').trim()

    if (!ajusteId) return c.json(400, { sucesso: false, message: 'id do ajuste é obrigatório.' })

    let reg
    try {
      reg = $app.findRecordById('sped_ajustes_apuracao', ajusteId)
      if (!reg) return c.json(404, { sucesso: false, message: 'Ajuste não encontrado.' })
    } catch (_) {
      return c.json(404, { sucesso: false, message: 'Ajuste não encontrado.' })
    }

    const empresaId = reg.getString('empresa_id')
    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }
    const periodo = reg.getString('periodo')

    // Verifica se já existe arquivo Entregue no período
    try {
      const entregues = $app.findRecordsByFilter(
        'sped_arquivos',
        `empresa_id = '${empresaId}' && periodo = '${periodo}' && status = 'Entregue'`,
        '',
        1,
        0,
      )
      if (entregues && entregues.length > 0) {
        return c.json(400, {
          sucesso: false,
          message: `O período ${periodo} já possui arquivo oficial Entregue à SEFAZ. O ajuste não pode ser excluído.`,
        })
      }
    } catch (errCheck) {
      return c.json(500, {
        sucesso: false,
        message: 'Erro ao verificar período entregue: ' + errCheck.message,
      })
    }

    try {
      $app.delete(reg)
      return c.json(200, { sucesso: true, message: 'Ajuste excluído com sucesso.' })
    } catch (errDel) {
      return c.json(500, {
        sucesso: false,
        message: 'Erro ao excluir ajuste: ' + (errDel.message || String(errDel)),
      })
    }
  },
  $apis.requireAuth(),
)
