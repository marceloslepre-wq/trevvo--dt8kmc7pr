// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Consulta de CPF na API Externa (apicpf.dev)
 * Rota: GET /backend/v1/cadastros/consulta-cpf?cpf={apenas_numeros}
 *
 * Exige usuário autenticado no ERP e isolamento pelo assinante do usuário.
 * Lê a chave da variável de ambiente APICPF_DEV_KEY via $os.getenv.
 * Se ausente ou vazia, retorna HTTP 400 com mensagem clara em português.
 * Se presente, consulta https://apicpf.dev/consulta?cpf=... com header X-API-KEY.
 * Nunca vaza a chave na resposta nem no log.
 */

routerAdd(
  'GET',
  '/backend/v1/cadastros/consulta-cpf',
  (c) => {
    // 1) Usuário autenticado obrigatório (PB v0.23+ c.auth ou c.get('authRecord'))
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, {
        sucesso: false,
        erro: 'nao_autenticado',
        mensagem: 'Autenticação necessária para consultar CPF.',
      })
    }

    try {
      // 2) Isolamento pelo assinante do usuário (usando tenancy.js requerido dentro do callback)
      let assinante = null
      try {
        const { assinanteDoUsuario } = require(`${__hooks}/tenancy.js`)
        assinante = assinanteDoUsuario(authRecord)
      } catch (errTenancy) {
        console.log(
          '[consulta-cpf]',
          'Erro ao obter assinante do usuário:',
          errTenancy && errTenancy.message ? errTenancy.message : String(errTenancy),
        )
        return c.json(403, {
          sucesso: false,
          erro: 'assinante_invalido',
          mensagem: 'Usuário sem assinante válido vinculado ou licença inativa.',
        })
      }

      if (!assinante) {
        return c.json(403, {
          sucesso: false,
          erro: 'assinante_invalido',
          mensagem: 'Assinante não identificado.',
        })
      }

      // 3) Obter e validar parâmetro CPF da query
      const reqInfo = c.requestInfo()
      const query = (reqInfo && reqInfo.query) || {}
      const cpfBruto = String(query.cpf || '')
      const cpfLimpo = cpfBruto.replace(/\D/g, '')

      // Função local de validação de CPF (módulo 11) dentro do callback
      function validarCpfLocal(num) {
        if (!num || num.length !== 11) return false
        if (/^(\d)\1{10}$/.test(num)) return false

        let soma = 0
        for (let i = 0; i < 9; i++) {
          soma += parseInt(num.charAt(i), 10) * (10 - i)
        }
        let resto = 11 - (soma % 11)
        let dv1 = resto >= 10 ? 0 : resto
        if (dv1 !== parseInt(num.charAt(9), 10)) return false

        soma = 0
        for (let i = 0; i < 10; i++) {
          soma += parseInt(num.charAt(i), 10) * (11 - i)
        }
        resto = 11 - (soma % 11)
        let dv2 = resto >= 10 ? 0 : resto
        return dv2 === parseInt(num.charAt(10), 10)
      }

      if (!validarCpfLocal(cpfLimpo)) {
        return c.json(400, {
          sucesso: false,
          erro: 'cpf_invalido',
          mensagem: 'O CPF informado é inválido. Digite 11 dígitos numéricos válidos.',
        })
      }

      // 4) Leitura da chave de API em variável de ambiente (APICPF_DEV_KEY)
      let apiKey = ''
      try {
        apiKey = ($os.getenv('APICPF_DEV_KEY') || '').trim()
      } catch (errEnv) {
        console.log(
          '[consulta-cpf]',
          'Erro ao ler variável de ambiente:',
          errEnv && errEnv.message ? errEnv.message : String(errEnv),
        )
      }

      if (!apiKey) {
        // Mensagem exigida pela especificação
        return c.json(400, {
          sucesso: false,
          erro: 'chave_nao_configurada',
          mensagem: 'Consulta de CPF não configurada. Cadastre a chave da API CPF no painel.',
        })
      }

      // 5) Chamada à API externa apicpf.dev
      // Documentação: GET https://api.apicpf.dev/consulta?cpf={apenas_numeros} (ou https://apicpf.dev/consulta)
      // com header X-API-KEY: {chave}
      // Tentamos o host oficial api.apicpf.dev primeiro; se falhar na rede, fallback para apicpf.dev
      let urlApi = `https://api.apicpf.dev/consulta?cpf=${cpfLimpo}`
      let resHttp = null

      try {
        resHttp = $http.send({
          method: 'GET',
          url: urlApi,
          headers: {
            'X-API-KEY': apiKey,
            Accept: 'application/json',
          },
          timeout: 20,
        })
      } catch (errHttp1) {
        // Fallback para apicpf.dev caso api.apicpf.dev tenha alguma indisponibilidade de DNS/rede
        try {
          urlApi = `https://apicpf.dev/consulta?cpf=${cpfLimpo}`
          resHttp = $http.send({
            method: 'GET',
            url: urlApi,
            headers: {
              'X-API-KEY': apiKey,
              Accept: 'application/json',
            },
            timeout: 20,
          })
        } catch (errHttp) {
          console.log(
            '[consulta-cpf]',
            'Falha de rede ao consultar apicpf.dev:',
            errHttp && errHttp.message ? errHttp.message : String(errHttp),
            errHttp && errHttp.stack ? errHttp.stack : '',
          )
          return c.json(502, {
            sucesso: false,
            erro: 'falha_comunicacao',
            mensagem: 'Falha na comunicação com o serviço de consulta de CPF.',
          })
        }
      }

      const statusCode = (resHttp && resHttp.statusCode) || 500
      let corpoJson = null
      try {
        corpoJson = JSON.parse((resHttp && resHttp.raw) || '{}')
      } catch (_) {
        corpoJson = null
      }

      // Tratamento da resposta externa (suporta { data: { nome, ... } } ou direto { nome, ... })
      if (statusCode === 200 && corpoJson) {
        const dados =
          corpoJson.data && typeof corpoJson.data === 'object' ? corpoJson.data : corpoJson
        const nome = String(dados.nome || dados.nome_completo || '').trim()
        const dataNascimento = String(dados.data_nascimento || dados.nascimento || '').trim()
        const mae = String(dados.mae || dados.nome_mae || '').trim()
        const genero = String(dados.genero || dados.sexo || '').trim()

        return c.json(200, {
          sucesso: true,
          nome: nome,
          data_nascimento: dataNascimento,
          mae: mae,
          genero: genero,
        })
      }

      // Se status for 404 da API externa (ou não encontrado)
      if (
        statusCode === 404 ||
        (corpoJson && (corpoJson.erro === 'cpf_nao_encontrado' || corpoJson.status === 'not_found'))
      ) {
        console.log(
          '[consulta-cpf]',
          `CPF ${cpfLimpo.slice(0, 3)}*** não encontrado na base externa (HTTP ${statusCode}).`,
        )
        return c.json(404, {
          sucesso: false,
          erro: 'cpf_nao_encontrado',
          mensagem: 'CPF não encontrado na base. Preencha os dados manualmente.',
        })
      }

      // Se status for 401 ou 403 (chave inválida ou limite excedido)
      if (statusCode === 401 || statusCode === 403) {
        console.log('[consulta-cpf]', `Chave recusada pela API externa (HTTP ${statusCode}).`)
        return c.json(400, {
          sucesso: false,
          erro: 'chave_invalida',
          mensagem: 'Chave da API CPF inválida ou limite de consultas atingido.',
        })
      }

      // Outro erro da API externa
      console.log('[consulta-cpf]', `Erro retornado pela API externa: HTTP ${statusCode}`)
      return c.json(404, {
        sucesso: false,
        erro: 'cpf_nao_encontrado',
        mensagem: 'CPF não encontrado na base. Preencha os dados manualmente.',
      })
    } catch (errGeral) {
      console.log(
        '[consulta-cpf]',
        'Erro inesperado na rota de consulta de CPF:',
        errGeral && errGeral.message ? errGeral.message : String(errGeral),
        errGeral && errGeral.stack ? errGeral.stack : '',
      )
      return c.json(500, {
        sucesso: false,
        erro: 'erro_interno',
        mensagem: 'Erro interno ao processar a consulta de CPF.',
      })
    }
  },
  $apis.requireAuth(),
)
