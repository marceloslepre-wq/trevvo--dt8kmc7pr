/**
 * Validações brasileiras e máscaras conforme especificações do PROJETO_ERP.md.
 */

/**
 * Validação de CPF: 11 dígitos com módulo 11 e rejeição de sequências repetidas.
 */
export function validarCPF(cpf: string): boolean {
  if (!cpf) return false
  const limpo = cpf.replace(/\D/g, '')
  if (limpo.length !== 11) return false

  // Rejeitar sequências repetidas (00000000000, 11111111111, etc.)
  if (/^(\d)\1{10}$/.test(limpo)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (10 - i)
  }
  let resto = 11 - (soma % 11)
  let dv1 = resto >= 10 ? 0 : resto
  if (dv1 !== parseInt(limpo.charAt(9), 10)) return false

  soma = 0
  for (let i = 0; i < 10; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (11 - i)
  }
  resto = 11 - (soma % 11)
  let dv2 = resto >= 10 ? 0 : resto
  return dv2 === parseInt(limpo.charAt(10), 10)
}

/**
 * Validação de CNPJ numérico e alfanumérico conforme regra estrita do PROJETO_ERP.md:
 * - 14 posições
 * - As 12 primeiras podem ser letras maiúsculas ou números e as 2 últimas são dígitos verificadores (números).
 * - Cálculo do DV: converter cada caractere para (código ASCII - 48).
 * - Pesos do CNPJ:
 *   1º DV: 5,4,3,2,9,8,7,6,5,4,3,2
 *   2º DV: 6,5,4,3,2,9,8,7,6,5,4,3,2
 * - Soma módulo 11; resto menor que 2 vira 0, senão 11 - resto.
 */
export function validarCNPJ(cnpj: string): boolean {
  if (!cnpj) return false
  // Remove pontos, traços, barras e espaços; transforma em maiúsculo
  const limpo = cnpj.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (limpo.length !== 14) return false

  // 12 primeiros: letras maiúsculas ou números (A-Z, 0-9)
  const raizFilial = limpo.substring(0, 12)
  if (!/^[0-9A-Z]{12}$/.test(raizFilial)) return false

  // 2 últimos devem ser numéricos
  const dvEnviado1 = parseInt(limpo.charAt(12), 10)
  const dvEnviado2 = parseInt(limpo.charAt(13), 10)
  if (Number.isNaN(dvEnviado1) || Number.isNaN(dvEnviado2)) return false

  // Pesos
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  // Cálculo 1º DV
  let soma1 = 0
  for (let i = 0; i < 12; i++) {
    const valorAscii = limpo.charCodeAt(i) - 48
    soma1 += valorAscii * pesos1[i]
  }
  const resto1 = soma1 % 11
  const dvCalculado1 = resto1 < 2 ? 0 : 11 - resto1

  if (dvCalculado1 !== dvEnviado1) return false

  // Cálculo 2º DV (inclui o 1º DV na 13ª posição)
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

/**
 * Validação de Inscrição Estadual.
 * Aceita "ISENTO".
 * Para UF ES, valida 9 dígitos com DV (módulo 11, pesos 9 a 2):
 *  - 9 dígitos numéricos
 *  - 8 primeiros multiplicados pelos pesos 9, 8, 7, 6, 5, 4, 3, 2
 *  - resto = soma % 11
 *  - se resto < 2 dv = 0, senão dv = 11 - resto
 */
export function validarInscricaoEstadual(
  ie: string,
  uf: string,
): { valido: boolean; mensagem?: string } {
  if (!ie) return { valido: true }
  const normalizada = ie.trim().toUpperCase()
  if (normalizada === 'ISENTO') return { valido: true }

  if (uf === 'ES') {
    const digitos = normalizada.replace(/\D/g, '')
    if (digitos.length !== 9) {
      return {
        valido: false,
        mensagem: 'IE do Espírito Santo deve ter 9 dígitos numéricos ou ISENTO',
      }
    }
    const pesos = [9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < 8; i++) {
      soma += parseInt(digitos.charAt(i), 10) * pesos[i]
    }
    const resto = soma % 11
    const dvEsperado = resto < 2 ? 0 : 11 - resto
    const dvInformado = parseInt(digitos.charAt(8), 10)

    if (dvEsperado !== dvInformado) {
      return { valido: false, mensagem: 'Dígito verificador da Inscrição Estadual (ES) inválido' }
    }
  }

  return { valido: true }
}

/**
 * Retorna os 8 primeiros caracteres (raiz do CNPJ)
 */
export function extrairRaizCNPJ(cnpj: string): string {
  const limpo = (cnpj || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return limpo.substring(0, 8)
}

/**
 * Formatação de CNPJ: 00.000.000/0000-00 (preserva letras alfanuméricas)
 */
export function formatarCNPJ(valor: string): string {
  if (!valor) return ''
  const limpo = valor
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 14)
  if (limpo.length <= 2) return limpo
  if (limpo.length <= 5) return `${limpo.slice(0, 2)}.${limpo.slice(2)}`
  if (limpo.length <= 8) return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5)}`
  if (limpo.length <= 12)
    return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8)}`
  return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`
}

/**
 * Formatação de CPF: 000.000.000-00
 */
export function formatarCPF(valor: string): string {
  if (!valor) return ''
  const limpo = valor.replace(/\D/g, '').slice(0, 11)
  if (limpo.length <= 3) return limpo
  if (limpo.length <= 6) return `${limpo.slice(0, 3)}.${limpo.slice(3)}`
  if (limpo.length <= 9) return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6)}`
  return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9, 11)}`
}

/**
 * Formatação de CEP: 00000-000
 */
export function formatarCEP(valor: string): string {
  if (!valor) return ''
  const limpo = valor.replace(/\D/g, '').slice(0, 8)
  if (limpo.length <= 5) return limpo
  return `${limpo.slice(0, 5)}-${limpo.slice(5, 8)}`
}

/**
 * Formatação de Telefone: (00) 0000-0000 ou (00) 00000-0000
 */
export function formatarTelefone(valor: string): string {
  if (!valor) return ''
  const limpo = valor.replace(/\D/g, '').slice(0, 11)
  if (limpo.length <= 2) return limpo.length > 0 ? `(${limpo}` : ''
  if (limpo.length <= 6) return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`
  if (limpo.length <= 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`
  return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`
}

/**
 * Consulta de CEP via ViaCEP
 */
export interface EnderecoViaCep {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  ibge: string
  erro?: boolean
}

export async function buscarViaCep(cep: string): Promise<EnderecoViaCep | null> {
  const limpo = (cep || '').replace(/\D/g, '')
  if (limpo.length !== 8) return null

  try {
    const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.erro) return null
    return data as EnderecoViaCep
  } catch (err) {
    console.error('Erro ao consultar ViaCEP:', err)
    return null
  }
}

/**
 * Consulta CNPJ na BrasilAPI (quando numérico)
 */
export interface DadosBrasilApiCnpj {
  cnpj: string
  razao_social?: string
  nome_fantasia?: string
  cnae_fiscal?: number | string
  cnaes_secundarios?: Array<{ codigo: number | string; texto: string }>
  data_inicio_atividade?: string
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  codigo_municipio_ibge?: number | string
  uf?: string
  ddd_telefone_1?: string
  email?: string
}

export async function buscarBrasilApiCnpj(cnpj: string): Promise<DadosBrasilApiCnpj | null> {
  const limpo = (cnpj || '').replace(/\D/g, '')
  if (limpo.length !== 14) return null

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${limpo}`)
    if (!res.ok) return null
    const data = await res.json()
    return data as DadosBrasilApiCnpj
  } catch (err) {
    console.error('Erro ao consultar BrasilAPI CNPJ:', err)
    return null
  }
}
