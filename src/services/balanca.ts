import type { ConfigVendasEmpresa } from '@/services/configVendas'
import type { Produto } from '@/services/produtos'

export interface ResultadoLeituraBalanca {
  ehEtiquetaBalanca: boolean
  codigoProduto?: string
  tipo?: 'Preço' | 'Peso'
  valorTotal?: number
  pesoKg?: number
  quantidadeKgCalculada?: number
  produtoEncontrado?: Produto | null
  erro?: string
}

/**
 * Interpreta se uma string de código de barras é uma etiqueta EAN-13 de balança
 * e extrai o código do produto e o valor ou peso gravado.
 *
 * Padrão brasileiro GS1 / Balança checkout (EAN-13 iniciando com '2' ou prefixo configurado):
 * - Código tem 13 dígitos
 * - Começa com balanca_prefixo (padrão '2')
 * - Código do item: posições [inicio, inicio + tamanho]
 *   Configuração padrão: inicio = 2 (índice 1 no array 0-based), tamanho = 5 (índices 1 a 5)
 * - Posições 8 a 12 (índices 7 a 11, total 5 dígitos): valor em centavos ou peso em gramas
 *   Exemplo: '01590' => se Preço: R$ 15,90; se Peso: 1.590 kg (1590 gramas)
 * - Último dígito (posição 13 / índice 12): dígito verificador EAN-13
 */
export function decodificarEtiquetaBalanca(
  codigoLido: string,
  config?: ConfigVendasEmpresa | null,
  produtosCache?: Produto[],
): ResultadoLeituraBalanca {
  const codigoLimpo = (codigoLido || '').trim()

  if (!config?.balanca_ativa) {
    return { ehEtiquetaBalanca: false }
  }

  const prefixo = (config.balanca_prefixo || '2').trim()
  if (!prefixo) {
    return { ehEtiquetaBalanca: false }
  }

  // Verifica se é EAN-13 e começa com o prefixo
  if (codigoLimpo.length !== 13 || !codigoLimpo.startsWith(prefixo)) {
    return { ehEtiquetaBalanca: false }
  }

  // Não pode ser GTIN normal de outro produto se não estiver configurado
  const posCodigo1Based = config.balanca_posicao_codigo || 2
  const tamCodigo = config.balanca_tamanho_codigo || 5
  const inicioIdx = Math.max(0, posCodigo1Based - 1)
  const fimIdx = inicioIdx + tamCodigo

  if (fimIdx > 12) {
    return {
      ehEtiquetaBalanca: true,
      erro: 'Configuração de posição e tamanho de código da balança inválida.',
    }
  }

  const codigoExtraidoRaw = codigoLimpo.substring(inicioIdx, fimIdx)
  // Pode vir com zeros à esquerda: '00123' => '123' ou manter
  const codigoNumerico = parseInt(codigoExtraidoRaw, 10)
  const codigoStr = isNaN(codigoNumerico) ? codigoExtraidoRaw : String(codigoNumerico)

  // Extrai valor ou peso das posições 8 a 12 (índices 7 a 12, length 5)
  // EAN-13: [0][1 2 3 4 5][6][7 8 9 10 11][12]
  // substring(7, 12) = 5 dígitos
  const valorPesoRaw = codigoLimpo.substring(7, 12)
  const valorInt = parseInt(valorPesoRaw, 10)

  if (isNaN(valorInt) || valorInt < 0) {
    return {
      ehEtiquetaBalanca: true,
      codigoProduto: codigoStr,
      erro: 'Não foi possível extrair o valor/peso da etiqueta de balança.',
    }
  }

  const tipoBalanca = config.balanca_tipo || 'Preço'

  // Procura produto no cache local se fornecido
  let prodEncontrado: Produto | null = null
  if (produtosCache && produtosCache.length > 0) {
    prodEncontrado =
      produtosCache.find(
        (p) =>
          String(p.codigo) === codigoStr ||
          p.gtin === codigoExtraidoRaw ||
          p.gtin === codigoStr ||
          p.referencia === codigoStr,
      ) || null
  }

  if (tipoBalanca === 'Preço') {
    // 5 dígitos representam centavos: ex: 1590 => R$ 15,90
    const valorReais = valorInt / 100
    let qtdCalculada = 1

    if (prodEncontrado && prodEncontrado.preco_venda && prodEncontrado.preco_venda > 0) {
      // Quantidade = Valor / Preço Unitário
      qtdCalculada = Number((valorReais / prodEncontrado.preco_venda).toFixed(3))
    }

    return {
      ehEtiquetaBalanca: true,
      codigoProduto: codigoStr,
      tipo: 'Preço',
      valorTotal: valorReais,
      quantidadeKgCalculada: qtdCalculada,
      produtoEncontrado: prodEncontrado,
    }
  } else {
    // Peso: 5 dígitos representam gramas: ex: 1590 => 1.590 kg
    const pesoKg = Number((valorInt / 1000).toFixed(3))
    return {
      ehEtiquetaBalanca: true,
      codigoProduto: codigoStr,
      tipo: 'Peso',
      pesoKg,
      quantidadeKgCalculada: pesoKg,
      produtoEncontrado: prodEncontrado,
    }
  }
}
