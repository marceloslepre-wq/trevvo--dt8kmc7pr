import React from 'react'
import { usePermissoes } from '@/contexts/PermissoesContext'
import AcessoNegado from '@/components/AcessoNegado'

/**
 * PERMISSÃO — SÓ NEGA DEPOIS QUE TUDO CARREGOU
 *
 * Este guard só mostra "Acesso negado" quando as permissões TERMINARAM de
 * carregar (carregando === false). Enquanto carregam, renderiza o children
 * (as telas de destino, como /movel/consulta, mostram o seu próprio
 * indicador de carregamento de dados até a resposta chegar).
 *
 * A carga de permissões nunca "fica presa": erros também encerram o
 * carregamento (capturados no PermissoesContext), então a negação real
 * acontece só com dados definitivos — evita o "Acesso Negado" falso visto no
 * celular com internet lenta/instável.
 */
const PermissaoGuard: React.FC<{
  modulo: string
  acao?: string
  children: React.ReactNode
}> = ({ modulo, acao = 'ver', children }) => {
  const { pode, carregando } = usePermissoes()

  // Ainda carregando: não decide nada — não nega nem permite em falso.
  if (carregando) {
    return null
  }

  if (!pode(modulo, acao)) {
    return <AcessoNegado />
  }

  return <>{children}</>
}

export default PermissaoGuard
