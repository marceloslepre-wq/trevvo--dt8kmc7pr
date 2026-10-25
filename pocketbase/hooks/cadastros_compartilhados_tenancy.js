// @ts-check
/// <reference path="../types.d.ts" />

/**
 * HOOKS DE TENANCY PARA CADASTROS COMPARTILHADOS (Etapa 9 - Prompt 9.2)
 *
 * Todas as funções auxiliares são declaradas INLINE dentro de cada callback
 * para total conformidade com o JSVM isolado do PocketBase.
 */

// -----------------------------------------------------------------------------
// 1 e 2. Hooks onRecordCreate e onRecordUpdate nas 15 coleções
// -----------------------------------------------------------------------------
const COLS_15 = [
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

for (let i = 0; i < COLS_15.length; i++) {
  const nomeCol = COLS_15[i]

  // onRecordCreate
  onRecordCreate((e) => {
    const record = e.record
    if (!record) return e.next()

    const auth = e.httpContext ? e.httpContext.auth || e.httpContext.get('authRecord') : null

    if (auth) {
      let assinanteId = ''
      try {
        let usuarioRec = null
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
        } catch (_) {}

        if (!usuarioRec && auth.getString && auth.getString('email')) {
          try {
            const uRecs = $app.findRecordsByFilter(
              'usuarios',
              "email = '" + auth.getString('email') + "'",
              '-created',
              1,
              0,
            )
            if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
          } catch (_) {}
        }

        if (usuarioRec) {
          assinanteId = usuarioRec.getString('assinante_id')
        }
      } catch (errAss) {
        throw new BadRequestError(
          'Não foi possível identificar o assinante do usuário: ' + (errAss.message || errAss),
        )
      }

      if (!assinanteId) {
        throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
      }

      const assinanteEnviado = record.getString('assinante_id')
      if (assinanteEnviado && assinanteEnviado !== assinanteId) {
        throw new BadRequestError(
          'Operação rejeitada: assinante informado diverge do assinante do usuário autenticado.',
        )
      }

      record.set('assinante_id', assinanteId)
    } else {
      if (!record.getString('assinante_id')) {
        record.set('assinante_id', 'wqxiw7olvkup3sm')
      }
    }

    return e.next()
  }, nomeCol)

  // onRecordUpdate
  onRecordUpdate((e) => {
    const record = e.record
    if (!record) return e.next()

    const original = record.original()
    if (original) {
      const origAssinante = original.getString('assinante_id')
      if (origAssinante) {
        record.set('assinante_id', origAssinante)
      }
    }

    return e.next()
  }, nomeCol)
}

// -----------------------------------------------------------------------------
// 1b. Proteção de Tenancy para Coleções Estruturais: empresas, usuarios, perfis_acesso
// -----------------------------------------------------------------------------
const COLS_ESTRUTURAIS = ['empresas', 'usuarios', 'perfis_acesso']

for (let i = 0; i < COLS_ESTRUTURAIS.length; i++) {
  const nomeCol = COLS_ESTRUTURAIS[i]

  // onRecordCreate: preenche assinante_id se vier vazio do contexto auth
  onRecordCreate((e) => {
    const record = e.record
    if (!record) return e.next()

    const auth = e.httpContext ? e.httpContext.auth || e.httpContext.get('authRecord') : null
    if (auth) {
      let assinanteId = ''
      if (auth.getString) {
        assinanteId = auth.getString('assinante_id')
      }
      if (!assinanteId) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) assinanteId = uRecs[0].getString('assinante_id')
        } catch (_) {}
      }

      if (assinanteId) {
        const enviado = record.getString('assinante_id')
        if (enviado && enviado !== assinanteId) {
          throw new BadRequestError(
            'Operação rejeitada: assinante informado diverge do usuário autenticado.',
          )
        }
        record.set('assinante_id', assinanteId)
      }
    }

    return e.next()
  }, nomeCol)

  // onRecordUpdate: assinante_id é imutável
  onRecordUpdate((e) => {
    const record = e.record
    if (!record) return e.next()

    const original = record.original()
    if (original) {
      const origAssinante = original.getString('assinante_id')
      if (origAssinante) {
        record.set('assinante_id', origAssinante)
      }
    }

    return e.next()
  }, nomeCol)
}

// -----------------------------------------------------------------------------
// 1c. Proteção de users (_pb_users_auth_): impedir tocar em 'tipo', 'assinante_id' e 'is_admin' pelo navegador
// -----------------------------------------------------------------------------
onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const httpContext = e.httpContext
  if (httpContext) {
    const original = record.original()
    if (original) {
      const origTipo = original.getString('tipo')
      const origAssinante = original.getString('assinante_id')
      const origAdmin = original.getBool('is_admin')

      if (origTipo && record.getString('tipo') !== origTipo) {
        record.set('tipo', origTipo)
      }
      if (origAssinante && record.getString('assinante_id') !== origAssinante) {
        record.set('assinante_id', origAssinante)
      }
      if (record.getBool('is_admin') !== origAdmin) {
        record.set('is_admin', origAdmin)
      }
    }
  }

  return e.next()
}, '_pb_users_auth_')

// -----------------------------------------------------------------------------
// 3. Validações de Relações Cruzadas no Mesmo Assinante
// -----------------------------------------------------------------------------

// PRODUTOS (Create)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const assinanteId = record.getString('assinante_id')
  if (assinanteId) {
    const marcaId = record.getString('marca_id')
    if (marcaId) {
      try {
        const m = $app.findRecordById('marcas', marcaId)
        if (m && m.getString('assinante_id') && m.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError('A marca selecionada pertence a outro assinante.')
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }

    const grupoId = record.getString('grupo_id')
    if (grupoId) {
      try {
        const g = $app.findRecordById('grupos', grupoId)
        if (g && g.getString('assinante_id') && g.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError('O grupo selecionado pertence a outro assinante.')
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }

    const categoriaId = record.getString('categoria_id')
    if (categoriaId) {
      try {
        const cat = $app.findRecordById('categorias', categoriaId)
        if (cat && cat.getString('assinante_id') && cat.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError('A categoria selecionada pertence a outro assinante.')
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }

    const fornecedorId = record.getString('fornecedor_principal_id')
    if (fornecedorId) {
      try {
        const f = $app.findRecordById('fornecedores', fornecedorId)
        if (f && f.getString('assinante_id') && f.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError(
            'O fornecedor principal selecionado pertence a outro assinante.',
          )
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }

    const perfilTribId = record.getString('perfil_tributario_id')
    if (perfilTribId) {
      try {
        const pt = $app.findRecordById('perfis_tributarios', perfilTribId)
        if (pt && pt.getString('assinante_id') && pt.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError('O perfil tributário selecionado pertence a outro assinante.')
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }
  }

  return e.next()
}, 'produtos')

// PRODUTOS (Update)
onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const assinanteId = record.getString('assinante_id')
  if (assinanteId) {
    const marcaId = record.getString('marca_id')
    if (marcaId) {
      try {
        const m = $app.findRecordById('marcas', marcaId)
        if (m && m.getString('assinante_id') && m.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError('A marca selecionada pertence a outro assinante.')
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }

    const grupoId = record.getString('grupo_id')
    if (grupoId) {
      try {
        const g = $app.findRecordById('grupos', grupoId)
        if (g && g.getString('assinante_id') && g.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError('O grupo selecionado pertence a outro assinante.')
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }

    const categoriaId = record.getString('categoria_id')
    if (categoriaId) {
      try {
        const cat = $app.findRecordById('categorias', categoriaId)
        if (cat && cat.getString('assinante_id') && cat.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError('A categoria selecionada pertence a outro assinante.')
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }

    const fornecedorId = record.getString('fornecedor_principal_id')
    if (fornecedorId) {
      try {
        const f = $app.findRecordById('fornecedores', fornecedorId)
        if (f && f.getString('assinante_id') && f.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError(
            'O fornecedor principal selecionado pertence a outro assinante.',
          )
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }

    const perfilTribId = record.getString('perfil_tributario_id')
    if (perfilTribId) {
      try {
        const pt = $app.findRecordById('perfis_tributarios', perfilTribId)
        if (pt && pt.getString('assinante_id') && pt.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError('O perfil tributário selecionado pertence a outro assinante.')
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }
  }

  return e.next()
}, 'produtos')

// CLIENTES (Create)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const assinanteId = record.getString('assinante_id')
  if (assinanteId) {
    const condId = record.getString('condicao_pagamento_id')
    if (condId) {
      try {
        const cp = $app.findRecordById('condicoes_pagamento', condId)
        if (cp && cp.getString('assinante_id') && cp.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError(
            'A condição de pagamento selecionada pertence a outro assinante.',
          )
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }
  }

  return e.next()
}, 'clientes')

// CLIENTES (Update)
onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const assinanteId = record.getString('assinante_id')
  if (assinanteId) {
    const condId = record.getString('condicao_pagamento_id')
    if (condId) {
      try {
        const cp = $app.findRecordById('condicoes_pagamento', condId)
        if (cp && cp.getString('assinante_id') && cp.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError(
            'A condição de pagamento selecionada pertence a outro assinante.',
          )
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }
  }

  return e.next()
}, 'clientes')

// FORNECEDORES (Create)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const assinanteId = record.getString('assinante_id')
  if (assinanteId) {
    const condId = record.getString('condicao_pagamento_id')
    if (condId) {
      try {
        const cp = $app.findRecordById('condicoes_pagamento', condId)
        if (cp && cp.getString('assinante_id') && cp.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError(
            'A condição de pagamento selecionada pertence a outro assinante.',
          )
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }
  }

  return e.next()
}, 'fornecedores')

// FORNECEDORES (Update)
onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const assinanteId = record.getString('assinante_id')
  if (assinanteId) {
    const condId = record.getString('condicao_pagamento_id')
    if (condId) {
      try {
        const cp = $app.findRecordById('condicoes_pagamento', condId)
        if (cp && cp.getString('assinante_id') && cp.getString('assinante_id') !== assinanteId) {
          throw new BadRequestError(
            'A condição de pagamento selecionada pertence a outro assinante.',
          )
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }
  }

  return e.next()
}, 'fornecedores')

// FORMAS DE PAGAMENTO (Create)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const assinanteId = record.getString('assinante_id')
  if (assinanteId) {
    const contaId = record.getString('conta_financeira_padrao_id')
    if (contaId) {
      try {
        const conta = $app.findRecordById('contas_financeiras', contaId)
        if (conta) {
          const empresaId = conta.getString('empresa_id')
          if (empresaId) {
            const emp = $app.findRecordById('empresas', empresaId)
            if (
              emp &&
              emp.getString('assinante_id') &&
              emp.getString('assinante_id') !== assinanteId
            ) {
              throw new BadRequestError(
                'A conta financeira padrão pertence a uma empresa de outro assinante.',
              )
            }
          }
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }
  }

  return e.next()
}, 'formas_pagamento')

// FORMAS DE PAGAMENTO (Update)
onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const assinanteId = record.getString('assinante_id')
  if (assinanteId) {
    const contaId = record.getString('conta_financeira_padrao_id')
    if (contaId) {
      try {
        const conta = $app.findRecordById('contas_financeiras', contaId)
        if (conta) {
          const empresaId = conta.getString('empresa_id')
          if (empresaId) {
            const emp = $app.findRecordById('empresas', empresaId)
            if (
              emp &&
              emp.getString('assinante_id') &&
              emp.getString('assinante_id') !== assinanteId
            ) {
              throw new BadRequestError(
                'A conta financeira padrão pertence a uma empresa de outro assinante.',
              )
            }
          }
        }
      } catch (err) {
        if (err.message && err.message.includes('outro assinante')) throw err
      }
    }
  }

  return e.next()
}, 'formas_pagamento')

// VENDAS (Create)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const empresaId = record.getString('empresa_id')
  if (empresaId) {
    let assinanteEmpresaId = ''
    try {
      const emp = $app.findRecordById('empresas', empresaId)
      if (emp) assinanteEmpresaId = emp.getString('assinante_id')
    } catch (_) {}

    if (assinanteEmpresaId) {
      const clienteId = record.getString('cliente_id')
      if (clienteId) {
        try {
          const cli = $app.findRecordById('clientes', clienteId)
          if (
            cli &&
            cli.getString('assinante_id') &&
            cli.getString('assinante_id') !== assinanteEmpresaId
          ) {
            throw new BadRequestError('O cliente selecionado pertence a outro assinante.')
          }
        } catch (err) {
          if (err.message && err.message.includes('outro assinante')) throw err
        }
      }

      const condId = record.getString('condicao_pagamento_id')
      if (condId) {
        try {
          const cp = $app.findRecordById('condicoes_pagamento', condId)
          if (
            cp &&
            cp.getString('assinante_id') &&
            cp.getString('assinante_id') !== assinanteEmpresaId
          ) {
            throw new BadRequestError(
              'A condição de pagamento selecionada pertence a outro assinante.',
            )
          }
        } catch (err) {
          if (err.message && err.message.includes('outro assinante')) throw err
        }
      }
    }
  }

  return e.next()
}, 'vendas')

// VENDAS (Update)
onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const empresaId = record.getString('empresa_id')
  if (empresaId) {
    let assinanteEmpresaId = ''
    try {
      const emp = $app.findRecordById('empresas', empresaId)
      if (emp) assinanteEmpresaId = emp.getString('assinante_id')
    } catch (_) {}

    if (assinanteEmpresaId) {
      const clienteId = record.getString('cliente_id')
      if (clienteId) {
        try {
          const cli = $app.findRecordById('clientes', clienteId)
          if (
            cli &&
            cli.getString('assinante_id') &&
            cli.getString('assinante_id') !== assinanteEmpresaId
          ) {
            throw new BadRequestError('O cliente selecionado pertence a outro assinante.')
          }
        } catch (err) {
          if (err.message && err.message.includes('outro assinante')) throw err
        }
      }

      const condId = record.getString('condicao_pagamento_id')
      if (condId) {
        try {
          const cp = $app.findRecordById('condicoes_pagamento', condId)
          if (
            cp &&
            cp.getString('assinante_id') &&
            cp.getString('assinante_id') !== assinanteEmpresaId
          ) {
            throw new BadRequestError(
              'A condição de pagamento selecionada pertence a outro assinante.',
            )
          }
        } catch (err) {
          if (err.message && err.message.includes('outro assinante')) throw err
        }
      }
    }
  }

  return e.next()
}, 'vendas')

// PRODUTOS_FORNECEDORES (Create)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const prodId = record.getString('produto_id')
  const fornId = record.getString('fornecedor_id')

  if (prodId && fornId) {
    try {
      const p = $app.findRecordById('produtos', prodId)
      const f = $app.findRecordById('fornecedores', fornId)
      if (p && f) {
        const assP = p.getString('assinante_id')
        const assF = f.getString('assinante_id')
        if (assP && assF && assP !== assF) {
          throw new BadRequestError(
            'O produto e o fornecedor vinculados devem pertencer ao mesmo assinante.',
          )
        }
      }
    } catch (err) {
      if (err.message && err.message.includes('mesmo assinante')) throw err
    }
  }

  return e.next()
}, 'produtos_fornecedores')

// PRODUTOS_FORNECEDORES (Update)
onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const prodId = record.getString('produto_id')
  const fornId = record.getString('fornecedor_id')

  if (prodId && fornId) {
    try {
      const p = $app.findRecordById('produtos', prodId)
      const f = $app.findRecordById('fornecedores', fornId)
      if (p && f) {
        const assP = p.getString('assinante_id')
        const assF = f.getString('assinante_id')
        if (assP && assF && assP !== assF) {
          throw new BadRequestError(
            'O produto e o fornecedor vinculados devem pertencer ao mesmo assinante.',
          )
        }
      }
    } catch (err) {
      if (err.message && err.message.includes('mesmo assinante')) throw err
    }
  }

  return e.next()
}, 'produtos_fornecedores')

// CONFIG_FINANCEIRA_EMPRESA (Create)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const empresaId = record.getString('empresa_id')
  if (empresaId) {
    let assinanteEmpresaId = ''
    try {
      const emp = $app.findRecordById('empresas', empresaId)
      if (emp) assinanteEmpresaId = emp.getString('assinante_id')
    } catch (_) {}

    if (assinanteEmpresaId) {
      const camposPlano = [
        'plano_compras_revenda_id',
        'plano_industrializacao_id',
        'plano_uso_consumo_id',
        'plano_imobilizado_id',
        'plano_outras_entradas_id',
        'plano_vendas_id',
        'plano_juros_recebidos_id',
        'plano_juros_pagos_id',
        'plano_descontos_obtidos_id',
        'plano_descontos_concedidos_id',
        'plano_transferencias_id',
      ]

      for (let j = 0; j < camposPlano.length; j++) {
        const pId = record.getString(camposPlano[j])
        if (pId) {
          try {
            const pc = $app.findRecordById('plano_contas', pId)
            if (
              pc &&
              pc.getString('assinante_id') &&
              pc.getString('assinante_id') !== assinanteEmpresaId
            ) {
              throw new BadRequestError(
                'A conta contábil em ' + camposPlano[j] + ' pertence a outro assinante.',
              )
            }
          } catch (err) {
            if (err.message && err.message.includes('outro assinante')) throw err
          }
        }
      }

      const ccId = record.getString('centro_custo_padrao_id')
      if (ccId) {
        try {
          const cc = $app.findRecordById('centros_custo', ccId)
          if (
            cc &&
            cc.getString('assinante_id') &&
            cc.getString('assinante_id') !== assinanteEmpresaId
          ) {
            throw new BadRequestError('O centro de custo padrão pertence a outro assinante.')
          }
        } catch (err) {
          if (err.message && err.message.includes('outro assinante')) throw err
        }
      }
    }
  }

  return e.next()
}, 'config_financeira_empresa')

// CONFIG_FINANCEIRA_EMPRESA (Update)
onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const empresaId = record.getString('empresa_id')
  if (empresaId) {
    let assinanteEmpresaId = ''
    try {
      const emp = $app.findRecordById('empresas', empresaId)
      if (emp) assinanteEmpresaId = emp.getString('assinante_id')
    } catch (_) {}

    if (assinanteEmpresaId) {
      const camposPlano = [
        'plano_compras_revenda_id',
        'plano_industrializacao_id',
        'plano_uso_consumo_id',
        'plano_imobilizado_id',
        'plano_outras_entradas_id',
        'plano_vendas_id',
        'plano_juros_recebidos_id',
        'plano_juros_pagos_id',
        'plano_descontos_obtidos_id',
        'plano_descontos_concedidos_id',
        'plano_transferencias_id',
      ]

      for (let j = 0; j < camposPlano.length; j++) {
        const pId = record.getString(camposPlano[j])
        if (pId) {
          try {
            const pc = $app.findRecordById('plano_contas', pId)
            if (
              pc &&
              pc.getString('assinante_id') &&
              pc.getString('assinante_id') !== assinanteEmpresaId
            ) {
              throw new BadRequestError(
                'A conta contábil em ' + camposPlano[j] + ' pertence a outro assinante.',
              )
            }
          } catch (err) {
            if (err.message && err.message.includes('outro assinante')) throw err
          }
        }
      }

      const ccId = record.getString('centro_custo_padrao_id')
      if (ccId) {
        try {
          const cc = $app.findRecordById('centros_custo', ccId)
          if (
            cc &&
            cc.getString('assinante_id') &&
            cc.getString('assinante_id') !== assinanteEmpresaId
          ) {
            throw new BadRequestError('O centro de custo padrão pertence a outro assinante.')
          }
        } catch (err) {
          if (err.message && err.message.includes('outro assinante')) throw err
        }
      }
    }
  }

  return e.next()
}, 'config_financeira_empresa')
