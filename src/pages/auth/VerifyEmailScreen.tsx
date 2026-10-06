import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function VerifyEmailScreen() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const { confirmVerification } = useAuth()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('Token de verificação ausente na URL.')
      return
    }

    let isMounted = true
    confirmVerification(token)
      .then(() => {
        if (isMounted) setStatus('success')
      })
      .catch(() => {
        if (isMounted) {
          setStatus('error')
          setErrorMessage('O link de verificação expirou ou é inválido.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [token, confirmVerification])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans text-slate-900">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>

        <Card className="border-slate-200 shadow-md bg-white">
          <CardHeader className="space-y-1 text-center pb-4">
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900">
              Verificação de E-mail
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Confirmação de endereço de e-mail no sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center py-4">
            {status === 'loading' && (
              <div className="space-y-3 py-6">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
                <p className="text-sm text-slate-600">Validando confirmação de e-mail...</p>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4 py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    E-mail verificado com sucesso!
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Sua conta está confirmada. Você já pode acessar todas as funcionalidades do ERP.
                  </p>
                </div>
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  <Link to="/login">Ir para o Login</Link>
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4 py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Falha na verificação</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {errorMessage || 'Não foi possível confirmar seu e-mail.'}
                  </p>
                </div>
                <Button asChild variant="outline" className="w-full border-slate-300">
                  <Link to="/login">Voltar ao Login</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
