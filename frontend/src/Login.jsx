import React, { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function Login({ onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // --- NOVOS ESTADOS DA VERIFICAÇÃO ---
  const [verifyingEmail, setVerifyingEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [mensagemSucesso, setMensagemSucesso] = useState('');

  // Função para Entrar (Login)
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // O FastAPI usa formulário (form-data) para o login padrão
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Salva o token e avisa o App.jsx que estamos logados
        localStorage.setItem('token', data.access_token);
        onLogin(data); 
      } else {
        setError(data.detail || 'E-mail ou senha incorretos.');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // Função para Criar Conta (Register)
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMensagemSucesso('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Agora, em vez de voltar para o login, ele abre a tela de verificação
        setVerifyingEmail(email);
        setMensagemSucesso('Enviamos um código de 6 dígitos para o seu e-mail!');
      } else {
        setError(data.detail || 'Erro ao criar conta.');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // --- NOVA FUNÇÃO: VERIFICAR CÓDIGO ---
  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMensagemSucesso('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyingEmail, codigo: verificationCode }),
      });
      const data = await response.json();
      
      if (response.ok) {
        setMensagemSucesso('Conta verificada com sucesso! Você já pode entrar.');
        setVerifyingEmail('');
        setVerificationCode('');
        setIsRegistering(false); // Volta para a tela de login
      } else {
        setError(data.detail || 'Código inválido ou expirado.');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>🎸 LeviHub</h1>
        <p>{verifyingEmail ? 'Verificação de Segurança' : isRegistering ? 'Crie sua conta para gerenciar seu louvor' : 'Sua escala e repertório em um só lugar'}</p>

        {/* Avisos */}
        {mensagemSucesso && <div style={{ color: '#2ecc71', marginBottom: '15px', textAlign: 'center', fontWeight: 'bold', padding: '10px', backgroundColor: 'rgba(46, 204, 113, 0.1)', borderRadius: '5px' }}>✅ {mensagemSucesso}</div>}
        {error && <div className="login-error">{error}</div>}

        {/* MODO 1: VERIFICAÇÃO DE CÓDIGO */}
        {verifyingEmail ? (
          <form onSubmit={handleVerify}>
            <p style={{ textAlign: 'center', color: '#9ab', marginBottom: '15px', fontSize: '0.9em' }}>
              Por favor, insira o código que acabamos de enviar para <br/><strong>{verifyingEmail}</strong>
            </p>
            
            <div className="input-group">
              <label>Código de 6 dígitos</label>
              <input 
                type="text" 
                value={verificationCode} 
                onChange={(e) => setVerificationCode(e.target.value)} 
                required 
                maxLength="6"
                placeholder="Ex: 123456"
                style={{ textAlign: 'center', fontSize: '1.5em', letterSpacing: '5px', fontWeight: 'bold' }}
              />
            </div>

            <button type="submit" className="login-btn-main" disabled={loading} style={{ backgroundColor: '#2ecc71' }}>
              {loading ? 'Validando...' : 'Confirmar Conta'}
            </button>
            
            <div style={{ textAlign: 'center', marginTop: '15px' }}>
              <button type="button" onClick={() => { setVerifyingEmail(''); setMensagemSucesso(''); setError(''); }} style={{ background: 'none', border: 'none', color: '#9ab', cursor: 'pointer', textDecoration: 'underline' }}>
                Cancelar / Voltar
              </button>
            </div>
          </form>

        ) : (
          
          /* MODO 2 E 3: LOGIN OU REGISTRO NORMAL */
          <>
            <form onSubmit={isRegistering ? handleRegister : handleLogin}>
              <div className="input-group">
                <label>E-mail</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  placeholder="exemplo@email.com"
                />
              </div>

              <div className="input-group">
                <label>Senha</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  placeholder="Sua senha"
                />
              </div>

              <button type="submit" className="login-btn-main" disabled={loading}>
                {loading ? 'Processando...' : (isRegistering ? 'Cadastrar e Receber Código' : 'Entrar')}
              </button>
            </form>

            <div className="login-divider">ou</div>

            <button 
              className="login-btn-visitor" 
              onClick={() => onLogin(null)} 
              disabled={loading}
            >
              Entrar como Visitante
            </button>

            <div className="login-footer">
              {isRegistering ? (
                <p>Já tem uma conta? <span onClick={() => { setIsRegistering(false); setError(''); setMensagemSucesso(''); }}>Faça Login</span></p>
              ) : (
                <p>Ainda não tem conta? <span onClick={() => { setIsRegistering(true); setError(''); setMensagemSucesso(''); }}>Criar Conta</span></p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Login;