import React, { useState, useEffect, useRef } from 'react'
import {
  Settings,
  Upload,
  Trash2,
  Save,
  CheckCircle2,
  Palette,
  Type,
  ImageIcon,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'
import { salvarConfiguracaoGeral } from '@/services/configuracoes'

const CORES_SUGERIDAS = [
  { nome: 'Azul Padrão', hex: '#2563eb' },
  { nome: 'Azul Escuro / Navy', hex: '#1e40af' },
  { nome: 'Índigo', hex: '#4f46e5' },
  { nome: 'Verde Esmeralda', hex: '#059669' },
  { nome: 'Verde Petróleo (Teal)', hex: '#0d9488' },
  { nome: 'Laranja Comercial', hex: '#ea580c' },
  { nome: 'Vermelho Ruby', hex: '#dc2626' },
  { nome: 'Roxo Moderno', hex: '#7c3aed' },
  { nome: 'Ardósia / Grafite', hex: '#334155' },
]

export default function ConfiguracoesGeralPage() {
  const { config, logoUrl, recarregarConfig } = useConfiguracoes()
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeEditar = pode('configuracoes', 'editar') || pode('configuracoes', 'criar')

  const [nomeSistema, setNomeSistema] = useState(config.nome_sistema || 'ERP Gestão Comercial')
  const [corPrincipal, setCorPrincipal] = useState(config.cor_principal || '#2563eb')
  const [diasAlertaValidade, setDiasAlertaValidade] = useState<number>(
    config.dias_alerta_validade || 30,
  )
  const [arquivoLogo, setArquivoLogo] = useState<File | null>(null)
  const [previewLogo, setPreviewLogo] = useState<string | null>(logoUrl)
  const [removerLogo, setRemoverLogo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNomeSistema(config.nome_sistema || 'ERP Gestão Comercial')
    setCorPrincipal(config.cor_principal || '#2563eb')
    setDiasAlertaValidade(config.dias_alerta_validade || 30)
    setPreviewLogo(logoUrl)
    setArquivoLogo(null)
    setRemoverLogo(false)
  }, [config, logoUrl])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Formato inválido',
        description: 'Por favor, selecione um arquivo de imagem (PNG, JPG, WEBP ou SVG).',
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Arquivo muito grande',
        description: 'O tamanho da imagem não deve exceder 5 MB.',
      })
      return
    }

    setArquivoLogo(file)
    setRemoverLogo(false)
    const objectUrl = URL.createObjectURL(file)
    setPreviewLogo(objectUrl)
  }

  const handleRemoverLogo = () => {
    setArquivoLogo(null)
    setPreviewLogo(null)
    setRemoverLogo(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nomeSistema.trim()) {
      toast({
        variant: 'destructive',
        title: 'Campo obrigatório',
        description: 'O nome do sistema não pode ficar em branco.',
      })
      return
    }

    try {
      setSalvando(true)
      await salvarConfiguracaoGeral(
        {
          nome_sistema: nomeSistema.trim(),
          cor_principal: corPrincipal,
          dias_alerta_validade: diasAlertaValidade || 30,
          logoFile: arquivoLogo,
          removerLogo: removerLogo,
        },
        config.id,
      )

      await recarregarConfig()

      toast({
        title: 'Configurações salvas',
        description: 'Os parâmetros gerais do sistema foram atualizados com sucesso.',
      })
    } catch (err) {
      console.error('Erro ao salvar configurações gerais:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Ocorreu uma falha ao persistir as configurações. Tente novamente.',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Configurações Gerais
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Personalize a identidade visual, nome do ERP e cor temática principal do sistema.
          </p>
        </div>

        {podeEditar && (
          <Button
            onClick={handleSalvar}
            disabled={salvando}
            className="gap-2 bg-primary hover:opacity-95 text-primary-foreground shadow-xs"
          >
            {salvando ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar alterações
              </>
            )}
          </Button>
        )}
      </div>

      <form onSubmit={handleSalvar} className="space-y-6">
        {/* Parâmetros Operacionais de Estoque e Validade */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold text-slate-900">
                Parâmetros de Estoque e Validade
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Configure a antecedência em dias para alertas preventivos de produtos com data de
              validade próxima do vencimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-xs">
              <Label
                htmlFor="dias_alerta_validade"
                className="text-xs font-semibold text-slate-700"
              >
                Dias de antecedência para alerta de validade <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dias_alerta_validade"
                type="number"
                min={1}
                max={365}
                value={diasAlertaValidade}
                onChange={(e) => setDiasAlertaValidade(parseInt(e.target.value, 10) || 30)}
                disabled={!podeEditar || salvando}
                className="text-sm font-mono"
              />
              <p className="text-[11px] text-slate-400">
                Lotes com vencimento em até este número de dias receberão destaque amarelo
                (&quot;Vence em até X dias&quot;) na tela de Lotes e Validade.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Identificação do Sistema */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Type className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold text-slate-900">
                Identificação do Sistema
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Este nome é exibido no cabeçalho do layout, no menu lateral e na tela de login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-md">
              <Label htmlFor="nome_sistema" className="text-xs font-semibold text-slate-700">
                Nome do sistema <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nome_sistema"
                value={nomeSistema}
                onChange={(e) => setNomeSistema(e.target.value)}
                placeholder="Ex: ERP Gestão Comercial"
                disabled={!podeEditar || salvando}
                maxLength={60}
                className="text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Nome exibido na aba do navegador, no topo da barra e na tela de login.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Logo do Sistema */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold text-slate-900">
                Logotipo do Sistema
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Faça upload do logotipo da sua empresa para substituir o ícone padrão do ERP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="w-32 h-32 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden relative shadow-inner">
                {previewLogo ? (
                  <img
                    src={previewLogo}
                    alt="Pré-visualização do logotipo"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center p-3 text-slate-400">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                    <span className="text-[11px] block">Sem logotipo</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoChange}
                  disabled={!podeEditar || salvando}
                  className="hidden"
                  id="logo-upload-input"
                />

                {podeEditar && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={salvando}
                      className="gap-2 text-xs font-medium"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {previewLogo ? 'Trocar imagem' : 'Selecionar imagem'}
                    </Button>

                    {previewLogo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoverLogo}
                        disabled={salvando}
                        className="gap-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </Button>
                    )}
                  </div>
                )}

                <div className="text-[11px] text-slate-500 space-y-1">
                  <p>Formatos suportados: PNG, JPEG, WEBP ou SVG.</p>
                  <p>
                    Tamanho máximo: 5 MB. Proporção recomendada: quadrada ou retangular horizontal.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cor Principal / Tema */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold text-slate-900">
                Cor Principal do Tema
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Defina a cor primária que personaliza os botões, realces, ícones ativos e menus do
              ERP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 max-w-sm">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="cor_picker"
                  value={corPrincipal}
                  onChange={(e) => setCorPrincipal(e.target.value)}
                  disabled={!podeEditar || salvando}
                  className="w-12 h-10 p-1 rounded-lg border border-slate-300 cursor-pointer bg-white"
                  title="Escolha uma cor"
                />
                <Input
                  type="text"
                  value={corPrincipal}
                  onChange={(e) => setCorPrincipal(e.target.value)}
                  disabled={!podeEditar || salvando}
                  placeholder="#2563eb"
                  maxLength={7}
                  className="font-mono text-xs w-28 uppercase"
                />
              </div>

              <div
                className="h-10 px-4 rounded-lg flex items-center justify-center text-white text-xs font-semibold shadow-xs"
                style={{ backgroundColor: corPrincipal }}
              >
                Exemplo
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">Cores sugeridas</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {CORES_SUGERIDAS.map((c) => {
                  const isSelecionada = corPrincipal.toLowerCase() === c.hex.toLowerCase()
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      disabled={!podeEditar || salvando}
                      onClick={() => setCorPrincipal(c.hex)}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all ${
                        isSelecionada
                          ? 'border-slate-900 bg-slate-50 font-semibold shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex-shrink-0 shadow-xs border border-black/10"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="truncate text-slate-700 text-[11px]">{c.nome}</span>
                      {isSelecionada && (
                        <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-slate-900" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg flex items-start gap-2.5 text-xs text-blue-800">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                A cor principal é aplicada automaticamente às variáveis CSS globais de tema do ERP
                (botões, seleções ativas, foco e realces).
              </span>
            </div>
          </CardContent>
        </Card>

        {podeEditar && (
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="submit"
              disabled={salvando}
              className="gap-2 bg-primary hover:opacity-95 text-primary-foreground min-w-[140px] shadow-xs"
            >
              {salvando ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar configurações
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
