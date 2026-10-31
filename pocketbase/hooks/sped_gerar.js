/// <reference path="../types.d.ts" />

/**
 * Endpoint central para geração do arquivo SPED Fiscal (EFD ICMS/IPI).
 *
 * POST /backend/v1/sped/gerar
 * Body: { empresa_id: string, periodo: "AAAA-MM", modo: "Oficial" | "Teste" }
 *
 * JSVM PocketBase / Skip Cloud:
 * - Zero require de tenancy.js ou outros módulos do projeto nos callbacks (evita 'Invalid module').
 * - As rotinas de tenancy (exigirEmpresaDoUsuario e auxiliares) são declaradas localmente no callback.
 * - O routerAdd continua no nível superior do arquivo, intacto, com mesmo caminho e método.
 * - O callback é envolvido em try/catch externo com log real e JSON { sucesso: false, message: ... }.
 */

routerAdd(
  'POST',
  '/backend/v1/sped/gerar',
  function (c) {
    try {
      var authRecord = c.auth || c.get('authRecord')
      if (!authRecord) {
        return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
      }

      // Funções locais de tenancy e governança multi-tenant (evita require)
      function eMaster(auth) {
        if (!auth) return false
        try {
          var userRec = $app.findRecordById('_pb_users_auth_', auth.id)
          return !!(userRec && userRec.getString('tipo') === 'master')
        } catch (_) {
          return false
        }
      }

      function empresasDoUsuario(auth) {
        if (!auth) return []

        var usuarioRec = null
        try {
          var uRecs = $app.findRecordsByFilter(
            'usuarios',
            "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) {
            usuarioRec = uRecs[0]
          }
        } catch (_) {}

        if (!usuarioRec && auth.getString && auth.getString('email')) {
          try {
            var uRecsByEmail = $app.findRecordsByFilter(
              'usuarios',
              "email = '" + auth.getString('email') + "'",
              '-created',
              1,
              0,
            )
            if (uRecsByEmail && uRecsByEmail.length > 0) {
              usuarioRec = uRecsByEmail[0]
            }
          } catch (_) {}
        }

        if (!usuarioRec) return []

        var assinanteId = usuarioRec.getString('assinante_id')
        if (!assinanteId) return []

        function obterAssinanteImpersonadoLocal(userId, appInstance) {
          var app = appInstance || $app
          if (!userId) return null
          try {
            if (!app.hasTable('master_impersonacoes')) return null
            var recs = app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + userId + "'",
              '-created',
              1,
              0,
            )
            if (recs && recs.length > 0) {
              return recs[0].getString('assinante_id') || null
            }
          } catch (_) {}
          return null
        }

        var ehMasterUser = eMaster(auth)
        if (ehMasterUser) {
          try {
            var impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
            if (impersonadoId) {
              assinanteId = impersonadoId
            }
          } catch (_) {}
        }

        var isAdmin = false
        var perfilId = usuarioRec.getString('perfil_id')
        if (perfilId) {
          try {
            var perfilRec = $app.findRecordById('perfis_acesso', perfilId)
            if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
              isAdmin = true
            }
          } catch (_) {}
        }

        if (isAdmin || ehMasterUser) {
          try {
            var empresas = $app.findRecordsByFilter(
              'empresas',
              "assinante_id = '" + assinanteId + "' && ativo = true",
              'codigo',
              500,
              0,
            )
            return empresas
          } catch (_) {
            return []
          }
        }

        var permitidosIds = new Set()
        var padraoId = usuarioRec.getString('empresa_padrao_id')
        if (padraoId) permitidosIds.add(padraoId)

        try {
          var vinculos = $app.findRecordsByFilter(
            'usuarios_empresas',
            "usuario_id = '" + usuarioRec.id + "' && ativo = true",
            '',
            500,
            0,
          )
          for (var i = 0; i < vinculos.length; i++) {
            var eId = vinculos[i].getString('empresa_id')
            if (eId) permitidosIds.add(eId)
          }
        } catch (_) {}

        var empresasLista = []
        permitidosIds.forEach(function (eId) {
          try {
            var emp = $app.findRecordById('empresas', eId)
            if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
              empresasLista.push(emp)
            }
          } catch (_) {}
        })

        empresasLista.sort(function (a, b) {
          return (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0)
        })
        return empresasLista
      }

      function exigirEmpresaDoUsuario(auth, empresaId) {
        if (!empresaId) {
          throw new Error('ID da empresa é obrigatório.')
        }
        var permitidas = empresasDoUsuario(auth)
        var encontrada = permitidas.find(function (e) {
          return e.id === empresaId
        })
        if (!encontrada) {
          throw new Error('Acesso negado à empresa especificada para este usuário/assinante.')
        }
        return encontrada
      }

      // Utilitários de formatação para SPED Fiscal (EFD ICMS/IPI)
      var SpedFormatoLocal = (function () {
        function removerAcentosECaracteresEspeciais(valor) {
          if (valor === null || valor === undefined) return ''
          var str = String(valor)

          var mapaAcentos = {
            á: 'a',
            à: 'a',
            ã: 'a',
            â: 'a',
            ä: 'a',
            Á: 'A',
            À: 'A',
            Ã: 'A',
            Â: 'A',
            Ä: 'A',
            é: 'e',
            è: 'e',
            ê: 'e',
            ë: 'e',
            É: 'E',
            È: 'E',
            Ê: 'E',
            Ë: 'E',
            í: 'i',
            ì: 'i',
            î: 'i',
            ï: 'i',
            Í: 'I',
            Ì: 'I',
            Î: 'I',
            Ï: 'I',
            ó: 'o',
            ò: 'o',
            õ: 'o',
            ô: 'o',
            ö: 'o',
            Ó: 'O',
            Ò: 'O',
            Õ: 'O',
            Ô: 'O',
            Ö: 'O',
            ú: 'u',
            ù: 'u',
            û: 'u',
            ü: 'u',
            Ú: 'U',
            Ù: 'U',
            Û: 'U',
            Ü: 'U',
            ç: 'c',
            Ç: 'C',
            ñ: 'n',
            Ñ: 'N',
          }

          str = str.replace(/[áàãâäÁÀÃÂÄéèêëÉÈÊËíìîïÍÌÎÏóòõôöÓÒÕÔÖúùûüÚÙÛÜçÇñÑ]/g, function (m) {
            return mapaAcentos[m] || m
          })

          str = str.replace(/[|\r\n\t]+/g, ' ')
          str = str.replace(/[^\x20-\x7E]/g, '')
          return str.trim()
        }

        function formatarTexto(valor, maxLen) {
          var limpo = removerAcentosECaracteresEspeciais(valor)
          if (typeof maxLen === 'number' && maxLen > 0) {
            return limpo.substring(0, maxLen)
          }
          return limpo
        }

        function formatarDigitos(valor) {
          if (valor === null || valor === undefined) return ''
          return String(valor).replace(/\D/g, '')
        }

        function formatarValor(valor) {
          if (valor === null || valor === undefined || valor === '') return ''
          var num = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
          if (isNaN(num)) return ''
          return num.toFixed(2).replace('.', ',')
        }

        function formatarQuantidade(valor, maxCasas) {
          if (valor === null || valor === undefined || valor === '') return ''
          var num = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
          if (isNaN(num)) return ''
          var casas = typeof maxCasas === 'number' ? maxCasas : 3
          var str = num.toFixed(casas).replace('.', ',')
          str = str.replace(/0+$/, '').replace(/,$/, '')
          return str
        }

        function formatarPrecoUnitario(valor, maxCasas) {
          if (valor === null || valor === undefined || valor === '') return ''
          var num = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
          if (isNaN(num)) return ''
          var casas = typeof maxCasas === 'number' ? maxCasas : 6
          var str = num.toFixed(casas).replace('.', ',')
          var partes = str.split(',')
          if (partes.length === 2 && partes[1].length > 2) {
            var decimais = partes[1].replace(/0+$/, '')
            if (decimais.length < 2) decimais = decimais.padEnd(2, '0')
            str = partes[0] + ',' + decimais
          }
          return str
        }

        function formatarData(dataIsoOuDate) {
          if (!dataIsoOuDate) return ''
          var d = null
          if (typeof dataIsoOuDate === 'string') {
            var raw = dataIsoOuDate.trim()
            if (!raw) return ''
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
              var p = raw.split('-')
              return p[2] + p[1] + p[0]
            }
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
              var p2 = raw.split('/')
              return p2[0] + p2[1] + p2[2]
            }
            if (/^\d{8}$/.test(raw)) {
              return raw
            }
            d = new Date(raw)
          } else if (dataIsoOuDate instanceof Date) {
            d = dataIsoOuDate
          }

          if (!d || isNaN(d.getTime())) return ''

          var utcMillis = d.getTime() + d.getTimezoneOffset() * 60000
          var spOffsetMillis = -3 * 60 * 60000
          var spDate = new Date(utcMillis + spOffsetMillis)

          var dia = String(spDate.getDate())
          if (dia.length < 2) dia = '0' + dia
          var mes = String(spDate.getMonth() + 1)
          if (mes.length < 2) mes = '0' + mes
          var ano = String(spDate.getFullYear())

          return dia + mes + ano
        }

        function montarLinha(campos) {
          var valores = (campos || []).map(function (c) {
            return c === null || c === undefined ? '' : String(c)
          })
          return '|' + valores.join('|') + '|\r\n'
        }

        return {
          removerAcentosECaracteresEspeciais: removerAcentosECaracteresEspeciais,
          formatarTexto: formatarTexto,
          formatarDigitos: formatarDigitos,
          formatarValor: formatarValor,
          formatarQuantidade: formatarQuantidade,
          formatarPrecoUnitario: formatarPrecoUnitario,
          formatarData: formatarData,
          montarLinha: montarLinha,
        }
      })()

      // Motor do SPED Fiscal local no callback
      var SpedGeradorLocal = (function () {
        function criarContexto(params) {
          var empresa = params.empresa
          var configSped = params.configSped
          var periodo = params.periodo
          var modo = params.modo || 'Teste'
          var finalidade = params.finalidade || '0'

          var ano = parseInt(periodo.substring(0, 4), 10)
          var mes = parseInt(periodo.substring(5, 7), 10)
          var mesStr = mes < 10 ? '0' + mes : String(mes)
          var ultimoDia = new Date(ano, mes, 0).getDate()
          var ultimoDiaStr = ultimoDia < 10 ? '0' + ultimoDia : String(ultimoDia)

          var dtIniIso = ano + '-' + mesStr + '-01'
          var dtFinIso = ano + '-' + mesStr + '-' + ultimoDiaStr
          var dtIniSped = '01' + mesStr + String(ano)
          var dtFinSped = ultimoDiaStr + mesStr + String(ano)

          var participantesMap = {}
          var itensMap = {}
          var unidadesMap = {}
          var validacoes = []

          return {
            empresa: empresa,
            configSped: configSped,
            periodo: periodo,
            ano: ano,
            mes: mes,
            modo: modo,
            finalidade: finalidade,
            dtIniIso: dtIniIso,
            dtFinIso: dtFinIso,
            dtIniSped: dtIniSped,
            dtFinSped: dtFinSped,
            participantesMap: participantesMap,
            itensMap: itensMap,
            unidadesMap: unidadesMap,
            validacoes: validacoes,

            registrarParticipante: function (tipo, id) {
              if (!tipo || !id) return
              var k = String(tipo).toUpperCase() + '_' + String(id)
              participantesMap[k] = { tipo: String(tipo).toUpperCase(), id: String(id) }
            },

            registrarItem: function (produtoId) {
              if (!produtoId) return
              itensMap[String(produtoId)] = String(produtoId)
            },

            registrarUnidade: function (unidadeIdOuSigla) {
              if (!unidadeIdOuSigla) return
              unidadesMap[String(unidadeIdOuSigla)] = String(unidadeIdOuSigla)
            },

            adicionarValidacao: function (nivel, mensagem, registro, referencia) {
              validacoes.push({
                nivel: nivel === 'erro' ? 'erro' : 'aviso',
                registro: registro || '',
                mensagem: mensagem || '',
                referencia: referencia || '',
              })
            },
          }
        }

        function gerarBlocoB(ctx) {
          var linhas = []
          linhas.push(SpedFormato.montarLinha(['B001', '1']))
          var totalLinhas = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['B990', String(totalLinhas)]))
          return linhas
        }

        function extrairDataBrasilia(dataStr) {
          if (!dataStr) return null
          var d = null
          var raw = String(dataStr).trim()
          if (!raw) return null
          if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            var p = raw.split('-')
            return {
              ano: parseInt(p[0], 10),
              mes: parseInt(p[1], 10),
              dia: parseInt(p[2], 10),
              isoDia: raw,
            }
          }
          d = new Date(raw)
          if (!d || isNaN(d.getTime())) return null
          var utcMillis = d.getTime() + d.getTimezoneOffset() * 60000
          var spOffsetMillis = -3 * 60 * 60000
          var spDate = new Date(utcMillis + spOffsetMillis)

          var ano = spDate.getFullYear()
          var m = spDate.getMonth() + 1
          var dia = spDate.getDate()
          var mesStr = m < 10 ? '0' + m : String(m)
          var diaStr = dia < 10 ? '0' + dia : String(dia)

          return {
            ano: ano,
            mes: m,
            dia: dia,
            isoDia: ano + '-' + mesStr + '-' + diaStr,
          }
        }

        function round2(valor) {
          var num = typeof valor === 'number' ? valor : parseFloat(String(valor || 0))
          if (isNaN(num)) return 0
          return Math.round(num * 100) / 100
        }

        function extrairUfDestinoDoc(doc) {
          if (!doc) return ''
          var uf = (doc.getString('destinatario_uf') || '').trim().toUpperCase()
          if (uf && uf.length === 2) return uf
          var clienteId = doc.getString('cliente_id')
          if (clienteId) {
            try {
              var cl = $app.findRecordById('clientes', clienteId)
              var ufCl = (cl.getString('uf') || '').trim().toUpperCase()
              if (ufCl && ufCl.length === 2) return ufCl
            } catch (_) {}
          }
          var jsonEnv = doc.get('json_enviado')
          if (jsonEnv) {
            try {
              var payload = typeof jsonEnv === 'string' ? JSON.parse(jsonEnv) : jsonEnv
              if (payload && payload.destinatario && payload.destinatario.uf) {
                var ufDest = String(payload.destinatario.uf).trim().toUpperCase()
                if (ufDest.length === 2) return ufDest
              }
            } catch (_) {}
          }
          return ''
        }

        function gerarBlocoD(ctx) {
          var linhas = []
          linhas.push(SpedFormato.montarLinha(['D001', '1']))
          var totalLinhas = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['D990', String(totalLinhas)]))
          return linhas
        }

        function gerarBlocoG(ctx) {
          var linhas = []
          linhas.push(SpedFormato.montarLinha(['G001', '1']))
          var totalLinhas = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['G990', String(totalLinhas)]))
          return linhas
        }

        function gerarBloco1(ctx) {
          var linhas = []
          linhas.push(SpedFormato.montarLinha(['1001', '0']))
          linhas.push(
            SpedFormato.montarLinha([
              '1010',
              'N',
              'N',
              'N',
              'N',
              'N',
              'N',
              'N',
              'N',
              'N',
              'N',
              'N',
              'N',
              'N',
            ]),
          )

          var recebeuEletronico = false
          try {
            var dtIniFiltro = ctx.dtIniIso + ' 00:00:00'
            var dtFinFiltro = ctx.dtFinIso + ' 23:59:59'
            var vendasPeriodo = $app.findRecordsByFilter(
              'vendas',
              "empresa_id = '" +
                ctx.empresa.id +
                "' && ativo = true && data_venda >= '" +
                dtIniFiltro +
                "' && data_venda <= '" +
                dtFinFiltro +
                "'",
              'created',
              2000,
              0,
            )

            if (vendasPeriodo.length > 0) {
              var vendaIds = vendasPeriodo.map(function (v) {
                return v.id
              })

              for (var vi = 0; vi < vendaIds.length; vi++) {
                var pagtos = $app.findRecordsByFilter(
                  'vendas_pagamentos',
                  "venda_id = '" + vendaIds[vi] + "' && ativo = true",
                  'created',
                  50,
                  0,
                )
                for (var pi = 0; pi < pagtos.length; pi++) {
                  var fpId = pagtos[pi].getString('forma_pagamento_id')
                  if (fpId) {
                    try {
                      var fp = $app.findRecordById('formas_pagamento', fpId)
                      var tipoFp = fp.getString('tipo') || ''
                      var tPag = fp.getString('codigo_tpag') || ''
                      if (
                        tipoFp === 'Cartão de crédito' ||
                        tipoFp === 'Cartão de débito' ||
                        tipoFp === 'PIX' ||
                        tPag === '03' ||
                        tPag === '04' ||
                        tPag === '17'
                      ) {
                        recebeuEletronico = true
                        break
                      }
                    } catch (_) {}
                  }
                }
                if (recebeuEletronico) break
              }
            }

            if (!recebeuEletronico) {
              var titulos = $app.findRecordsByFilter(
                'contas_receber',
                "empresa_id = '" +
                  ctx.empresa.id +
                  "' && ativo = true && data_emissao >= '" +
                  ctx.dtIniIso +
                  "' && data_emissao <= '" +
                  ctx.dtFinIso +
                  "'",
                'created',
                500,
                0,
              )
              for (var tr = 0; tr < titulos.length; tr++) {
                var fppId = titulos[tr].getString('forma_pagamento_prevista_id')
                if (fppId) {
                  try {
                    var fpp = $app.findRecordById('formas_pagamento', fppId)
                    var tipoFpp = fpp.getString('tipo') || ''
                    var tPagFpp = fpp.getString('codigo_tpag') || ''
                    if (
                      tipoFpp === 'Cartão de crédito' ||
                      tipoFpp === 'Cartão de débito' ||
                      tipoFpp === 'PIX' ||
                      tPagFpp === '03' ||
                      tPagFpp === '04' ||
                      tPagFpp === '17'
                    ) {
                      recebeuEletronico = true
                      break
                    }
                  } catch (_) {}
                }
              }
            }
          } catch (errEletr) {
            console.warn('Erro ao verificar recebimentos eletronicos:', errEletr)
          }

          if (recebeuEletronico) {
            ctx.adicionarValidacao(
              'aviso',
              'confira com o contador se o registro 1601 (pagamentos eletrônicos) é exigido; o ERP não gera o 1601 nesta versão',
              '1010',
            )
          }

          var totalLinhas1 = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['1990', String(totalLinhas1)]))
          return linhas
        }

        // BLOCO 0
        function gerarBloco0(ctx) {
          var emp = ctx.empresa
          var cfg = ctx.configSped
          var linhas = []

          var codVer = '020'
          if (cfg) {
            var cv = cfg.getString('versao_leiaute')
            if (cv && cv.trim()) codVer = cv.trim()
          }
          var codFin = ctx.finalidade === '1' ? '1' : '0'
          var dtIni = ctx.dtIniSped
          var dtFin = ctx.dtFinSped
          var nome = SpedFormato.formatarTexto(
            emp.getString('razao_social') || emp.getString('nome_fantasia'),
            100,
          )
          var cnpj = SpedFormato.formatarDigitos(emp.getString('cnpj'))
          var cpf = ''
          var uf = (emp.getString('uf') || 'ES').trim().toUpperCase()
          var ie = SpedFormato.formatarDigitos(emp.getString('inscricao_estadual'))
          var codMun = SpedFormato.formatarDigitos(emp.getString('codigo_municipio_ibge'))
          var im = SpedFormato.formatarTexto(emp.getString('inscricao_municipal'), 20)
          var suframa = ''
          var indPerfil = (emp.getString('perfil_sped') || 'B').trim().toUpperCase()
          if (indPerfil !== 'A' && indPerfil !== 'B' && indPerfil !== 'C') indPerfil = 'B'
          var indAtiv = String(emp.getInt('indicador_atividade_sped') || 0)

          if (!codMun || codMun.length !== 7) {
            ctx.adicionarValidacao(
              'erro',
              'Código de município IBGE da empresa não informado ou inválido (deve ter 7 dígitos).',
              '0000',
              codMun,
            )
          }

          linhas.push(
            SpedFormato.montarLinha([
              '0000',
              codVer,
              codFin,
              dtIni,
              dtFin,
              nome,
              cnpj,
              cpf,
              uf,
              ie,
              codMun,
              im,
              suframa,
              indPerfil,
              indAtiv,
            ]),
          )

          linhas.push(SpedFormato.montarLinha(['0001', '0']))

          var fantasia = SpedFormato.formatarTexto(
            emp.getString('nome_fantasia') || emp.getString('razao_social'),
            60,
          )
          var cep = SpedFormato.formatarDigitos(emp.getString('cep'))
          var logradouro = SpedFormato.formatarTexto(emp.getString('logradouro'), 60)
          var numero = SpedFormato.formatarTexto(emp.getString('numero'), 10)
          var complemento = SpedFormato.formatarTexto(emp.getString('complemento'), 60)
          var bairro = SpedFormato.formatarTexto(emp.getString('bairro'), 60)
          var fone = SpedFormato.formatarDigitos(
            emp.getString('telefone') || emp.getString('celular'),
          )
          var fax = ''
          var email = SpedFormato.formatarTexto(
            emp.getString('email_fiscal') || emp.getString('email'),
            100,
          )

          linhas.push(
            SpedFormato.montarLinha([
              '0005',
              fantasia,
              cep,
              logradouro,
              numero,
              complemento,
              bairro,
              fone,
              fax,
              email,
            ]),
          )

          var ieSt = SpedFormato.formatarDigitos(emp.getString('inscricao_estadual_st'))
          if (ieSt) {
            linhas.push(SpedFormato.montarLinha(['0015', uf, ieSt]))
          }

          var contNome = SpedFormato.formatarTexto(emp.getString('contador_nome'), 100)
          var contCpf = SpedFormato.formatarDigitos(emp.getString('contador_cpf'))
          var contCrc = SpedFormato.formatarTexto(emp.getString('contador_crc'), 15)
          var contCnpjEscritorio = SpedFormato.formatarDigitos(
            emp.getString('contador_cnpj_escritorio'),
          )
          var contCep = SpedFormato.formatarDigitos(emp.getString('contador_cep'))
          var contLogradouro = SpedFormato.formatarTexto(emp.getString('contador_logradouro'), 60)
          var contNumero = SpedFormato.formatarTexto(emp.getString('contador_numero'), 10)
          var contComplemento = SpedFormato.formatarTexto(emp.getString('contador_complemento'), 60)
          var contBairro = SpedFormato.formatarTexto(emp.getString('contador_bairro'), 60)
          var contFone = SpedFormato.formatarDigitos(emp.getString('contador_telefone'))
          var contFax = ''
          var contEmail = SpedFormato.formatarTexto(emp.getString('contador_email'), 100)
          var contCodMun = SpedFormato.formatarDigitos(
            emp.getString('contador_codigo_municipio_ibge'),
          )

          if (!contNome) {
            ctx.adicionarValidacao(
              'aviso',
              'Nome do contador não preenchido no cadastro da empresa.',
              '0100',
            )
          }
          if (!contCpf || contCpf.length !== 11) {
            ctx.adicionarValidacao('aviso', 'CPF do contador ausente ou inválido.', '0100', contCpf)
          }
          if (!contCrc) {
            ctx.adicionarValidacao('aviso', 'CRC do contador não preenchido.', '0100')
          }

          linhas.push(
            SpedFormato.montarLinha([
              '0100',
              contNome,
              contCpf,
              contCrc,
              contCnpjEscritorio,
              contCep,
              contLogradouro,
              contNumero,
              contComplemento,
              contBairro,
              contFone,
              contFax,
              contEmail,
              contCodMun,
            ]),
          )

          var chavesPart = Object.keys(ctx.participantesMap).sort()
          for (var i = 0; i < chavesPart.length; i++) {
            var itemPart = ctx.participantesMap[chavesPart[i]]
            var codPart = itemPart.tipo + itemPart.id
            var nomePart = ''
            var codPais = '01058'
            var cnpjPart = ''
            var cpfPart = ''
            var iePart = ''
            var codMunPart = ''
            var suframaPart = ''
            var endPart = ''
            var numPart = ''
            var complPart = ''
            var bairroPart = ''

            try {
              if (itemPart.tipo === 'C') {
                var cl = $app.findRecordById('clientes', itemPart.id)
                nomePart = SpedFormato.formatarTexto(
                  cl.getString('nome_razao_social') || cl.getString('nome_fantasia'),
                  100,
                )
                var doc = SpedFormato.formatarDigitos(cl.getString('cpf_cnpj'))
                if (doc.length > 11) cnpjPart = doc
                else cpfPart = doc
                var indIeCl = cl.getString('indicador_ie')
                if (indIeCl === '1') {
                  iePart = SpedFormato.formatarDigitos(cl.getString('inscricao_estadual'))
                }
                codMunPart = SpedFormato.formatarDigitos(cl.getString('codigo_municipio_ibge'))
                suframaPart = SpedFormato.formatarDigitos(cl.getString('inscricao_suframa'))
                endPart = SpedFormato.formatarTexto(cl.getString('logradouro'), 60)
                numPart = SpedFormato.formatarTexto(cl.getString('numero'), 10)
                complPart = SpedFormato.formatarTexto(cl.getString('complemento'), 60)
                bairroPart = SpedFormato.formatarTexto(cl.getString('bairro'), 60)
              } else if (itemPart.tipo === 'F') {
                var fo = $app.findRecordById('fornecedores', itemPart.id)
                nomePart = SpedFormato.formatarTexto(
                  fo.getString('razao_social') || fo.getString('nome_fantasia'),
                  100,
                )
                var docF = SpedFormato.formatarDigitos(fo.getString('cpf_cnpj'))
                if (docF.length > 11) cnpjPart = docF
                else cpfPart = docF
                var indIeFo = fo.getString('indicador_ie')
                if (indIeFo === '1') {
                  iePart = SpedFormato.formatarDigitos(fo.getString('inscricao_estadual'))
                }
                codMunPart = SpedFormato.formatarDigitos(fo.getString('codigo_municipio_ibge'))
                suframaPart = SpedFormato.formatarDigitos(fo.getString('inscricao_suframa'))
                endPart = SpedFormato.formatarTexto(fo.getString('logradouro'), 60)
                numPart = SpedFormato.formatarTexto(fo.getString('numero'), 10)
                complPart = SpedFormato.formatarTexto(fo.getString('complemento'), 60)
                bairroPart = SpedFormato.formatarTexto(fo.getString('bairro'), 60)
              } else if (itemPart.tipo === 'E') {
                var emRel = $app.findRecordById('empresas', itemPart.id)
                nomePart = SpedFormato.formatarTexto(
                  emRel.getString('razao_social') || emRel.getString('nome_fantasia'),
                  100,
                )
                cnpjPart = SpedFormato.formatarDigitos(emRel.getString('cnpj'))
                iePart = SpedFormato.formatarDigitos(emRel.getString('inscricao_estadual'))
                codMunPart = SpedFormato.formatarDigitos(emRel.getString('codigo_municipio_ibge'))
                endPart = SpedFormato.formatarTexto(emRel.getString('logradouro'), 60)
                numPart = SpedFormato.formatarTexto(emRel.getString('numero'), 10)
                complPart = SpedFormato.formatarTexto(emRel.getString('complemento'), 60)
                bairroPart = SpedFormato.formatarTexto(emRel.getString('bairro'), 60)
              }
            } catch (errPart) {
              ctx.adicionarValidacao(
                'erro',
                'Falha ao carregar participante: ' + (errPart.message || errPart),
                '0150',
                codPart,
              )
            }

            if (!codMunPart || codMunPart.length !== 7) {
              ctx.adicionarValidacao(
                'erro',
                'Código de município IBGE não informado para o participante "' +
                  (nomePart || codPart) +
                  '".',
                '0150',
                codPart,
              )
            }

            linhas.push(
              SpedFormato.montarLinha([
                '0150',
                codPart,
                nomePart,
                codPais,
                cnpjPart,
                cpfPart,
                iePart,
                codMunPart,
                suframaPart,
                endPart,
                numPart,
                complPart,
                bairroPart,
              ]),
            )
          }

          var chavesUnid = Object.keys(ctx.unidadesMap).sort()
          for (var u = 0; u < chavesUnid.length; u++) {
            var idOuSigla = ctx.unidadesMap[chavesUnid[u]]
            var sigla = idOuSigla
            var descr = idOuSigla
            try {
              var unRec = null
              if (idOuSigla.length === 15) {
                try {
                  unRec = $app.findRecordById('unidades_medida', idOuSigla)
                } catch (_) {}
              }
              if (!unRec) {
                var unRecs = $app.findRecordsByFilter(
                  'unidades_medida',
                  "sigla = '" + idOuSigla + "'",
                  '',
                  1,
                  0,
                )
                if (unRecs && unRecs.length > 0) unRec = unRecs[0]
              }
              if (unRec) {
                sigla = unRec.getString('sigla')
                descr = unRec.getString('descricao') || sigla
              }
            } catch (_) {}

            linhas.push(
              SpedFormato.montarLinha([
                '0190',
                SpedFormato.formatarTexto(sigla, 6),
                SpedFormato.formatarTexto(descr, 100),
              ]),
            )
          }

          var chavesItens = Object.keys(ctx.itensMap).sort()
          for (var it = 0; it < chavesItens.length; it++) {
            var prodId = ctx.itensMap[chavesItens[it]]
            try {
              var prod = $app.findRecordById('produtos', prodId)
              var codItem = String(prod.getInt('codigo') || prod.id)
              var descrItem = SpedFormato.formatarTexto(prod.getString('descricao'), 100)
              var codBarra = SpedFormato.formatarDigitos(prod.getString('gtin'))
              var codAntItem = ''
              var unidInv = ''
              var unidId = prod.getString('unidade_id')
              if (unidId) {
                try {
                  var unP = $app.findRecordById('unidades_medida', unidId)
                  unidInv = unP.getString('sigla')
                } catch (_) {
                  unidInv = unidId
                }
              }
              if (!unidInv) unidInv = 'UN'

              var tipoItem = SpedFormato.formatarDigitos(prod.getString('tipo_item_sped'))
              if (!tipoItem) {
                tipoItem = '00'
                ctx.adicionarValidacao(
                  'erro',
                  'Produto sem tipo_item_sped: ' + codItem + ' - ' + descrItem,
                  '0200',
                  codItem,
                )
              }
              if (tipoItem.length === 1) tipoItem = '0' + tipoItem

              var codNcm = SpedFormato.formatarDigitos(prod.getString('ncm'))
              if (!codNcm || codNcm.length !== 8) {
                ctx.adicionarValidacao(
                  'erro',
                  'Produto sem NCM válido de 8 dígitos: ' + codItem + ' - ' + descrItem,
                  '0200',
                  codItem,
                )
              }

              var exIpi = SpedFormato.formatarTexto(prod.getString('ex_tipi'), 3)
              var codGen = SpedFormato.formatarDigitos(prod.getString('codigo_genero'))
              if (!codGen && codNcm.length >= 2) {
                codGen = codNcm.substring(0, 2)
              }
              var codLst = SpedFormato.formatarDigitos(prod.getString('codigo_servico_lc116'))
              var aliqIcms = ''
              var cest = SpedFormato.formatarDigitos(prod.getString('cest'))

              linhas.push(
                SpedFormato.montarLinha([
                  '0200',
                  codItem,
                  descrItem,
                  codBarra,
                  codAntItem,
                  SpedFormato.formatarTexto(unidInv, 6),
                  tipoItem,
                  codNcm,
                  exIpi,
                  codGen,
                  codLst,
                  aliqIcms,
                  cest,
                ]),
              )
            } catch (errProd) {
              ctx.adicionarValidacao(
                'erro',
                'Falha ao carregar produto para o Bloco 0200: ' + (errProd.message || errProd),
                '0200',
                prodId,
              )
            }
          }

          var totalLinhas0 = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['0990', String(totalLinhas0)]))
          return linhas
        }

        // BLOCO 9
        function gerarBloco9(linhasAnteriores) {
          var linhas = []
          linhas.push(SpedFormato.montarLinha(['9001', '0']))

          var contagem = {}
          function incrementar(reg) {
            if (!reg) return
            contagem[reg] = (contagem[reg] || 0) + 1
          }

          for (var i = 0; i < linhasAnteriores.length; i++) {
            var l = linhasAnteriores[i]
            if (l && l.length > 2 && l.charAt(0) === '|') {
              var partes = l.split('|')
              var reg = partes[1]
              incrementar(reg)
            }
          }

          incrementar('9001')

          var tiposFixos = ['9001', '9900', '9990', '9999']
          for (var tf = 0; tf < tiposFixos.length; tf++) {
            if (!contagem[tiposFixos[tf]]) {
              contagem[tiposFixos[tf]] = 0
            }
          }
          contagem['9001'] = 1
          contagem['9990'] = 1
          contagem['9999'] = 1

          var listaTipos = Object.keys(contagem).sort()
          var qtdRegistros9900 = listaTipos.length
          contagem['9900'] = qtdRegistros9900

          for (var t = 0; t < listaTipos.length; t++) {
            var codReg = listaTipos[t]
            var qtd = contagem[codReg]
            linhas.push(SpedFormato.montarLinha(['9900', codReg, String(qtd)]))
          }

          var totalLinhas9 = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['9990', String(totalLinhas9)]))

          var totalArquivo = linhasAnteriores.length + linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['9999', String(totalArquivo)]))

          return {
            linhas: linhas,
            contagem: contagem,
            totalLinhas: totalArquivo,
          }
        }

        function validarDVCPF(cpfLimpo) {
          if (!cpfLimpo || cpfLimpo.length !== 11) return false
          if (/^(\d)\1{10}$/.test(cpfLimpo)) return false

          var soma = 0
          for (var i = 0; i < 9; i++) {
            soma += parseInt(cpfLimpo.charAt(i), 10) * (10 - i)
          }
          var resto = 11 - (soma % 11)
          var dv1 = resto >= 10 ? 0 : resto
          if (dv1 !== parseInt(cpfLimpo.charAt(9), 10)) return false

          soma = 0
          for (var j = 0; j < 10; j++) {
            soma += parseInt(cpfLimpo.charAt(j), 10) * (11 - j)
          }
          resto = 11 - (soma % 11)
          var dv2 = resto >= 10 ? 0 : resto
          return dv2 === parseInt(cpfLimpo.charAt(10), 10)
        }

        function validarDVCNPJ(cnpjLimpo) {
          if (!cnpjLimpo) return false
          var str = String(cnpjLimpo)
            .replace(/[^a-zA-Z0-9]/g, '')
            .toUpperCase()
          if (str.length !== 14) return false

          var raizFilial = str.substring(0, 12)
          if (!/^[0-9A-Z]{12}$/.test(raizFilial)) return false

          var dvEnviado1 = parseInt(str.charAt(12), 10)
          var dvEnviado2 = parseInt(str.charAt(13), 10)
          if (isNaN(dvEnviado1) || isNaN(dvEnviado2)) return false

          var pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          var pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

          var soma1 = 0
          for (var i = 0; i < 12; i++) {
            var valAscii = str.charCodeAt(i) - 48
            soma1 += valAscii * pesos1[i]
          }
          var resto1 = soma1 % 11
          var dvCalc1 = resto1 < 2 ? 0 : 11 - resto1
          if (dvCalc1 !== dvEnviado1) return false

          var soma2 = 0
          for (var j = 0; j < 12; j++) {
            var valAscii2 = str.charCodeAt(j) - 48
            soma2 += valAscii2 * pesos2[j]
          }
          soma2 += dvCalc1 * pesos2[12]
          var resto2 = soma2 % 11
          var dvCalc2 = resto2 < 2 ? 0 : 11 - resto2

          return dvCalc2 === dvEnviado2
        }

        function executarValidacaoInternaPreFechamento(ctx, linhasBlocosOperacionais) {
          var participantesUsados = {}
          var itensUsados = {}
          var unidadesUsadas = {}
          var chavesAcessoVistas = {}

          for (var b = 0; b < linhasBlocosOperacionais.length; b++) {
            var linha = linhasBlocosOperacionais[b]
            if (!linha || linha.charAt(0) !== '|') continue
            var colunas = linha.split('|')
            var reg = colunas[1]

            if (reg === 'C100') {
              var codPart = (colunas[4] || '').trim()
              var chvNfe = (colunas[9] || '').trim()
              var dtDoc = (colunas[10] || '').trim()
              var dtES = (colunas[11] || '').trim()
              var indOper = (colunas[2] || '').trim()
              var numDoc = (colunas[8] || '').trim()

              if (codPart) {
                participantesUsados[codPart] = true
              }

              if (chvNfe && chvNfe.length === 44) {
                if (chavesAcessoVistas[chvNfe]) {
                  ctx.adicionarValidacao(
                    'erro',
                    'A mesma chave de acesso não pode aparecer duas vezes no arquivo SPED: ' +
                      chvNfe,
                    'C100',
                    chvNfe,
                  )
                } else {
                  chavesAcessoVistas[chvNfe] = true
                }
              }

              var mesStrEsperado = ctx.mes < 10 ? '0' + ctx.mes : String(ctx.mes)
              var anoStrEsperado = String(ctx.ano)

              if (indOper === '1') {
                if (dtDoc && dtDoc.length === 8) {
                  var mesDoc = dtDoc.substring(2, 4)
                  var anoDoc = dtDoc.substring(4, 8)
                  if (mesDoc !== mesStrEsperado || anoDoc !== anoStrEsperado) {
                    ctx.adicionarValidacao(
                      'erro',
                      'Data DT_DOC da nota de saída nº ' +
                        numDoc +
                        ' (' +
                        dtDoc +
                        ') está fora do período de apuração (' +
                        ctx.periodo +
                        ').',
                      'C100',
                      numDoc,
                    )
                  }
                }
              } else if (indOper === '0') {
                if (dtES && dtES.length === 8) {
                  var mesES = dtES.substring(2, 4)
                  var anoES = dtES.substring(4, 8)
                  if (mesES !== mesStrEsperado || anoES !== anoStrEsperado) {
                    ctx.adicionarValidacao(
                      'erro',
                      'Data DT_E_S da nota de entrada nº ' +
                        numDoc +
                        ' (' +
                        dtES +
                        ') está fora do período de apuração (' +
                        ctx.periodo +
                        ').',
                      'C100',
                      numDoc,
                    )
                  }
                }
              }
            } else if (reg === 'C170') {
              var codItemC170 = (colunas[3] || '').trim()
              var unidC170 = (colunas[6] || '').trim()
              if (codItemC170) itensUsados[codItemC170] = true
              if (unidC170) unidadesUsadas[unidC170] = true
            } else if (reg === 'H010') {
              var codItemH010 = (colunas[2] || '').trim()
              var unidH010 = (colunas[3] || '').trim()
              if (codItemH010) itensUsados[codItemH010] = true
              if (unidH010) unidadesUsadas[unidH010] = true
            } else if (reg === 'K200') {
              var codItemK200 = (colunas[3] || '').trim()
              if (codItemK200) itensUsados[codItemK200] = true
            }
          }

          var chavesPartOriginal = Object.keys(ctx.participantesMap)
          for (var p = 0; p < chavesPartOriginal.length; p++) {
            var itemPart = ctx.participantesMap[chavesPartOriginal[p]]
            var codPartCandidate = itemPart.tipo + itemPart.id
            if (!participantesUsados[codPartCandidate]) {
              ctx.adicionarValidacao(
                'aviso',
                'Participante ' +
                  codPartCandidate +
                  ' coletado não foi referenciado em nenhum documento e foi retirado do arquivo.',
                '0150',
                codPartCandidate,
              )
              delete ctx.participantesMap[chavesPartOriginal[p]]
            }
          }

          var chavesItensOriginal = Object.keys(ctx.itensMap)
          for (var itk = 0; itk < chavesItensOriginal.length; itk++) {
            var prodIdCand = ctx.itensMap[chavesItensOriginal[itk]]
            var codItemEsperado = prodIdCand
            try {
              var prodRecTemp = $app.findRecordById('produtos', prodIdCand)
              codItemEsperado = String(prodRecTemp.getInt('codigo') || prodRecTemp.id)
            } catch (_) {}

            if (!itensUsados[codItemEsperado] && !itensUsados[prodIdCand]) {
              ctx.adicionarValidacao(
                'aviso',
                'Item ' +
                  codItemEsperado +
                  ' não foi referenciado em C170, H010 ou K200 e foi retirado do arquivo.',
                '0200',
                codItemEsperado,
              )
              delete ctx.itensMap[chavesItensOriginal[itk]]
            }
          }

          var chavesUnidOriginal = Object.keys(ctx.unidadesMap)
          for (var uk = 0; uk < chavesUnidOriginal.length; uk++) {
            var unidCand = ctx.unidadesMap[chavesUnidOriginal[uk]]
            var siglaCand = unidCand
            try {
              if (unidCand.length === 15) {
                var unR = $app.findRecordById('unidades_medida', unidCand)
                siglaCand = unR.getString('sigla') || unidCand
              }
            } catch (_) {}

            if (!unidadesUsadas[siglaCand] && !unidadesUsadas[unidCand]) {
              ctx.adicionarValidacao(
                'aviso',
                'Unidade de medida ' +
                  siglaCand +
                  ' não foi referenciada em nenhum item e foi retirada do arquivo.',
                '0190',
                siglaCand,
              )
              delete ctx.unidadesMap[chavesUnidOriginal[uk]]
            }
          }

          return {
            participantesUsados: participantesUsados,
            itensUsados: itensUsados,
            unidadesUsadas: unidadesUsadas,
          }
        }

        function executarValidacaoInternaPosMontagem(ctx, linhasArquivoPronto, dadosUso) {
          var linhas0150 = {}
          var linhas0200 = {}
          var linhas0190 = {}
          var contagemReal = {}

          var x990Gravado = {}
          var linhas9900 = {}
          var reg9990Gravado = null
          var reg9999Gravado = null
          var linhaE110Pronta = null

          for (var i = 0; i < linhasArquivoPronto.length; i++) {
            var l = linhasArquivoPronto[i]
            if (!l || l.charAt(0) !== '|') continue
            var cols = l.split('|')
            var r = cols[1]

            contagemReal[r] = (contagemReal[r] || 0) + 1

            if (r === '0150') {
              var codP = (cols[2] || '').trim()
              var cnpjP = (cols[5] || '').trim()
              var cpfP = (cols[6] || '').trim()
              linhas0150[codP] = { cnpj: cnpjP, cpf: cpfP }
            } else if (r === '0190') {
              var un = (cols[2] || '').trim()
              linhas0190[un] = true
            } else if (r === '0200') {
              var it = (cols[2] || '').trim()
              linhas0200[it] = true
            } else if (r === 'E110') {
              linhaE110Pronta = cols
            } else if (r === '9900') {
              var regApontado = (cols[2] || '').trim()
              var qtdApontada = parseInt((cols[3] || '0').trim(), 10)
              linhas9900[regApontado] = qtdApontada
            } else if (r === '9990') {
              reg9990Gravado = parseInt((cols[2] || '0').trim(), 10)
            } else if (r === '9999') {
              reg9999Gravado = parseInt((cols[2] || '0').trim(), 10)
            } else if (r.length === 4 && r.endsWith('990')) {
              x990Gravado[r] = parseInt((cols[2] || '0').trim(), 10)
            }
          }

          var partsUsadosLista = Object.keys(dadosUso.participantesUsados || {})
          for (var pu = 0; pu < partsUsadosLista.length; pu++) {
            var cp = partsUsadosLista[pu]
            if (!linhas0150[cp]) {
              ctx.adicionarValidacao(
                'erro',
                'Participante ' +
                  cp +
                  ' utilizado no Bloco C não possui registro 0150 correspondente.',
                '0150',
                cp,
              )
            }
          }

          var itensUsadosLista = Object.keys(dadosUso.itensUsados || {})
          for (var iu = 0; iu < itensUsadosLista.length; iu++) {
            var ci = itensUsadosLista[iu]
            if (!linhas0200[ci]) {
              ctx.adicionarValidacao(
                'erro',
                'Item ' +
                  ci +
                  ' utilizado na movimentação não possui registro 0200 correspondente.',
                '0200',
                ci,
              )
            }
          }

          var unidUsadasLista = Object.keys(dadosUso.unidadesUsadas || {})
          for (var uu = 0; uu < unidUsadasLista.length; uu++) {
            var cu = unidUsadasLista[uu]
            if (!linhas0190[cu]) {
              ctx.adicionarValidacao(
                'erro',
                'Unidade de medida ' + cu + ' utilizada não possui registro 0190 correspondente.',
                '0190',
                cu,
              )
            }
          }

          var codsPart0150 = Object.keys(linhas0150)
          for (var cpIdx = 0; cpIdx < codsPart0150.length; cpIdx++) {
            var codPart0150 = codsPart0150[cpIdx]
            var dadosDocPart = linhas0150[codPart0150]
            if (dadosDocPart.cnpj) {
              if (!validarDVCNPJ(dadosDocPart.cnpj)) {
                ctx.adicionarValidacao(
                  'erro',
                  'Participante ' +
                    codPart0150 +
                    ' possui CNPJ com dígito verificador inválido: ' +
                    dadosDocPart.cnpj,
                  '0150',
                  codPart0150,
                )
              }
            } else if (dadosDocPart.cpf) {
              if (!validarDVCPF(dadosDocPart.cpf)) {
                ctx.adicionarValidacao(
                  'erro',
                  'Participante ' +
                    codPart0150 +
                    ' possui CPF com dígito verificador inválido: ' +
                    dadosDocPart.cpf,
                  '0150',
                  codPart0150,
                )
              }
            } else {
              ctx.adicionarValidacao(
                'erro',
                'Participante ' + codPart0150 + ' não possui CNPJ nem CPF informado.',
                '0150',
                codPart0150,
              )
            }
          }

          var tiposEncontrados = Object.keys(contagemReal)
          for (var te = 0; te < tiposEncontrados.length; te++) {
            var tipoReg = tiposEncontrados[te]
            var qtdReal = contagemReal[tipoReg]
            var qtdInformada9900 = linhas9900[tipoReg]
            if (qtdInformada9900 !== qtdReal) {
              ctx.adicionarValidacao(
                'erro',
                'Contagem do registro 9900 para o tipo ' +
                  tipoReg +
                  ' (' +
                  qtdInformada9900 +
                  ') não confere com as linhas reais do arquivo (' +
                  qtdReal +
                  ').',
                '9900',
                tipoReg,
              )
            }
          }

          var linhasReaisBloco9 = (contagemReal['9001'] || 0) + (contagemReal['9900'] || 0) + 1
          if (reg9990Gravado !== linhasReaisBloco9) {
            ctx.adicionarValidacao(
              'erro',
              'Registro 9990 (' +
                reg9990Gravado +
                ') não confere com a quantidade real de linhas do Bloco 9 (' +
                linhasReaisBloco9 +
                ').',
              '9990',
              String(reg9990Gravado),
            )
          }

          var totalRealLinhasArquivo = linhasArquivoPronto.length
          if (reg9999Gravado !== totalRealLinhasArquivo) {
            ctx.adicionarValidacao(
              'erro',
              'Registro 9999 (' +
                reg9999Gravado +
                ') não confere com a quantidade real total de linhas do arquivo (' +
                totalRealLinhasArquivo +
                ').',
              '9999',
              String(reg9999Gravado),
            )
          }

          var blocosPrefixo = [
            { bloco: '0', regEncerramento: '0990' },
            { bloco: 'B', regEncerramento: 'B990' },
            { bloco: 'C', regEncerramento: 'C990' },
            { bloco: 'D', regEncerramento: 'D990' },
            { bloco: 'E', regEncerramento: 'E990' },
            { bloco: 'G', regEncerramento: 'G990' },
            { bloco: 'H', regEncerramento: 'H990' },
            { bloco: 'K', regEncerramento: 'K990' },
            { bloco: '1', regEncerramento: '1990' },
          ]

          for (var bp = 0; bp < blocosPrefixo.length; bp++) {
            var itemBp = blocosPrefixo[bp]
            var bId = itemBp.bloco
            var encReg = itemBp.regEncerramento
            var linhasReaisDoBloco = 0

            for (var lk = 0; lk < linhasArquivoPronto.length; lk++) {
              var lin = linhasArquivoPronto[lk]
              if (!lin || lin.charAt(0) !== '|') continue
              var cod = lin.split('|')[1] || ''
              if (cod.startsWith(bId)) {
                linhasReaisDoBloco++
              }
            }

            var gravadoX990 = x990Gravado[encReg]
            if (gravadoX990 !== undefined && gravadoX990 !== linhasReaisDoBloco) {
              ctx.adicionarValidacao(
                'erro',
                'Registro ' +
                  encReg +
                  ' (' +
                  gravadoX990 +
                  ') não confere com a quantidade real de linhas do Bloco ' +
                  bId +
                  ' (' +
                  linhasReaisDoBloco +
                  ').',
                encReg,
                String(gravadoX990),
              )
            }
          }

          if (linhaE110Pronta) {
            var vlTotDebRecalc = 0
            var vlTotCredRecalc = 0
            var vlTotAjDebRecalc = 0
            var vlEstornosCredRecalc = 0
            var vlTotAjCredRecalc = 0
            var vlEstornosDebRecalc = 0
            var vlTotDedRecalc = 0
            var debEspRecalc = 0

            for (var er = 0; er < linhasArquivoPronto.length; er++) {
              var linE = linhasArquivoPronto[er]
              if (!linE || linE.charAt(0) !== '|') continue
              var colsE = linE.split('|')
              var rE = colsE[1]

              if (rE === 'C190') {
                var cfopL = (colsE[3] || '').trim()
                var vlIcmsL = parseFloat(String(colsE[7] || '0').replace(',', '.')) || 0
                var primDig = cfopL.charAt(0)
                if (primDig === '5' || primDig === '6' || primDig === '7') {
                  vlTotDebRecalc = round2(vlTotDebRecalc + vlIcmsL)
                } else if (primDig === '1' || primDig === '2' || primDig === '3') {
                  vlTotCredRecalc = round2(vlTotCredRecalc + vlIcmsL)
                }
              } else if (rE === 'E111') {
                var codAjL = (colsE[2] || '').trim()
                var valAjL = parseFloat(String(colsE[4] || '0').replace(',', '.')) || 0
                var qChar = codAjL.length >= 4 ? codAjL.charAt(3) : ''
                if (qChar === '0') vlTotAjDebRecalc = round2(vlTotAjDebRecalc + valAjL)
                else if (qChar === '1') vlEstornosCredRecalc = round2(vlEstornosCredRecalc + valAjL)
                else if (qChar === '2') vlTotAjCredRecalc = round2(vlTotAjCredRecalc + valAjL)
                else if (qChar === '3') vlEstornosDebRecalc = round2(vlEstornosDebRecalc + valAjL)
                else if (qChar === '4') vlTotDedRecalc = round2(vlTotDedRecalc + valAjL)
                else if (qChar === '5') debEspRecalc = round2(debEspRecalc + valAjL)
              }
            }

            var gravadoDeb = parseFloat(String(linhaE110Pronta[2] || '0').replace(',', '.')) || 0
            var gravadoCred = parseFloat(String(linhaE110Pronta[6] || '0').replace(',', '.')) || 0
            var gravadoAjDeb = parseFloat(String(linhaE110Pronta[4] || '0').replace(',', '.')) || 0
            var gravadoEstCred =
              parseFloat(String(linhaE110Pronta[5] || '0').replace(',', '.')) || 0
            var gravadoAjCred = parseFloat(String(linhaE110Pronta[8] || '0').replace(',', '.')) || 0
            var gravadoEstDeb = parseFloat(String(linhaE110Pronta[9] || '0').replace(',', '.')) || 0
            var gravadoSldAnt =
              parseFloat(String(linhaE110Pronta[10] || '0').replace(',', '.')) || 0
            var gravadoSldApur =
              parseFloat(String(linhaE110Pronta[11] || '0').replace(',', '.')) || 0
            var gravadoTotDed =
              parseFloat(String(linhaE110Pronta[12] || '0').replace(',', '.')) || 0
            var gravadoRecolher =
              parseFloat(String(linhaE110Pronta[13] || '0').replace(',', '.')) || 0
            var gravadoTransportar =
              parseFloat(String(linhaE110Pronta[14] || '0').replace(',', '.')) || 0
            var gravadoDebEsp =
              parseFloat(String(linhaE110Pronta[15] || '0').replace(',', '.')) || 0

            var resRecalc = round2(
              vlTotDebRecalc +
                vlTotAjDebRecalc +
                vlEstornosCredRecalc -
                (vlTotCredRecalc + vlTotAjCredRecalc + vlEstornosDebRecalc + gravadoSldAnt),
            )
            var sldApurRecalc = resRecalc >= 0 ? resRecalc : 0
            var sldTranspRecalc = resRecalc < 0 ? Math.abs(resRecalc) : 0
            var recolherRecalc =
              resRecalc >= 0 ? Math.max(0, round2(sldApurRecalc - vlTotDedRecalc)) : 0

            var difDeb = Math.abs(round2(gravadoDeb - vlTotDebRecalc))
            var difCred = Math.abs(round2(gravadoCred - vlTotCredRecalc))
            var difApur = Math.abs(round2(gravadoSldApur - sldApurRecalc))
            var difRecol = Math.abs(round2(gravadoRecolher - recolherRecalc))
            var difTransp = Math.abs(round2(gravadoTransportar - sldTranspRecalc))

            if (
              difDeb > 0.01 ||
              difCred > 0.01 ||
              difApur > 0.01 ||
              difRecol > 0.01 ||
              difTransp > 0.01
            ) {
              ctx.adicionarValidacao(
                'erro',
                'Recálculo da apuração E110 a partir dos registros do arquivo diverge dos valores gravados (Débitos gravados: ' +
                  gravadoDeb.toFixed(2) +
                  ' vs recalc: ' +
                  vlTotDebRecalc.toFixed(2) +
                  '; Créditos gravados: ' +
                  gravadoCred.toFixed(2) +
                  ' vs recalc: ' +
                  vlTotCredRecalc.toFixed(2) +
                  ').',
                'E110',
              )
            }
          }
        }

        function gerarArquivoCompleto(params) {
          var ctx = criarContexto(params)

          var ieEmpresa = SpedFormato.formatarDigitos(ctx.empresa.getString('inscricao_estadual'))
          var ieTexto = (ctx.empresa.getString('inscricao_estadual') || '').trim().toUpperCase()
          if (ctx.modo === 'Oficial') {
            if (!ieEmpresa || ieTexto === 'ISENTO' || !/^\d+$/.test(ieEmpresa)) {
              ctx.adicionarValidacao(
                'erro',
                'Empresa sem Inscrição Estadual numérica no modo Oficial (IE: "' + ieTexto + '").',
                '0000',
                ieTexto,
              )
            }
          }

          var linhasB = gerarBlocoB(ctx)
          var linhasC = gerarBlocoC(ctx)
          var linhasD = gerarBlocoD(ctx)
          var linhasE = gerarBlocoE(ctx)
          var linhasG = gerarBlocoG(ctx)
          var linhasH = gerarBlocoH(ctx)
          var linhasK = gerarBlocoK(ctx)
          var linhas1 = gerarBloco1(ctx)

          var linhasOperacionais = []
          linhasOperacionais = linhasOperacionais.concat(linhasB)
          linhasOperacionais = linhasOperacionais.concat(linhasC)
          linhasOperacionais = linhasOperacionais.concat(linhasD)
          linhasOperacionais = linhasOperacionais.concat(linhasE)
          linhasOperacionais = linhasOperacionais.concat(linhasG)
          linhasOperacionais = linhasOperacionais.concat(linhasH)
          linhasOperacionais = linhasOperacionais.concat(linhasK)
          linhasOperacionais = linhasOperacionais.concat(linhas1)

          var dadosUso = executarValidacaoInternaPreFechamento(ctx, linhasOperacionais)
          var linhas0 = gerarBloco0(ctx)

          var linhasAntes9 = []
          linhasAntes9 = linhasAntes9.concat(linhas0)
          linhasAntes9 = linhasAntes9.concat(linhasOperacionais)

          var res9 = gerarBloco9(linhasAntes9)
          var linhasFinais = linhasAntes9.concat(res9.linhas)

          executarValidacaoInternaPosMontagem(ctx, linhasFinais, dadosUso)

          var conteudoTexto = linhasFinais.join('')
          var tamanhoBytes = 0
          try {
            tamanhoBytes = Buffer.byteLength(conteudoTexto, 'utf-8')
          } catch (_) {
            tamanhoBytes = conteudoTexto.length
          }
          if (tamanhoBytes > 4 * 1024 * 1024) {
            var mbTamanho = (tamanhoBytes / (1024 * 1024)).toFixed(2)
            ctx.adicionarValidacao(
              'aviso',
              'Arquivo SPED ultrapassou 4 MB (' +
                mbTamanho +
                ' MB). O PVA pode demorar mais para validar.',
              '9999',
              mbTamanho + ' MB',
            )
          }

          var cnpjDig =
            SpedFormato.formatarDigitos(ctx.empresa.getString('cnpj')) || '00000000000000'
          var periodoSemHifen = ctx.periodo.replace('-', '')
          var nomeArquivo = 'SPED_EFD_' + cnpjDig + '_' + periodoSemHifen + '.txt'
          if (ctx.modo === 'Teste') {
            nomeArquivo = 'TESTE_' + nomeArquivo
          }

          var temErros = false
          for (var v = 0; v < ctx.validacoes.length; v++) {
            if (ctx.validacoes[v].nivel === 'erro') {
              temErros = true
              break
            }
          }

          var status = temErros ? 'Gerado com erros' : 'Gerado'

          return {
            conteudo: conteudoTexto,
            nomeArquivo: nomeArquivo,
            quantidadeLinhas: linhasFinais.length,
            contagemRegistros: res9.contagem,
            validacoes: ctx.validacoes,
            status: status,
            temErros: temErros,
            resumoSaida: ctx.resumoSaida || null,
            resumoEntrada: ctx.resumoEntrada || null,
            resumoApuracao: ctx.resumoApuracao || null,
            ctx: ctx,
          }
        }

        // --- BLOCO C ---
        function gerarBlocoC(ctx) {
          var linhas = []
          var empresaId = ctx.empresa.id

          var c190Registros = []
          var c101Registros = []

          var totalNfe = 0
          var totalNfce = 0
          var totalCanceladas = 0
          var totalDenegadas = 0
          var totalInutilizadas = 0
          var totalVlDoc = 0
          var totalVlIcms = 0

          var regimeApuracaoEmpresa = (ctx.empresa.getString('regime_apuracao') || '').trim()
          var crtRaw = ctx.empresa.get('crt')
          var crt = crtRaw !== null && crtRaw !== undefined && crtRaw !== '' ? Number(crtRaw) : null
          var ehSimples = regimeApuracaoEmpresa
            ? regimeApuracaoEmpresa === 'Simples Nacional'
            : crt === 1 || crt === 2 || crt === 4

          var incluirHomologacaoEmTeste = true
          if (ctx.configSped) {
            if (ctx.configSped.getBool('incluir_homologacao_em_teste') === false) {
              incluirHomologacaoEmTeste = false
            }
          }

          var arquivosEntreguesPeriodo = []
          try {
            arquivosEntreguesPeriodo = $app.findRecordsByFilter(
              'sped_arquivos',
              "empresa_id = '" +
                empresaId +
                "' && periodo = '" +
                ctx.periodo +
                "' && status = 'Entregue'",
              '-entregue_em',
              50,
              0,
            )
          } catch (_) {}

          var docsBrutos = []
          try {
            docsBrutos = $app.findRecordsByFilter(
              'documentos_fiscais',
              "empresa_id = '" +
                empresaId +
                "' && (modelo = '55' || modelo = '65') && ativo = true",
              'data_emissao,numero',
              10000,
              0,
            )
          } catch (errDocs) {
            ctx.adicionarValidacao(
              'erro',
              'Falha ao carregar documentos fiscais: ' + (errDocs.message || errDocs),
              'C100',
            )
          }

          var docsPeriodo = []
          for (var d = 0; d < docsBrutos.length; d++) {
            var doc = docsBrutos[d]
            var dtEmissaoStr = doc.getString('data_emissao') || doc.getString('created')
            var dtBsb = extrairDataBrasilia(dtEmissaoStr)
            if (!dtBsb) continue

            if (dtBsb.ano !== ctx.ano || dtBsb.mes !== ctx.mes) {
              continue
            }

            var statusDoc = doc.getString('status') || 'Rascunho'
            var numDoc = doc.getInt('numero') || 0
            var modeloDoc = doc.getString('modelo') || '55'
            var ambienteDoc = doc.getString('ambiente') || 'Homologação'

            if (ctx.modo === 'Oficial') {
              if (ambienteDoc !== 'Produção') {
                continue
              }
            } else {
              if (ambienteDoc !== 'Produção' && !incluirHomologacaoEmTeste) {
                continue
              }
            }

            if (statusDoc === 'Rascunho' || statusDoc === 'Rejeitada') {
              continue
            }

            if (statusDoc === 'Processando') {
              ctx.adicionarValidacao(
                'aviso',
                'Documento fiscal ' +
                  modeloDoc +
                  ' nº ' +
                  numDoc +
                  ' permaneceu com status "Processando" ao fim do período ' +
                  ctx.periodo +
                  '.',
                'C100',
                String(numDoc),
              )
              continue
            }

            if (
              statusDoc === 'Autorizada' ||
              statusDoc === 'Cancelada' ||
              statusDoc === 'Denegada'
            ) {
              docsPeriodo.push({
                rec: doc,
                dtBsb: dtBsb,
              })
            }
          }

          var inutsPeriodo = []
          try {
            var inutsBrutas = $app.findRecordsByFilter(
              'inutilizacoes',
              "empresa_id = '" + empresaId + "'",
              'created',
              1000,
              0,
            )
            for (var u = 0; u < inutsBrutas.length; u++) {
              var inut = inutsBrutas[u]
              var dtInutStr = inut.getString('data_inutilizacao') || inut.getString('created')
              var dtInutBsb = extrairDataBrasilia(dtInutStr)
              if (!dtInutBsb) continue
              if (dtInutBsb.ano !== ctx.ano || dtInutBsb.mes !== ctx.mes) continue

              var stInut = (inut.getString('status') || '').toLowerCase()
              if (stInut !== 'autorizada' && stInut !== 'homologada' && stInut !== 'sucesso') {
                continue
              }

              var colInut = inut.collection()
              var temCampoAmb = colInut && colInut.fields.getByName('ambiente')
              if (temCampoAmb && ctx.modo === 'Oficial') {
                var ambInut = inut.getString('ambiente')
                if (ambInut && ambInut !== 'Produção') {
                  continue
                }
              }

              inutsPeriodo.push(inut)
            }
          } catch (errInut) {
            console.warn('Erro ao carregar inutilizacoes:', errInut)
          }

          var chavesProcessadasBlocoC = {}

          var totalCompras = 0
          var totalTransferenciasRecebidas = 0
          var totalVlDocEntrada = 0
          var totalVlCreditoIcms = 0

          var ehContribuinteIpi = ctx.empresa.getBool('contribuinte_ipi') === true

          var c100Linhas = []

          for (var idx = 0; idx < docsPeriodo.length; idx++) {
            var itemDoc = docsPeriodo[idx]
            var rec = itemDoc.rec
            var status = rec.getString('status')
            var modelo = rec.getString('modelo') || '55'
            var serie = rec.getString('serie') || '1'
            var numero = rec.getInt('numero') || 0
            var chaveAcesso = SpedFormato.formatarDigitos(rec.getString('chave_acesso'))
            if (chaveAcesso) {
              chavesProcessadasBlocoC[chaveAcesso] = true
            }
            var tipoDocumento = rec.getInt('tipo_documento')
            var indOper = tipoDocumento === 0 ? '0' : '1'
            var indEmit = '0'

            if (modelo === '65') {
              totalNfce++
            } else {
              totalNfe++
            }

            var codSit = '00'
            if (status === 'Cancelada') {
              codSit = '02'
              totalCanceladas++
            } else if (status === 'Denegada') {
              codSit = '04'
              totalDenegadas++
            }

            if (status === 'Cancelada' && arquivosEntreguesPeriodo.length > 0) {
              var dtCancStr = rec.getString('cancelada_em') || rec.getString('updated')
              var dtCanc = dtCancStr ? new Date(dtCancStr) : null
              for (var ae = 0; ae < arquivosEntreguesPeriodo.length; ae++) {
                var arqEnt = arquivosEntreguesPeriodo[ae]
                var dtEntStr = arqEnt.getString('entregue_em') || arqEnt.getString('created')
                var dtEnt = dtEntStr ? new Date(dtEntStr) : null
                if (dtCanc && dtEnt && dtCanc.getTime() > dtEnt.getTime()) {
                  ctx.adicionarValidacao(
                    'aviso',
                    'Nota ' +
                      modelo +
                      ' nº ' +
                      numero +
                      ' cancelada após a entrega do SPED anterior, é preciso retificar.',
                    'C100',
                    String(numero),
                  )
                  break
                }
              }
            }

            if (status === 'Cancelada' || status === 'Denegada') {
              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C100',
                  indOper,
                  indEmit,
                  '',
                  modelo,
                  codSit,
                  serie,
                  String(numero),
                  chaveAcesso,
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                ]),
              )
              continue
            }

            var dtEmissaoSped = SpedFormato.formatarData(
              rec.getString('data_emissao') || rec.getString('created'),
            )

            var codPart = ''
            var origemDoc = rec.getString('origem') || ''
            var clienteId = rec.getString('cliente_id')
            var fornecedorId = rec.getString('fornecedor_id')

            if (modelo === '65') {
              codPart = ''
            } else {
              if (origemDoc === 'Transferência' || origemDoc === 'Transferencia') {
                var empDestId = ''
                if (rec.getString('origem_id')) {
                  try {
                    var trfRec = $app.findRecordById('transferencias', rec.getString('origem_id'))
                    empDestId = trfRec.getString('empresa_destino_id')
                  } catch (_) {}
                }
                if (empDestId) {
                  codPart = 'E' + empDestId
                  ctx.registrarParticipante('E', empDestId)
                } else if (clienteId) {
                  codPart = 'C' + clienteId
                  ctx.registrarParticipante('C', clienteId)
                }
              } else if (
                origemDoc === 'Devolução de compra' ||
                origemDoc === 'Devolucao de compra'
              ) {
                if (fornecedorId) {
                  codPart = 'F' + fornecedorId
                  ctx.registrarParticipante('F', fornecedorId)
                } else if (rec.getString('origem_id')) {
                  try {
                    var neRec = $app.findRecordById('notas_entrada', rec.getString('origem_id'))
                    var fId = neRec.getString('fornecedor_id')
                    if (fId) {
                      codPart = 'F' + fId
                      ctx.registrarParticipante('F', fId)
                    }
                  } catch (_) {}
                }
              } else {
                if (clienteId) {
                  codPart = 'C' + clienteId
                  ctx.registrarParticipante('C', clienteId)
                } else if (rec.getString('venda_id')) {
                  try {
                    var vRec = $app.findRecordById('vendas', rec.getString('venda_id'))
                    var cId = vRec.getString('cliente_id')
                    if (cId) {
                      codPart = 'C' + cId
                      ctx.registrarParticipante('C', cId)
                    }
                  } catch (_) {}
                }
              }
            }

            var indPgto = '2'
            if (rec.getString('venda_id')) {
              try {
                var parcelasRecs = $app.findRecordsByFilter(
                  'contas_receber',
                  "origem_id = '" + rec.getString('venda_id') + "' && ativo = true",
                  'data_vencimento',
                  100,
                  0,
                )
                if (parcelasRecs && parcelasRecs.length > 0) {
                  var temPrazo = false
                  var dtVendaIso = itemDoc.dtBsb.isoDia
                  for (var p = 0; p < parcelasRecs.length; p++) {
                    var dv = (parcelasRecs[p].getString('data_vencimento') || '').substring(0, 10)
                    if (dv && dv > dtVendaIso) {
                      temPrazo = true
                      break
                    }
                  }
                  indPgto = temPrazo ? '1' : '0'
                } else {
                  indPgto = '0'
                }
              } catch (_) {
                indPgto = '2'
              }
            } else {
              indPgto = '2'
            }

            var indFrt = '9'
            var jsonEnv = rec.get('json_enviado')
            if (jsonEnv) {
              try {
                var payloadParsed = typeof jsonEnv === 'string' ? JSON.parse(jsonEnv) : jsonEnv
                if (
                  payloadParsed &&
                  payloadParsed.modalidade_frete !== undefined &&
                  payloadParsed.modalidade_frete !== null
                ) {
                  indFrt = String(payloadParsed.modalidade_frete)
                }
              } catch (_) {}
            }

            var vlDoc = round2(rec.getFloat('valor_total') || 0)
            var vlDesc = round2(rec.getFloat('valor_desconto') || 0)
            var vlAbatNt = '0,00'
            var vlMerc = round2(rec.getFloat('valor_produtos') || 0)
            var vlFrt = round2(rec.getFloat('valor_frete') || 0)
            var vlSeg = round2(rec.getFloat('valor_seguro') || 0)
            var vlOutDa = round2(rec.getFloat('valor_outras_despesas') || 0)
            var vlBcIcms = round2(rec.getFloat('base_icms') || 0)
            var vlIcms = round2(rec.getFloat('valor_icms') || 0)
            var vlBcIcmsSt = round2(rec.getFloat('base_icms_st') || 0)
            var vlIcmsSt = round2(rec.getFloat('valor_icms_st') || 0)
            var vlIpi = round2(rec.getFloat('valor_ipi') || 0)
            var vlPis = round2(rec.getFloat('valor_pis') || 0)
            var vlCofins = round2(rec.getFloat('valor_cofins') || 0)

            totalVlDoc = round2(totalVlDoc + vlDoc)
            totalVlIcms = round2(totalVlIcms + vlIcms)

            var sBcIcmsSt = modelo === '65' ? '' : SpedFormato.formatarValor(vlBcIcmsSt)
            var sIcmsSt = modelo === '65' ? '' : SpedFormato.formatarValor(vlIcmsSt)
            var sIpi = modelo === '65' ? '' : SpedFormato.formatarValor(vlIpi)
            var sPis = modelo === '65' ? '' : SpedFormato.formatarValor(vlPis)
            var sCofins = modelo === '65' ? '' : SpedFormato.formatarValor(vlCofins)

            c100Linhas.push(
              SpedFormato.montarLinha([
                'C100',
                indOper,
                indEmit,
                codPart,
                modelo,
                codSit,
                serie,
                String(numero),
                chaveAcesso,
                dtEmissaoSped,
                dtEmissaoSped,
                SpedFormato.formatarValor(vlDoc),
                indPgto,
                SpedFormato.formatarValor(vlDesc),
                vlAbatNt,
                SpedFormato.formatarValor(vlMerc),
                indFrt,
                SpedFormato.formatarValor(vlFrt),
                SpedFormato.formatarValor(vlSeg),
                SpedFormato.formatarValor(vlOutDa),
                SpedFormato.formatarValor(vlBcIcms),
                SpedFormato.formatarValor(vlIcms),
                sBcIcmsSt,
                sIcmsSt,
                sIpi,
                sPis,
                sCofins,
                '',
                '',
              ]),
            )

            var vlFcpUfDest = round2(rec.getFloat('valor_fcp_uf_destino') || 0)
            var vlIcmsUfDest = round2(rec.getFloat('valor_icms_uf_destino') || 0)
            var vlIcmsUfRem = round2(rec.getFloat('valor_icms_uf_remetente') || 0)

            if (modelo === '55' && (vlFcpUfDest > 0 || vlIcmsUfDest > 0 || vlIcmsUfRem > 0)) {
              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C101',
                  SpedFormato.formatarValor(vlFcpUfDest),
                  SpedFormato.formatarValor(vlIcmsUfDest),
                  SpedFormato.formatarValor(vlIcmsUfRem),
                ]),
              )

              var ufDestC101 = extrairUfDestinoDoc(rec)
              var tipoOperC101 = indOper === '0' ? 'devolucao_venda' : 'saida'
              var dtEmissaoDocIso = itemDoc.dtBsb ? itemDoc.dtBsb.isoDia : ''
              c101Registros.push({
                uf: ufDestC101,
                tipo: tipoOperC101,
                dtEmissaoIso: dtEmissaoDocIso,
                vlFcpUfDest: vlFcpUfDest,
                vlIcmsUfDest: vlIcmsUfDest,
                vlIcmsUfRem: vlIcmsUfRem,
              })
            }

            var itensDoc = []
            try {
              itensDoc = $app.findRecordsByFilter(
                'documentos_fiscais_itens',
                "documento_id = '" + rec.id + "'",
                'item',
                500,
                0,
              )
            } catch (errItens) {
              ctx.adicionarValidacao(
                'erro',
                'Falha ao carregar itens da nota ' + numero + ': ' + (errItens.message || errItens),
                'C190',
                String(numero),
              )
            }

            var gruposC190 = {}
            var somaVlOprDoc = 0

            for (var it = 0; it < itensDoc.length; it++) {
              var item = itensDoc[it]
              var origItem = SpedFormato.formatarDigitos(item.getString('origem')) || '0'
              var cstItem = SpedFormato.formatarDigitos(item.getString('cst_icms'))
              var csosnItem = SpedFormato.formatarDigitos(item.getString('csosn'))

              var prodIdItem = item.getString('produto_id')
              if (prodIdItem) {
                ctx.registrarItem(prodIdItem)
              }
              var unItem = item.getString('unidade')
              if (unItem) {
                ctx.registrarUnidade(unItem)
              }

              var cstFinal = ''
              if (ehSimples) {
                if (!csosnItem && cstItem) {
                  csosnItem = cstItem.length === 2 ? '1' + cstItem : '102'
                }
                if (!csosnItem) csosnItem = '102'
                cstFinal = origItem.substring(0, 1) + csosnItem
              } else {
                if (!cstItem && csosnItem) {
                  cstItem = csosnItem.length >= 2 ? csosnItem.slice(-2) : '00'
                }
                if (!cstItem) cstItem = '00'
                if (cstItem.length === 1) cstItem = '0' + cstItem
                cstFinal = origItem.substring(0, 1) + cstItem
              }

              var cfopItem = SpedFormato.formatarDigitos(item.getString('cfop')) || '5102'
              var aliqIcmsItem = round2(item.getFloat('aliquota_icms') || 0)

              var vTotItem = round2(item.getFloat('valor_total') || 0)
              var vIcmsStItem = round2(item.getFloat('valor_icms_st') || 0)
              var vFcpStItem = round2(item.getFloat('valor_fcp_st') || 0)
              var vIpiItem = round2(item.getFloat('valor_ipi') || 0)

              var vlOprItem = round2(vTotItem + vIcmsStItem + vFcpStItem + vIpiItem)

              var bcIcmsItem = round2(item.getFloat('base_icms') || 0)
              var vIcmsItem = round2(item.getFloat('valor_icms') || 0)
              var bcStItem = round2(item.getFloat('base_icms_st') || 0)
              var redBcItem = round2(item.getFloat('reducao_bc_icms') || 0)

              var vlRedBcItem = 0
              if (redBcItem > 0 && redBcItem < 100 && bcIcmsItem > 0) {
                var baseIntegral = round2(bcIcmsItem / (1 - redBcItem / 100))
                vlRedBcItem = Math.max(0, round2(baseIntegral - bcIcmsItem))
              }

              var chaveGrupo = cstFinal + '|' + cfopItem + '|' + aliqIcmsItem.toFixed(2)
              if (!gruposC190[chaveGrupo]) {
                gruposC190[chaveGrupo] = {
                  cst: cstFinal,
                  cfop: cfopItem,
                  aliqIcms: aliqIcmsItem,
                  vlOpr: 0,
                  vlBcIcms: 0,
                  vlIcms: 0,
                  vlBcIcmsSt: 0,
                  vlIcmsSt: 0,
                  vlRedBc: 0,
                  vlIpi: 0,
                }
              }

              var g = gruposC190[chaveGrupo]
              g.vlOpr = round2(g.vlOpr + vlOprItem)
              g.vlBcIcms = round2(g.vlBcIcms + bcIcmsItem)
              g.vlIcms = round2(g.vlIcms + vIcmsItem)
              g.vlBcIcmsSt = round2(g.vlBcIcmsSt + bcStItem)
              g.vlIcmsSt = round2(g.vlIcmsSt + vIcmsStItem)
              g.vlRedBc = round2(g.vlRedBc + vlRedBcItem)
              g.vlIpi = round2(g.vlIpi + vIpiItem)
            }

            var chavesGrupo = Object.keys(gruposC190).sort()
            for (var cg = 0; cg < chavesGrupo.length; cg++) {
              var grp = gruposC190[chavesGrupo[cg]]
              somaVlOprDoc = round2(somaVlOprDoc + grp.vlOpr)

              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C190',
                  grp.cst,
                  grp.cfop,
                  grp.aliqIcms > 0 ? SpedFormato.formatarValor(grp.aliqIcms) : '',
                  SpedFormato.formatarValor(grp.vlOpr),
                  SpedFormato.formatarValor(grp.vlBcIcms),
                  SpedFormato.formatarValor(grp.vlIcms),
                  SpedFormato.formatarValor(grp.vlBcIcmsSt),
                  SpedFormato.formatarValor(grp.vlIcmsSt),
                  SpedFormato.formatarValor(grp.vlRedBc),
                  SpedFormato.formatarValor(grp.vlIpi),
                  '',
                ]),
              )

              c190Registros.push({
                indOper: indOper,
                cst: grp.cst,
                cfop: grp.cfop,
                aliqIcms: grp.aliqIcms,
                vlOpr: grp.vlOpr,
                vlBcIcms: grp.vlBcIcms,
                vlIcms: grp.vlIcms,
                vlBcIcmsSt: grp.vlBcIcmsSt,
                vlIcmsSt: grp.vlIcmsSt,
                vlRedBc: grp.vlRedBc,
                vlIpi: grp.vlIpi,
              })
            }

            var difVlOpr = Math.abs(round2(somaVlOprDoc - vlDoc))
            if (itensDoc.length > 0 && difVlOpr > 0.01) {
              ctx.adicionarValidacao(
                'aviso',
                'Soma do valor das operações dos registros analíticos C190 (R$ ' +
                  somaVlOprDoc.toFixed(2) +
                  ') diverge do VL_DOC da nota ' +
                  modelo +
                  ' nº ' +
                  numero +
                  ' (R$ ' +
                  vlDoc.toFixed(2) +
                  ').',
                'C190',
                String(numero),
              )
            }
          }

          var notasEntradaBrutas = []
          try {
            notasEntradaBrutas = $app.findRecordsByFilter(
              'notas_entrada',
              "empresa_id = '" + empresaId + "' && status = 'Lançada' && ativo = true",
              'data_entrada,numero',
              10000,
              0,
            )
          } catch (errNe) {
            ctx.adicionarValidacao(
              'erro',
              'Falha ao carregar notas de entrada: ' + (errNe.message || errNe),
              'C100',
            )
          }

          for (var neIdx = 0; neIdx < notasEntradaBrutas.length; neIdx++) {
            var ne = notasEntradaBrutas[neIdx]
            var dtEntradaStr = ne.getString('data_entrada') || ne.getString('created')
            var dtEntBsb = extrairDataBrasilia(dtEntradaStr)
            if (!dtEntBsb) continue
            if (dtEntBsb.ano !== ctx.ano || dtEntBsb.mes !== ctx.mes) continue

            var modeloNe = ne.getString('modelo') || '55'
            var sitDocNe = ne.getString('situacao_documento') || '00'
            var numNe = ne.getInt('numero') || 0
            var serNe = ne.getString('serie') || '1'
            var chvNe = SpedFormato.formatarDigitos(ne.getString('chave_acesso'))

            if (modeloNe !== '55' && modeloNe !== '01' && modeloNe !== '1B' && modeloNe !== '04') {
              ctx.adicionarValidacao(
                'aviso',
                'Nota de entrada nº ' +
                  numNe +
                  ' possui modelo "' +
                  modeloNe +
                  '" não suportado na escrituração do SPED Fiscal e não foi incluída.',
                'C100',
                String(numNe),
              )
              continue
            }

            if (sitDocNe === '02') {
              continue
            }

            var codSitNe = '00'
            if (sitDocNe === '08') {
              codSitNe = '08'
            }

            if (chvNe) {
              chavesProcessadasBlocoC[chvNe] = true
            }

            var fornIdNe = ne.getString('fornecedor_id')
            var codPartNe = ''
            if (fornIdNe) {
              codPartNe = 'F' + fornIdNe
              ctx.registrarParticipante('F', fornIdNe)
            } else {
              ctx.adicionarValidacao(
                'erro',
                'Nota de entrada nº ' + numNe + ' não possui fornecedor informado.',
                'C100',
                String(numNe),
              )
            }

            var chvNeFinal = modeloNe === '55' ? chvNe : ''

            var dtDocNeSped = SpedFormato.formatarData(
              ne.getString('data_emissao') || ne.getString('data_entrada'),
            )
            var dtEntNeSped = SpedFormato.formatarData(dtEntradaStr)

            var indPgtoNe = String(ne.getInt('indicador_pagamento') || 0)
            if (indPgtoNe !== '0' && indPgtoNe !== '1' && indPgtoNe !== '2') indPgtoNe = '0'

            var indFrtNe = String(ne.getInt('modalidade_frete') || 9)
            if (['0', '1', '2', '3', '4', '9'].indexOf(indFrtNe) === -1) indFrtNe = '9'

            var vlDocNe = round2(ne.getFloat('valor_total') || 0)
            var vlDescNe = round2(ne.getFloat('valor_desconto') || 0)
            var vlMercNe = round2(ne.getFloat('valor_produtos') || 0)
            var vlFrtNe = round2(ne.getFloat('valor_frete') || 0)
            var vlSegNe = round2(ne.getFloat('valor_seguro') || 0)
            var vlOutDaNe = round2(ne.getFloat('valor_outras_despesas') || 0)

            var vlBcIcmsStNe = round2(ne.getFloat('base_icms_st') || 0)
            var vlIcmsStNe = round2(ne.getFloat('valor_icms_st') || 0)

            var itensNe = []
            try {
              itensNe = $app.findRecordsByFilter(
                'notas_entrada_itens',
                "nota_id = '" + ne.id + "' && ativo = true",
                'numero_item',
                1000,
                0,
              )
            } catch (errItNe) {
              ctx.adicionarValidacao(
                'erro',
                'Falha ao carregar itens da nota de entrada nº ' +
                  numNe +
                  ': ' +
                  (errItNe.message || errItNe),
                'C170',
                String(numNe),
              )
            }

            var somaCreditoBcIcmsNe = 0
            var somaCreditoIcmsNe = 0
            var somaCreditoIpiNe = 0
            var somaCreditoPisNe = 0
            var somaCreditoCofinsNe = 0
            var somaValorProdutoItensNe = 0

            for (var itC = 0; itC < itensNe.length; itC++) {
              var itChecagem = itensNe[itC]
              somaValorProdutoItensNe = round2(
                somaValorProdutoItensNe + (itChecagem.getFloat('valor_produto') || 0),
              )
              if (itChecagem.getBool('aproveita_credito_icms')) {
                somaCreditoBcIcmsNe = round2(
                  somaCreditoBcIcmsNe + (itChecagem.getFloat('base_icms') || 0),
                )
                somaCreditoIcmsNe = round2(
                  somaCreditoIcmsNe + (itChecagem.getFloat('valor_credito_icms') || 0),
                )
              }
              if (ehContribuinteIpi && itChecagem.getBool('aproveita_credito_ipi')) {
                somaCreditoIpiNe = round2(
                  somaCreditoIpiNe + (itChecagem.getFloat('valor_credito_ipi') || 0),
                )
              }
              var cPis = round2(itChecagem.getFloat('valor_credito_pis') || 0)
              var cCof = round2(itChecagem.getFloat('valor_credito_cofins') || 0)
              if (cPis > 0) somaCreditoPisNe = round2(somaCreditoPisNe + cPis)
              if (cCof > 0) somaCreditoCofinsNe = round2(somaCreditoCofinsNe + cCof)
            }

            totalCompras++
            totalVlDocEntrada = round2(totalVlDocEntrada + vlDocNe)
            totalVlCreditoIcms = round2(totalVlCreditoIcms + somaCreditoIcmsNe)

            c100Linhas.push(
              SpedFormato.montarLinha([
                'C100',
                '0',
                '1',
                codPartNe,
                modeloNe,
                codSitNe,
                serNe,
                String(numNe),
                chvNeFinal,
                dtDocNeSped,
                dtEntNeSped,
                SpedFormato.formatarValor(vlDocNe),
                indPgtoNe,
                SpedFormato.formatarValor(vlDescNe),
                '0,00',
                SpedFormato.formatarValor(vlMercNe),
                indFrtNe,
                SpedFormato.formatarValor(vlFrtNe),
                SpedFormato.formatarValor(vlSegNe),
                SpedFormato.formatarValor(vlOutDaNe),
                SpedFormato.formatarValor(somaCreditoBcIcmsNe),
                SpedFormato.formatarValor(somaCreditoIcmsNe),
                SpedFormato.formatarValor(vlBcIcmsStNe),
                SpedFormato.formatarValor(vlIcmsStNe),
                SpedFormato.formatarValor(somaCreditoIpiNe),
                somaCreditoPisNe > 0 ? SpedFormato.formatarValor(somaCreditoPisNe) : '',
                somaCreditoCofinsNe > 0 ? SpedFormato.formatarValor(somaCreditoCofinsNe) : '',
                '',
                '',
              ]),
            )

            var totFrtNe = round2(ne.getFloat('valor_frete') || 0)
            var totSegNe = round2(ne.getFloat('valor_seguro') || 0)
            var totOutNe = round2(ne.getFloat('valor_outras_despesas') || 0)
            var totStNe = round2(ne.getFloat('valor_icms_st') || 0)
            var totFcpStNe = round2(ne.getFloat('valor_fcp_st') || 0)
            var totIpiNe = round2(ne.getFloat('valor_ipi') || 0)
            var totDescNe = round2(ne.getFloat('valor_desconto') || 0)

            var itensCalculadosNe = []
            var acumFrtNe = 0
            var acumSegNe = 0
            var acumOutNe = 0
            var acumStNe = 0
            var acumFcpStNe = 0
            var acumIpiNe = 0
            var acumDescNe = 0

            for (var itIdx = 0; itIdx < itensNe.length; itIdx++) {
              var itRec = itensNe[itIdx]
              var numItem = itRec.getInt('numero_item') || itIdx + 1
              var prodIdVinculado = itRec.getString('produto_id')

              if (!prodIdVinculado) {
                ctx.adicionarValidacao(
                  'erro',
                  'Item ' +
                    numItem +
                    ' da nota de entrada nº ' +
                    numNe +
                    ' não possui produto vinculado no catálogo.',
                  'C170',
                  String(numNe),
                )
              } else {
                ctx.registrarItem(prodIdVinculado)
              }

              var codItemP = ''
              var unidItemP = 'UN'
              if (prodIdVinculado) {
                try {
                  var pRec = $app.findRecordById('produtos', prodIdVinculado)
                  codItemP = String(pRec.getInt('codigo') || pRec.id)
                  var uId = pRec.getString('unidade_id')
                  if (uId) {
                    try {
                      var unP2 = $app.findRecordById('unidades_medida', uId)
                      unidItemP = unP2.getString('sigla')
                    } catch (_) {
                      unidItemP = uId
                    }
                  }
                  ctx.registrarUnidade(unidItemP)
                } catch (_) {
                  codItemP = prodIdVinculado
                }
              }

              var qtdEstoque =
                itRec.getFloat('quantidade_estoque') || itRec.getFloat('quantidade_fornecedor') || 0
              var vlProdItem = round2(itRec.getFloat('valor_produto') || 0)
              var vlDescItem = round2(itRec.getFloat('valor_desconto') || 0)

              var proporcao =
                somaValorProdutoItensNe > 0
                  ? vlProdItem / somaValorProdutoItensNe
                  : 1 / itensNe.length
              var frtItem = round2(itRec.getFloat('valor_frete') || 0)
              var segItem = round2(itRec.getFloat('valor_seguro') || 0)
              var outItem = round2(itRec.getFloat('valor_outras') || 0)
              var stItem = round2(itRec.getFloat('valor_icms_st') || 0)
              var fcpStItem = round2(itRec.getFloat('valor_fcp_st') || 0)
              var ipiItem = round2(itRec.getFloat('valor_ipi') || 0)

              var ehUltimoItem = itIdx === itensNe.length - 1

              if (totFrtNe > 0 && frtItem === 0) {
                frtItem = ehUltimoItem ? round2(totFrtNe - acumFrtNe) : round2(totFrtNe * proporcao)
              }
              acumFrtNe = round2(acumFrtNe + frtItem)

              if (totSegNe > 0 && segItem === 0) {
                segItem = ehUltimoItem ? round2(totSegNe - acumSegNe) : round2(totSegNe * proporcao)
              }
              acumSegNe = round2(acumSegNe + segItem)

              if (totOutNe > 0 && outItem === 0) {
                outItem = ehUltimoItem ? round2(totOutNe - acumOutNe) : round2(totOutNe * proporcao)
              }
              acumOutNe = round2(acumOutNe + outItem)

              if (totStNe > 0 && stItem === 0) {
                stItem = ehUltimoItem ? round2(totStNe - acumStNe) : round2(totStNe * proporcao)
              }
              acumStNe = round2(acumStNe + stItem)

              if (totFcpStNe > 0 && fcpStItem === 0) {
                fcpStItem = ehUltimoItem
                  ? round2(totFcpStNe - acumFcpStNe)
                  : round2(totFcpStNe * proporcao)
              }
              acumFcpStNe = round2(acumFcpStNe + fcpStItem)

              if (totIpiNe > 0 && ipiItem === 0) {
                ipiItem = ehUltimoItem ? round2(totIpiNe - acumIpiNe) : round2(totIpiNe * proporcao)
              }
              acumIpiNe = round2(acumIpiNe + ipiItem)

              if (totDescNe > 0 && vlDescItem === 0) {
                vlDescItem = ehUltimoItem
                  ? round2(totDescNe - acumDescNe)
                  : round2(totDescNe * proporcao)
              }
              acumDescNe = round2(acumDescNe + vlDescItem)

              var vlOprItemNe = round2(
                vlProdItem +
                  frtItem +
                  segItem +
                  outItem +
                  stItem +
                  fcpStItem +
                  ipiItem -
                  vlDescItem,
              )

              var origItemNe = SpedFormato.formatarDigitos(itRec.getString('origem')) || '0'
              var cstEntradaRaw = SpedFormato.formatarDigitos(itRec.getString('cst_icms_entrada'))
              var cstIcmsNe = ''
              if (cstEntradaRaw.length === 3) {
                cstIcmsNe = cstEntradaRaw
              } else if (cstEntradaRaw.length === 2) {
                cstIcmsNe = origItemNe.substring(0, 1) + cstEntradaRaw
              } else {
                var cstFornRaw = SpedFormato.formatarDigitos(itRec.getString('cst_icms_fornecedor'))
                if (cstFornRaw.length >= 2) {
                  cstIcmsNe = origItemNe.substring(0, 1) + cstFornRaw.slice(-2)
                } else {
                  cstIcmsNe = origItemNe.substring(0, 1) + '00'
                }
              }

              var cfopEntradaNe =
                SpedFormato.formatarDigitos(itRec.getString('cfop_entrada')) || '1102'

              var aproveitaCredIcms = itRec.getBool('aproveita_credito_icms')
              var bcIcmsCredItem = aproveitaCredIcms ? round2(itRec.getFloat('base_icms') || 0) : 0
              var aliqIcmsItem = round2(itRec.getFloat('aliquota_icms') || 0)
              var vlIcmsCredItem = aproveitaCredIcms
                ? round2(itRec.getFloat('valor_credito_icms') || 0)
                : 0

              var bcStItemNe = round2(itRec.getFloat('base_icms_st') || 0)
              var aliqStItemNe = round2(itRec.getFloat('aliquota_icms_st') || 0)
              var vlStItemNe = round2(itRec.getFloat('valor_icms_st') || 0)

              var sCstIpiNe = ''
              var sCodEnqNe = ''
              var sBcIpiNe = ''
              var sAliqIpiNe = ''
              var sVlIpiNe = ''
              var vlIpiCredItem = 0

              if (ehContribuinteIpi) {
                sCstIpiNe = SpedFormato.formatarDigitos(itRec.getString('cst_ipi')) || '00'
                sCodEnqNe = SpedFormato.formatarTexto(
                  itRec.getString('codigo_enquadramento') || '999',
                  3,
                )
                var bcIpiNe = round2(itRec.getFloat('base_ipi') || 0)
                var aliqIpiNe = round2(itRec.getFloat('aliquota_ipi') || 0)
                var vIpiCred = itRec.getBool('aproveita_credito_ipi')
                  ? round2(itRec.getFloat('valor_credito_ipi') || 0)
                  : 0
                vlIpiCredItem = vIpiCred
                sBcIpiNe = bcIpiNe > 0 ? SpedFormato.formatarValor(bcIpiNe) : ''
                sAliqIpiNe = aliqIpiNe > 0 ? SpedFormato.formatarValor(aliqIpiNe) : ''
                sVlIpiNe = vIpiCred > 0 ? SpedFormato.formatarValor(vIpiCred) : ''
              }

              var cstPisNe = SpedFormato.formatarDigitos(itRec.getString('cst_pis_entrada'))
              var cstCofinsNe = SpedFormato.formatarDigitos(itRec.getString('cst_cofins_entrada'))
              var vCredPis = round2(itRec.getFloat('valor_credito_pis') || 0)
              var vCredCofins = round2(itRec.getFloat('valor_credito_cofins') || 0)

              var sBcPisNe = ''
              var sAliqPisNe = ''
              var sVlPisNe = ''
              if (vCredPis > 0) {
                var bcPisNe = round2(itRec.getFloat('base_pis') || vlProdItem)
                var aliqPisNe = round2(itRec.getFloat('aliquota_pis') || 0)
                sBcPisNe = SpedFormato.formatarValor(bcPisNe)
                sAliqPisNe = aliqPisNe > 0 ? SpedFormato.formatarValor(aliqPisNe) : ''
                sVlPisNe = SpedFormato.formatarValor(vCredPis)
              }

              var sBcCofinsNe = ''
              var sAliqCofinsNe = ''
              var sVlCofinsNe = ''
              if (vCredCofins > 0) {
                var bcCofinsNe = round2(itRec.getFloat('base_cofins') || vlProdItem)
                var aliqCofinsNe = round2(itRec.getFloat('aliquota_cofins') || 0)
                sBcCofinsNe = SpedFormato.formatarValor(bcCofinsNe)
                sAliqCofinsNe = aliqCofinsNe > 0 ? SpedFormato.formatarValor(aliqCofinsNe) : ''
                sVlCofinsNe = SpedFormato.formatarValor(vCredCofins)
              }

              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C170',
                  String(numItem),
                  codItemP,
                  '',
                  SpedFormato.formatarQuantidade(qtdEstoque, 5),
                  SpedFormato.formatarTexto(unidItemP, 6),
                  SpedFormato.formatarValor(vlProdItem),
                  vlDescItem > 0 ? SpedFormato.formatarValor(vlDescItem) : '',
                  '0',
                  cstIcmsNe,
                  cfopEntradaNe,
                  '',
                  bcIcmsCredItem > 0 ? SpedFormato.formatarValor(bcIcmsCredItem) : '',
                  aliqIcmsItem > 0 ? SpedFormato.formatarValor(aliqIcmsItem) : '',
                  vlIcmsCredItem > 0 ? SpedFormato.formatarValor(vlIcmsCredItem) : '',
                  bcStItemNe > 0 ? SpedFormato.formatarValor(bcStItemNe) : '',
                  aliqStItemNe > 0 ? SpedFormato.formatarValor(aliqStItemNe) : '',
                  vlStItemNe > 0 ? SpedFormato.formatarValor(vlStItemNe) : '',
                  '0',
                  sCstIpiNe,
                  sCodEnqNe,
                  sBcIpiNe,
                  sAliqIpiNe,
                  sVlIpiNe,
                  cstPisNe,
                  sBcPisNe,
                  sAliqPisNe,
                  '',
                  '',
                  sVlPisNe,
                  cstCofinsNe,
                  sBcCofinsNe,
                  sAliqCofinsNe,
                  '',
                  '',
                  sVlCofinsNe,
                  '',
                  '0,00',
                ]),
              )

              itensCalculadosNe.push({
                cst: cstIcmsNe,
                cfop: cfopEntradaNe,
                aliqIcms: aliqIcmsItem,
                vlOpr: vlOprItemNe,
                vlBcIcms: bcIcmsCredItem,
                vlIcms: vlIcmsCredItem,
                vlBcSt: bcStItemNe,
                vlSt: vlStItemNe,
                vlIpi: vlIpiCredItem,
              })
            }

            var gruposC190Ne = {}
            var somaVlOprNe = 0

            for (var ig = 0; ig < itensCalculadosNe.length; ig++) {
              var itc = itensCalculadosNe[ig]
              var chvG = itc.cst + '|' + itc.cfop + '|' + itc.aliqIcms.toFixed(2)
              if (!gruposC190Ne[chvG]) {
                gruposC190Ne[chvG] = {
                  cst: itc.cst,
                  cfop: itc.cfop,
                  aliqIcms: itc.aliqIcms,
                  vlOpr: 0,
                  vlBcIcms: 0,
                  vlIcms: 0,
                  vlBcSt: 0,
                  vlSt: 0,
                  vlRedBc: 0,
                  vlIpi: 0,
                }
              }
              var gNe = gruposC190Ne[chvG]
              gNe.vlOpr = round2(gNe.vlOpr + itc.vlOpr)
              gNe.vlBcIcms = round2(gNe.vlBcIcms + itc.vlBcIcms)
              gNe.vlIcms = round2(gNe.vlIcms + itc.vlIcms)
              gNe.vlBcSt = round2(gNe.vlBcSt + itc.vlBcSt)
              gNe.vlSt = round2(gNe.vlSt + itc.vlSt)
              gNe.vlIpi = round2(gNe.vlIpi + itc.vlIpi)
            }

            var listaChavesGNe = Object.keys(gruposC190Ne).sort()
            var somaVlIcmsGruposNe = 0
            for (var kg = 0; kg < listaChavesGNe.length; kg++) {
              somaVlIcmsGruposNe = round2(
                somaVlIcmsGruposNe + gruposC190Ne[listaChavesGNe[kg]].vlIcms,
              )
            }
            var difIcmsNe = round2(somaCreditoIcmsNe - somaVlIcmsGruposNe)
            if (
              listaChavesGNe.length > 0 &&
              Math.abs(difIcmsNe) > 0 &&
              Math.abs(difIcmsNe) <= 0.05
            ) {
              var ultG = gruposC190Ne[listaChavesGNe[listaChavesGNe.length - 1]]
              ultG.vlIcms = round2(ultG.vlIcms + difIcmsNe)
            }

            for (var cgNe = 0; cgNe < listaChavesGNe.length; cgNe++) {
              var grpNe = gruposC190Ne[listaChavesGNe[cgNe]]
              somaVlOprNe = round2(somaVlOprNe + grpNe.vlOpr)

              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C190',
                  grpNe.cst,
                  grpNe.cfop,
                  grpNe.aliqIcms > 0 ? SpedFormato.formatarValor(grpNe.aliqIcms) : '',
                  SpedFormato.formatarValor(grpNe.vlOpr),
                  SpedFormato.formatarValor(grpNe.vlBcIcms),
                  SpedFormato.formatarValor(grpNe.vlIcms),
                  SpedFormato.formatarValor(grpNe.vlBcSt),
                  SpedFormato.formatarValor(grpNe.vlSt),
                  SpedFormato.formatarValor(grpNe.vlRedBc),
                  SpedFormato.formatarValor(grpNe.vlIpi),
                  '',
                ]),
              )

              c190Registros.push({
                indOper: '0',
                cst: grpNe.cst,
                cfop: grpNe.cfop,
                aliqIcms: grpNe.aliqIcms,
                vlOpr: grpNe.vlOpr,
                vlBcIcms: grpNe.vlBcIcms,
                vlIcms: grpNe.vlIcms,
                vlBcIcmsSt: grpNe.vlBcSt,
                vlIcmsSt: grpNe.vlSt,
                vlRedBc: grpNe.vlRedBc,
                vlIpi: grpNe.vlIpi,
              })
            }

            var difVlOprNe = Math.abs(round2(somaVlOprNe - vlDocNe))
            if (itensNe.length > 0 && difVlOprNe > 0.01) {
              ctx.adicionarValidacao(
                'aviso',
                'Soma do valor das operações dos registros analíticos C190 (R$ ' +
                  somaVlOprNe.toFixed(2) +
                  ') diverge do VL_DOC da nota de entrada nº ' +
                  numNe +
                  ' (R$ ' +
                  vlDocNe.toFixed(2) +
                  ').',
                'C190',
                String(numNe),
              )
            }
          }

          var docsTrfBrutos = []
          try {
            docsTrfBrutos = $app.findRecordsByFilter(
              'documentos_fiscais',
              "(origem = 'Transferência' || origem = 'Transferencia') && transferencia_id != '' && (status = 'Autorizada' || status = 'Cancelada') && ativo = true",
              'data_emissao,numero',
              5000,
              0,
            )
          } catch (errTrfDocs) {
            ctx.adicionarValidacao(
              'aviso',
              'Falha ao carregar documentos fiscais de transferência: ' +
                (errTrfDocs.message || errTrfDocs),
              'C100',
            )
          }

          for (var trfIdx = 0; trfIdx < docsTrfBrutos.length; trfIdx++) {
            var docTrf = docsTrfBrutos[trfIdx]
            var trfId = docTrf.getString('transferencia_id')
            if (!trfId) continue

            var trfRec = null
            try {
              trfRec = $app.findRecordById('transferencias', trfId)
            } catch (_) {
              continue
            }
            if (!trfRec) continue

            var empDestId = trfRec.getString('empresa_destino_id')
            if (empDestId !== empresaId) {
              continue
            }

            var dtEmissaoTrfStr = docTrf.getString('data_emissao') || docTrf.getString('created')
            var dtTrfBsb = extrairDataBrasilia(dtEmissaoTrfStr)
            if (!dtTrfBsb) continue
            if (dtTrfBsb.ano !== ctx.ano || dtTrfBsb.mes !== ctx.mes) continue

            var ambTrf = docTrf.getString('ambiente') || 'Homologação'
            if (ctx.modo === 'Oficial') {
              if (ambTrf !== 'Produção') continue
            } else {
              if (ambTrf !== 'Produção' && !incluirHomologacaoEmTeste) continue
            }

            var chvTrf = SpedFormato.formatarDigitos(docTrf.getString('chave_acesso'))
            if (chvTrf && chavesProcessadasBlocoC[chvTrf]) {
              continue
            }
            if (chvTrf) {
              chavesProcessadasBlocoC[chvTrf] = true
            }

            var stTrf = docTrf.getString('status')
            var modTrf = docTrf.getString('modelo') || '55'
            var serTrf = docTrf.getString('serie') || '1'
            var numTrf = docTrf.getInt('numero') || 0

            var empOrigId = trfRec.getString('empresa_origem_id') || docTrf.getString('empresa_id')
            var codPartTrf = ''
            if (empOrigId) {
              codPartTrf = 'E' + empOrigId
              ctx.registrarParticipante('E', empOrigId)
            }

            if (stTrf === 'Cancelada') {
              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C100',
                  '0',
                  '1',
                  codPartTrf,
                  modTrf,
                  '02',
                  serTrf,
                  String(numTrf),
                  chvTrf,
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                ]),
              )
              continue
            }

            var dtEmissaoTrfSped = SpedFormato.formatarData(dtEmissaoTrfStr)
            var dtEntradaTrfStr = trfRec.getString('data_recebimento') || dtEmissaoTrfStr
            var dtEntradaTrfSped = SpedFormato.formatarData(dtEntradaTrfStr)

            var vlDocTrf = round2(docTrf.getFloat('valor_total') || 0)
            var vlDescTrf = round2(docTrf.getFloat('valor_desconto') || 0)
            var vlMercTrf = round2(docTrf.getFloat('valor_produtos') || 0)
            var vlFrtTrf = round2(docTrf.getFloat('valor_frete') || 0)
            var vlSegTrf = round2(docTrf.getFloat('valor_seguro') || 0)
            var vlOutDaTrf = round2(docTrf.getFloat('valor_outras_despesas') || 0)

            var vlBcIcmsTrf = round2(docTrf.getFloat('base_icms') || 0)
            var vlIcmsTrf = round2(docTrf.getFloat('valor_icms') || 0)
            var vlBcIcmsStTrf = round2(docTrf.getFloat('base_icms_st') || 0)
            var vlIcmsStTrf = round2(docTrf.getFloat('valor_icms_st') || 0)
            var vlIpiTrf = round2(docTrf.getFloat('valor_ipi') || 0)
            var vlPisTrf = round2(docTrf.getFloat('valor_pis') || 0)
            var vlCofinsTrf = round2(docTrf.getFloat('valor_cofins') || 0)

            totalTransferenciasRecebidas++
            totalVlDocEntrada = round2(totalVlDocEntrada + vlDocTrf)
            totalVlCreditoIcms = round2(totalVlCreditoIcms + vlIcmsTrf)

            c100Linhas.push(
              SpedFormato.montarLinha([
                'C100',
                '0',
                '1',
                codPartTrf,
                modTrf,
                '00',
                serTrf,
                String(numTrf),
                chvTrf,
                dtEmissaoTrfSped,
                dtEntradaTrfSped,
                SpedFormato.formatarValor(vlDocTrf),
                '2',
                SpedFormato.formatarValor(vlDescTrf),
                '0,00',
                SpedFormato.formatarValor(vlMercTrf),
                '9',
                SpedFormato.formatarValor(vlFrtTrf),
                SpedFormato.formatarValor(vlSegTrf),
                SpedFormato.formatarValor(vlOutDaTrf),
                SpedFormato.formatarValor(vlBcIcmsTrf),
                SpedFormato.formatarValor(vlIcmsTrf),
                SpedFormato.formatarValor(vlBcIcmsStTrf),
                SpedFormato.formatarValor(vlIcmsStTrf),
                SpedFormato.formatarValor(vlIpiTrf),
                vlPisTrf > 0 ? SpedFormato.formatarValor(vlPisTrf) : '',
                vlCofinsTrf > 0 ? SpedFormato.formatarValor(vlCofinsTrf) : '',
                '',
                '',
              ]),
            )

            var itensDocTrf = []
            try {
              itensDocTrf = $app.findRecordsByFilter(
                'documentos_fiscais_itens',
                "documento_id = '" + docTrf.id + "'",
                'item',
                500,
                0,
              )
            } catch (errItTrf) {
              ctx.adicionarValidacao(
                'erro',
                'Falha ao carregar itens da transferência nº ' +
                  numTrf +
                  ': ' +
                  (errItTrf.message || errItTrf),
                'C170',
                String(numTrf),
              )
            }

            var gruposC190Trf = {}
            var somaVlOprTrf = 0

            for (var itTrfIdx = 0; itTrfIdx < itensDocTrf.length; itTrfIdx++) {
              var itTrf = itensDocTrf[itTrfIdx]
              var numItemTrf = itTrf.getInt('item') || itTrfIdx + 1
              var prodIdTrf = itTrf.getString('produto_id')

              if (prodIdTrf) {
                ctx.registrarItem(prodIdTrf)
              }

              var codItemTrf = ''
              var unidItemTrf = 'UN'
              if (prodIdTrf) {
                try {
                  var pTrf = $app.findRecordById('produtos', prodIdTrf)
                  codItemTrf = String(pTrf.getInt('codigo') || pTrf.id)
                  var uTrfId = pTrf.getString('unidade_id')
                  if (uTrfId) {
                    try {
                      var unTrfRec = $app.findRecordById('unidades_medida', uTrfId)
                      unidItemTrf = unTrfRec.getString('sigla')
                    } catch (_) {
                      unidItemTrf = uTrfId
                    }
                  }
                  ctx.registrarUnidade(unidItemTrf)
                } catch (_) {
                  codItemTrf = prodIdTrf
                }
              } else {
                codItemTrf = itTrf.getString('codigo') || String(numItemTrf)
              }

              var qtdTrf = itTrf.getFloat('quantidade') || 0
              var vlBrutoTrf = round2(
                itTrf.getFloat('valor_bruto') || itTrf.getFloat('valor_total') || 0,
              )
              var vlDescItTrf = round2(itTrf.getFloat('valor_desconto') || 0)

              var origTrf = SpedFormato.formatarDigitos(itTrf.getString('origem')) || '0'
              var cstSaidaTrf = SpedFormato.formatarDigitos(itTrf.getString('cst_icms'))
              if (!cstSaidaTrf) {
                var csosnTrf = SpedFormato.formatarDigitos(itTrf.getString('csosn'))
                cstSaidaTrf = csosnTrf.length >= 2 ? csosnTrf.slice(-2) : '00'
              }
              if (cstSaidaTrf.length === 1) cstSaidaTrf = '0' + cstSaidaTrf
              var cstEntradaTrf = origTrf.substring(0, 1) + cstSaidaTrf

              var cfopSaidaTrf = SpedFormato.formatarDigitos(itTrf.getString('cfop')) || '5152'
              var cfopEntradaTrf = cfopSaidaTrf
              if (cfopSaidaTrf.length === 4) {
                var primeiroDigito = cfopSaidaTrf.charAt(0)
                if (primeiroDigito === '5') {
                  cfopEntradaTrf = '1' + cfopSaidaTrf.substring(1)
                } else if (primeiroDigito === '6') {
                  cfopEntradaTrf = '2' + cfopSaidaTrf.substring(1)
                }
              }

              var bcIcmsItTrf = round2(itTrf.getFloat('base_icms') || 0)
              var aliqIcmsItTrf = round2(itTrf.getFloat('aliquota_icms') || 0)
              var vlIcmsItTrf = round2(itTrf.getFloat('valor_icms') || 0)

              var bcStItTrf = round2(itTrf.getFloat('base_icms_st') || 0)
              var aliqStItTrf = round2(itTrf.getFloat('aliquota_icms_st') || 0)
              var vlStItTrf = round2(itTrf.getFloat('valor_icms_st') || 0)
              var fcpStItTrf = round2(itTrf.getFloat('valor_fcp_st') || 0)

              var vlIpiItTrf = round2(itTrf.getFloat('valor_ipi') || 0)
              var sCstIpiTrf = ''
              var sCodEnqTrf = ''
              var sBcIpiTrf = ''
              var sAliqIpiTrf = ''
              var sVlIpiTrf = ''
              if (ehContribuinteIpi && vlIpiItTrf > 0) {
                sCstIpiTrf = SpedFormato.formatarDigitos(itTrf.getString('cst_ipi')) || '00'
                sCodEnqTrf = SpedFormato.formatarTexto(
                  itTrf.getString('codigo_enquadramento_ipi') || '999',
                  3,
                )
                var bcIpiTrf = round2(itTrf.getFloat('base_ipi') || 0)
                var aliqIpiTrf = round2(itTrf.getFloat('aliquota_ipi') || 0)
                sBcIpiTrf = bcIpiTrf > 0 ? SpedFormato.formatarValor(bcIpiTrf) : ''
                sAliqIpiTrf = aliqIpiTrf > 0 ? SpedFormato.formatarValor(aliqIpiTrf) : ''
                sVlIpiTrf = SpedFormato.formatarValor(vlIpiItTrf)
              }

              var frtItTrf = round2(itTrf.getFloat('valor_frete') || 0)
              var outItTrf = round2(itTrf.getFloat('valor_outras') || 0)
              var vlOprItTrf = round2(
                vlBrutoTrf +
                  frtItTrf +
                  outItTrf +
                  vlStItTrf +
                  fcpStItTrf +
                  vlIpiItTrf -
                  vlDescItTrf,
              )

              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C170',
                  String(numItemTrf),
                  codItemTrf,
                  '',
                  SpedFormato.formatarQuantidade(qtdTrf, 5),
                  SpedFormato.formatarTexto(unidItemTrf, 6),
                  SpedFormato.formatarValor(vlBrutoTrf),
                  vlDescItTrf > 0 ? SpedFormato.formatarValor(vlDescItTrf) : '',
                  '0',
                  cstEntradaTrf,
                  cfopEntradaTrf,
                  '',
                  bcIcmsItTrf > 0 ? SpedFormato.formatarValor(bcIcmsItTrf) : '',
                  aliqIcmsItTrf > 0 ? SpedFormato.formatarValor(aliqIcmsItTrf) : '',
                  vlIcmsItTrf > 0 ? SpedFormato.formatarValor(vlIcmsItTrf) : '',
                  bcStItTrf > 0 ? SpedFormato.formatarValor(bcStItTrf) : '',
                  aliqStItTrf > 0 ? SpedFormato.formatarValor(aliqStItTrf) : '',
                  vlStItTrf > 0 ? SpedFormato.formatarValor(vlStItTrf) : '',
                  '0',
                  sCstIpiTrf,
                  sCodEnqTrf,
                  sBcIpiTrf,
                  sAliqIpiTrf,
                  sVlIpiTrf,
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '0,00',
                ]),
              )

              var chvGTrf = cstEntradaTrf + '|' + cfopEntradaTrf + '|' + aliqIcmsItTrf.toFixed(2)
              if (!gruposC190Trf[chvGTrf]) {
                gruposC190Trf[chvGTrf] = {
                  cst: cstEntradaTrf,
                  cfop: cfopEntradaTrf,
                  aliqIcms: aliqIcmsItTrf,
                  vlOpr: 0,
                  vlBcIcms: 0,
                  vlIcms: 0,
                  vlBcSt: 0,
                  vlSt: 0,
                  vlRedBc: 0,
                  vlIpi: 0,
                }
              }
              var gTrf = gruposC190Trf[chvGTrf]
              gTrf.vlOpr = round2(gTrf.vlOpr + vlOprItTrf)
              gTrf.vlBcIcms = round2(gTrf.vlBcIcms + bcIcmsItTrf)
              gTrf.vlIcms = round2(gTrf.vlIcms + vlIcmsItTrf)
              gTrf.vlBcSt = round2(gTrf.vlBcSt + bcStItTrf)
              gTrf.vlSt = round2(gTrf.vlSt + vlStItTrf)
              gTrf.vlIpi = round2(gTrf.vlIpi + vlIpiItTrf)
            }

            var listaChavesGTrf = Object.keys(gruposC190Trf).sort()
            var somaVlIcmsGruposTrf = 0
            for (var kgt = 0; kgt < listaChavesGTrf.length; kgt++) {
              somaVlIcmsGruposTrf = round2(
                somaVlIcmsGruposTrf + gruposC190Trf[listaChavesGTrf[kgt]].vlIcms,
              )
            }
            var difIcmsTrf = round2(vlIcmsTrf - somaVlIcmsGruposTrf)
            if (
              listaChavesGTrf.length > 0 &&
              Math.abs(difIcmsTrf) > 0 &&
              Math.abs(difIcmsTrf) <= 0.05
            ) {
              var ultGTrf = gruposC190Trf[listaChavesGTrf[listaChavesGTrf.length - 1]]
              ultGTrf.vlIcms = round2(ultGTrf.vlIcms + difIcmsTrf)
            }

            for (var cgTrf = 0; cgTrf < listaChavesGTrf.length; cgTrf++) {
              var grpTrf = gruposC190Trf[listaChavesGTrf[cgTrf]]
              somaVlOprTrf = round2(somaVlOprTrf + grpTrf.vlOpr)

              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C190',
                  grpTrf.cst,
                  grpTrf.cfop,
                  grpTrf.aliqIcms > 0 ? SpedFormato.formatarValor(grpTrf.aliqIcms) : '',
                  SpedFormato.formatarValor(grpTrf.vlOpr),
                  SpedFormato.formatarValor(grpTrf.vlBcIcms),
                  SpedFormato.formatarValor(grpTrf.vlIcms),
                  SpedFormato.formatarValor(grpTrf.vlBcSt),
                  SpedFormato.formatarValor(grpTrf.vlSt),
                  SpedFormato.formatarValor(grpTrf.vlRedBc),
                  SpedFormato.formatarValor(grpTrf.vlIpi),
                  '',
                ]),
              )

              c190Registros.push({
                indOper: '0',
                cst: grpTrf.cst,
                cfop: grpTrf.cfop,
                aliqIcms: grpTrf.aliqIcms,
                vlOpr: grpTrf.vlOpr,
                vlBcIcms: grpTrf.vlBcIcms,
                vlIcms: grpTrf.vlIcms,
                vlBcIcmsSt: grpTrf.vlBcSt,
                vlIcmsSt: grpTrf.vlSt,
                vlRedBc: grpTrf.vlRedBc,
                vlIpi: grpTrf.vlIpi,
              })
            }

            var difVlOprTrf = Math.abs(round2(somaVlOprTrf - vlDocTrf))
            if (itensDocTrf.length > 0 && difVlOprTrf > 0.01) {
              ctx.adicionarValidacao(
                'aviso',
                'Soma do valor das operações dos registros analíticos C190 (R$ ' +
                  somaVlOprTrf.toFixed(2) +
                  ') diverge do VL_DOC da transferência recebida nº ' +
                  numTrf +
                  ' (R$ ' +
                  vlDocTrf.toFixed(2) +
                  ').',
                'C190',
                String(numTrf),
              )
            }
          }

          for (var inIdx = 0; inIdx < inutsPeriodo.length; inIdx++) {
            var inutRec = inutsPeriodo[inIdx]
            var modInut = inutRec.getString('modelo') || '55'
            var serInut = inutRec.getString('serie') || '1'
            var numIni = inutRec.getInt('numero_inicial') || 0
            var numFim = inutRec.getInt('numero_final') || numIni

            for (var n = numIni; n <= numFim; n++) {
              totalInutilizadas++
              c100Linhas.push(
                SpedFormato.montarLinha([
                  'C100',
                  '1',
                  '0',
                  '',
                  modInut,
                  '05',
                  serInut,
                  String(n),
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                ]),
              )
            }
          }

          var temMovimento = c100Linhas.length > 0
          linhas.push(SpedFormato.montarLinha(['C001', temMovimento ? '0' : '1']))

          if (temMovimento) {
            linhas = linhas.concat(c100Linhas)
          }

          var totalLinhasC = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['C990', String(totalLinhasC)]))

          var agrupamentoSaidasCfopCst = {}
          var agrupamentoEntradasCfopCst = {}
          for (var a190 = 0; a190 < c190Registros.length; a190++) {
            var item190 = c190Registros[a190]
            var chave190 = (item190.cfop || '') + '_' + (item190.cst || '')
            var ehOperSaida = item190.indOper === '1'
            var mapaAlvo = ehOperSaida ? agrupamentoSaidasCfopCst : agrupamentoEntradasCfopCst
            if (!mapaAlvo[chave190]) {
              mapaAlvo[chave190] = {
                cfop: item190.cfop,
                cst: item190.cst,
                vl_contabil: 0,
                vl_bc_icms: 0,
                vl_icms: 0,
                vl_bc_icms_st: 0,
                vl_icms_st: 0,
                vl_ipi: 0,
              }
            }
            var gAlvo = mapaAlvo[chave190]
            gAlvo.vl_contabil = round2(gAlvo.vl_contabil + (item190.vlOpr || 0))
            gAlvo.vl_bc_icms = round2(gAlvo.vl_bc_icms + (item190.vlBcIcms || 0))
            gAlvo.vl_icms = round2(gAlvo.vl_icms + (item190.vlIcms || 0))
            gAlvo.vl_bc_icms_st = round2(gAlvo.vl_bc_icms_st + (item190.vlBcIcmsSt || 0))
            gAlvo.vl_icms_st = round2(gAlvo.vl_icms_st + (item190.vlIcmsSt || 0))
            gAlvo.vl_ipi = round2(gAlvo.vl_ipi + (item190.vlIpi || 0))
          }

          var listaSaidasCfopCst = Object.keys(agrupamentoSaidasCfopCst)
            .sort()
            .map(function (k) {
              return agrupamentoSaidasCfopCst[k]
            })
          var listaEntradasCfopCst = Object.keys(agrupamentoEntradasCfopCst)
            .sort()
            .map(function (k) {
              return agrupamentoEntradasCfopCst[k]
            })

          var listaCanceladasDenegadas = []
          for (var cd = 0; cd < docsPeriodo.length; cd++) {
            var dDoc = docsPeriodo[cd].rec
            var stDoc = dDoc.getString('status')
            if (stDoc === 'Cancelada' || stDoc === 'Denegada') {
              listaCanceladasDenegadas.push({
                tipo: stDoc,
                modelo: dDoc.getString('modelo') || '55',
                serie: dDoc.getString('serie') || '1',
                numero: dDoc.getInt('numero') || 0,
                chave_acesso: dDoc.getString('chave_acesso') || '',
                data: (dDoc.getString('data_emissao') || dDoc.getString('created') || '').substring(
                  0,
                  10,
                ),
                motivo:
                  dDoc.getString('motivo_cancelamento') || dDoc.getString('justificativa') || '',
              })
            }
          }

          var listaInutilizadasDet = []
          for (var inD = 0; inD < inutsPeriodo.length; inD++) {
            var inRec = inutsPeriodo[inD]
            var mInut = inRec.getString('modelo') || '55'
            var sInut = inRec.getString('serie') || '1'
            var nIni = inRec.getInt('numero_inicial') || 0
            var nFim = inRec.getInt('numero_final') || nIni
            var jInut = inRec.getString('justificativa') || ''
            var dtInut = (
              inRec.getString('data_inutilizacao') ||
              inRec.getString('created') ||
              ''
            ).substring(0, 10)
            for (var nVal = nIni; nVal <= nFim; nVal++) {
              listaInutilizadasDet.push({
                tipo: 'Inutilizada',
                modelo: mInut,
                serie: sInut,
                numero: nVal,
                data: dtInut,
                justificativa: jInut,
              })
            }
          }

          ctx.resumoSaida = {
            total_nfe: totalNfe,
            total_nfce: totalNfce,
            total_canceladas: totalCanceladas,
            total_denegadas: totalDenegadas,
            total_inutilizadas: totalInutilizadas,
            total_vl_doc: totalVlDoc,
            total_vl_icms: totalVlIcms,
            por_cfop_cst: listaSaidasCfopCst,
            canceladas_denegadas: listaCanceladasDenegadas,
            inutilizadas: listaInutilizadasDet,
          }

          ctx.resumoEntrada = {
            total_compras: totalCompras,
            total_transferencias: totalTransferenciasRecebidas,
            total_vl_doc: totalVlDocEntrada,
            total_credito_icms: totalVlCreditoIcms,
            por_cfop_cst: listaEntradasCfopCst,
          }

          ctx.c190Registros = c190Registros
          ctx.c101Registros = c101Registros

          return linhas
        }

        // --- BLOCO E (Apuração do ICMS e DIFAL) ---
        function gerarBlocoE(ctx) {
          var linhas = []
          var empresaId = ctx.empresa.id
          var periodoStr = ctx.periodo // 'AAAA-MM'
          var dtIni = ctx.dtIniSped
          var dtFin = ctx.dtFinSped
          var cfg = ctx.configSped

          linhas.push(SpedFormato.montarLinha(['E001', '0']))

          var c190Lista = ctx.c190Registros || []
          var c101Lista = ctx.c101Registros || []

          for (var i = 0; i < c190Lista.length; i++) {
            var rC190 = c190Lista[i]
            var cfopPrim = (rC190.cfop || '').charAt(0)
            var ehSaida =
              rC190.indOper === '1' || cfopPrim === '5' || cfopPrim === '6' || cfopPrim === '7'
            if (ehSaida && round2(rC190.vlIcmsSt) > 0) {
              ctx.adicionarValidacao(
                'erro',
                'há ICMS ST retido nas saídas: a apuração E200/E210 precisa ser feita com o contador',
                'E200',
                rC190.cfop,
              )
              break
            }
          }

          var vlTotDebitos = 0
          var vlTotCreditos = 0

          for (var j = 0; j < c190Lista.length; j++) {
            var itemC190 = c190Lista[j]
            var chCfop = (itemC190.cfop || '').charAt(0)
            var valIcms = round2(itemC190.vlIcms || 0)
            if (chCfop === '5' || chCfop === '6' || chCfop === '7') {
              vlTotDebitos = round2(vlTotDebitos + valIcms)
            } else if (chCfop === '1' || chCfop === '2' || chCfop === '3') {
              vlTotCreditos = round2(vlTotCreditos + valIcms)
            }
          }

          var vlAjDebitos = 0
          var vlAjCreditos = 0

          var ajustesPeriodo = []
          try {
            ajustesPeriodo = $app.findRecordsByFilter(
              'sped_ajustes_apuracao',
              "empresa_id = '" + empresaId + "' && periodo = '" + periodoStr + "'",
              'created',
              500,
              0,
            )
          } catch (errAj) {
            ctx.adicionarValidacao(
              'erro',
              'Falha ao consultar ajustes de apuração: ' + (errAj.message || errAj),
              'E111',
            )
          }

          var vlTotAjDebitos = 0
          var vlEstornosCred = 0
          var vlTotAjCreditos = 0
          var vlEstornosDeb = 0
          var vlTotDed = 0
          var debEsp = 0

          for (var a = 0; a < ajustesPeriodo.length; a++) {
            var ajRec = ajustesPeriodo[a]
            var codAj = (ajRec.getString('codigo_ajuste') || '').trim()
            var valAj = round2(ajRec.getFloat('valor') || 0)
            var quartoChar = codAj.length >= 4 ? codAj.charAt(3) : ''

            if (quartoChar === '0') {
              vlTotAjDebitos = round2(vlTotAjDebitos + valAj)
            } else if (quartoChar === '1') {
              vlEstornosCred = round2(vlEstornosCred + valAj)
            } else if (quartoChar === '2') {
              vlTotAjCreditos = round2(vlTotAjCreditos + valAj)
            } else if (quartoChar === '3') {
              vlEstornosDeb = round2(vlEstornosDeb + valAj)
            } else if (quartoChar === '4') {
              vlTotDed = round2(vlTotDed + valAj)
            } else if (quartoChar === '5') {
              debEsp = round2(debEsp + valAj)
            } else {
              ctx.adicionarValidacao(
                'aviso',
                'Código de ajuste "' +
                  codAj +
                  '" possui 4º caractere ("' +
                  quartoChar +
                  '") não mapeado para o E110.',
                'E111',
                codAj,
              )
            }
          }

          var vlSldCredorAnt = 0
          var periodoSaldoInicial = cfg ? (cfg.getString('periodo_saldo_inicial') || '').trim() : ''
          var saldoCredorInicialConfig = cfg ? round2(cfg.getFloat('saldo_credor_inicial') || 0) : 0

          var mesAnteriorAno = ctx.mes === 1 ? ctx.ano - 1 : ctx.ano
          var mesAnteriorMes = ctx.mes === 1 ? 12 : ctx.mes - 1
          var periodoAnteriorStr =
            mesAnteriorAno +
            '-' +
            (mesAnteriorMes < 10 ? '0' + mesAnteriorMes : String(mesAnteriorMes))

          var achouSaldoAnterior = false

          if (periodoSaldoInicial && periodoSaldoInicial === periodoStr) {
            vlSldCredorAnt = saldoCredorInicialConfig
            achouSaldoAnterior = true
          } else {
            try {
              var arqsAnt = $app.findRecordsByFilter(
                'sped_arquivos',
                "empresa_id = '" +
                  empresaId +
                  "' && periodo = '" +
                  periodoAnteriorStr +
                  "' && tipo_escrituracao = '0'",
                '-created',
                10,
                0,
              )

              var arqAlvo = null
              for (var f = 0; f < arqsAnt.length; f++) {
                if (arqsAnt[f].getString('status') === 'Entregue') {
                  arqAlvo = arqsAnt[f]
                  break
                }
              }
              if (!arqAlvo && arqsAnt.length > 0) {
                arqAlvo = arqsAnt[0]
              }

              if (arqAlvo) {
                var resApur = arqAlvo.get('resumo_apuracao')
                if (resApur) {
                  var resParsed = typeof resApur === 'string' ? JSON.parse(resApur) : resApur
                  if (
                    resParsed &&
                    resParsed.icms_proprio &&
                    resParsed.icms_proprio.saldo_credor_transportar !== undefined
                  ) {
                    vlSldCredorAnt = round2(resParsed.icms_proprio.saldo_credor_transportar || 0)
                    achouSaldoAnterior = true
                  }
                }
              }
            } catch (errAnt) {}

            if (!achouSaldoAnterior) {
              vlSldCredorAnt = 0
              ctx.adicionarValidacao(
                'aviso',
                'Nenhum arquivo anterior encontrado para obter o saldo credor transportado do mês ' +
                  periodoAnteriorStr +
                  '. Saldo credor anterior considerado como R$ 0,00.',
                'E110',
              )
            }
          }

          var totalDebitosApur = round2(
            vlTotDebitos + vlAjDebitos + vlTotAjDebitos + vlEstornosCred,
          )
          var totalCreditosApur = round2(
            vlTotCreditos + vlAjCreditos + vlTotAjCreditos + vlEstornosDeb + vlSldCredorAnt,
          )
          var resultado = round2(totalDebitosApur - totalCreditosApur)

          var vlSldApurado = 0
          var vlIcmsRecolher = 0
          var vlSldCredorTransportar = 0

          if (resultado >= 0) {
            vlSldApurado = resultado
            if (vlTotDed > vlSldApurado) {
              ctx.adicionarValidacao(
                'erro',
                'Total de deduções do ICMS (R$ ' +
                  vlTotDed.toFixed(2) +
                  ') não pode ser superior ao saldo apurado (R$ ' +
                  vlSldApurado.toFixed(2) +
                  ').',
                'E110',
              )
              vlIcmsRecolher = 0
            } else {
              vlIcmsRecolher = round2(vlSldApurado - vlTotDed)
            }
            vlSldCredorTransportar = 0
          } else {
            vlSldApurado = 0
            vlIcmsRecolher = 0
            vlSldCredorTransportar = Math.abs(resultado)
          }

          linhas.push(SpedFormato.montarLinha(['E100', dtIni, dtFin]))

          linhas.push(
            SpedFormato.montarLinha([
              'E110',
              SpedFormato.formatarValor(vlTotDebitos),
              SpedFormato.formatarValor(vlAjDebitos),
              SpedFormato.formatarValor(vlTotAjDebitos),
              SpedFormato.formatarValor(vlEstornosCred),
              SpedFormato.formatarValor(vlTotCreditos),
              SpedFormato.formatarValor(vlAjCreditos),
              SpedFormato.formatarValor(vlTotAjCreditos),
              SpedFormato.formatarValor(vlEstornosDeb),
              SpedFormato.formatarValor(vlSldCredorAnt),
              SpedFormato.formatarValor(vlSldApurado),
              SpedFormato.formatarValor(vlTotDed),
              SpedFormato.formatarValor(vlIcmsRecolher),
              SpedFormato.formatarValor(vlSldCredorTransportar),
              SpedFormato.formatarValor(debEsp),
            ]),
          )

          for (var k = 0; k < ajustesPeriodo.length; k++) {
            var itemAj = ajustesPeriodo[k]
            var codAjApur = (itemAj.getString('codigo_ajuste') || '').trim()
            var descrComplAj = SpedFormato.formatarTexto(
              itemAj.getString('descricao_complementar'),
              100,
            )
            var vlAjApur = round2(itemAj.getFloat('valor') || 0)

            linhas.push(
              SpedFormato.montarLinha([
                'E111',
                codAjApur,
                descrComplAj,
                SpedFormato.formatarValor(vlAjApur),
              ]),
            )
          }

          var totalRecolherComEsp = round2(vlIcmsRecolher + debEsp)
          if (totalRecolherComEsp > 0) {
            var codRecIcms = cfg ? (cfg.getString('codigo_receita_icms') || '').trim() : ''
            if (!codRecIcms) {
              ctx.adicionarValidacao(
                'erro',
                'Há ICMS a recolher (R$ ' +
                  totalRecolherComEsp.toFixed(2) +
                  '), mas o código da receita do ICMS (codigo_receita_icms) não está configurado na empresa.',
                'E116',
              )
            }

            var diaVctoIcms = cfg ? cfg.getInt('dia_vencimento_icms') || 10 : 10
            if (diaVctoIcms < 1 || diaVctoIcms > 31) diaVctoIcms = 10

            var mesSegAno = ctx.mes === 12 ? ctx.ano + 1 : ctx.ano
            var mesSegMes = ctx.mes === 12 ? 1 : ctx.mes + 1
            var ultimoDiaMesSeg = new Date(mesSegAno, mesSegMes, 0).getDate()
            var diaVctoFinal = Math.min(diaVctoIcms, ultimoDiaMesSeg)
            var dtVctoE116 =
              (diaVctoFinal < 10 ? '0' + diaVctoFinal : String(diaVctoFinal)) +
              (mesSegMes < 10 ? '0' + mesSegMes : String(mesSegMes)) +
              String(mesSegAno)

            var mesRefE116 = (ctx.mes < 10 ? '0' + ctx.mes : String(ctx.mes)) + String(ctx.ano)

            linhas.push(
              SpedFormato.montarLinha([
                'E116',
                '000',
                SpedFormato.formatarValor(totalRecolherComEsp),
                dtVctoE116,
                codRecIcms,
                '',
                '',
                '',
                '',
                mesRefE116,
              ]),
            )
          }

          var difalPorUf = {}

          if (c101Lista.length > 0) {
            for (var c1 = 0; c1 < c101Lista.length; c1++) {
              var r101 = c101Lista[c1]
              var ufDest = (r101.uf || '').trim().toUpperCase()
              if (!ufDest || ufDest.length !== 2) {
                ctx.adicionarValidacao(
                  'aviso',
                  'C101 com DIFAL sem UF de destino identificada. O registro foi desconsiderado na apuração E300.',
                  'E300',
                )
                continue
              }

              if (!difalPorUf[ufDest]) {
                difalPorUf[ufDest] = {
                  uf: ufDest,
                  debDifal: 0,
                  credDifal: 0,
                  debFcp: 0,
                  credFcp: 0,
                  dtMaisAntigaIso: r101.dtEmissaoIso || '',
                }
              }

              var objUf = difalPorUf[ufDest]
              if (r101.dtEmissaoIso) {
                if (!objUf.dtMaisAntigaIso || r101.dtEmissaoIso < objUf.dtMaisAntigaIso) {
                  objUf.dtMaisAntigaIso = r101.dtEmissaoIso
                }
              }

              if (r101.tipo === 'devolucao_venda') {
                objUf.credDifal = round2(objUf.credDifal + (r101.vlIcmsUfDest || 0))
                objUf.credFcp = round2(objUf.credFcp + (r101.vlFcpUfDest || 0))
              } else {
                objUf.debDifal = round2(objUf.debDifal + (r101.vlIcmsUfDest || 0))
                objUf.debFcp = round2(objUf.debFcp + (r101.vlFcpUfDest || 0))
              }
            }

            var ufsDifal = Object.keys(difalPorUf).sort()
            if (ufsDifal.length > 0) {
              ctx.adicionarValidacao(
                'aviso',
                'DIFAL apurado pelo ERP: o contador confere os códigos de obrigação e de receita antes de transmitir.',
                'E300',
              )
            }

            for (var u = 0; u < ufsDifal.length; u++) {
              var sUf = ufsDifal[u]
              var dUf = difalPorUf[sUf]

              linhas.push(SpedFormato.montarLinha(['E300', sUf, dtIni, dtFin]))

              var resDifal = round2(dUf.debDifal - dUf.credDifal)
              var vlRecolDifal = resDifal > 0 ? resDifal : 0
              var vlSldCredTransportarDifal = resDifal < 0 ? Math.abs(resDifal) : 0

              var resFcp = round2(dUf.debFcp - dUf.credFcp)
              var vlRecolFcp = resFcp > 0 ? resFcp : 0
              var vlSldCredTransportarFcp = resFcp < 0 ? Math.abs(resFcp) : 0

              dUf.vlRecolDifal = vlRecolDifal
              dUf.vlSldCredTransportarDifal = vlSldCredTransportarDifal
              dUf.vlRecolFcp = vlRecolFcp
              dUf.vlSldCredTransportarFcp = vlSldCredTransportarFcp

              linhas.push(
                SpedFormato.montarLinha([
                  'E310',
                  '1',
                  '0,00',
                  SpedFormato.formatarValor(dUf.debDifal),
                  '0,00',
                  SpedFormato.formatarValor(dUf.credDifal),
                  '0,00',
                  '0,00',
                  '0,00',
                  SpedFormato.formatarValor(vlRecolDifal),
                  SpedFormato.formatarValor(vlSldCredTransportarDifal),
                  '0,00',
                  '0,00',
                  SpedFormato.formatarValor(dUf.debFcp),
                  '0,00',
                  SpedFormato.formatarValor(dUf.credFcp),
                  '0,00',
                  '0,00',
                  '0,00',
                  SpedFormato.formatarValor(vlRecolFcp),
                  SpedFormato.formatarValor(vlSldCredTransportarFcp),
                  '0,00',
                ]),
              )

              var dtVctoE316 = ''
              if (dUf.dtMaisAntigaIso) {
                var partesIso = dUf.dtMaisAntigaIso.split('-')
                if (partesIso.length === 3) {
                  dtVctoE316 = partesIso[2] + partesIso[1] + partesIso[0]
                }
              }
              if (!dtVctoE316) {
                dtVctoE316 = dtIni
              }
              var mesRefE316 = (ctx.mes < 10 ? '0' + ctx.mes : String(ctx.mes)) + String(ctx.ano)

              if (vlRecolDifal > 0) {
                linhas.push(
                  SpedFormato.montarLinha([
                    'E316',
                    '000',
                    SpedFormato.formatarValor(vlRecolDifal),
                    dtVctoE316,
                    '',
                    '',
                    '',
                    '',
                    '',
                    mesRefE316,
                  ]),
                )
              }

              if (vlRecolFcp > 0) {
                linhas.push(
                  SpedFormato.montarLinha([
                    'E316',
                    '006',
                    SpedFormato.formatarValor(vlRecolFcp),
                    dtVctoE316,
                    '',
                    '',
                    '',
                    '',
                    '',
                    mesRefE316,
                  ]),
                )
              }
            }
          }

          ctx.resumoApuracao = {
            icms_proprio: {
              total_debitos: vlTotDebitos,
              ajuste_debitos: vlAjDebitos,
              total_ajuste_debitos: vlTotAjDebitos,
              estorno_creditos: vlEstornosCred,
              total_creditos: vlTotCreditos,
              ajuste_creditos: vlAjCreditos,
              total_ajuste_creditos: vlTotAjCreditos,
              estorno_debitos: vlEstornosDeb,
              saldo_credor_anterior: vlSldCredorAnt,
              saldo_apurado: vlSldApurado,
              total_deducoes: vlTotDed,
              icms_recolher: vlIcmsRecolher,
              saldo_credor_transportar: vlSldCredorTransportar,
              debito_especial: debEsp,
            },
            difal_por_uf: difalPorUf,
          }

          var totalLinhas = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['E990', String(totalLinhas)]))
          return linhas
        }

        // --- BLOCO H (Inventário Físico) ---
        function gerarBlocoH(ctx) {
          var linhas = []
          var mesBlocoH = 2 // padrão fevereiro
          var contaContabilEstoque = ''
          if (ctx.configSped) {
            var mbh = ctx.configSped.getInt('mes_bloco_h')
            if (mbh && mbh >= 1 && mbh <= 12) {
              mesBlocoH = mbh
            }
            contaContabilEstoque = (ctx.configSped.getString('conta_contabil_estoque') || '').trim()
          }

          // Só no arquivo do mês mes_bloco_h (padrão 2). Nos outros meses, H001 IND_MOV 1 e H990
          if (ctx.mes !== mesBlocoH) {
            linhas.push(SpedFormato.montarLinha(['H001', '1']))
            var totalLinhasVazio = linhas.length + 1
            linhas.push(SpedFormato.montarLinha(['H990', String(totalLinhasVazio)]))
            return linhas
          }

          var anoAnterior = ctx.ano - 1
          var dtRefEsperada = String(anoAnterior) + '-12-31'
          var inventarios = []
          try {
            inventarios = $app.findRecordsByFilter(
              'inventarios',
              "empresa_id = '" +
                ctx.empresa.id +
                "' && tipo = 'Anual (Bloco H)' && status = 'Finalizado' && ativo = true",
              '-created',
              20,
              0,
            )
          } catch (errInv) {
            console.warn('Erro ao buscar inventários:', errInv)
          }

          var invEncontrado = null
          for (var i = 0; i < inventarios.length; i++) {
            var inv = inventarios[i]
            var dtRef = (inv.getString('data_referencia') || '').substring(0, 10)
            if (dtRef === dtRefEsperada) {
              invEncontrado = inv
              break
            }
          }

          if (!invEncontrado) {
            ctx.adicionarValidacao('erro', 'falta o inventário de 31/12', 'H001', dtRefEsperada)
            linhas.push(SpedFormato.montarLinha(['H001', '1']))
            var totLinhasErro = linhas.length + 1
            linhas.push(SpedFormato.montarLinha(['H990', String(totLinhasErro)]))
            return linhas
          }

          linhas.push(SpedFormato.montarLinha(['H001', '0']))

          if (!contaContabilEstoque) {
            ctx.adicionarValidacao(
              'aviso',
              'o COD_CTA do H010 é exigido de quem tem escrituração contábil; confirme com o contador',
              'H010',
            )
          }

          var itensInv = []
          try {
            itensInv = $app.findRecordsByFilter(
              'inventarios_itens',
              "inventario_id = '" + invEncontrado.id + "' && ativo = true",
              'created',
              10000,
              0,
            )
          } catch (errItensInv) {
            console.warn('Erro ao carregar itens do inventário:', errItensInv)
          }

          var produtosAgrupados = {}
          for (var j = 0; j < itensInv.length; j++) {
            var itemRec = itensInv[j]
            var prodId = itemRec.getString('produto_id')
            if (!prodId) continue
            var qtdContada = itemRec.getFloat('quantidade_contada') || 0
            var custoUnit = itemRec.getFloat('custo_unitario') || 0

            if (!produtosAgrupados[prodId]) {
              produtosAgrupados[prodId] = {
                produtoId: prodId,
                quantidade: 0,
                custoUnitario: custoUnit,
              }
            }
            produtosAgrupados[prodId].quantidade += qtdContada
            if (custoUnit > 0) {
              produtosAgrupados[prodId].custoUnitario = custoUnit
            }
          }

          var chavesProdutos = Object.keys(produtosAgrupados).sort()
          var itensH010 = []
          var somaVlItem = 0

          for (var k = 0; k < chavesProdutos.length; k++) {
            var dadosProd = produtosAgrupados[chavesProdutos[k]]
            if (dadosProd.quantidade <= 0) continue

            var prodRec = null
            try {
              prodRec = $app.findRecordById('produtos', dadosProd.produtoId)
            } catch (_) {}

            var codItem = prodRec
              ? String(prodRec.getInt('codigo') || prodRec.id)
              : dadosProd.produtoId
            var unid = 'UN'
            if (prodRec) {
              var unId = prodRec.getString('unidade_id')
              if (unId) {
                try {
                  var unRec = $app.findRecordById('unidades_medida', unId)
                  unid = unRec.getString('sigla') || 'UN'
                } catch (_) {
                  unid = unId
                }
              }
            }

            ctx.registrarItem(dadosProd.produtoId)
            ctx.registrarUnidade(unid)

            var vlUnit = round2(dadosProd.custoUnitario)
            var vlItem = round2(dadosProd.quantidade * dadosProd.custoUnitario)
            somaVlItem = round2(somaVlItem + vlItem)

            itensH010.push({
              codItem: codItem,
              unid: unid,
              qtd: dadosProd.quantidade,
              vlUnit: dadosProd.custoUnitario,
              vlItem: vlItem,
            })
          }

          var dtInvSped = SpedFormato.formatarData(dtRefEsperada)
          var motInv = '01'
          var motInvCampo = invEncontrado.getString('motivo_bloco_h') || ''
          if (motInvCampo && motInvCampo.length >= 2) {
            motInv = motInvCampo.substring(0, 2)
          }

          if (!ctx.resumoApuracao) {
            ctx.resumoApuracao = {}
          }
          ctx.resumoApuracao.inventario_h005 = {
            dt_inv: dtRefEsperada,
            dt_inv_sped: dtInvSped,
            vl_inv: somaVlItem,
            mot_inv: motInv,
            total_itens: itensH010.length,
          }

          linhas.push(
            SpedFormato.montarLinha([
              'H005',
              dtInvSped,
              SpedFormato.formatarValor(somaVlItem),
              motInv,
            ]),
          )

          for (var h = 0; h < itensH010.length; h++) {
            var itemH = itensH010[h]
            linhas.push(
              SpedFormato.montarLinha([
                'H010',
                itemH.codItem,
                SpedFormato.formatarTexto(itemH.unid, 6),
                SpedFormato.formatarQuantidade(itemH.qtd, 3),
                SpedFormato.formatarPrecoUnitario(itemH.vlUnit, 6),
                SpedFormato.formatarValor(itemH.vlItem),
                '0',
                '',
                '',
                contaContabilEstoque,
                SpedFormato.formatarValor(itemH.vlItem),
              ]),
            )
          }

          var totalLinhasH = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['H990', String(totalLinhasH)]))
          return linhas
        }

        // --- BLOCO K (Controle da Produção e do Estoque) ---
        function gerarBlocoK(ctx) {
          var linhas = []
          var gerarBlocoKConfig = false
          if (ctx.configSped) {
            gerarBlocoKConfig = ctx.configSped.getBool('gerar_bloco_k') === true
          }

          if (!gerarBlocoKConfig) {
            linhas.push(SpedFormato.montarLinha(['K001', '1']))
            var totalLinhasVazioK = linhas.length + 1
            linhas.push(SpedFormato.montarLinha(['K990', String(totalLinhasVazioK)]))
            return linhas
          }

          linhas.push(SpedFormato.montarLinha(['K001', '0']))
          linhas.push(SpedFormato.montarLinha(['K010', '2']))

          ctx.adicionarValidacao(
            'aviso',
            'Bloco K ligado: o contador confirma se a empresa é obrigada e se o leiaute restrito vale para ela',
            'K010',
          )

          linhas.push(SpedFormato.montarLinha(['K100', ctx.dtIniSped, ctx.dtFinSped]))

          var saldosPorProduto = {}
          try {
            var dataLimiteIso = ctx.dtFinIso + ' 23:59:59'
            var movs = $app.findRecordsByFilter(
              'estoque_movimentos',
              "empresa_id = '" +
                ctx.empresa.id +
                "' && ativo = true && estornado = false && data_movimento <= '" +
                dataLimiteIso +
                "'",
              'data_movimento,id',
              50000,
              0,
            )

            for (var m = 0; m < movs.length; m++) {
              var mov = movs[m]
              var pId = mov.getString('produto_id')
              if (!pId) continue
              var tipoMov = mov.getString('tipo')
              var qtdMov = mov.getFloat('quantidade') || 0

              if (saldosPorProduto[pId] === undefined) {
                saldosPorProduto[pId] = 0
              }

              if (tipoMov === 'Entrada') {
                saldosPorProduto[pId] += qtdMov
              } else if (tipoMov === 'Saída') {
                saldosPorProduto[pId] -= qtdMov
              }
            }
          } catch (errMovs) {
            console.warn('Erro ao consultar movimentacoes de estoque para K200:', errMovs)
          }

          var prodsK = Object.keys(saldosPorProduto).sort()
          for (var pk = 0; pk < prodsK.length; pk++) {
            var prodIdK = prodsK[pk]
            var saldoQtd = round2(saldosPorProduto[prodIdK])
            if (Math.abs(saldoQtd) < 0.0001) continue

            var prodRecK = null
            try {
              prodRecK = $app.findRecordById('produtos', prodIdK)
            } catch (_) {}

            var codItemK = prodRecK ? String(prodRecK.getInt('codigo') || prodRecK.id) : prodIdK

            ctx.registrarItem(prodIdK)

            linhas.push(
              SpedFormato.montarLinha([
                'K200',
                ctx.dtFinSped,
                codItemK,
                SpedFormato.formatarQuantidade(saldoQtd, 3),
                '0',
                '',
              ]),
            )
          }

          var totalLinhasK = linhas.length + 1
          linhas.push(SpedFormato.montarLinha(['K990', String(totalLinhasK)]))
          return linhas
        }

        return {
          criarContexto: criarContexto,
          gerarBloco0: gerarBloco0,
          gerarBlocoB: gerarBlocoB,
          gerarBlocoC: gerarBlocoC,
          gerarBlocoD: gerarBlocoD,
          gerarBlocoE: gerarBlocoE,
          gerarBlocoG: gerarBlocoG,
          gerarBlocoH: gerarBlocoH,
          gerarBlocoK: gerarBlocoK,
          gerarBloco1: gerarBloco1,
          gerarBloco9: gerarBloco9,
          gerarArquivoCompleto: gerarArquivoCompleto,
        }
      })()

      var userId = authRecord.id
      var body = c.requestInfo().body || {}
      var empresaId = (body.empresa_id || '').trim()
      var periodo = (body.periodo || '').trim() // AAAA-MM
      var modo = (body.modo || 'Teste').trim() // Oficial | Teste
      var finalidadeSolicitada = body.finalidade ? String(body.finalidade).trim() : ''

      if (!empresaId) {
        return c.json(400, { sucesso: false, message: 'empresa_id é obrigatório.' })
      }

      exigirEmpresaDoUsuario(authRecord, empresaId)

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

      // 3. Checagem prévia de Inscrição Estadual no modo Oficial e determinação da Finalidade (0 Original ou 1 Retificadora)
      var finalidadeCalculada = '0'
      if (modo === 'Oficial') {
        try {
          var entreguesOficiais = $app.findRecordsByFilter(
            'sped_arquivos',
            "empresa_id = '" +
              empresaId +
              "' && periodo = '" +
              periodo +
              "' && modo = 'Oficial' && status = 'Entregue'",
            '-created',
            1,
            0,
          )
          if (entreguesOficiais && entreguesOficiais.length > 0) {
            finalidadeCalculada = '1'
          }
        } catch (errCheckEntregue) {
          console.warn('Aviso: erro ao verificar arquivos entregues:', errCheckEntregue)
        }
      }

      if (finalidadeSolicitada === '1' || finalidadeSolicitada === '0') {
        finalidadeCalculada = finalidadeSolicitada
      }

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
            recErro.set('finalidade', finalidadeCalculada)
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
            var msgIE = errErroIE && errErroIE.message ? errErroIE.message : String(errErroIE)
            console.log('[sped/gerar] Erro ao gravar status de erro IE: ' + msgIE)
            return c.json(400, {
              sucesso: false,
              message: 'Erro ao gravar status de erro: ' + msgIE,
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
        arquivoRec.set('finalidade', finalidadeCalculada)
        arquivoRec.set('modo', modo)
        arquivoRec.set('status', 'Gerando')
        arquivoRec.set('gerado_por', usuarioErp.id)
        $app.save(arquivoRec)
      } catch (errCriar) {
        var msgCriar = errCriar && errCriar.message ? errCriar.message : String(errCriar)
        console.log('[sped/gerar] Erro ao inicializar registro: ' + msgCriar)
        return c.json(400, {
          sucesso: false,
          message: 'Erro ao inicializar registro de geração do SPED: ' + msgCriar,
        })
      }

      // 5. Monta o arquivo SPED através do motor SpedGerador
      try {
        var resultado = SpedGeradorLocal.gerarArquivoCompleto({
          empresa: empresa,
          configSped: configSped,
          periodo: periodo,
          modo: modo,
          finalidade: finalidadeCalculada,
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
          finalidade: finalidadeCalculada,
          status: resultado.status,
          nome_arquivo: resultado.nomeArquivo,
          quantidade_linhas: resultado.quantidadeLinhas,
          total_validacoes: resultado.validacoes.length,
          tem_erros: resultado.temErros,
        })
      } catch (errGeracao) {
        var msgGeracao = errGeracao && errGeracao.message ? errGeracao.message : String(errGeracao)
        console.log('[sped/gerar] Erro na geração do SPED: ' + msgGeracao)
        try {
          arquivoRec.set('status', 'Erro')
          arquivoRec.set(
            'validacoes',
            JSON.stringify([
              {
                nivel: 'erro',
                registro: '',
                mensagem: 'Falha durante o processamento do gerador: ' + msgGeracao,
              },
            ]),
          )
          $app.save(arquivoRec)
        } catch (_) {}

        return c.json(400, {
          sucesso: false,
          id: arquivoRec ? arquivoRec.id : null,
          status: 'Erro',
          message: 'Erro durante a geração do SPED: ' + msgGeracao,
        })
      }
    } catch (err) {
      var msgGeral = err && err.message ? err.message : String(err)
      console.log('[sped/gerar] Erro não tratado: ' + msgGeral)
      return c.json(400, {
        sucesso: false,
        message: 'Erro na geração do SPED: ' + (msgGeral || 'Falha na operação.'),
      })
    }
  },
  $apis.requireAuth(),
)
