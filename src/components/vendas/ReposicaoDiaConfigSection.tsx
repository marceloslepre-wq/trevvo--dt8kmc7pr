import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { obterOuCriarConfigVendasEmpresa, salvarConfigVendasEmpresa } from '@/services/configVendas'
import type { Empresa } from '@/services/empresas'
import type { ConfigVendasEmpresa } from '@/services/configVendas'
import { useToast } from '@/hooks/use-toast'
import { listarEmpresasAtivas } from '@/services/empresas'

interface Props {
  empresaId: string
}

/**
 * Seção "Reposição do dia" da configuração de vendas da empresa.
 * - permitir_estoque_negativo: permite vender no PDV/pedido sem saldo disponível.
 * - empresa_reposicao_id: a empresa que repõe o estoque desta (mesmo assinante).
 */
export function ReposicaoDiaConfigSection({ empresaId }: Props) {
  const { toast } = useToast()
  const [config, setConfig] = useState<ConfigVendasEmpresa | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [permitirNegativo, setPermitirNegativo] = useState(false)
  const [empresaReposicao, setEmpresaReposicao] = useState('')
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  useEffect(() => {
    if (!empresaId) return
    let cancelado = false
    setCarregando(true)
    ;(async () => {
      try {
        const cfg = await obterOuCriarConfigVendasEmpresa(empresaId)
        if (cancelado) return
        setConfig(cfg)
        setPermitirNegativo(!!cfg.permitir_estoque_negativo)
        setEmpresaReposicao(cfg.empresa_reposicao_id || '')
        const lista = await listarEmpresasAtivas()
        if (!cancelado) setEmpresas(lista)
      } catch (err) {
        console.error('Erro ao carregar config de reposição:', err)
      } finally {
        if (!cancelado) setCarregando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [empresaId])

  async function salvar(dados: {
    permitir_estoque_negativo?: boolean
    empresa_reposicao_id?: string
  }) {
    if (!config) return
    setSalvando(true)
    try {
      const atualizada = await salvarConfigVendasEmpresa({
        ...config,
        empresa_id: empresaId,
        ...dados,
      } as never)
      setConfig(atualizada)
      toast({
        title: 'Configuração salva',
        description: 'Reposição do dia atualizada para esta empresa.',
      })
    } catch (err) {
      console.error('Erro ao salvar config de reposição:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar a configuração de reposição do dia.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando configuração de reposição...
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reposição do dia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="permitir-estoque-negativo">Permitir estoque negativo</Label>
            <p className="text-sm text-muted-foreground">
              Quando ligado, a empresa pode vender (PDV e pedido) mesmo sem saldo disponível em
              estoque.
            </p>
          </div>
          <Switch
            id="permitir-estoque-negativo"
            checked={permitirNegativo}
            disabled={salvando}
            onCheckedChange={(v) => {
              setPermitirNegativo(v)
              salvar({ permitir_estoque_negativo: v })
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="empresa-reposicao">Empresa de reposição</Label>
          <p className="text-sm text-muted-foreground">
            A empresa que repõe o estoque desta no fim do dia (deve ser do mesmo assinante).
          </p>
          <Select
            value={empresaReposicao || undefined}
            disabled={salvando}
            onValueChange={(v) => {
              setEmpresaReposicao(v)
              salvar({ empresa_reposicao_id: v })
            }}
          >
            <SelectTrigger id="empresa-reposicao" className="w-full md:w-96">
              <SelectValue placeholder="Selecione a empresa que repõe o estoque" />
            </SelectTrigger>
            <SelectContent>
              {empresas
                .filter((e) => e.id !== empresaId)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.codigo ? `${e.codigo} - ` : ''}
                    {e.nome_fantasia || e.razao_social || e.id}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
