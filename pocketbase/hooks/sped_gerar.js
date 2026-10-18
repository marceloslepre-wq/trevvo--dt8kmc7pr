/// <reference path="../types.d.ts" />

/**
 * Endpoint central para geração do arquivo SPED Fiscal (EFD ICMS/IPI).
 *
 * POST /backend/v1/sped/gerar
 * Body: { empresa_id: string, periodo: "AAAA-MM", modo: "Oficial" | "Teste" }
 */

routerAdd(
  'POST',
  '/backend/v1/sped/gerar',
  function (c) {
    var authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    var userId = authRecord.id
    var body = c.requestInfo().body || {}
    var empresaId = (body.empresa_id || '').trim()
    var periodo = (body.periodo || '').trim() // AAAA-MM
    var modo = (body.modo || 'Teste').trim() // Oficial | Teste

    if (!empresaId) {
      return c.json(400, { sucesso: false, message: 'empresa_id é obrigatório.' })
    }

    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
      return c.json(400, {
        sucesso: false,
        message: 'periodo deve estar no formato AAAA-MM (exemplo: 2025-01).',
      })
    }

    if (modo !== 'Oficial' && modo !== 'Teste') {
      return c.json(400, {
        sucesso: false,
        message: 'modo deve ser "Oficial" ou "Teste".',
      })
    }

    // 1. Validação de Usuário, Acesso ao Módulo Fiscal e Vínculo à Empresa
    var usuarioErp = null
    var perfil = null
    var isAdmin = false
    var podeAcessarFiscal = false

    try {
      var uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + userId + "' && ativo = true",
        '',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioErp = uRecs[0]
      }

      if (!usuarioErp) {
        return c.json(403, {
          sucesso: false,
          message: 'Usuário ERP não vinculado ao login ou inativo.',
        })
      }

      var perfilId = usuarioErp.getString('perfil_id')
      if (perfilId) {
        perfil = $app.findRecordById('perfis_acesso', perfilId)
        if (perfil && perfil.getBool('ativo')) {
          if (perfil.getBool('administrador')) {
            isAdmin = true
            podeAcessarFiscal = true
          } else {
            // Checa permissão no módulo sped ou notas_saida
            var perms = $app.findRecordsByFilter(
              'permissoes',
              "perfil_id = '" +
                perfil.id +
                "' && (modulo = 'sped' || modulo = 'notas_saida') && pode_ver = true && ativo = true",
              '',
              1,
              0,
            )
            if (perms && perms.length > 0) {
              podeAcessarFiscal = true
            }
          }
        }
      }

      if (!podeAcessarFiscal) {
        return c.json(403, {
          sucesso: false,
          message: 'Acesso negado: você não tem permissão para o menu Fiscal / SPED.',
        })
      }

      // Validação de vínculo com a empresa (administrador tem acesso a todas)
      if (!isAdmin) {
        var vinculoOk = usuarioErp.getString('empresa_padrao_id') === empresaId
        if (!vinculoOk) {
          var vinculos = $app.findRecordsByFilter(
            'usuarios_empresas',
            "usuario_id = '" +
              usuarioErp.id +
              "' && empresa_id = '" +
              empresaId +
              "' && ativo = true",
            '',
            1,
            0,
          )
          if (vinculos && vinculos.length > 0) {
            vinculoOk = true
          }
        }

        if (!vinculoOk) {
          return c.json(403, {
            sucesso: false,
            message: 'Você não tem permissão de acesso à empresa solicitada.',
          })
        }
      }
    } catch (errPerm) {
      return c.json(500, {
        sucesso: false,
        message: 'Erro ao validar permissões do usuário: ' + (errPerm.message || String(errPerm)),
      })
    }

    // 2. Carregar Empresa e Configuração do SPED
    var empresa = null
    try {
      empresa = $app.findRecordById('empresas', empresaId)
    } catch (_) {
      return c.json(404, { sucesso: false, message: 'Empresa não encontrada.' })
    }

    var configSped = null
    try {
      var cfgs = $app.findRecordsByFilter(
        'config_sped_empresa',
        "empresa_id = '" + empresaId + "'",
        '-created',
        1,
        0,
      )
      if (cfgs && cfgs.length > 0) {
        configSped = cfgs[0]
      }
    } catch (_) {}

    // 3. Checagem prévia de Inscrição Estadual no modo Oficial
    var ieTexto = (empresa.getString('inscricao_estadual') || '').trim().toUpperCase()
    var ieDigitos = ieTexto.replace(/\D/g, '')

    if (modo === 'Oficial') {
      if (!ieDigitos || ieTexto === 'ISENTO' || !/^\d+$/.test(ieDigitos)) {
        // Grava registro com status "Erro" e validação impeditiva
        try {
          var colSped = $app.findCollectionByNameOrId('sped_arquivos')
          var recErro = new Record(colSped)
          recErro.set('empresa_id', empresaId)
          recErro.set('periodo', periodo)
          recErro.set('finalidade', '0')
          recErro.set('modo', modo)
          recErro.set('status', 'Erro')
          recErro.set('gerado_por', usuarioErp.id)
          recErro.set(
            'validacoes',
            JSON.stringify([
              {
                nivel: 'erro',
                registro: '0000',
                mensagem:
                  'No modo Oficial a empresa precisa ter inscrição estadual numérica. IE atual: "' +
                  (ieTexto || 'Vazia') +
                  '".',
                referencia: ieTexto,
              },
            ]),
          )
          $app.save(recErro)

          return c.json(200, {
            sucesso: false,
            id: recErro.id,
            status: 'Erro',
            message:
              'A empresa não possui Inscrição Estadual numérica obrigatória no modo Oficial.',
          })
        } catch (errErroIE) {
          return c.json(500, {
            sucesso: false,
            message: 'Erro ao gravar status de erro: ' + (errErroIE.message || String(errErroIE)),
          })
        }
      }
    }

    // 4. Cria registro inicial em sped_arquivos com status "Gerando"
    var arquivoRec = null
    try {
      var spedCol = $app.findCollectionByNameOrId('sped_arquivos')
      arquivoRec = new Record(spedCol)
      arquivoRec.set('empresa_id', empresaId)
      arquivoRec.set('periodo', periodo)
      arquivoRec.set('finalidade', '0')
      arquivoRec.set('modo', modo)
      arquivoRec.set('status', 'Gerando')
      arquivoRec.set('gerado_por', usuarioErp.id)
      $app.save(arquivoRec)
    } catch (errCriar) {
      return c.json(500, {
        sucesso: false,
        message:
          'Erro ao inicializar registro de geração do SPED: ' +
          (errCriar.message || String(errCriar)),
      })
    }

    // 5. Monta o arquivo SPED através do motor SpedGerador
    try {
      var resultado = SpedGerador.gerarArquivoCompleto({
        empresa: empresa,
        configSped: configSped,
        periodo: periodo,
        modo: modo,
        finalidade: '0',
      })

      // Converte o texto para bytes e anexa como arquivo PocketBase
      var conteudoBytes = Buffer.from(resultado.conteudo, 'utf-8')
      var fileUpload = $filesystem.fileFromBytes(conteudoBytes, resultado.nomeArquivo)

      arquivoRec.set('arquivo', fileUpload)
      arquivoRec.set('nome_arquivo', resultado.nomeArquivo)
      arquivoRec.set('quantidade_linhas', resultado.quantidadeLinhas)
      arquivoRec.set('contagem_registros', JSON.stringify(resultado.contagemRegistros))
      arquivoRec.set('validacoes', JSON.stringify(resultado.validacoes))
      if (resultado.resumoApuracao) {
        arquivoRec.set('resumo_apuracao', JSON.stringify(resultado.resumoApuracao))
      }
      if (resultado.resumoSaida) {
        arquivoRec.set('resumo_saida', JSON.stringify(resultado.resumoSaida))
      }
      if (resultado.resumoEntrada) {
        arquivoRec.set('resumo_entrada', JSON.stringify(resultado.resumoEntrada))
      }
      arquivoRec.set('status', resultado.status)
      $app.save(arquivoRec)

      // 6. Atualizar arquivos anteriores do mesmo período e modo para "Substituído" (exceto "Entregue" e exceto o atual)
      try {
        var anteriores = $app.findRecordsByFilter(
          'sped_arquivos',
          "empresa_id = '" +
            empresaId +
            "' && periodo = '" +
            periodo +
            "' && modo = '" +
            modo +
            "' && id != '" +
            arquivoRec.id +
            "' && status != 'Entregue' && status != 'Substituído'",
          '-created',
          100,
          0,
        )
        for (var a = 0; a < anteriores.length; a++) {
          var ant = anteriores[a]
          ant.set('status', 'Substituído')
          $app.save(ant)
        }
      } catch (errAnt) {
        console.warn('Aviso: falha ao marcar arquivos anteriores como Substituído:', errAnt)
      }

      // 7. Resposta JSON contendo APENAS o id e o status (NUNCA o conteúdo do arquivo)
      return c.json(200, {
        sucesso: true,
        id: arquivoRec.id,
        status: resultado.status,
        nome_arquivo: resultado.nomeArquivo,
        quantidade_linhas: resultado.quantidadeLinhas,
        total_validacoes: resultado.validacoes.length,
        tem_erros: resultado.temErros,
      })
    } catch (errGeracao) {
      console.error('Erro na geração do SPED:', errGeracao)
      try {
        arquivoRec.set('status', 'Erro')
        arquivoRec.set(
          'validacoes',
          JSON.stringify([
            {
              nivel: 'erro',
              registro: '',
              mensagem:
                'Falha durante o processamento do gerador: ' +
                (errGeracao.message || String(errGeracao)),
            },
          ]),
        )
        $app.save(arquivoRec)
      } catch (_) {}

      return c.json(500, {
        sucesso: false,
        id: arquivoRec ? arquivoRec.id : null,
        status: 'Erro',
        message:
          'Erro interno durante a geração do SPED: ' + (errGeracao.message || String(errGeracao)),
      })
    }
  },
  $apis.requireAuth(),
)
