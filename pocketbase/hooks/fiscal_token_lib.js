/// <reference path="../types.d.ts" />

/**
 * Módulo fiscal_token_lib.js
 *
 * Função única centralizada no backend para obter o token da Focus NFe.
 *
 * Hierarquia de busca (conforme Prompt 9.6 item 4):
 * 1) Coleção `credenciais_fiscais` vinculada à empresa do documento:
 *    - Se o ambiente configurado na `config_emissao_fiscal` da empresa for 'Produção', usa token_producao.
 *    - Caso contrário, usa token_homologacao.
 *    - Se o token da tabela estiver preenchido (não vazio), retorna ele com origem 'banco'.
 * 2) Fallback para segredos do Skip Cloud ($os.getenv):
 *    - Padrão histórico FOCUS_NFE_TOKEN_${PRODUCAO|HOMOLOGACAO}_${codigo_token} ou FOCUS_NFE_TOKEN_${PRODUCAO|HOMOLOGACAO}.
 *    - Se preenchido, retorna ele com origem 'segredo'.
 * 3) Se nenhum for encontrado, retorna token vazio com origem 'nenhuma'.
 *
 * OBSERVAÇÃO CRÍTICA JSVM: Este arquivo NÃO registra hooks nem routerAdd, apenas exporta
 * funções via module.exports. Deve ser importado com require(`${__hooks}/fiscal_token_lib.js`)
 * DENTRO dos callbacks onde for utilizado.
 */

function obterTokenFocus(empresaId, appInstance) {
  const app = appInstance || $app
  if (!empresaId) {
    return {
      token: '',
      origem: 'nenhuma',
      ambiente: 'Homologação',
      nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
      codigoToken: '',
    }
  }

  // 1) Obter ambiente e codigo_token da config_emissao_fiscal da empresa
  let ambiente = 'Homologação'
  let codigoToken = ''
  try {
    const configs = app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )
    if (configs && configs.length > 0) {
      const cfg = configs[0]
      ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
      codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
    }
  } catch (_) {}

  const ehProducao = ambiente === 'Produção'
  const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
  let nomeSegredo = codigoToken
    ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
    : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

  // 2) Tentar buscar na coleção credenciais_fiscais (prioridade 1)
  try {
    const creds = app.findRecordsByFilter(
      'credenciais_fiscais',
      `empresa_id = '${empresaId}'`,
      '-created',
      1,
      0,
    )
    if (creds && creds.length > 0) {
      const cred = creds[0]
      const tokenBanco = (
        ehProducao ? cred.getString('token_producao') : cred.getString('token_homologacao')
      ).trim()

      if (tokenBanco && tokenBanco.length > 0) {
        return {
          token: tokenBanco,
          origem: 'banco',
          ambiente: ambiente,
          nomeSegredo: nomeSegredo,
          codigoToken: codigoToken,
        }
      }
    }
  } catch (errCred) {
    // Caso de erro de leitura ou tabela vazia, segue para o fallback
  }

  // 3) Fallback para segredos do Skip Cloud ($os.getenv)
  let tokenSegredo = ''
  try {
    if (codigoToken) {
      tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
    }
  } catch (_) {
    tokenSegredo = ''
  }

  // Se não achou com codigoToken ou não tinha codigoToken, tenta o segredo por código/id da empresa ou padrão
  if (!tokenSegredo) {
    try {
      const empRec = app.findRecordById('empresas', empresaId)
      const codEmp = empRec.getInt('codigo')
      if (codEmp === 2) {
        const segEcommerce = (
          $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
        ).trim()
        if (segEcommerce) {
          tokenSegredo = segEcommerce
          nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
        }
      } else if (codEmp === 3) {
        const segFilial05 = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || '').trim()
        if (segFilial05) {
          tokenSegredo = segFilial05
          nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
        }
      }
    } catch (_) {}
  }

  // Se ainda não achou, tenta o segredo padrão sem sufixo de empresa
  if (!tokenSegredo) {
    try {
      const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
      if (segPadrao) {
        tokenSegredo = segPadrao
        nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
      }
    } catch (_) {}
  }

  if (tokenSegredo && tokenSegredo.length > 0) {
    return {
      token: tokenSegredo,
      origem: 'segredo',
      ambiente: ambiente,
      nomeSegredo: nomeSegredo,
      codigoToken: codigoToken,
    }
  }

  return {
    token: '',
    origem: 'nenhuma',
    ambiente: ambiente,
    nomeSegredo: nomeSegredo,
    codigoToken: codigoToken,
  }
}

/**
 * Gera uma string aleatória longa para webhook_secret (letras e números)
 */
function gerarWebhookSecret(tamanho) {
  const len = tamanho || 32
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < len; i++) {
    const idx = Math.floor(Math.random() * chars.length)
    result += chars.charAt(idx)
  }
  return result
}

module.exports = {
  obterTokenFocus: obterTokenFocus,
  gerarWebhookSecret: gerarWebhookSecret,
}
