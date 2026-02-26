import React, { useState, useRef, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function LeviRoboto() {
  const [messages, setMessages] = useState([
    { 
      sender: 'bot', 
      text: 'Olá Abençoado(a)! Escolha uma das opções:\n\n/opcao1: Procurar músicas a partir de uma palavra chave\n\n/opcao2: Listar algumas músicas para planejar o louvor do dia\n\n/opcao3: Sugerir uma música para o nosso banco de dados (em breve)\n\n/opcao4: Encerrar\n\n(Ou use o menu ☰ abaixo)' 
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [botState, setBotState] = useState('idle'); 
  const [isLoading, setIsLoading] = useState(false);
  const [ultimaPalavra, setUltimaPalavra] = useState(''); 
  
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const commandList = [
    { cmd: '/start', desc: 'Dá início a conversa', enabled: true },
    { cmd: '/opcao1', desc: '🔍 Procurar músicas a partir de uma palavra chave', enabled: true },
    { cmd: '/opcao2', desc: '🎲 Listar músicas para planejar o louvor', enabled: true },
    { cmd: '/opcao3', desc: '💡 Sugerir uma música para o banco de dados', enabled: true },
    { cmd: '/opcao4', desc: '❌ Encerrar', enabled: true },
    { cmd: '/opcao5', desc: '🔄 Refazer última busca', enabled: true },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (sender, text) => {
    setMessages(prev => [...prev, { sender, text }]);
  };

  const handleSelectCommand = (cmd) => {
    setShowCommandMenu(false);
    setInputValue(''); 
    handleSend(cmd); 
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    if (val === '/') {
      setShowCommandMenu(true);
    } else if (val.length === 0 && showCommandMenu) {
      setShowCommandMenu(false);
    }
  };

  // --- O CÉREBRO DA INTERAÇÃO (Comandos + Links) ---
  const formatarMensagem = (text) => {
    // Procura por comandos EXATOS do bot OU por links http/https
    const regex = /(\/(?:start|cancel|opcao1|opcao2|opcao3|opcao4|opcao5)|https?:\/\/[^\s]+)/gi;
    const partes = text.split(regex);
    
    return partes.map((parte, index) => {
      // Se for um comando do bot:
      if (parte.match(/^\/(?:start|cancel|opcao1|opcao2|opcao3|opcao4|opcao5)$/i)) {
        return (
          <span 
            key={index} 
            className="clickable-command" 
            onClick={() => handleSend(parte.toLowerCase())}
            title="Clique para executar"
          >
            {parte}
          </span>
        );
      } 
      // Se for um Link da Web (YouTube, etc):
      else if (parte.match(/^https?:\/\/[^\s]+/i)) {
        return (
          <a 
            key={index} 
            href={parte} 
            target="_blank" 
            rel="noopener noreferrer"
            className="clickable-link"
            title={parte}
            style={{ marginLeft: '5px', fontSize: '0.9em' }}
          >
            🔗 Ouvir / Cifra
          </a>
        );
      }
      // Se for texto normal:
      return <span key={index}>{parte}</span>;
    });
  };

  // --- FUNÇÃO ISOLADA DE BUSCA (CURA O ERRO DE RECURSÃO INFINITA) ---
  const executarBusca = async (termoDeBusca) => {
    setUltimaPalavra(termoDeBusca); 
    
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const res = await fetch(`${API_BASE_URL}/musicas/buscar?q=${encodeURIComponent(termoDeBusca)}`, { headers });
      const data = await res.json();
      
      if (data.error) {
         addMessage('bot', `Erro ao buscar: ${data.error}`);
      } else if (data.resultados && data.resultados.length > 0) {
         
         const palavraFormatada = data.closest_word.charAt(0).toUpperCase() + data.closest_word.slice(1);
         addMessage('bot', `Bip... Bop... 🤖 Eita glória! 🥳 A palavra chave mais próxima de "${termoDeBusca}" que encontrei no meu banco de dados é: ${palavraFormatada}`);
         
         setTimeout(() => {
             let msg = `Aqui estão algumas músicas que têm a ver com a palavra "${palavraFormatada}":\n`;
             data.resultados.forEach(musica => {
               msg += `\n${musica}\n`;
             });
             addMessage('bot', msg);
             
             setTimeout(() => {
               addMessage('bot', 'Gostaria de consultar mais músicas relacionadas à mesma palavra-chave? Se sim, basta selecionar a /opcao5');
               
               setTimeout(() => {
                   addMessage('bot', 'Se não, você também pode:\n/opcao1: Fazer uma busca com uma palavra chave diferente\n/opcao2: Listar algumas músicas para planejar o louvor do dia\n/opcao3: Sugerir uma música para o nosso banco de dados\n/opcao4: Encerrar');
               }, 600);
             }, 600);
         }, 600);

      } else {
         addMessage('bot', `Bip... Bop... 🤖 Misericórdia! Não encontrei nenhuma palavra parecida com "${termoDeBusca}" no meu banco de dados 🙄`);
      }
    } catch (e) {
      addMessage('bot', 'Desculpe, ocorreu um erro de conexão com a API.');
    }
    
    setBotState('idle'); 
  };

  // --- O GERENCIADOR PRINCIPAL ---
  const handleSend = async (textOverride) => {
    const text = textOverride !== undefined ? textOverride : inputValue;
    if (!text.trim()) return;

    setShowCommandMenu(false); 
    addMessage('user', text);
    setInputValue('');
    setIsLoading(true);

    const command = text.trim().toLowerCase();

    try {
      // --- PASSO 1: COMANDOS GLOBAIS (Funcionam em qualquer estado) ---
      if (command === '/cancel') {
        setBotState('idle');
        addMessage('bot', 'Conversa cancelada.\nSe precisar é só dar um /start');
      }
      else if (command === '/start') {
        setBotState('idle');
        addMessage('bot', 'Olá Abençoado(a)! Escolha uma das opções:\n\n/opcao1: Procurar músicas a partir de uma palavra chave\n\n/opcao2: Listar algumas músicas para planejar o louvor do dia\n\n/opcao3: Sugerir uma música para o nosso banco de dados\n\n/opcao4: Encerrar');
      }
      else if (command === '/opcao4') {
        setBotState('idle');
        addMessage('bot', 'Volte logo! 😉 Se precisar é só dar um /start para começarmos a conversar novamente!\n\nDeus abençoe!');
      }
      else if (command === '/opcao5') {
        if (ultimaPalavra) {
          addMessage('bot', `Refazendo a busca para: ${ultimaPalavra}...`);
          await executarBusca(ultimaPalavra); 
        } else {
          addMessage('bot', 'Não há uma palavra-chave armazenada. Use a /opcao1.');
        }
      }
      else if (command === '/opcao1') {
        setBotState('esperando_busca');
        addMessage('bot', 'Digite uma palavra-chave para buscar músicas correspondentes:');
      } 
      else if (command === '/opcao2') {
        setBotState('idle');
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        
        const res = await fetch(`${API_BASE_URL}/musicas/sortear`, { headers });
        const data = await res.json();
        
        if (data.error) {
           addMessage('bot', `Erro: ${data.error}`);
        } else {
           let msgSorteio = "🎸 Músicas sorteadas para o louvor:\n\n";
           
           if (data.is_custom) {
               // --- LÓGICA DO REPERTÓRIO PESSOAL (CATEGORIAS DINÂMICAS) ---
               if (Object.keys(data.sorteio).length === 0) {
                   msgSorteio = "Seu repertório está vazio! Adicione músicas na aba 'Meu Repertório' para eu poder sortear.";
               } else {
                   Object.entries(data.sorteio).forEach(([categoria, musica]) => {
                       msgSorteio += `*${categoria.toUpperCase()}*:\n${musica}\n\n`;
                   });
               }
           } else {
               // --- LÓGICA DO REPERTÓRIO GLOBAL (FIXO) ---
               msgSorteio += `1) ${data.agitadas1}\n\n2) ${data.agitadas2}\n\n3) ${data.lentas1}\n\n4) ${data.lentas2}\n\n`;
               msgSorteio += `Música para ceia: ${data.ceia}\n\n`;
               msgSorteio += `Música para as crianças: ${data.infantis}\n\n`;
           }
           
           addMessage('bot', msgSorteio);
           
           setTimeout(() => {
              addMessage('bot', 'O que gostaria de fazer agora? 🤔\n/opcao1: Fazer uma busca por palavra chave\n/opcao2: Listar novamente as músicas\n/opcao3: Sugerir uma música\n/opcao4: Encerrar');
           }, 600);
        }
      }
      else if (command === '/opcao3') {
        setBotState('esperando_sugestao');
        addMessage('bot', 'Por favor, sugira uma música que gostaria de adicionar à lista.');
      }

      // --- PASSO 2: PROCESSAMENTO DE TEXTO (Apenas se não for um comando acima) ---
      else {
        if (botState === 'esperando_busca') {
          await executarBusca(text);
        }
        else if (botState === 'esperando_sugestao') {
          const res = await fetch(`${API_BASE_URL}/musicas/sugerir`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ usuario: 'Usuário Web', sugestao: text })
          });
          const data = await res.json();
          
          if (data.error) {
              addMessage('bot', 'Tive um probleminha para salvar na planilha, mas anotei aqui! Obrigado.');
          } else {
              addMessage('bot', 'Sugestão enviada com sucesso! Obrigado por contribuir.');
          }
          
          setTimeout(() => {
              addMessage('bot', 'O que gostaria de fazer agora? 🤔\n/opcao1: Buscar por palavra chave\n/opcao2: Listar músicas\n/opcao3: Sugerir nova música\n/opcao4: Encerrar');
          }, 600);
          
          setBotState('idle');
        }
        else {
          // Se o usuário digitar algo aleatório sem estar em um estado de espera
          if (command.startsWith('/')) {
            addMessage('bot', 'Comando não reconhecido. Use o /start.');
          } else {
            await executarBusca(text);
          }
        }
      }
    } catch (e) {
      addMessage('bot', 'Desculpe, ocorreu um erro de conexão com o servidor.');
      setBotState('idle');
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend();
    if (e.key === 'Escape') setShowCommandMenu(false);
  };

  return (
    <div className="gerador-escala-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2>🤖 LeviRoboto</h2>
        <span style={{ color: botState === 'idle' ? '#9ab' : '#61dafb', fontSize: '0.9em', fontWeight: 'bold' }}>
          Status: {botState === 'idle' ? 'Aguardando Comando' : '⏳ Esperando sua resposta...'}
        </span>
      </div>

      <div className="chat-container">
        
        <div className="chat-messages" onClick={() => setShowCommandMenu(false)}>
          {messages.map((msg, index) => (
            <div key={index} className={`chat-bubble ${msg.sender === 'bot' ? 'bubble-bot' : 'bubble-user'}`}>
              {/* MAGIA AQUI: Aplica o formatador em todo texto renderizado */}
              {formatarMensagem(msg.text)}
            </div>
          ))}
          {isLoading && (
            <div className="chat-bubble bubble-bot" style={{ opacity: 0.7 }}>
              <i>Digitando...</i>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {botState !== 'idle' && (
          <div className="chat-shortcuts">
            <button onClick={() => handleSend('/cancel')} style={{ backgroundColor: '#e74c3c', color: 'white', borderColor: '#c0392b' }}>❌ Cancelar Ação Atual</button>
          </div>
        )}

        <div className="chat-input-area">
          <div className="input-wrapper">
            
            {showCommandMenu && (
              <div className="command-popup">
                {commandList.map((item, index) => (
                  <div 
                    key={index} 
                    className={`command-item ${!item.enabled ? 'disabled' : ''}`}
                    onClick={() => item.enabled && handleSelectCommand(item.cmd)}
                  >
                    <span className="cmd-name">{item.cmd}</span>
                    <span className="cmd-desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            )}

            <button 
              className={`menu-btn ${showCommandMenu ? 'active' : ''}`}
              onClick={() => setShowCommandMenu(!showCommandMenu)}
              title="Ver comandos"
            >
              ☰
            </button>
            
            <input 
              ref={inputRef}
              type="text" 
              className="chat-input-with-menu" 
              placeholder={botState === 'idle' ? "Digite / para comandos..." : "Digite sua resposta..."}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              onFocus={() => inputValue === '/' && setShowCommandMenu(true)}
            />
          </div>

          <button className="chat-send-btn" onClick={() => handleSend()} disabled={isLoading || !inputValue.trim()}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

export default LeviRoboto;