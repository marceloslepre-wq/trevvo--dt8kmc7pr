// @ts-check
/// <reference path="../types.d.ts" />

/**
 * pocketbase/hooks/assinatura_rotas.js
 *
 * Rota pública de autocadastro de novos assinantes do SaaS (Etapa 9 Multi-tenant - Prompt 9.8-1).
 * POST /backend/v1/assinatura/cadastrar
 *
 * REGRAS CRÍTICAS DA JSVM (goja):
 * - NENHUM require de master_lib.js (causa "Invalid module" no servidor).
 * - Módulos permitidos com require DENTRO do callback: tenancy.js, numeracao_lib.js, fiscal_token_lib.js.
 * - TODAS as funções auxiliares são locais DENTRO do callback (evita "Hook scoping error").
 * - IP lido do primeiro valor de x-forwarded-for, NUNCA de requestInfo().remoteIP.
 * - Transação única com $app.runInTransaction para criar assinante, empresa, admin e carga inicial.
 */

routerAdd('GET', '/backend/v1/assinatura/planos', (c) => {
  try {
    const planos = $app.findRecordsByFilter(
      'planos_catalogo',
      'ativo = true && exclusivo_master = false',
      'valor_mensal',
      100,
      0,
    )
    const lista = []
    for (let i = 0; i < planos.length; i++) {
      const p = planos[i]
      lista.push({
        id: p.id,
        nome: p.getString('nome'),
        etiqueta: p.getString('etiqueta'),
        descricao: p.getString('descricao'),
        valor_mensal: p.getFloat('valor_mensal'),
        limite_empresas: p.getInt('limite_empresas'),
        limite_usuarios: p.getInt('limite_usuarios'),
        permite_nfe: p.getBool('permite_nfe'),
        permite_nfce: p.getBool('permite_nfce'),
        permite_sped: p.getBool('permite_sped'),
        exclusivo_master: p.getBool('exclusivo_master'),
        ativo: p.getBool('ativo'),
      })
    }
    return c.json(200, { sucesso: true, planos: lista })
  } catch (err) {
    console.log('[assinatura/planos]', err && err.message, err && err.stack)
    return c.json(500, { error: 'Falha ao listar planos disponíveis.' })
  }
})

routerAdd('POST', '/backend/v1/assinatura/cadastrar', (c) => {
  try {
    // -------------------------------------------------------------------------
    // Funções locais auxiliares de validação e formatação
    // -------------------------------------------------------------------------

    function validarCNPJ(cnpj) {
      if (!cnpj) return false
      const limpo = String(cnpj)
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
      if (limpo.length !== 14) return false

      const raizFilial = limpo.substring(0, 12)
      if (!/^[0-9A-Z]{12}$/.test(raizFilial)) return false

      const dvEnviado1 = parseInt(limpo.charAt(12), 10)
      const dvEnviado2 = parseInt(limpo.charAt(13), 10)
      if (Number.isNaN(dvEnviado1) || Number.isNaN(dvEnviado2)) return false

      const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

      let soma1 = 0
      for (let i = 0; i < 12; i++) {
        const valorAscii = limpo.charCodeAt(i) - 48
        soma1 += valorAscii * pesos1[i]
      }
      const resto1 = soma1 % 11
      const dvCalculado1 = resto1 < 2 ? 0 : 11 - resto1
      if (dvCalculado1 !== dvEnviado1) return false

      let soma2 = 0
      for (let i = 0; i < 12; i++) {
        const valorAscii = limpo.charCodeAt(i) - 48
        soma2 += valorAscii * pesos2[i]
      }
      soma2 += dvCalculado1 * pesos2[12]
      const resto2 = soma2 % 11
      const dvCalculado2 = resto2 < 2 ? 0 : 11 - resto2

      return dvCalculado2 === dvEnviado2
    }

    function formatarCNPJ(valor) {
      if (!valor) return ''
      const limpo = String(valor)
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
        .slice(0, 14)
      if (limpo.length !== 14) return limpo
      return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`
    }

    function gerarNumeroLicenca(tx) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      for (let tentativa = 0; tentativa < 30; tentativa++) {
        let codigo = ''
        for (let i = 0; i < 6; i++) {
          const idx = Math.floor(Math.random() * chars.length)
          codigo += chars.charAt(idx)
        }
        let prefixo = ''
        for (let j = 0; j < 2; j++) {
          const idxP = Math.floor(Math.random() * 26)
          prefixo += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(idxP)
        }
        const numero = `${prefixo}-${codigo}`

        try {
          const jaExiste = tx.findRecordsByFilter(
            'assinantes',
            `numero_licenca = '${numero}'`,
            '',
            1,
            0,
          )
          if (!jaExiste || jaExiste.length === 0) {
            return numero
          }
        } catch (_) {
          return numero
        }
      }
      return 'AS-' + $security.randomString(6).toUpperCase()
    }

    // -------------------------------------------------------------------------
    // 1. Extração do corpo da requisição e dados
    // -------------------------------------------------------------------------
    const body = c.requestInfo().body || {}
    const headers = c.requestInfo().headers || {}

    // IP de origem (primeiro endereço do x-forwarded-for)
    const xForwardedFor = (headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '').trim()
    const ipOrigem = xForwardedFor ? xForwardedFor.split(',')[0].trim() : '127.0.0.1'

    // Dados estruturados
    const planoId = (body.plano_id || body.plano || '').trim()
    const responsavel = body.responsavel || {}
    const empresa = body.empresa || body.primeira_empresa || {}
    const termosAceitos = Boolean(
      body.termos_aceitos !== undefined ? body.termos_aceitos : body.aceite_termos,
    )

    const respNome = (responsavel.nome || '').trim()
    const respEmail = (responsavel.email || '').trim().toLowerCase()
    const respTelefone = (responsavel.telefone || '').trim()
    const respWhatsapp = (responsavel.whatsapp || responsavel.whatsapp_contato || '').trim()
    const respSenha = (responsavel.senha || responsavel.password || '').trim()

    const empRazaoSocial = (empresa.razao_social || '').trim()
    const empNomeFantasia = (empresa.nome_fantasia || empRazaoSocial).trim()
    const empCnpjBruto = (empresa.cnpj || '').trim()
    const empInscricaoEstadual = (empresa.inscricao_estadual || 'ISENTO').trim()
    const empCrt = Number(empresa.crt) || 1
    const empCep = (empresa.cep || '').trim()
    const empLogradouro = (empresa.logradouro || '').trim()
    const empNumero = (empresa.numero || 'S/N').trim()
    const empComplemento = (empresa.complemento || '').trim()
    const empBairro = (empresa.bairro || '').trim()
    const empMunicipio = (empresa.municipio || '').trim()
    const empCodigoMunicipioIbge = (empresa.codigo_municipio_ibge || '').trim()
    const empUf = (empresa.uf || 'ES').trim().toUpperCase()

    // -------------------------------------------------------------------------
    // 2. Validações preliminares
    // -------------------------------------------------------------------------
    if (!termosAceitos) {
      return c.json(400, {
        error: 'É obrigatório aceitar os termos de uso para realizar o cadastro.',
      })
    }

    if (!planoId) {
      return c.json(400, {
        error: 'Plano não informado. Selecione um plano para continuar.',
      })
    }

    if (!respNome || !respEmail || !respSenha) {
      return c.json(400, {
        error: 'Nome, e-mail e senha do responsável são obrigatórios.',
      })
    }

    if (respSenha.length < 8) {
      return c.json(400, {
        error: 'A senha do responsável deve ter pelo menos 8 caracteres.',
      })
    }

    if (!empRazaoSocial || !empCnpjBruto) {
      return c.json(400, {
        error: 'Razão social e CNPJ da primeira empresa são obrigatórios.',
      })
    }

    if (!validarCNPJ(empCnpjBruto)) {
      return c.json(400, {
        error: 'CNPJ inválido. Confira os dígitos verificadores informados.',
      })
    }

    const cnpjFormatado = formatarCNPJ(empCnpjBruto)
    const cnpjLimpo = empCnpjBruto.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

    // Validação do plano
    let planoRec = null
    try {
      planoRec = $app.findRecordById('planos_catalogo', planoId)
    } catch (_) {
      try {
        const planos = $app.findRecordsByFilter(
          'planos_catalogo',
          `id = '${planoId}' || nome = '${planoId}'`,
          '',
          1,
          0,
        )
        if (planos.length > 0) planoRec = planos[0]
      } catch (_) {}
    }
    if (!planoRec) {
      try {
        const porEtiqueta = $app.findRecordsByFilter(
          'planos_catalogo',
          `etiqueta = '${planoId}'`,
          '',
          1,
          0,
        )
        if (porEtiqueta.length > 0) planoRec = porEtiqueta[0]
      } catch (_) {}
    }

    if (!planoRec) {
      return c.json(400, {
        error: 'Plano selecionado não encontrado no catálogo.',
      })
    }

    if (!planoRec.getBool('ativo')) {
      return c.json(400, {
        error: 'O plano selecionado não está ativo no momento.',
      })
    }

    if (planoRec.getBool('exclusivo_master')) {
      return c.json(400, {
        error: 'O plano selecionado é exclusivo para a administração master.',
      })
    }

    // Rate limit: no máximo 5 cadastros por hora por IP
    if (ipOrigem && ipOrigem !== '127.0.0.1') {
      try {
        const umaHoraAtras = new Date(Date.now() - 3600 * 1000).toISOString()
        const recentes = $app.findRecordsByFilter(
          'assinantes',
          `ip_origem = '${ipOrigem}' && created >= '${umaHoraAtras}'`,
          '',
          10,
          0,
        )
        if (recentes && recentes.length >= 5) {
          return c.json(400, {
            error:
              'Limite de cadastros por hora excedido para este endereço IP. Tente novamente mais tarde.',
          })
        }
      } catch (errRate) {
        console.log('[assinatura_rotas] Erro ao verificar rate limit:', errRate)
      }
    }

    // Verificação de unicidade de e-mail e CNPJ
    // 1. E-mail em users (_pb_users_auth_)
    try {
      const userAuthExist = $app.findAuthRecordByEmail('_pb_users_auth_', respEmail)
      if (userAuthExist) {
        return c.json(400, {
          error: 'Este e-mail já está em uso por outro usuário no sistema.',
        })
      }
    } catch (_) {}

    // 2. E-mail em usuarios
    try {
      const usuarioExist = $app.findRecordsByFilter('usuarios', `email = '${respEmail}'`, '', 1, 0)
      if (usuarioExist && usuarioExist.length > 0) {
        return c.json(400, {
          error: 'Este e-mail já está em uso por outro usuário no sistema.',
        })
      }
    } catch (_) {}

    // 3. E-mail em assinantes
    try {
      const assEmailExist = $app.findRecordsByFilter(
        'assinantes',
        `email_contato = '${respEmail}'`,
        '',
        1,
        0,
      )
      if (assEmailExist && assEmailExist.length > 0) {
        return c.json(400, {
          error: 'Este e-mail já está cadastrado para outro assinante.',
        })
      }
    } catch (_) {}

    // 4. CNPJ em empresas
    try {
      const empCnpjExist = $app.findRecordsByFilter(
        'empresas',
        `cnpj = '${cnpjFormatado}' || cnpj = '${cnpjLimpo}'`,
        '',
        1,
        0,
      )
      if (empCnpjExist && empCnpjExist.length > 0) {
        return c.json(400, {
          error: 'Este CNPJ já está cadastrado para outra empresa no sistema.',
        })
      }
    } catch (_) {}

    // 5. CNPJ em assinantes
    try {
      const assCnpjExist = $app.findRecordsByFilter(
        'assinantes',
        `documento = '${cnpjFormatado}' || documento = '${cnpjLimpo}'`,
        '',
        1,
        0,
      )
      if (assCnpjExist && assCnpjExist.length > 0) {
        return c.json(400, {
          error: 'Este CNPJ já está cadastrado para outro assinante no sistema.',
        })
      }
    } catch (_) {}

    // -------------------------------------------------------------------------
    // 3. Dias de trial a partir de config_master
    // -------------------------------------------------------------------------
    let diasTrial = 15
    try {
      const cfgs = $app.findRecordsByFilter('config_master', '', '-created', 1, 0)
      if (cfgs && cfgs.length > 0) {
        const d = cfgs[0].getInt('dias_trial')
        if (d > 0) diasTrial = d
      }
    } catch (_) {}

    const hoje = new Date()
    const dataInicioStr = hoje.toISOString().slice(0, 10)
    const expiraData = new Date(hoje.getTime() + diasTrial * 24 * 3600 * 1000)
    const dataExpiracaoStr = expiraData.toISOString().slice(0, 10)

    // -------------------------------------------------------------------------
    // 4. Carga Inicial: função local dentro do handler
    // -------------------------------------------------------------------------
    function executarCargaInicial(tx, assinante, empresaNova) {
      const assinanteId = assinante.id
      const empresaId = empresaNova.id

      // Carregar numeracao_lib com require dentro do callback
      const numLib = require(`${__hooks}/numeracao_lib.js`)

      // A) Centros de Custo Padrão ("1 - Geral")
      const centrosCustoCol = tx.findCollectionByNameOrId('centros_custo')
      const ccRec = new Record(centrosCustoCol)
      ccRec.set('codigo', '1')
      ccRec.set('descricao', 'Geral')
      ccRec.set('ativo', true)
      ccRec.set('assinante_id', assinanteId)
      tx.save(ccRec)
      const centroCustoGeralId = ccRec.id

      // B) Plano de Contas Padrão
      const planoContasCol = tx.findCollectionByNameOrId('plano_contas')
      const planoItens = [
        {
          codigo: '1',
          descricao: 'RECEITAS',
          tipo: 'Receita',
          natureza: 'Sintética',
          pai: null,
          grupo_dre: 'Fora da DRE',
        },
        {
          codigo: '1.1',
          descricao: 'Receitas operacionais',
          tipo: 'Receita',
          natureza: 'Sintética',
          pai: '1',
          grupo_dre: 'Receita bruta',
        },
        {
          codigo: '1.1.01',
          descricao: 'Vendas de mercadorias',
          tipo: 'Receita',
          natureza: 'Analítica',
          pai: '1.1',
          grupo_dre: 'Receita bruta',
        },
        {
          codigo: '1.1.02',
          descricao: 'Prestação de serviços',
          tipo: 'Receita',
          natureza: 'Analítica',
          pai: '1.1',
          grupo_dre: 'Receita bruta',
        },
        {
          codigo: '1.2',
          descricao: 'Receitas financeiras',
          tipo: 'Receita',
          natureza: 'Sintética',
          pai: '1',
          grupo_dre: 'Resultado financeiro',
        },
        {
          codigo: '1.2.01',
          descricao: 'Juros e multas recebidos',
          tipo: 'Receita',
          natureza: 'Analítica',
          pai: '1.2',
          grupo_dre: 'Resultado financeiro',
        },
        {
          codigo: '1.2.02',
          descricao: 'Descontos obtidos',
          tipo: 'Receita',
          natureza: 'Analítica',
          pai: '1.2',
          grupo_dre: 'Resultado financeiro',
        },
        {
          codigo: '1.2.03',
          descricao: 'Rendimentos de aplicações',
          tipo: 'Receita',
          natureza: 'Analítica',
          pai: '1.2',
          grupo_dre: 'Resultado financeiro',
        },
        {
          codigo: '1.3',
          descricao: 'Outras receitas',
          tipo: 'Receita',
          natureza: 'Sintética',
          pai: '1',
          grupo_dre: 'Outras receitas e despesas',
        },
        {
          codigo: '1.3.01',
          descricao: 'Outras receitas',
          tipo: 'Receita',
          natureza: 'Analítica',
          pai: '1.3',
          grupo_dre: 'Outras receitas e despesas',
        },

        {
          codigo: '2',
          descricao: 'DESPESAS',
          tipo: 'Despesa',
          natureza: 'Sintética',
          pai: null,
          grupo_dre: 'Fora da DRE',
        },
        {
          codigo: '2.1',
          descricao: 'Custo das mercadorias',
          tipo: 'Despesa',
          natureza: 'Sintética',
          pai: '2',
          grupo_dre: 'Custo das mercadorias',
        },
        {
          codigo: '2.1.01',
          descricao: 'Compras de mercadorias para revenda',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.1',
          grupo_dre: 'Custo das mercadorias',
        },
        {
          codigo: '2.1.02',
          descricao: 'Fretes sobre compras',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.1',
          grupo_dre: 'Custo das mercadorias',
        },
        {
          codigo: '2.1.03',
          descricao: 'Matéria-prima e insumos',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.1',
          grupo_dre: 'Custo das mercadorias',
        },

        {
          codigo: '2.2',
          descricao: 'Impostos sobre vendas',
          tipo: 'Despesa',
          natureza: 'Sintética',
          pai: '2',
          grupo_dre: 'Deduções da receita',
        },
        {
          codigo: '2.2.01',
          descricao: 'Simples Nacional (DAS)',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.2',
          grupo_dre: 'Deduções da receita',
        },
        {
          codigo: '2.2.02',
          descricao: 'ICMS',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.2',
          grupo_dre: 'Deduções da receita',
        },
        {
          codigo: '2.2.03',
          descricao: 'PIS e COFINS',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.2',
          grupo_dre: 'Deduções da receita',
        },

        {
          codigo: '2.3',
          descricao: 'Pessoal',
          tipo: 'Despesa',
          natureza: 'Sintética',
          pai: '2',
          grupo_dre: 'Despesas operacionais',
        },
        {
          codigo: '2.3.01',
          descricao: 'Salários',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.3',
          grupo_dre: 'Despesas operacionais',
        },
        {
          codigo: '2.3.02',
          descricao: 'Encargos (INSS e FGTS)',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.3',
          grupo_dre: 'Despesas operacionais',
        },

        {
          codigo: '2.4',
          descricao: 'Administrativas',
          tipo: 'Despesa',
          natureza: 'Sintética',
          pai: '2',
          grupo_dre: 'Despesas operacionais',
        },
        {
          codigo: '2.4.01',
          descricao: 'Aluguel',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.4',
          grupo_dre: 'Despesas operacionais',
        },
        {
          codigo: '2.4.02',
          descricao: 'Energia elétrica',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.4',
          grupo_dre: 'Despesas operacionais',
        },
        {
          codigo: '2.4.03',
          descricao: 'Material de uso e consumo',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.4',
          grupo_dre: 'Despesas operacionais',
        },

        {
          codigo: '2.5',
          descricao: 'Comerciais',
          tipo: 'Despesa',
          natureza: 'Sintética',
          pai: '2',
          grupo_dre: 'Despesas operacionais',
        },
        {
          codigo: '2.5.01',
          descricao: 'Comissões',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.5',
          grupo_dre: 'Despesas operacionais',
        },
        {
          codigo: '2.5.03',
          descricao: 'Taxas de cartão e meios de pagamento',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.5',
          grupo_dre: 'Despesas operacionais',
        },

        {
          codigo: '2.6',
          descricao: 'Financeiras',
          tipo: 'Despesa',
          natureza: 'Sintética',
          pai: '2',
          grupo_dre: 'Resultado financeiro',
        },
        {
          codigo: '2.6.01',
          descricao: 'Juros e multas pagos',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.6',
          grupo_dre: 'Resultado financeiro',
        },
        {
          codigo: '2.6.02',
          descricao: 'Tarifas bancárias',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.6',
          grupo_dre: 'Resultado financeiro',
        },
        {
          codigo: '2.6.03',
          descricao: 'Descontos concedidos',
          tipo: 'Despesa',
          natureza: 'Analítica',
          pai: '2.6',
          grupo_dre: 'Resultado financeiro',
        },

        {
          codigo: '3',
          descricao: 'MOVIMENTAÇÕES SEM RESULTADO',
          tipo: 'Sem resultado',
          natureza: 'Sintética',
          pai: null,
          grupo_dre: 'Fora da DRE',
        },
        {
          codigo: '3.1',
          descricao: 'Movimentações',
          tipo: 'Sem resultado',
          natureza: 'Sintética',
          pai: '3',
          grupo_dre: 'Fora da DRE',
        },
        {
          codigo: '3.1.01',
          descricao: 'Transferências entre contas',
          tipo: 'Sem resultado',
          natureza: 'Analítica',
          pai: '3.1',
          grupo_dre: 'Fora da DRE',
        },
      ]

      const mapaPlanoIds = {}
      for (let i = 0; i < planoItens.length; i++) {
        const item = planoItens[i]
        const pRec = new Record(planoContasCol)
        pRec.set('codigo', item.codigo)
        pRec.set('descricao', item.descricao)
        pRec.set('tipo', item.tipo)
        pRec.set('natureza', item.natureza)
        pRec.set('grupo_dre', item.grupo_dre)
        pRec.set('ativo', true)
        pRec.set('assinante_id', assinanteId)
        if (item.pai && mapaPlanoIds[item.pai]) {
          pRec.set('conta_pai_id', mapaPlanoIds[item.pai])
        }
        tx.save(pRec)
        mapaPlanoIds[item.codigo] = pRec.id
      }

      // C) Formas de Pagamento (5 formas obrigatórias: Dinheiro, PIX, Cartão de débito, Cartão de crédito, Boleto)
      const formasCol = tx.findCollectionByNameOrId('formas_pagamento')
      const formasPadrao = [
        { codigo_tpag: '01', descricao: 'Dinheiro', tipo: 'Dinheiro' },
        { codigo_tpag: '17', descricao: 'PIX', tipo: 'PIX' },
        { codigo_tpag: '04', descricao: 'Cartão de débito', tipo: 'Cartão de débito' },
        { codigo_tpag: '03', descricao: 'Cartão de crédito', tipo: 'Cartão de crédito' },
        { codigo_tpag: '15', descricao: 'Boleto', tipo: 'Boleto' },
      ]
      for (let f = 0; f < formasPadrao.length; f++) {
        const fp = formasPadrao[f]
        const fpRec = new Record(formasCol)
        fpRec.set('codigo_tpag', fp.codigo_tpag)
        fpRec.set('descricao', fp.descricao)
        fpRec.set('tipo', fp.tipo)
        fpRec.set('taxa_percentual', 0)
        fpRec.set('dias_para_recebimento', 0)
        fpRec.set('ativo', true)
        fpRec.set('assinante_id', assinanteId)
        tx.save(fpRec)
      }

      // D) Condições de Pagamento (À vista, 30 dias, 30/60)
      const condicoesCol = tx.findCollectionByNameOrId('condicoes_pagamento')
      const condicoesPadrao = [
        {
          nome: 'À vista',
          tipo: 'À vista',
          uso: 'Ambos',
          quantidade_parcelas: 1,
          dias_parcelas: [0],
          observacao: 'Pagamento integral no ato da operação.',
        },
        {
          nome: '30 dias',
          tipo: 'A prazo',
          uso: 'Ambos',
          quantidade_parcelas: 1,
          dias_parcelas: [30],
          observacao: 'Pagamento em parcela única com vencimento em 30 dias.',
        },
        {
          nome: '30/60',
          tipo: 'A prazo',
          uso: 'Ambos',
          quantidade_parcelas: 2,
          dias_parcelas: [30, 60],
          observacao: 'Pagamento em 2 parcelas (30 e 60 dias).',
        },
      ]

      for (let cIdx = 0; cIdx < condicoesPadrao.length; cIdx++) {
        const cp = condicoesPadrao[cIdx]
        const codCond = numLib.proximoNumero(assinanteId, null, 'codigo_condicoes_pagamento', tx)
        const cpRec = new Record(condicoesCol)
        cpRec.set('codigo', codCond)
        cpRec.set('nome', cp.nome)
        cpRec.set('tipo', cp.tipo)
        cpRec.set('uso', cp.uso)
        cpRec.set('quantidade_parcelas', cp.quantidade_parcelas)
        cpRec.set('dias_parcelas', cp.dias_parcelas)
        cpRec.set('percentual_entrada', 0)
        cpRec.set('acrescimo_percentual', 0)
        cpRec.set('desconto_percentual', 0)
        cpRec.set('dia_fixo_vencimento', 0)
        cpRec.set('observacao', cp.observacao)
        cpRec.set('ativo', true)
        cpRec.set('assinante_id', assinanteId)
        tx.save(cpRec)
      }

      // E) Perfis de Acesso adicionais da carga inicial: Gerente, Vendedor, Caixa, Financeiro, Estoque
      const perfisCol = tx.findCollectionByNameOrId('perfis_acesso')
      const permissoesCol = tx.findCollectionByNameOrId('permissoes')

      const todosModulos = [
        'painel',
        'empresas',
        'usuarios',
        'perfis_acesso',
        'clientes',
        'fornecedores',
        'produtos',
        'marcas',
        'grupos_categorias',
        'unidades_medida',
        'tabelas_fiscais',
        'condicoes_pagamento',
        'estoque',
        'compras',
        'notas_entrada',
        'financeiro_pagar',
        'financeiro_receber',
        'vendas',
        'pdv',
        'caixa',
        'notas_saida',
        'sped',
        'relatorios',
        'configuracoes',
        'financeiro_bancos',
      ]

      const perfisAdicionais = [
        {
          nome: 'Gerente',
          descricao:
            'Gestão geral da empresa (usuarios, perfis e configuracoes apenas visualização)',
          administrador: false,
          regra: (mod) => {
            if (mod === 'usuarios' || mod === 'perfis_acesso' || mod === 'configuracoes') {
              return { ver: true, criar: false, editar: false, excluir: false }
            }
            return { ver: true, criar: true, editar: true, excluir: true }
          },
        },
        {
          nome: 'Vendedor',
          descricao: 'Vendas, pedidos, orçamentos, clientes e consulta de produtos',
          administrador: false,
          regra: (mod) => {
            if (['vendas', 'clientes'].includes(mod)) {
              return { ver: true, criar: true, editar: true, excluir: false }
            }
            if (mod === 'produtos' || mod === 'painel') {
              return { ver: true, criar: false, editar: false, excluir: false }
            }
            return { ver: false, criar: false, editar: false, excluir: false }
          },
        },
        {
          nome: 'Caixa',
          descricao: 'Frente de caixa, PDV, abertura e fechamento de sessão',
          administrador: false,
          regra: (mod) => {
            if (['pdv', 'caixa', 'vendas', 'clientes'].includes(mod)) {
              return { ver: true, criar: true, editar: false, excluir: false }
            }
            if (mod === 'produtos' || mod === 'painel') {
              return { ver: true, criar: false, editar: false, excluir: false }
            }
            return { ver: false, criar: false, editar: false, excluir: false }
          },
        },
        {
          nome: 'Financeiro',
          descricao:
            'Operações financeiras, contas a pagar, receber, clientes, fornecedores e bancos',
          administrador: false,
          regra: (mod) => {
            if (
              [
                'financeiro_pagar',
                'financeiro_receber',
                'financeiro_bancos',
                'clientes',
                'fornecedores',
              ].includes(mod)
            ) {
              return { ver: true, criar: true, editar: true, excluir: false }
            }
            if (mod === 'relatorios' || mod === 'painel') {
              return { ver: true, criar: false, editar: false, excluir: false }
            }
            return { ver: false, criar: false, editar: false, excluir: false }
          },
        },
        {
          nome: 'Estoque',
          descricao:
            'Controle de estoque, compras, notas de entrada, produtos e cadastros relacionados',
          administrador: false,
          regra: (mod) => {
            if (
              [
                'produtos',
                'estoque',
                'compras',
                'notas_entrada',
                'marcas',
                'grupos_categorias',
                'unidades_medida',
              ].includes(mod)
            ) {
              return { ver: true, criar: true, editar: true, excluir: false }
            }
            if (mod === 'fornecedores' || mod === 'painel') {
              return { ver: true, criar: false, editar: false, excluir: false }
            }
            return { ver: false, criar: false, editar: false, excluir: false }
          },
        },
      ]

      for (let pIdx = 0; pIdx < perfisAdicionais.length; pIdx++) {
        const pDef = perfisAdicionais[pIdx]
        const pRec = new Record(perfisCol)
        pRec.set('nome', pDef.nome)
        pRec.set('descricao', pDef.descricao)
        pRec.set('administrador', false)
        pRec.set('ativo', true)
        pRec.set('assinante_id', assinanteId)
        tx.save(pRec)

        for (let m = 0; m < todosModulos.length; m++) {
          const modName = todosModulos[m]
          const pRule = pDef.regra(modName)
          const permRec = new Record(permissoesCol)
          permRec.set('perfil_id', pRec.id)
          permRec.set('modulo', modName)
          permRec.set('ativo', true)
          permRec.set('pode_ver', Boolean(pRule.ver))
          permRec.set('pode_criar', Boolean(pRule.criar))
          permRec.set('pode_editar', Boolean(pRule.editar))
          permRec.set('pode_excluir', Boolean(pRule.excluir))
          tx.save(permRec)
        }
      }

      // F) Cliente "Consumidor Final"
      const clientesCol = tx.findCollectionByNameOrId('clientes')
      const codCli = numLib.proximoNumero(assinanteId, null, 'codigo_clientes', tx)
      const cliRec = new Record(clientesCol)
      cliRec.set('codigo', codCli)
      cliRec.set('nome_razao_social', 'Consumidor Final')
      cliRec.set('nome_fantasia', 'Consumidor Final')
      cliRec.set('tipo_pessoa', 'Física')
      cliRec.set('consumidor_final', true)
      cliRec.set('indicador_ie', '9')
      cliRec.set('bloqueado', false)
      cliRec.set('ativo', true)
      cliRec.set('assinante_id', assinanteId)
      tx.save(cliRec)
      const consumidorFinalId = cliRec.id

      // G) Conta financeira "Caixa"
      const contasFinCol = tx.findCollectionByNameOrId('contas_financeiras')
      const contaCaixaRec = new Record(contasFinCol)
      contaCaixaRec.set('empresa_id', empresaId)
      contaCaixaRec.set('nome', 'Caixa')
      contaCaixaRec.set('tipo', 'Caixa físico')
      contaCaixaRec.set('saldo_inicial', 0)
      contaCaixaRec.set('data_saldo_inicial', dataInicioStr)
      contaCaixaRec.set('saldo_atual', 0)
      contaCaixaRec.set('permite_saldo_negativo', false)
      contaCaixaRec.set('conta_padrao_pagamentos', true)
      contaCaixaRec.set('conta_padrao_recebimentos', true)
      contaCaixaRec.set('ativo', true)
      tx.save(contaCaixaRec)

      // H) Configurações da Empresa
      // 1. config_fiscal_empresa
      const cfgFiscCol = tx.findCollectionByNameOrId('config_fiscal_empresa')
      const cfgFiscRec = new Record(cfgFiscCol)
      cfgFiscRec.set('empresa_id', empresaId)
      cfgFiscRec.set('aliquota_icms_interna_padrao', 17)
      cfgFiscRec.set('aliquota_fcp_padrao', 0)
      cfgFiscRec.set('csosn_padrao_tributado', '102')
      cfgFiscRec.set('criar_produtos_automaticamente', 'Perguntar')
      cfgFiscRec.set('aplicar_sugestao_fiscal_em_produtos_existentes_vazios', true)
      cfgFiscRec.set('ativo', true)
      tx.save(cfgFiscRec)

      // 2. config_financeira_empresa
      const cfgFinCol = tx.findCollectionByNameOrId('config_financeira_empresa')
      const cfgFinRec = new Record(cfgFinCol)
      cfgFinRec.set('empresa_id', empresaId)
      cfgFinRec.set('multa_atraso_percentual', 2)
      cfgFinRec.set('juros_mora_mensal_percentual', 1)
      cfgFinRec.set('dias_carencia', 0)
      cfgFinRec.set('dias_tolerancia_bloqueio', 0)
      cfgFinRec.set('centro_custo_padrao_id', centroCustoGeralId)
      if (mapaPlanoIds['2.1.01']) cfgFinRec.set('plano_compras_revenda_id', mapaPlanoIds['2.1.01'])
      if (mapaPlanoIds['2.4.03']) cfgFinRec.set('plano_uso_consumo_id', mapaPlanoIds['2.4.03'])
      if (mapaPlanoIds['1.1.01']) cfgFinRec.set('plano_vendas_id', mapaPlanoIds['1.1.01'])
      if (mapaPlanoIds['1.2.01']) cfgFinRec.set('plano_juros_recebidos_id', mapaPlanoIds['1.2.01'])
      if (mapaPlanoIds['2.6.01']) cfgFinRec.set('plano_juros_pagos_id', mapaPlanoIds['2.6.01'])
      if (mapaPlanoIds['1.2.02'])
        cfgFinRec.set('plano_descontos_obtidos_id', mapaPlanoIds['1.2.02'])
      if (mapaPlanoIds['2.6.03'])
        cfgFinRec.set('plano_descontos_concedidos_id', mapaPlanoIds['2.6.03'])
      if (mapaPlanoIds['3.1.01']) cfgFinRec.set('plano_transferencias_id', mapaPlanoIds['3.1.01'])
      cfgFinRec.set('ativo', true)
      tx.save(cfgFinRec)

      // 3. config_vendas_empresa
      const cfgVendasCol = tx.findCollectionByNameOrId('config_vendas_empresa')
      const cfgVendasRec = new Record(cfgVendasCol)
      cfgVendasRec.set('empresa_id', empresaId)
      cfgVendasRec.set('cliente_padrao_id', consumidorFinalId)
      cfgVendasRec.set('permite_vender_sem_estoque', false)
      cfgVendasRec.set('exige_cliente_identificado_acima_de', 0)
      cfgVendasRec.set('bloquear_venda_prazo_cliente_bloqueado', true)
      cfgVendasRec.set('validade_orcamento_dias', 7)
      cfgVendasRec.set('dias_para_troca', 30)
      cfgVendasRec.set('mensagem_rodape_comprovante', 'Obrigado pela preferência! Volte sempre.')
      cfgVendasRec.set('fechamento_cego', false)
      cfgVendasRec.set('balanca_ativa', false)
      if (mapaPlanoIds['1.1.01']) cfgVendasRec.set('plano_vendas_id', mapaPlanoIds['1.1.01'])
      if (mapaPlanoIds['2.5.03']) cfgVendasRec.set('plano_taxas_cartao_id', mapaPlanoIds['2.5.03'])
      cfgVendasRec.set('ativo', true)
      tx.save(cfgVendasRec)

      // 4. config_emissao_fiscal (com emissão desligada)
      const cfgEmissaoCol = tx.findCollectionByNameOrId('config_emissao_fiscal')
      const cfgEmissaoRec = new Record(cfgEmissaoCol)
      cfgEmissaoRec.set('empresa_id', empresaId)
      cfgEmissaoRec.set('emite_documentos_fiscais', false)
      cfgEmissaoRec.set('emite_nfce', false)
      cfgEmissaoRec.set('ambiente', 'Homologação')
      cfgEmissaoRec.set('serie_nfe', '1')
      cfgEmissaoRec.set('serie_nfce', '1')
      cfgEmissaoRec.set('emitir_nfce_automaticamente_no_pdv', false)
      cfgEmissaoRec.set('ativo', true)
      tx.save(cfgEmissaoRec)

      // 5. config_sped_empresa
      const cfgSpedCol = tx.findCollectionByNameOrId('config_sped_empresa')
      const cfgSpedRec = new Record(cfgSpedCol)
      cfgSpedRec.set('empresa_id', empresaId)
      cfgSpedRec.set('versao_leiaute', '018')
      cfgSpedRec.set('dia_vencimento_icms', 10)
      cfgSpedRec.set('mes_bloco_h', 2)
      cfgSpedRec.set('gerar_bloco_k', false)
      cfgSpedRec.set('incluir_homologacao_em_teste', false)
      tx.save(cfgSpedRec)
    }

    // -------------------------------------------------------------------------
    // 5. Execução atômica numa única transação
    // -------------------------------------------------------------------------
    let resultado = null

    $app.runInTransaction((tx) => {
      const numLib = require(`${__hooks}/numeracao_lib.js`)

      // A) Criar Assinante
      const assinantesCol = tx.findCollectionByNameOrId('assinantes')
      const numeroLicenca = gerarNumeroLicenca(tx)

      const assinanteRec = new Record(assinantesCol)
      assinanteRec.set('numero_licenca', numeroLicenca)
      assinanteRec.set('nome', empRazaoSocial)
      assinanteRec.set('documento', cnpjFormatado)
      assinanteRec.set('email_contato', respEmail)
      assinanteRec.set('telefone', respTelefone)
      assinanteRec.set('whatsapp_contato', respWhatsapp)
      assinanteRec.set('status', 'Trial')
      assinanteRec.set('origem', false)
      assinanteRec.set('data_inicio', dataInicioStr)
      assinanteRec.set('data_expiracao', dataExpiracaoStr)
      assinanteRec.set('limites_personalizados', false)
      assinanteRec.set('limite_usuarios', planoRec.getInt('limite_usuarios') || 0)
      assinanteRec.set('limite_empresas', planoRec.getInt('limite_empresas') || 0)
      assinanteRec.set('observacoes', `Cadastro público via plano ${planoRec.getString('nome')}`)
      assinanteRec.set('plano_id', planoRec.id)
      assinanteRec.set('ip_origem', ipOrigem)
      tx.save(assinanteRec)
      const assinanteId = assinanteRec.id

      // Eventos de licença: Criação e Trial
      const eventosCol = tx.findCollectionByNameOrId('licencas_eventos')

      const evCriacao = new Record(eventosCol)
      evCriacao.set('assinante_id', assinanteId)
      evCriacao.set('numero_licenca', numeroLicenca)
      evCriacao.set('tipo', 'Criação')
      evCriacao.set('plano_id', planoRec.id)
      evCriacao.set('validade_ate', dataExpiracaoStr)
      evCriacao.set(
        'descricao',
        `Cadastro inicial do assinante via formulário público (Plano: ${planoRec.getString('nome')})`,
      )
      tx.save(evCriacao)

      const evTrial = new Record(eventosCol)
      evTrial.set('assinante_id', assinanteId)
      evTrial.set('numero_licenca', numeroLicenca)
      evTrial.set('tipo', 'Trial')
      evTrial.set('plano_id', planoRec.id)
      evTrial.set('validade_ate', dataExpiracaoStr)
      evTrial.set(
        'descricao',
        `Período de testes de ${diasTrial} dias ativado (válido até ${dataExpiracaoStr})`,
      )
      tx.save(evTrial)

      // B) Criar Empresa Matriz
      const empresasCol = tx.findCollectionByNameOrId('empresas')
      const codEmpresa = numLib.proximoNumero(assinanteId, null, 'codigo_empresas', tx)

      const empresaRec = new Record(empresasCol)
      empresaRec.set('tipo', 'Matriz')
      empresaRec.set('codigo', codEmpresa)
      empresaRec.set('razao_social', empRazaoSocial)
      empresaRec.set('nome_fantasia', empNomeFantasia)
      empresaRec.set('cnpj', cnpjFormatado)
      empresaRec.set('inscricao_estadual', empInscricaoEstadual)
      empresaRec.set('crt', empCrt)
      empresaRec.set('regime_apuracao', empCrt === 3 ? 'Lucro Presumido' : 'Simples Nacional')
      empresaRec.set('cep', empCep)
      empresaRec.set('logradouro', empLogradouro)
      empresaRec.set('numero', empNumero)
      empresaRec.set('complemento', empComplemento)
      empresaRec.set('bairro', empBairro)
      empresaRec.set('municipio', empMunicipio)
      empresaRec.set('codigo_municipio_ibge', empCodigoMunicipioIbge || '3205309')
      empresaRec.set('uf', empUf)
      empresaRec.set('telefone', respTelefone)
      empresaRec.set('email', respEmail)
      empresaRec.set('ativo', true)
      empresaRec.set('assinante_id', assinanteId)
      tx.save(empresaRec)
      const empresaId = empresaRec.id

      // C) Criar Perfil Administrador e Matriz de Permissões
      const perfisCol = tx.findCollectionByNameOrId('perfis_acesso')
      const permissoesCol = tx.findCollectionByNameOrId('permissoes')

      const perfilAdmin = new Record(perfisCol)
      perfilAdmin.set('nome', 'Administrador')
      perfilAdmin.set('descricao', 'Acesso total irrestrito ao sistema e a todas as empresas')
      perfilAdmin.set('administrador', true)
      perfilAdmin.set('ativo', true)
      perfilAdmin.set('assinante_id', assinanteId)
      tx.save(perfilAdmin)
      const perfilAdminId = perfilAdmin.id

      const todosModulos = [
        'painel',
        'empresas',
        'usuarios',
        'perfis_acesso',
        'clientes',
        'fornecedores',
        'produtos',
        'marcas',
        'grupos_categorias',
        'unidades_medida',
        'tabelas_fiscais',
        'condicoes_pagamento',
        'estoque',
        'compras',
        'notas_entrada',
        'financeiro_pagar',
        'financeiro_receber',
        'vendas',
        'pdv',
        'caixa',
        'notas_saida',
        'sped',
        'relatorios',
        'configuracoes',
        'financeiro_bancos',
      ]

      for (let m = 0; m < todosModulos.length; m++) {
        const modName = todosModulos[m]
        const permRec = new Record(permissoesCol)
        permRec.set('perfil_id', perfilAdminId)
        permRec.set('modulo', modName)
        permRec.set('ativo', true)
        permRec.set('pode_ver', true)
        permRec.set('pode_criar', true)
        permRec.set('pode_editar', true)
        permRec.set('pode_excluir', true)
        tx.save(permRec)
      }

      // D) Criar Usuário Administrador
      const usersAuthCol = tx.findCollectionByNameOrId('_pb_users_auth_')
      const usuariosCol = tx.findCollectionByNameOrId('usuarios')
      const ueCol = tx.findCollectionByNameOrId('usuarios_empresas')

      const authRec = new Record(usersAuthCol)
      authRec.setEmail(respEmail)
      authRec.setPassword(respSenha)
      authRec.setVerified(true)
      authRec.set('name', respNome)
      authRec.set('tipo', 'usuario') // NUNCA master
      authRec.set('assinante_id', assinanteId)
      authRec.set('is_admin', true)
      tx.save(authRec)
      const authUserId = authRec.id

      const usuarioRec = new Record(usuariosCol)
      usuarioRec.set('ativo', true)
      usuarioRec.set('auth_user_id', authUserId)
      usuarioRec.set('nome', respNome)
      usuarioRec.set('email', respEmail)
      usuarioRec.set('telefone', respTelefone)
      usuarioRec.set('perfil_id', perfilAdminId)
      usuarioRec.set('empresa_padrao_id', empresaId)
      usuarioRec.set('desconto_maximo_percentual', 0)
      usuarioRec.set('comissao_percentual', 0)
      usuarioRec.set('e_vendedor', false)
      usuarioRec.set('e_caixa', false)
      usuarioRec.set('assinante_id', assinanteId)
      tx.save(usuarioRec)
      const usuarioId = usuarioRec.id

      const ueRec = new Record(ueCol)
      ueRec.set('usuario_id', usuarioId)
      ueRec.set('empresa_id', empresaId)
      ueRec.set('auth_user_id', authUserId)
      ueRec.set('ativo', true)
      tx.save(ueRec)

      // E) Carga Inicial da Empresa
      executarCargaInicial(tx, assinanteRec, empresaRec)

      resultado = {
        assinante_id: assinanteId,
        empresa_id: empresaId,
        usuario_id: usuarioId,
        auth_user_id: authUserId,
        numero_licenca: numeroLicenca,
      }
    })

    return c.json(200, {
      sucesso: true,
      mensagem: 'Assinante cadastrado com sucesso!',
      assinante_id: resultado.assinante_id,
      empresa_id: resultado.empresa_id,
      usuario_id: resultado.usuario_id,
      numero_licenca: resultado.numero_licenca,
    })
  } catch (err) {
    console.log('[assinatura]', err && err.message, err && err.stack)
    return c.json(err.status || 500, {
      error: err.message || 'Falha interna ao processar cadastro de assinante.',
    })
  }
})
