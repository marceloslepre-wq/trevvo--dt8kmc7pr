import React, { useState, useRef } from 'react'
import {
  UploadCloud,
  FileCode,
  AlertTriangle,
  CheckCircle,
  Building2,
  UserPlus,
  ArrowRight,
  Loader2,
  X,
  FileCheck,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  parseNfeXml,
  buscarNotaPorChave,
  importarXmlNotaEntrada,
  NfeXmlParsed,
  NotaEntrada,
} from '@/services/notasEntrada'
import { TIPOS_ENTRADA, TipoEntradaNota } from '@/services/cfopConversao'
import { normalizarCpfCnpj } from '@/services/fornecedores'

interface ArquivoFila {
  id: string
  file: File
  conteudoXml: string
  parsed?: NfeXmlParsed
  erro?: string
  avisoSemProtocolo?: boolean
  notaExistente?: NotaEntrada | null
  cnpjDestinatarioInvalido?: boolean
  cnpjOutraEmpresaId?: string
  cnpjOutraEmpresaNome?: string
  status: 'pendente' | 'validado' | 'importando' | 'sucesso' | 'erro'
  notaCriada?: NotaEntrada
}

interface ImportarXmlModalProps {
  aberto: boolean
  onClose: () => void
  onImportadoSucesso: (nota: NotaEntrada) => void
}

export const ImportarXmlModal: React.FC<ImportarXmlModalProps> = ({
  aberto,
  onClose,
  onImportadoSucesso,
}) => {
  const { empresaAtiva, empresas, selecionarEmpresa } = useEmpresaAtiva()
  const { toast } = useToast()

  const [fila, setFila] = useState<ArquivoFila[]>([])
  const [tipoEntradaPadrao, setTipoEntradaPadrao] = useState<TipoEntradaNota>('Compra para revenda')
  const [processando, setProcessando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processarArquivos = async (files: FileList | File[]) => {
    if (!empresaAtiva) {
      toast({
        title: 'Empresa não selecionada',
        description: 'Selecione uma empresa ativa antes de importar.',
        variant: 'destructive',
      })
      return
    }

    const novasFilas: ArquivoFila[] = []
    const cnpjEmpresaAtiva = normalizarCpfCnpj(empresaAtiva.cnpj)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.name.toLowerCase().endsWith('.xml')) {
        continue
      }

      try {
        const text = await file.text()
        const parsed = parseNfeXml(text)

        // Validação CNPJ do Destinatário
        const cnpjDest = normalizarCpfCnpj(parsed.destCnpjCpf)
        let cnpjDestInvalido = false
        let outraEmpresaId: string | undefined
        let outraEmpresaNome: string | undefined

        if (cnpjDest && cnpjDest !== cnpjEmpresaAtiva) {
          // Verifica se pertence a outra empresa do grupo
          const outra = empresas.find((e) => normalizarCpfCnpj(e.cnpj) === cnpjDest)
          if (outra) {
            outraEmpresaId = outra.id
            outraEmpresaNome = outra.nome_fantasia || outra.razao_social
          } else {
            cnpjDestInvalido = true
          }
        }

        // Validação Chave já existente na empresa ativa
        let notaExistente: NotaEntrada | null = null
        if (parsed.chaveAcesso) {
          notaExistente = await buscarNotaPorChave(empresaAtiva.id, parsed.chaveAcesso)
        }

        novasFilas.push({
          id: `${file.name}-${Date.now()}-${i}`,
          file,
          conteudoXml: text,
          parsed,
          avisoSemProtocolo: !parsed.temProtocolo,
          notaExistente,
          cnpjDestinatarioInvalido: cnpjDestInvalido,
          cnpjOutraEmpresaId: outraEmpresaId,
          cnpjOutraEmpresaNome: outraEmpresaNome,
          status: 'validado',
        })
      } catch (err: unknown) {
        novasFilas.push({
          id: `${file.name}-${Date.now()}-${i}`,
          file,
          conteudoXml: '',
          erro: err instanceof Error ? err.message : 'Falha ao ler XML',
          status: 'erro',
        })
      }
    }

    setFila((prev) => [...prev, ...novasFilas])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processarArquivos(e.target.files)
      e.target.value = ''
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastando(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processarArquivos(e.dataTransfer.files)
    }
  }

  const removerDaFila = (id: string) => {
    setFila((prev) => prev.filter((item) => item.id !== id))
  }

  const trocarParaEmpresa = (empresaId: string) => {
    selecionarEmpresa(empresaId)
    toast({
      title: 'Empresa ativa alterada',
      description: 'A empresa foi alternada para corresponder ao destinatário do XML.',
    })
    // Revalida a fila limpando bloqueios
    setFila([])
  }

  const executarImportacao = async () => {
    if (!empresaAtiva) return
    const itensValidos = fila.filter(
      (f) =>
        f.status === 'validado' &&
        f.parsed &&
        !f.cnpjDestinatarioInvalido &&
        !f.cnpjOutraEmpresaId &&
        !f.notaExistente,
    )

    if (itensValidos.length === 0) {
      toast({
        title: 'Nenhum arquivo válido para importação',
        description: 'Verifique os avisos e erros dos arquivos selecionados.',
        variant: 'destructive',
      })
      return
    }

    setProcessando(true)
    let ultimaNota: NotaEntrada | null = null
    let totalImportadas = 0

    try {
      for (const item of itensValidos) {
        if (!item.parsed) continue
        item.status = 'importando'
        setFila([...fila])

        const res = await importarXmlNotaEntrada({
          parsed: item.parsed,
          empresaId: empresaAtiva.id,
          tipoEntrada: tipoEntradaPadrao,
          arquivoXml: item.file,
        })

        item.status = 'sucesso'
        item.notaCriada = res.nota
        ultimaNota = res.nota
        totalImportadas++
        setFila([...fila])
      }

      toast({
        title: 'Importação concluída',
        description: `${totalImportadas} nota(s) fiscal(is) importada(s) com sucesso.`,
      })

      if (ultimaNota) {
        onImportadoSucesso(ultimaNota)
      }
    } catch (err: unknown) {
      toast({
        title: 'Erro durante a importação',
        description: err instanceof Error ? err.message : 'Falha ao gravar registros',
        variant: 'destructive',
      })
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <UploadCloud className="h-6 w-6 text-blue-600" />
            <DialogTitle>Importar XML de NF-e do Fornecedor</DialogTitle>
          </div>
          <DialogDescription>
            Importe um ou múltiplos arquivos XML de notas fiscais de entrada (modelo 55). Os dados
            serão lidos e carregados para conferência.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1 flex-1 py-2 text-xs">
          {/* Seletor Tipo de Entrada */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Tipo de Entrada Padrão</Label>
              <p className="text-[11px] text-slate-500">
                Utilizado na conversão automática de CFOP de cada item da nota.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <Select
                value={tipoEntradaPadrao}
                onValueChange={(v: TipoEntradaNota) => setTipoEntradaPadrao(v)}
              >
                <SelectTrigger className="text-xs bg-white">
                  <SelectValue placeholder="Selecione o tipo de entrada" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ENTRADA.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {tipo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Área de Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setArrastando(true)
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              arrastando
                ? 'border-blue-500 bg-blue-50/50'
                : 'border-slate-300 hover:border-blue-400 bg-slate-50/40 hover:bg-slate-50'
            }`}
          >
            <input
              type="file"
              ref={inputRef}
              onChange={handleFileChange}
              multiple
              accept=".xml,text/xml,application/xml"
              className="hidden"
            />
            <FileCode className="h-10 w-10 text-blue-600 mx-auto mb-2 opacity-80" />
            <h4 className="font-semibold text-slate-800 text-sm">
              Clique para selecionar ou arraste arquivos XML de NF-e aqui
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Aceita um ou múltiplos arquivos .xml com tag &lt;nfeProc&gt; ou &lt;infNFe&gt;.
            </p>
          </div>

          {/* Fila de Arquivos Carregados */}
          {fila.length > 0 && (
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">
                  Arquivos na fila ({fila.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFila([])}
                  className="text-xs h-7 text-slate-500"
                >
                  Limpar lista
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {fila.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-200 bg-white flex flex-col gap-2 relative shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileCheck className="h-4 w-4 text-blue-600 shrink-0" />
                        <div>
                          <span className="font-medium text-slate-800">{item.file.name}</span>
                          {item.parsed && (
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                              <span>
                                NF-e <strong>{item.parsed.numero}</strong> / Série{' '}
                                <strong>{item.parsed.serie}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Emitente: <strong>{item.parsed.emitente.razaoSocial}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Valor: <strong>R$ {item.parsed.valorTotal.toFixed(2)}</strong>
                              </span>
                              <span>•</span>
                              <span>{item.parsed.itens.length} itens</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'validado' && (
                          <Badge
                            variant="outline"
                            className="bg-slate-50 text-slate-700 text-[10px]"
                          >
                            Pronto
                          </Badge>
                        )}
                        {item.status === 'importando' && (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                          >
                            <Loader2 className="h-3 w-3 animate-spin mr-1 inline" />
                            Importando
                          </Badge>
                        )}
                        {item.status === 'sucesso' && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                          >
                            <CheckCircle className="h-3 w-3 mr-1 inline" />
                            Concluído
                          </Badge>
                        )}
                        {item.status === 'erro' && (
                          <Badge
                            variant="outline"
                            className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]"
                          >
                            Erro
                          </Badge>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removerDaFila(item.id)}
                          className="h-6 w-6 text-slate-400 hover:text-slate-600"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </div>

                    {/* Avisos e Validações */}
                    {item.erro && (
                      <Alert variant="destructive" className="py-2 text-[11px]">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-xs">Falha no arquivo</AlertTitle>
                        <AlertDescription>{item.erro}</AlertDescription>
                      </Alert>
                    )}

                    {item.notaExistente && (
                      <Alert className="py-2 text-[11px] bg-amber-50 border-amber-200 text-amber-900">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-xs font-semibold">
                          Nota já importada nesta empresa
                        </AlertTitle>
                        <AlertDescription>
                          A chave de acesso <code>{item.parsed?.chaveAcesso}</code> já está
                          cadastrada na nota número <strong>{item.notaExistente.numero}</strong>.
                        </AlertDescription>
                      </Alert>
                    )}

                    {item.cnpjOutraEmpresaId && (
                      <Alert className="py-2 text-[11px] bg-blue-50 border-blue-200 text-blue-900">
                        <Building2 className="h-4 w-4 text-blue-600" />
                        <AlertTitle className="text-xs font-semibold">
                          Destinatário de outra filial
                        </AlertTitle>
                        <AlertDescription className="flex items-center justify-between gap-2 mt-1">
                          <span>
                            Este XML pertence à empresa <strong>{item.cnpjOutraEmpresaNome}</strong>
                            .
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => trocarParaEmpresa(item.cnpjOutraEmpresaId!)}
                            className="h-6 text-[10px] bg-white border-blue-300 text-blue-700 hover:bg-blue-100"
                          >
                            Trocar para esta empresa
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}

                    {item.cnpjDestinatarioInvalido && (
                      <Alert variant="destructive" className="py-2 text-[11px]">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-xs font-semibold">
                          Destinatário incompatível
                        </AlertTitle>
                        <AlertDescription>
                          O CNPJ destinatário (<code>{item.parsed?.destCnpjCpf}</code>) não pertence
                          a nenhuma filial cadastrada do grupo.
                        </AlertDescription>
                      </Alert>
                    )}

                    {item.avisoSemProtocolo && !item.erro && (
                      <Alert className="py-1.5 text-[11px] bg-amber-50/60 border-amber-200 text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <AlertDescription>
                          XML sem protocolo de autorização SEFAZ (importação permitida mediante
                          confirmação).
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={processando}>
            Fechar
          </Button>
          <Button
            size="sm"
            onClick={executarImportacao}
            disabled={
              processando ||
              fila.filter(
                (f) =>
                  f.status === 'validado' &&
                  !f.cnpjDestinatarioInvalido &&
                  !f.cnpjOutraEmpresaId &&
                  !f.notaExistente,
              ).length === 0
            }
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            {processando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                Importar XMLs Válidos
                <ArrowRight size={14} />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ImportarXmlModal
