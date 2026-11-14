// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0134: Regras de API por perfil — Vendedor/Caixa (nível API, camada PocketBase)
 *
 * Contexto: o front já bloqueia menu/rotas/botões (tabelaRotas.ts). Esta migration fecha o
 * nível API para o usuário de perfil operacional (Vendedor/Caixa, ex.: TESTE CAIXA), que é
 * identificado no nível da API pelo padrão do projeto (migrations 0068/0075):
 *   admin  = @request.auth.tipo = 'master' || @request.auth.is_admin = true
 *   comum  = qualquer outro usuário autenticado do mesmo assinante.
 *
 * Coleções ajustadas (escopo sempre pelo assinante_id do chamador):
 *  1. pdv_terminais / config_vendas_empresa:
 *     - leitura (list/view): mantida como está (assinante + vínculo ativo em usuarios_empresas);
 *       o PDV precisa ler os terminais da empresa e a config_vendas da empresa.
 *     - create/update/delete: apenas master/admin do assinante.
 *  2. contas_pagar / contas_receber:
 *     - leitura (list/view): mantida como está.
 *     - create/update: apenas master/admin (delete já é null = superuser, mantido).
 *     - Baixas de títulos continuam por hooks/endpoints /backend/v1/financeiro/*, que rodam
 *       com $app e não passam pelas API rules.
 *  3. empresas:
 *     - list/view: usuário comum passa a ver SOMENTE as empresas com vínculo ativo em
 *       usuarios_empresas (antes: todas as empresas do assinante). Master/admin continuam
 *       vendo todas as do assinante.
 *     - create/update/delete: inalterados (já restritos a master/admin).
 *  4. usuarios:
 *     - list/view: usuário comum passa a ver apenas o próprio registro e os colegas
 *       e_vendedor/e_caixa do assinante (necessário para o PDV: seleção de vendedor,
 *       limite de desconto e resolução do operador ERP). Master/admin continuam vendo todos.
 *     - create/update/delete: inalterados (já restritos a master/admin; a rota
 *       /backend/v1/usuarios-admin/* não usa estas regras e não é afetada).
 *
 * perfis_acesso e permissoes já estão corretas (leitura do assinante + escrita só
 * master/admin) e NÃO são tocadas aqui.
 */

migrate(
  (app) => {
    const leituraPorEmpresa =
      "@request.auth.id != '' && empresa_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= empresa_id && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))"
    const escritaAdmin =
      "@request.auth.id != '' && empresa_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true)"

    const aplicar = (nome, regras) => {
      const c = app.findCollectionByNameOrId(nome)
      const chaves = Object.keys(regras)
      for (let i = 0; i < chaves.length; i++) {
        c[chaves[i]] = regras[chaves[i]]
      }
      app.save(c)
    }

    // 1. pdv_terminais: leitura mantida, escrita só admin
    aplicar('pdv_terminais', {
      createRule: escritaAdmin,
      updateRule: escritaAdmin,
      deleteRule: escritaAdmin,
    })

    // 2. config_vendas_empresa: leitura mantida, escrita só admin
    aplicar('config_vendas_empresa', {
      createRule: escritaAdmin,
      updateRule: escritaAdmin,
      deleteRule: escritaAdmin,
    })

    // 3. contas_pagar: escrita só admin (delete permanece superuser)
    aplicar('contas_pagar', {
      createRule: escritaAdmin,
      updateRule: escritaAdmin,
    })

    // 4. contas_receber: escrita só admin (delete permanece superuser)
    aplicar('contas_receber', {
      createRule: escritaAdmin,
      updateRule: escritaAdmin,
    })

    // 5. empresas: usuário comum lê só as empresas com vínculo ativo em usuarios_empresas
    aplicar('empresas', {
      listRule: leituraPorEmpresa,
      viewRule: leituraPorEmpresa,
    })

    // 6. usuarios: usuário comum lê o próprio registro + colegas vendedores/caixas do assinante
    aplicar('usuarios', {
      listRule:
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || auth_user_id ?= @request.auth.id || e_vendedor = true || e_caixa = true)",
      viewRule:
        "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || auth_user_id ?= @request.auth.id || e_vendedor = true || e_caixa = true)",
    })
  },
  (app) => {
    // Down: restaura as regras anteriores (estado das migrations 0068/0075)
    const leituraAntiga =
      "@request.auth.id != '' && empresa_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= empresa_id && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))"
    const leituraAntigaEmpresas =
      "@request.auth.id != '' && assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= id && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))"

    const restaurar = (nome, regras) => {
      const c = app.findCollectionByNameOrId(nome)
      const chaves = Object.keys(regras)
      for (let i = 0; i < chaves.length; i++) {
        c[chaves[i]] = regras[chaves[i]]
      }
      app.save(c)
    }

    restaurar('pdv_terminais', {
      createRule: leituraAntiga,
      updateRule: leituraAntiga,
      deleteRule: leituraAntiga,
    })

    restaurar('config_vendas_empresa', {
      createRule: leituraAntiga,
      updateRule: leituraAntiga,
      deleteRule: leituraAntiga,
    })

    restaurar('contas_pagar', {
      createRule: leituraAntiga,
      updateRule: leituraAntiga,
    })

    restaurar('contas_receber', {
      createRule: leituraAntiga,
      updateRule: leituraAntiga,
    })

    restaurar('empresas', {
      listRule: leituraAntigaEmpresas,
      viewRule: leituraAntigaEmpresas,
    })

    restaurar('usuarios', {
      listRule: "@request.auth.id != '' && assinante_id = @request.auth.assinante_id",
      viewRule: "@request.auth.id != '' && assinante_id = @request.auth.assinante_id",
    })
  },
)
