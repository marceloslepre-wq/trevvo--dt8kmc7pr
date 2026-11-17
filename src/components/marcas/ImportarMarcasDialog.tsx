import { useRef, useState } from 'react'
import { FileUp, Loader2, Upload } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { salvarMarca } from '@/services/marcas'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Importação de marcas por planilha CSV (separada por ";"), com prévia.
 * Coluna obrigatória: nome_no_trevvo (ou nome). Opcionais: marca_no_uniplus, observacao.
 * Linhas com nome vazio são ignoradas. Cada marca nova passa por salvarMarca (validação e auditoria).
 */

type Situacao = 'nova' | 'existe' | 'ignorada'

interface LinhaMarca {
  linha: number
  nome: string
  origem: string
  situacao: Situacao
  motivo: string
  resultado?: 'gravada' | 'falhou'
  erroGravacao?: string
}

function chave(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function lerCsv(texto: string): Record<string, string>[] {
  const linhas = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  if (linhas.length < 2) return []
  const cabecalho = linhas[0].split(';').map((c) => c.trim().toLowerCase())
  return linhas.slice(1).map((l) => {
    const valores = l.split(';')
    const registro: Record<string, string> = {}
    cabecalho.forEach((c, i) => {
      registro[c] = (valores[i] || '').trim().replace(/^"|"$/g, '')
    })
    return registro
  })
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onConcluido: () => void
}

export default function ImportarMarcasDialog({ aberto, onFechar, onConcluido }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [linhas, setLinhas] = useState<LinhaMarca[]>([])
  const [lendo, setLendo] = useState(false)
  const [erroLeitura, setErroLeitura] = useState('')
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [concluido, setConcluido] = useState(false)

  const novas = linhas.filter((l) => l.situacao === 'nova')
  const existentes = linhas.filter((l) => l.situacao === 'existe')
  const ignoradas = linhas.filter((l) => l.situacao === 'ignorada')
  const gravadas = linhas.filter((l) => l.resultado === 'gravada')
  const falhas = linhas.filter((l) => l.resultado === 'falhou')

  function limpar() {
    setNomeArquivo('')
    setLinhas([])
    setErroLeitura('')
    setProgresso(0)
    setConcluido(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function fechar() {
    if (importando) return
    if (concluido) onConcluido()
    limpar()
    onFechar()
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    limpar()
    setNomeArquivo(arquivo.name)
    setLendo(true)
    try {
      const registros = lerCsv(await arquivo.text())
      if (registros.length === 0) throw new Error('O arquivo está vazio ou não tem cabeçalho.')
      const colunaNome = 'nome_no_trevvo' in registros[0] ? 'nome_no_trevvo' : 'nome'
      if (!(colunaNome in registros[0])) {
        throw new Error(
          'O cabeçalho precisa ter a coluna nome_no_trevvo (ou nome), separada por ";".',
        )
      }

      const existentesBanco = await pb
        .collection('marcas')
        .getFullList<{ nome: string }>({ fields: 'nome', batch: 500 })
      const cadastradas = new Set(existentesBanco.map((m) => chave(m.nome)))
      const vistas = new Set<string>()

      setLinhas(
        registros.map((r, i) => {
          const nome = (r[colunaNome] || '').trim()
          const origem = (r.marca_no_uniplus || '').trim()
          let situacao: Situacao = 'nova'
          let motivo = ''
          if (!nome) {
            situacao = 'ignorada'
            motivo = 'Sem nome: os produtos ficam sem marca'
          } else if (cadastradas.has(chave(nome))) {
            situacao = 'existe'
            motivo = 'Já cadastrada (será pulada)'
          } else if (vistas.has(chave(nome))) {
            situacao = 'ignorada'
            motivo = 'Repetida no arquivo'
          }
          if (nome) vistas.add(chave(nome))
          return { linha: i + 2, nome, origem, situacao, motivo }
        }),
      )
    } catch (err) {
      setErroLeitura(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  async function importar() {
    if (novas.length === 0) return
    setImportando(true)
    const atualizadas = [...linhas]
    let feitos = 0
    for (let i = 0; i < atualizadas.length; i++) {
      const l = atualizadas[i]
      if (l.situacao !== 'nova') continue
      try {
        await salvarMarca({
          nome: l.nome,
          observacao: l.origem ? `Importada do Uniplus (${l.origem}).` : 'Importada por planilha.',
          ativo: true,
        })
        atualizadas[i] = { ...l, resultado: 'gravada' }
      } catch (err) {
        atualizadas[i] = {
          ...l,
          resultado: 'falhou',
          erroGravacao: err instanceof Error ? err.message : 'Erro ao gravar',
        }
      }
      feitos++
      setProgresso(Math.round((feitos / novas.length) * 100))
      setLinhas([...atualizadas])
    }
    setImportando(false)
    setConcluido(true)
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-3xl notranslate" translate="no">
        <DialogHeader>
          <DialogTitle>Importar marcas</DialogTitle>
          <DialogDescription>
            Planilha CSV separada por ponto e vírgula, com a coluna nome_no_trevvo no cabeçalho.
            Nada é gravado antes de você conferir a prévia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={aoEscolherArquivo}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={lendo || importando}
              onClick={() => inputRef.current?.click()}
            >
              {lendo ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <FileUp size={14} className="mr-1.5" />
              )}
              Escolher arquivo
            </Button>
            {nomeArquivo && <span className="text-slate-600">{nomeArquivo}</span>}
          </div>

          {erroLeitura && <p className="text-red-600">{erroLeitura}</p>}

          {linhas.length > 0 && (
            <>
              <div className="flex flex-wrap gap-4">
                <span>
                  Novas: <strong>{novas.length}</strong>
                </span>
                <span>
                  Já cadastradas: <strong>{existentes.length}</strong>
                </span>
                <span>
                  Ignoradas: <strong>{ignoradas.length}</strong>
                </span>
                {concluido && (
                  <span>
                    Gravadas: <strong>{gravadas.length}</strong>
                    {falhas.length > 0 && (
                      <span className="text-red-600"> · Falharam: {falhas.length}</span>
                    )}
                  </span>
                )}
              </div>

              {importando && <Progress value={progresso} />}

              <div className="max-h-80 overflow-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left">
                    <tr>
                      <th className="p-2">Linha</th>
                      <th className="p-2">No Uniplus</th>
                      <th className="p-2">No Trevvo</th>
                      <th className="p-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.linha} className="border-t border-slate-100">
                        <td className="p-2">{l.linha}</td>
                        <td className="p-2">{l.origem || '-'}</td>
                        <td className="p-2">{l.nome || '-'}</td>
                        <td
                          className={
                            'p-2 ' +
                            (l.resultado === 'falhou'
                              ? 'text-red-600'
                              : l.situacao === 'nova'
                                ? 'text-emerald-700'
                                : 'text-slate-500')
                          }
                        >
                          {l.resultado === 'gravada'
                            ? 'Gravada'
                            : l.resultado === 'falhou'
                              ? `Falhou: ${l.erroGravacao}`
                              : l.situacao === 'nova'
                                ? 'Nova'
                                : l.motivo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={importando}>
            {concluido ? 'Fechar' : 'Cancelar'}
          </Button>
          {!concluido && (
            <Button onClick={importar} disabled={importando || novas.length === 0}>
              {importando ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Upload size={14} className="mr-1.5" />
              )}
              Importar {novas.length} novas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
