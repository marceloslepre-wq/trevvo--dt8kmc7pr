import { useRef, useState } from 'react'
import { FileUp, Loader2, Upload } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Fornecedor, normalizarCpfCnpj, salvarFornecedor } from '@/services/fornecedores'
import { buscarBrasilApiCnpj, validarCNPJ, validarInscricaoEstadual } from '@/lib/validacoes'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
 * Importação de fornecedores por planilha CSV (separada por ";"), com prévia.
 * Colunas reconhecidas pelo cabeçalho: cnpj, razao_social, nome_fantasia, ie, uf, municipio,
 * codigo_municipio_ibge, cep, logradouro, numero, complemento, bairro, telefone, codigo_uniplus.
 * Cada linha nova é gravada pelo mesmo caminho da tela de cadastro (salvarFornecedor),
 * que gera o código, valida e grava a auditoria.
 */

type Situacao = 'novo' | 'existe' | 'erro'

interface LinhaImportacao {
  linha: number
  cnpj: string
  razao_social: string
  nome_fantasia: string
  ie: string
  uf: string
  municipio: string
  codigo_municipio_ibge: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  telefone: string
  codigo_uniplus: string
  situacao: Situacao
  motivo: string
  resultado?: 'gravado' | 'falhou'
  erroGravacao?: string
}

const COLUNAS = [
  'cnpj',
  'razao_social',
  'nome_fantasia',
  'ie',
  'uf',
  'municipio',
  'codigo_municipio_ibge',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'telefone',
  'codigo_uniplus',
] as const

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

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onConcluido: () => void
}

export default function ImportarFornecedoresDialog({ aberto, onFechar, onConcluido }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([])
  const [lendo, setLendo] = useState(false)
  const [erroLeitura, setErroLeitura] = useState('')
  const [completarEndereco, setCompletarEndereco] = useState(true)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [concluido, setConcluido] = useState(false)

  const novos = linhas.filter((l) => l.situacao === 'novo')
  const existentes = linhas.filter((l) => l.situacao === 'existe')
  const comErro = linhas.filter((l) => l.situacao === 'erro')
  const gravados = linhas.filter((l) => l.resultado === 'gravado')
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
      const texto = await arquivo.text()
      const registros = lerCsv(texto)
      if (registros.length === 0) {
        throw new Error('O arquivo está vazio ou não tem cabeçalho.')
      }
      if (!('cnpj' in registros[0]) || !('razao_social' in registros[0])) {
        throw new Error(
          'O cabeçalho precisa ter as colunas cnpj e razao_social, separadas por ";".',
        )
      }

      // CNPJs já cadastrados no assinante (a regra da coleção já limita ao assinante do usuário)
      const existentesBanco = await pb
        .collection('fornecedores')
        .getFullList<{ cpf_cnpj: string }>({ fields: 'cpf_cnpj', batch: 500 })
      const cadastrados = new Set(existentesBanco.map((f) => normalizarCpfCnpj(f.cpf_cnpj)))
      const vistosNoArquivo = new Set<string>()

      const resultado: LinhaImportacao[] = registros.map((r, i) => {
        const base = {} as Record<(typeof COLUNAS)[number], string>
        COLUNAS.forEach((c) => {
          base[c] = r[c] || ''
        })
        const cnpj = normalizarCpfCnpj(base.cnpj)
        const uf = base.uf.toUpperCase()
        const ie = base.ie.toUpperCase()
        let situacao: Situacao = 'novo'
        let motivo = ''
        if (!cnpj || !validarCNPJ(cnpj)) {
          situacao = 'erro'
          motivo = 'CNPJ inválido'
        } else if (!base.razao_social) {
          situacao = 'erro'
          motivo = 'Razão social vazia'
        } else if (cadastrados.has(cnpj)) {
          situacao = 'existe'
          motivo = 'Já cadastrado (será pulado)'
        } else if (vistosNoArquivo.has(cnpj)) {
          situacao = 'erro'
          motivo = 'CNPJ repetido no arquivo'
        } else if (ie && !validarInscricaoEstadual(ie, uf).valido) {
          motivo = 'IE inválida para a UF: entra sem IE'
        } else if (!ie) {
          motivo = 'Sem IE: completar pela primeira NF-e'
        }
        if (cnpj) vistosNoArquivo.add(cnpj)
        return {
          ...base,
          linha: i + 2,
          cnpj,
          uf,
          ie,
          razao_social: base.razao_social.slice(0, 60),
          nome_fantasia: base.nome_fantasia.slice(0, 60),
          situacao,
          motivo,
        }
      })
      setLinhas(resultado)
    } catch (err) {
      setErroLeitura(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  async function importar() {
    if (novos.length === 0) return
    setImportando(true)
    setProgresso(0)
    const atualizadas = [...linhas]
    let feitos = 0
    for (let i = 0; i < atualizadas.length; i++) {
      const l = atualizadas[i]
      if (l.situacao !== 'novo') continue
      try {
        const ieValida = !!l.ie && validarInscricaoEstadual(l.ie, l.uf).valido
        const dados: Partial<Fornecedor> = {
          tipo_pessoa: 'Jurídica',
          cpf_cnpj: l.cnpj,
          razao_social: l.razao_social,
          nome_fantasia: l.nome_fantasia || undefined,
          indicador_ie: ieValida ? (l.ie === 'ISENTO' ? '2' : '1') : '9',
          inscricao_estadual: ieValida && l.ie !== 'ISENTO' ? l.ie : '',
          uf: l.uf,
          municipio: l.municipio,
          codigo_municipio_ibge: l.codigo_municipio_ibge,
          cep: l.cep.replace(/\D/g, ''),
          logradouro: l.logradouro,
          numero: l.numero,
          complemento: l.complemento,
          bairro: l.bairro,
          telefone: l.telefone,
          codigo_pais: '1058',
          pais: 'Brasil',
          ativo: true,
          observacoes: [
            l.codigo_uniplus
              ? `Importado do Uniplus (código ${l.codigo_uniplus}).`
              : 'Importado por planilha.',
            ieValida ? '' : 'IE a completar pela primeira NF-e.',
          ]
            .filter(Boolean)
            .join(' '),
        }

        if (completarEndereco && !l.logradouro) {
          const brasil = await buscarBrasilApiCnpj(l.cnpj)
          if (brasil) {
            dados.cep = (brasil.cep || '').replace(/\D/g, '')
            dados.logradouro = brasil.logradouro || ''
            dados.numero = brasil.numero || ''
            dados.complemento = brasil.complemento || ''
            dados.bairro = brasil.bairro || ''
            dados.municipio = brasil.municipio || dados.municipio
            dados.codigo_municipio_ibge = brasil.codigo_municipio_ibge
              ? String(brasil.codigo_municipio_ibge)
              : dados.codigo_municipio_ibge
            dados.uf = brasil.uf || dados.uf
            if (!dados.nome_fantasia && brasil.nome_fantasia) {
              dados.nome_fantasia = String(brasil.nome_fantasia).slice(0, 60)
            }
          }
          await aguardar(350)
        }

        await salvarFornecedor(dados)
        atualizadas[i] = { ...l, resultado: 'gravado' }
      } catch (err) {
        atualizadas[i] = {
          ...l,
          resultado: 'falhou',
          erroGravacao: err instanceof Error ? err.message : 'Erro ao gravar',
        }
      }
      feitos++
      setProgresso(Math.round((feitos / novos.length) * 100))
      setLinhas([...atualizadas])
    }
    setImportando(false)
    setConcluido(true)
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-4xl notranslate" translate="no">
        <DialogHeader>
          <DialogTitle>Importar fornecedores</DialogTitle>
          <DialogDescription>
            Planilha CSV separada por ponto e vírgula, com as colunas cnpj e razao_social no
            cabeçalho. Nada é gravado antes de você conferir a prévia.
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
                  Novos: <strong>{novos.length}</strong>
                </span>
                <span>
                  Já cadastrados: <strong>{existentes.length}</strong>
                </span>
                <span className={comErro.length ? 'text-red-600' : ''}>
                  Com erro: <strong>{comErro.length}</strong>
                </span>
                {concluido && (
                  <span>
                    Gravados: <strong>{gravados.length}</strong>
                    {falhas.length > 0 && (
                      <span className="text-red-600"> · Falharam: {falhas.length}</span>
                    )}
                  </span>
                )}
              </div>

              <label className="flex items-center gap-2">
                <Checkbox
                  checked={completarEndereco}
                  disabled={importando || concluido}
                  onCheckedChange={(v) => setCompletarEndereco(v === true)}
                />
                Completar o endereço pela consulta pública de CNPJ (BrasilAPI) quando faltar
              </label>

              {importando && <Progress value={progresso} />}

              <div className="max-h-80 overflow-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left">
                    <tr>
                      <th className="p-2">Linha</th>
                      <th className="p-2">CNPJ</th>
                      <th className="p-2">Razão social</th>
                      <th className="p-2">UF</th>
                      <th className="p-2">IE</th>
                      <th className="p-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.linha} className="border-t border-slate-100">
                        <td className="p-2">{l.linha}</td>
                        <td className="p-2 font-mono">{l.cnpj}</td>
                        <td className="p-2">{l.razao_social}</td>
                        <td className="p-2">{l.uf}</td>
                        <td className="p-2">{l.ie || '-'}</td>
                        <td
                          className={
                            'p-2 ' +
                            (l.situacao === 'erro' || l.resultado === 'falhou'
                              ? 'text-red-600'
                              : l.situacao === 'existe'
                                ? 'text-slate-500'
                                : 'text-emerald-700')
                          }
                        >
                          {l.resultado === 'gravado'
                            ? 'Gravado'
                            : l.resultado === 'falhou'
                              ? `Falhou: ${l.erroGravacao}`
                              : l.situacao === 'novo'
                                ? `Novo${l.motivo ? ` (${l.motivo})` : ''}`
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
            <Button onClick={importar} disabled={importando || novos.length === 0}>
              {importando ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Upload size={14} className="mr-1.5" />
              )}
              Importar {novos.length} novos
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
