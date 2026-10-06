import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { EmpresaProvider } from '@/contexts/EmpresaContext'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/RouteGuards'
import Layout from '@/components/Layout'

// Páginas de Autenticação
import LoginScreen from '@/pages/auth/LoginScreen'
import ForgotPasswordScreen from '@/pages/auth/ForgotPasswordScreen'
import ResetPasswordScreen from '@/pages/auth/ResetPasswordScreen'
import VerifyEmailScreen from '@/pages/auth/VerifyEmailScreen'
import ConfirmEmailChangeScreen from '@/pages/auth/ConfirmEmailChangeScreen'

// Páginas do Sistema
import Index from '@/pages/Index'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import EmpresasLista from '@/pages/cadastros/EmpresasLista'
import EmpresaForm from '@/pages/cadastros/EmpresaForm'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <EmpresaProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            {/* Rotas Públicas de Autenticação */}
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginScreen />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/esqueci-senha"
              element={
                <PublicOnlyRoute>
                  <ForgotPasswordScreen />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/redefinir-senha"
              element={
                <PublicOnlyRoute>
                  <ResetPasswordScreen />
                </PublicOnlyRoute>
              }
            />
            {/* Compatibilidade com rota inglesa caso chegue por links legados */}
            <Route path="/forgot-password" element={<Navigate to="/esqueci-senha" replace />} />
            <Route path="/reset-password" element={<Navigate to="/redefinir-senha" replace />} />
            <Route path="/verify-email" element={<VerifyEmailScreen />} />
            <Route path="/confirm-email-change" element={<ConfirmEmailChangeScreen />} />

            {/* Rotas Protegidas dentro do Layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* Rota raiz redireciona para /painel */}
              <Route path="/" element={<Navigate to="/painel" replace />} />
              <Route path="/painel" element={<Index />} />

              {/* Cadastros */}
              <Route path="/cadastros/empresas" element={<EmpresasLista />} />
              <Route path="/cadastros/empresas/novo" element={<EmpresaForm />} />
              <Route path="/cadastros/empresas/:id/editar" element={<EmpresaForm />} />
              <Route
                path="/cadastros/usuarios"
                element={
                  <PlaceholderPage
                    title="Usuários"
                    subtitle="Gestão de operadores e administradores do ERP"
                  />
                }
              />
              <Route
                path="/cadastros/perfis-acesso"
                element={
                  <PlaceholderPage
                    title="Perfis de Acesso"
                    subtitle="Matriz de permissões por módulo e nível"
                  />
                }
              />
              <Route
                path="/cadastros/clientes"
                element={
                  <PlaceholderPage
                    title="Clientes"
                    subtitle="Cadastro unificado de clientes compartilhados"
                  />
                }
              />
              <Route
                path="/cadastros/fornecedores"
                element={
                  <PlaceholderPage
                    title="Fornecedores"
                    subtitle="Cadastro de fornecedores de mercadorias e serviços"
                  />
                }
              />
              <Route
                path="/cadastros/produtos"
                element={
                  <PlaceholderPage
                    title="Produtos"
                    subtitle="Catálogo central de produtos, códigos de barras e NCM"
                  />
                }
              />
              <Route
                path="/cadastros/marcas"
                element={
                  <PlaceholderPage title="Marcas" subtitle="Marcas e fabricantes de produtos" />
                }
              />
              <Route
                path="/cadastros/grupos-categorias"
                element={
                  <PlaceholderPage
                    title="Grupos e Categorias"
                    subtitle="Classificação e árvore mercadológica"
                  />
                }
              />
              <Route
                path="/cadastros/unidades-medida"
                element={
                  <PlaceholderPage
                    title="Unidades de Medida"
                    subtitle="Unidades comerciais e tributárias (UN, KG, CX, etc.)"
                  />
                }
              />
              <Route
                path="/cadastros/tabelas-fiscais"
                element={
                  <PlaceholderPage
                    title="Tabelas Fiscais"
                    subtitle="CFOP, CST, CSOSN, NCM e regras tributárias"
                  />
                }
              />

              {/* Configurações */}
              <Route
                path="/configuracoes"
                element={
                  <PlaceholderPage
                    title="Configurações"
                    subtitle="Parâmetros gerais do ERP comercial"
                  />
                }
              />
            </Route>

            {/* Rota desconhecida redireciona para /painel */}
            <Route path="*" element={<Navigate to="/painel" replace />} />
          </Routes>
        </TooltipProvider>
      </EmpresaProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
