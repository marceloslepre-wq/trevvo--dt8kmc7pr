import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import type { Produto } from '@/services/produtos'
import type { Usuario } from '@/services/usuarios'

export interface ValidarDescontoItemParams {
  descontoPercentual: number
  produto: Partial<Produto>
  usuario: Partial<Usuario>
}

export interface ResultadoValidacaoDesconto {
  valido: boolean
  limitePermitido: number
  motivo?: string
  requerAutorizacaoSupervisor: boolean
}

/**
 * Valida o desconto aplicado a um item de venda.
 * Regra:
 * - O limite do usuário vem de `usuario.desconto_maximo_percentual` (0 se vazio).
 * - O limite do produto vem de `produto.permite_desconto` e `produto.desconto_maximo_percentual`.
 * - Se `produto.permite_desconto === false`, o produto NÃO aceita desconto (limite = 0%).
 * - Caso aceite, vale o MENOR dos dois limites (`Math.min(limiteUsuario, limiteProduto)`).
 * - Descontos acima do limite apurado exigem "Autorização de supervisor".
 */
export function validarDescontoItem({
  descontoPercentual,
  produto,
  usuario,
}: ValidarDescontoItemParams): ResultadoValidacaoDesconto {
  const desconto = Math.max(0, Number(descontoPercentual) || 0)

  // 1. Se desconto for 0, sempre válido
  if (desconto === 0) {
    return {
      valido: true,
      limitePermitido: 100,
      requerAutorizacaoSupervisor: false,
    }
  }

  // 2. Produto permite desconto?
  if (produto.permite_desconto === false) {
    return {
      valido: false,
      limitePermitido: 0,
      motivo: `O produto "${produto.descricao || 'Item'}" não aceita desconto.`,
      requerAutorizacaoSupervisor: true,
    }
  }

  // 3. Apura limite do produto
  const limiteProd =
    produto.desconto_maximo_percentual !== undefined &&
    produto.desconto_maximo_percentual !== null &&
    !isNaN(Number(produto.desconto_maximo_percentual))
      ? Number(produto.desconto_maximo_percentual)
      : 100 // se não especificado no produto, 100%

  // 4. Apura limite do usuário
  const limiteUser =
    usuario.desconto_maximo_percentual !== undefined &&
    usuario.desconto_maximo_percentual !== null &&
    !isNaN(Number(usuario.desconto_maximo_percentual))
      ? Number(usuario.desconto_maximo_percentual)
      : 0 // se não especificado no usuário, 0%

  // Regra: vale o MENOR dos dois limites
  const limitePermitido = Math.min(limiteProd, limiteUser)

  if (desconto > limitePermitido) {
    return {
      valido: false,
      limitePermitido,
      motivo: `Desconto informado (${desconto.toFixed(2)}%) excede o limite permitido de ${limitePermitido.toFixed(2)}% (usuário: ${limiteUser.toFixed(2)}%, produto: ${limiteProd.toFixed(2)}%).`,
      requerAutorizacaoSupervisor: true,
    }
  }

  return {
    valido: true,
    limitePermitido,
    requerAutorizacaoSupervisor: false,
  }
}

export interface AutorizarDescontoSupervisorParams {
  email: string
  senha: string
  descontoPercentual: number
  produtoId?: string
  produtoNome?: string
  usuarioOperadorId?: string
  empresaId?: string
  origem?: string // ex: "PDV", "Venda Balcão", "Orçamento"
  vendaContexto?: Record<string, unknown>
}

export interface ResultadoAutorizacaoSupervisor {
  autorizado: boolean
  supervisorId?: string
  supervisorNome?: string
  limiteSupervisor?: number
  mensagem?: string
}

/**
 * Valida as credenciais de um supervisor (e-mail + senha do users auth PocketBase),
 * checa se o supervisor tem limite suficiente para liberar o desconto
 * e grava um log de auditoria formal registrando quem autorizou, o valor e o contexto da venda.
 */
export async function autorizarDescontoSupervisor(
  params: AutorizarDescontoSupervisorParams,
): Promise<ResultadoAutorizacaoSupervisor> {
  const { email, senha, descontoPercentual } = params
  if (!email || !email.trim()) {
    throw new Error('Informe o e-mail do supervisor.')
  }
  if (!senha) {
    throw new Error('Informe a senha do supervisor.')
  }

  // 1. Tenta autenticar via collection 'users'
  let authRecordId: string
  let authEmail: string
  let authName: string
  try {
    const authData = await pb.collection('users').authWithPassword(email.trim(), senha)
    authRecordId = authData.record.id
    authEmail = authData.record.email
    authName = (authData.record.name as string) || authEmail
  } catch (err: unknown) {
    console.error('Falha de autenticação do supervisor:', err)
    throw new Error('E-mail ou senha do supervisor incorretos.')
  }

  // 2. Busca o registro na coleção usuarios vinculado a este authRecordId
  let usuarioSupervisor: Usuario | null = null
  try {
    usuarioSupervisor = await pb
      .collection('usuarios')
      .getFirstListItem<Usuario>(`auth_user_id = '${authRecordId}' && ativo = true`, {
        expand: 'perfil_id',
      })
  } catch {
    // Busca por email se auth_user_id ainda não estiver sincronizado
    try {
      usuarioSupervisor = await pb
        .collection('usuarios')
        .getFirstListItem<Usuario>(`email = '${authEmail.trim()}' && ativo = true`, {
          expand: 'perfil_id',
        })
    } catch {
      // continua sem registro ERP
    }
  }

  // 3. Checa permissões e limites do supervisor
  const perfilAdmin = usuarioSupervisor?.expand?.perfil_id?.administrador === true
  const limiteSupervisor = perfilAdmin
    ? 100
    : Number(usuarioSupervisor?.desconto_maximo_percentual || 0)

  if (!perfilAdmin && descontoPercentual > limiteSupervisor) {
    throw new Error(
      `O supervisor ${usuarioSupervisor?.nome || authName} possui limite de desconto de apenas ${limiteSupervisor.toFixed(2)}%, insuficiente para autorizar ${descontoPercentual.toFixed(2)}%.`,
    )
  }

  // 4. Registra em logs_auditoria
  const supervisorId = usuarioSupervisor?.id || authRecordId
  const supervisorNome = usuarioSupervisor?.nome || authName

  await registrarAuditoria({
    tabela: 'autorizacoes_desconto',
    registro_id: params.produtoId || `desc_${Date.now()}`,
    empresa_id: params.empresaId || null,
    acao: 'inclusao',
    valores_depois: {
      supervisor_id: supervisorId,
      supervisor_nome: supervisorNome,
      supervisor_email: authEmail,
      desconto_percentual: descontoPercentual,
      produto_id: params.produtoId || null,
      produto_nome: params.produtoNome || null,
      operador_id: params.usuarioOperadorId || pb.authStore.record?.id || null,
      origem: params.origem || 'venda_item',
      contexto: params.vendaContexto || null,
      data_autorizacao: new Date().toISOString(),
    },
  })

  return {
    autorizado: true,
    supervisorId,
    supervisorNome,
    limiteSupervisor,
    mensagem: `Desconto de ${descontoPercentual.toFixed(2)}% autorizado com sucesso por ${supervisorNome}.`,
  }
}
