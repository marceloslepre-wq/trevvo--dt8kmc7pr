import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Upload, CheckCircle2, FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { movimentarEstoque, ItemMovimentacaoEstoque } from '@/services/estoque'
import { Produto } from '@/services/produtos'
import pb from '@/lib/pocketbase/client'

export interface ImportarSaldoInicialModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  onSucesso: () => void
}

interface LinhaCsvImport {
  linhaNumero: number
  codigoOuGtin: string
  quantidadeStr: string
  custoUnitarioStr: string
  produtoEncontrado?: Produto
  quantidadeValida?: number
  custoValido?: number
  erro?: string
}

export const ImportarSaldoInicialModal: React.FC<ImportarSaldoInicialModalProps> = ({
  aberto,
  onOpenChange,
  onSucesso,
}) => {
  const { empresaAtiva } = useEmpresaAtiva()
  const [arquivoNome, setArquivoNome] = useState('')
  const [linhas, setLinhas] = useState<LinhaCsvImport[]>([])
  const [processandoArquivo, setProcessandoArquivo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reseta ao fechar
  useEffect(() => {
    if (!aberto) {
      setArquivoNome('')
      setLinhas([])
      setProcessandoArquivo(false)
      setSalvando(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [aberto])

  const handleSelecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivoNome(file.name)
    setProcessandoArquivo(true)

    try {
      const text = await file.text()
      const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)

      if (rawLines.length === 0) {
        toast({
          title: 'Arquivo vazio',
          description: 'O arquivo CSV selecionado não possui linhas de dados.',
          variant: 'destructive',
        })
        setProcessandoArquivo(false)
        return
      }

      // Identifica delimitador (; ou ,)
      const primeiraLinha = rawLines[0]
      const delimitador = primeiraLinha.includes(';') ? ';' : ','

      // Verifica se a primeira linha é cabeçalho
      const inicioIndice =
        primeiraLinha.toLowerCase().includes('codigo') ||
        primeiraLinha.toLowerCase().includes('gtin')
          ? 1
          : 0

      // Carregar produtos da base para conferência rápida
      const todosProdutos = await pb.collection('produtos').getFullList<Produto>({
        filter: 'ativo = true',
        expand: 'unidade_id',
      })

      const mapaPorGtin = new Map<string, Produto>()
      const mapaPorCodigo = new Map<number, Produto>()

      todosProdutos.forEach((p) => {
        if (p.gtin) mapaPorGtin.set(p.gtin.trim().toLowerCase(), p)
        mapaPorCodigo.set(p.codigo, p)
      })

      const parsed: LinhaCsvImport[] = []

      for (let i = inicioIndice; i < rawLines.length; i++) {
        const linhaRaw = rawLines[i].trim()
        if (!linhaRaw) continue

        const cols = linhaRaw.split(delimitador).map((c) => c.trim().replace(/^"|"$/g, ''))
        const codigoOuGtin = cols[0] || ''
        const qtdStr = cols[1] || ''
        const custoStr = cols[2] || ''

        let erro: string | undefined

        // Validar produto
        let prod: Produto | undefined
        if (codigoOuGtin) {
          prod = mapaPorGtin.get(codigoOuGtin.toLowerCase())
          if (!prod && /^\d+$/.test(codigoOuGtin)) {
            prod = mapaPorCodigo.get(parseInt(codigoOuGtin, 10))
          }
        }

        if (!prod) {
          erro = `Produto "${codigoOuGtin}" não encontrado no catálogo.`
        } else if (prod.controla_estoque === false) {
          erro = `Produto "${prod.descricao}" não controla estoque.`
        }

        // Validar quantidade
        const qtdNum = parseFloat(qtdStr.replace(',', '.'))
        if (isNaN(qtdNum) || qtdNum <= 0) {
          erro = erro || `Quantidade inválida: "${qtdStr}" (deve ser > 0).`
        }

        // Validar custo unitário
        const custoNum = parseFloat(custoStr.replace(',', '.'))
        if (isNaN(custoNum) || custoNum < 0) {
          erro = erro || `Custo unitário inválido: "${custoStr}".`
        }

        parsed.push({
          linhaNumero: i + 1,
          codigoOuGtin,
          quantidadeStr: qtdStr,
          custoUnitarioStr: custoStr,
          produtoEncontrado: prod,
          quantidadeValida: isNaN(qtdNum) ? undefined : qtdNum,
          custoValido: isNaN(custoNum) ? undefined : custoNum,
          erro,
        })
      }

      setLinhas(parsed)
    } catch (err) {
      console.error('Erro ao ler CSV:', err)
      toast({
        title: 'Erro ao processar CSV',
        description: 'Verifique se o arquivo está no padrão especificado.',
        variant: 'destructive',
      })
    } finally {
      setProcessandoArquivo(false)
    }
  }

  const linhasValidas = linhas.filter((l) => !l.erro)
  const linhasComErro = linhas.filter((l) => Boolean(l.erro))

  const handleImportar = async () => {
    if (!empresaAtiva) {
      toast({
        title: 'Empresa ativa não selecionada',
        variant: 'destructive',
      })
      return
    }

    if (linhasValidas.length === 0) {
      toast({
        title: 'Nenhum item válido para importar',
        description: 'Corrija os erros apontados no arquivo CSV.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const agoraIso = new Date().toISOString()
      const itensParaMovimentar: ItemMovimentacaoEstoque[] = linhasValidas.map((l) => ({
        empresa_id: empresaAtiva.id,
        produto_id: l.produtoEncontrado!.id,
        tipo: 'Entrada',
        origem: 'SALDO_INICIAL',
        quantidade: l.quantidadeValida!,
        custo_unitario: l.custoValido!,
        data_movimento: agoraIso,
        documento_tipo: 'Saldo inicial',
        documento_numero: 'IMPORT_CSV',
        motivo: 'Implantação de saldo inicial via planilha CSV',
        observacao: `Importado do arquivo: ${arquivoNome} (linha ${l.linhaNumero})`,
      }))

      const res = await movimentarEstoque(itensParaMovimentar)

      if (res.sucesso) {
        toast({
          title: 'Saldo inicial importado com sucesso!',
          description: `${res.total} produtos movimentados na empresa ${empresaAtiva.nome_fantasia || empresaAtiva.razao_social}.`,
        })
        onSucesso()
        onOpenChange(false)
      } else {
        toast({
          title: 'Erro na importação',
          description: res.message,
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha ao salvar saldo inicial',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const baixarExemploCsv = () => {
    const csvContent =
      'codigo_ou_gtin;quantidade;custo_unitario\r\n1;50;15.50\r\n7891234567890;120.5000;8.90\r\n'
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'modelo_saldo_inicial.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            <DialogTitle className="text-base font-bold text-slate-900">
              Importar Saldo Inicial por CSV
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-600">
            Cadastre rapidamente o inventário inicial da filial via planilha. Colunas:
            <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] font-mono mx-1 text-slate-800">
              codigo_ou_gtin;quantidade;custo_unitario
            </code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 text-xs">
          {/* Seletor de Arquivo e Botão de Modelo */}
          <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-semibold text-slate-800">Selecione o arquivo CSV (.csv)</div>
              <div className="text-[11px] text-slate-500">
                Delimitador recomendado: ponto e vírgula (;). Quantidade com até 4 decimais.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={baixarExemploCsv}
                className="text-xs text-slate-700"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-slate-500" />
                Baixar Modelo
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleSelecionarArquivo}
                className="hidden"
                id="csv-saldo-upload"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                {arquivoNome ? 'Trocar Arquivo' : 'Escolher Arquivo'}
              </Button>
            </div>
          </div>

          {processandoArquivo && (
            <div className="py-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span>Validando dados e cruzando com o catálogo de produtos...</span>
            </div>
          )}

          {/* Resumo da validação */}
          {linhas.length > 0 && !processandoArquivo && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                  {linhas.length} linha(s) lida(s)
                </Badge>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                  {linhasValidas.length} válida(s)
                </Badge>
                {linhasComErro.length > 0 && (
                  <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-xs">
                    {linhasComErro.length} com erro
                  </Badge>
                )}
              </div>

              {/* Tabela de prévia */}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2 text-center">Linha</th>
                      <th className="p-2">Identificador</th>
                      <th className="p-2">Produto Encontrado</th>
                      <th className="p-2 text-right">Qtd</th>
                      <th className="p-2 text-right">Custo Unitário</th>
                      <th className="p-2">Status / Erro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {linhas.map((l) => (
                      <tr
                        key={l.linhaNumero}
                        className={l.erro ? 'bg-rose-50/50' : 'hover:bg-slate-50'}
                      >
                        <td className="p-2 text-center font-mono text-slate-400">
                          {l.linhaNumero}
                        </td>
                        <td className="p-2 font-mono font-medium text-slate-700">
                          {l.codigoOuGtin}
                        </td>
                        <td className="p-2">
                          {l.produtoEncontrado ? (
                            <div>
                              <span className="font-semibold text-slate-900">
                                {l.produtoEncontrado.descricao}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                #{l.produtoEncontrado.codigo} •{' '}
                                {l.produtoEncontrado.expand?.unidade_id?.sigla}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">
                          {l.quantidadeValida !== undefined
                            ? l.quantidadeValida.toLocaleString('pt-BR', {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })
                            : l.quantidadeStr}
                        </td>
                        <td className="p-2 text-right font-mono text-slate-700">
                          {l.custoValido !== undefined
                            ? l.custoValido.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })
                            : l.custoUnitarioStr}
                        </td>
                        <td className="p-2">
                          {l.erro ? (
                            <span className="text-rose-600 font-medium flex items-center gap-1 text-[11px]">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              {l.erro}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-medium flex items-center gap-1 text-[11px]">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              Pronto para importar
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
            className="text-xs"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleImportar}
            disabled={salvando || linhasValidas.length === 0}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {salvando ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Gravando Movimentos...
              </>
            ) : (
              `Importar ${linhasValidas.length} Itens Válidos`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export default ImportarSaldoInicialModal
