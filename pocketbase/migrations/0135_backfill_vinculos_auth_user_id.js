// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0135: backfill de usuarios_empresas.auth_user_id
 *
 * Causa do bug "PDV não abre caixa" (perfil Vendedor/Caixa, ex.: TESTE CAIXA):
 * o hook /backend/v1/usuarios-admin/criar gravava o vínculo usuario x empresa
 * SEM o campo auth_user_id. As regras de leitura por vínculo (padrão das
 * migrations 0068/0075/0134) exigem
 *   @collection.usuarios_empresas.auth_user_id ?= @request.auth.id
 * então qualquer vínculo com auth_user_id vazio não casa, e o usuário comum
 * deixa de ler pdv_terminais/caixa_sessoes/empresas da própria empresa
 * (aparecia "Nenhum terminal disponível para abertura" no PDV).
 *
 * Esta migration preenche auth_user_id em todos os vínculos cujo usuario_id
 * tenha auth_user_id no cadastro de usuarios. Idempotente: vínculos já
 * preenchidos são ignorados (não sobrescreve).
 */
migrate(
  (app) => {
    let pagina = 0
    const tam = 200
    let total = 0

    while (true) {
      let vinculos = []
      try {
        vinculos = app.findRecordsByFilter(
          'usuarios_empresas',
          'auth_user_id = ""',
          '-created',
          tam,
          pagina * tam,
        )
      } catch (errF) {
        console.log('[0135] erro ao buscar vinculos: ' + errF)
        break
      }
      if (!vinculos || vinculos.length === 0) break

      for (let i = 0; i < vinculos.length; i++) {
        const v = vinculos[i]
        const usuarioId = v.getString('usuario_id')
        if (!usuarioId) continue
        let u = null
        try {
          u = app.findRecordById('usuarios', usuarioId)
        } catch (_) {
          u = null
        }
        if (!u) continue
        const authUserId = u.getString('auth_user_id')
        if (!authUserId) continue
        v.set('auth_user_id', authUserId)
        try {
          app.save(v)
          total++
        } catch (errS) {
          console.log('[0135] erro ao salvar vinculo ' + v.id + ': ' + errS)
        }
      }

      if (vinculos.length < tam) break
      pagina++
      if (pagina > 200) break // defesa contra loop infinito
    }

    console.log('[0135] vinculos usuarios_empresas com auth_user_id preenchido: ' + total)
  },
  (app) => {
    // Down: no-op — não removemos auth_user_id já preenchido (dado corretivo).
  },
)
