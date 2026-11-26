/**
 * Monta o "copia e cola" (BR Code EMV) de um PIX estático com valor,
 * conforme o Manual de Padrões para Iniciação do PIX (Banco Central).
 * Tudo local: nenhuma chamada a banco ou API.
 */

function campo(id: string, valor: string): string {
  return id + String(valor.length).padStart(2, '0') + valor
}

function semAcento(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .\-*@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Normaliza a chave: CPF/CNPJ só dígitos, telefone com +55, e-mail e aleatória como estão. */
export function normalizarChavePix(chave: string): string {
  const c = (chave || '').trim()
  if (!c) return ''
  if (c.includes('@')) return c.toLowerCase()
  // chave aleatória (EVP): 36 caracteres com hífens
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) {
    return c.toLowerCase()
  }
  if (c.startsWith('+')) return '+' + c.replace(/\D/g, '')
  const dig = c.replace(/\D/g, '')
  // 11 dígitos pode ser CPF ou celular: com máscara de telefone "(", trata como telefone
  if (dig.length === 11 && /[()]/.test(c)) return '+55' + dig
  if (dig.length === 11 || dig.length === 14) return dig
  if (dig.length === 10 || dig.length === 13) return '+' + (dig.length === 10 ? '55' : '') + dig
  return c
}

export function montarPixCopiaECola(params: {
  chave: string
  valor: number
  nome: string
  cidade: string
  txid?: string
}): string {
  const chave = normalizarChavePix(params.chave)
  const nome = semAcento(params.nome).slice(0, 25) || 'RECEBEDOR'
  const cidade = semAcento(params.cidade).slice(0, 15) || 'BRASIL'
  const txid = (params.txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave)
  let payload =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    (params.valor > 0 ? campo('54', params.valor.toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', nome) +
    campo('60', cidade) +
    campo('62', campo('05', txid)) +
    '6304'
  payload += crc16(payload)
  return payload
}
