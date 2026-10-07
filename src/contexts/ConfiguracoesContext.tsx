import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  ConfiguracaoGeral,
  CONFIG_PADRAO,
  obterConfiguracaoGeral,
  obterUrlLogo,
} from '@/services/configuracoes'

interface ConfiguracoesContextType {
  config: ConfiguracaoGeral
  logoUrl: string | null
  carregando: boolean
  recarregarConfig: () => Promise<void>
}

const ConfiguracoesContext = createContext<ConfiguracoesContextType | undefined>(undefined)

/**
 * Converte HEX (#RRGGBB) para HSL string no formato "H S% L%" utilizado pelo Tailwind
 */
function hexToHsl(hex: string): string | null {
  const cleanHex = hex.replace('#', '').trim()
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return null

  let r = 0,
    g = 0,
    b = 0
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16) / 255
    g = parseInt(cleanHex[1] + cleanHex[1], 16) / 255
    b = parseInt(cleanHex[2] + cleanHex[2], 16) / 255
  } else {
    r = parseInt(cleanHex.substring(0, 2), 16) / 255
    g = parseInt(cleanHex.substring(2, 4), 16) / 255
    b = parseInt(cleanHex.substring(4, 6), 16) / 255
  }

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h = h * 60
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export const ConfiguracoesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ConfiguracaoGeral>(CONFIG_PADRAO)
  const [carregando, setCarregando] = useState<boolean>(true)

  const aplicarTema = useCallback((corHex?: string) => {
    if (!corHex) return
    const hsl = hexToHsl(corHex)
    if (hsl) {
      document.documentElement.style.setProperty('--primary', hsl)
      document.documentElement.style.setProperty('--sidebar-primary', hsl)
      document.documentElement.style.setProperty('--ring', hsl)
    }
    document.documentElement.style.setProperty('--brand-color', corHex)
  }, [])

  const recarregarConfig = useCallback(async () => {
    try {
      setCarregando(true)
      const data = await obterConfiguracaoGeral()
      setConfig(data)
      aplicarTema(data.cor_principal)
      if (data.nome_sistema) {
        document.title = data.nome_sistema
      }
    } catch (err) {
      console.warn('Erro ao carregar configurações gerais:', err)
    } finally {
      setCarregando(false)
    }
  }, [aplicarTema])

  useEffect(() => {
    recarregarConfig()
  }, [recarregarConfig])

  const logoUrl = obterUrlLogo(config)

  return (
    <ConfiguracoesContext.Provider
      value={{
        config,
        logoUrl,
        carregando,
        recarregarConfig,
      }}
    >
      {children}
    </ConfiguracoesContext.Provider>
  )
}

export const useConfiguracoes = () => {
  const ctx = useContext(ConfiguracoesContext)
  if (!ctx) {
    throw new Error('useConfiguracoes deve ser usado dentro de um ConfiguracoesProvider')
  }
  return ctx
}
