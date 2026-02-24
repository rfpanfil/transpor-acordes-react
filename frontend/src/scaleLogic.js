// src/scaleLogic.js

export const gerarEscalas = (equipa, datasEscala, indisponibilidades, regras, vagasPorDia) => {
  const formatDataKey = (d) => `${d.getDate()}-${d.getMonth()}-${d.getFullYear()}`;
  let resultadosUnicos = new Set();
  let resultadosObj = [];

  const contarParticipacoes = (membroId, escalaAtual) => {
    let count = 0;
    for (let dia in escalaAtual) {
      if (escalaAtual[dia].some(a => a.membro && a.membro.id === membroId)) count++;
    }
    return count;
  };

  let tentativasTotais = 0;

  while (resultadosObj.length < 10 && tentativasTotais < 50) {
    tentativasTotais++;
    let encontrouNestaTentativa = false;
    let limitadorAntiTravamento = 0; // NOVO: Disjuntor de segurança

    const backtrack = (diaIndex, escalaAtual) => {
      if (encontrouNestaTentativa) return; 
      
      limitadorAntiTravamento++;
      if (limitadorAntiTravamento > 25000) {
        encontrouNestaTentativa = true; // Se testou 25.000 combinações e não achou, aborta para não travar o PC
        return;
      }
      
      if (diaIndex === datasEscala.length) {
        
        // Antes de salvar, verifica se a escala atendeu as metas mensais de frequência
        let todasAsFrequenciasCumpridas = true;
        
        for (let regra of regras) {
          if (regra.tipo === 'frequencia') {
            let contagemOficial = 0;
            for (let d in escalaAtual) {
              // Correção: Adicionado 'a.membro.id &&' para evitar erro quando a vaga estiver vazia ('---')
              if (escalaAtual[d].some(a => a.membro && a.membro.id && a.membro.id.toString() === regra.membro1 && a.vaga.label === regra.funcao)) {
                contagemOficial++;
              }
            }
            // Se a quantidade não for EXATAMENTE a que você pediu, essa escala inteira é descartada
            if (contagemOficial !== parseInt(regra.quantidade)) {
              todasAsFrequenciasCumpridas = false;
              break;
            }
          }
        }

        // Se passar por todas as provas, é salva!
        if (todasAsFrequenciasCumpridas) {
          const jsonStr = JSON.stringify(escalaAtual);
          if (!resultadosUnicos.has(jsonStr)) {
            resultadosUnicos.add(jsonStr);
            resultadosObj.push(JSON.parse(jsonStr));
            encontrouNestaTentativa = true;
          }
        }
        return;
      }

      const dataAtual = datasEscala[diaIndex];
      const dataKey = formatDataKey(dataAtual);
      
      // FORÇA A ORDEM: Resolve as funções normais PRIMEIRO, e as de Crianças POR ÚLTIMO.
      // Isso garante que a pessoa já esteja na função de Adulto quando a vaga de Criança for avaliada.
      const vagas = (vagasPorDia[dataKey] || []).slice().sort((a, b) => {
        if (a.label.includes('Crianças') && !b.label.includes('Crianças')) return 1;
        if (!a.label.includes('Crianças') && b.label.includes('Crianças')) return -1;
        return 0;
      });

      const tentarPreencherDia = (vagaIndex, alocadosNesteDia) => {
        if (encontrouNestaTentativa) return;

        if (vagaIndex === vagas.length) {
          if (!validarRegrasDoDia(alocadosNesteDia, dataKey, regras, equipa)) return;
          escalaAtual[dataKey] = [...alocadosNesteDia];
          backtrack(diaIndex + 1, escalaAtual);
          return;
        }

        const vaga = vagas[vagaIndex];
        
        const isCandidatoValido = (membro, vagaAtual, alocados) => {
          if (indisponibilidades[`${membro.id}_${dataKey}`]) return false;

          // NOVA BLINDAGEM: Verifica se o membro já bateu o limite de vezes definido na regra
          const regraFreq = regras.find(r => r.tipo === 'frequencia' && r.membro1 === membro.id.toString() && r.funcao === vagaAtual.label);
          if (regraFreq) {
            let vezesQueJaTocou = 0;
            // Conta quantas vezes ele já foi escalado nessa mesma função nos dias anteriores
            for (let d in escalaAtual) {
              if (escalaAtual[d].some(a => a.membro && a.membro.id === membro.id && a.vaga.label === vagaAtual.label)) {
                vezesQueJaTocou++;
              }
            }
            // Se já tocou o que foi pedido, ele está estritamente proibido de ser escolhido de novo pra essa função
            if (vezesQueJaTocou >= parseInt(regraFreq.quantidade)) return false; 
          }

          // 1. OBRIGATÓRIO: O membro tem que ter a função exata (ignorando maiúsculas/minúsculas para evitar bugs)
          const temFuncaoExata = membro.funcoes.some(f => vagaAtual.aceita.some(a => a.toLowerCase() === f.toLowerCase()));
          if (!temFuncaoExata) return false;

          // 2. Pega as funções que o membro já pegou NESTE dia
          const alocacoesDoMembro = alocados.filter(a => a.membro && a.membro.id === membro.id);
          
          if (alocacoesDoMembro.length >= 2) return false; // Ninguém faz 3 coisas

          // 3. Se já tem 1 função hoje, a troca só é permitida se for pro par Criança + Adulto Musical
          if (alocacoesDoMembro.length === 1) {
            const vagaExistente = alocacoesDoMembro[0].vaga.label;
            const labelAtual = vagaAtual.label;

            const isMidiaOuSom = (label) => label.toLowerCase().includes('mídia') || label.toLowerCase().includes('som') || label.toLowerCase().includes('live');
            const isCrianca = (label) => label.includes('Crianças');
            const isAdultoMusical = (label) => !isCrianca(label) && !isMidiaOuSom(label);

            const ehDobraValida = (isAdultoMusical(vagaExistente) && isCrianca(labelAtual)) || 
                                  (isCrianca(vagaExistente) && isAdultoMusical(labelAtual));

            if (!ehDobraValida) {
              return false; // Bloqueia Mídia+Musical, Mídia+Crianças, ou Duas de Adulto
            }
          }

          return true;
        };

        // AGORA VERIFICA AS FUNÇÕES E A PERMISSÃO DE DOBRA NAS CRIANÇAS
        let candidatos = equipa.filter(m => isCandidatoValido(m, vaga, alocadosNesteDia));

        candidatos.sort((a, b) => {
          // 1. PRIORIDADE MÁXIMA: Regras de Frequência
          // Se alguém precisa bater a cota desta função, passa na frente de todo mundo
          const precisaVaga = (membroId) => {
            const regra = regras.find(r => r.tipo === 'frequencia' && r.membro1 === membroId.toString() && r.funcao === vaga.label);
            if (!regra) return 0;
            let tocou = 0;
            for (let d in escalaAtual) {
              if (escalaAtual[d].some(aloc => aloc.membro && aloc.membro.id === membroId && aloc.vaga.label === vaga.label)) tocou++;
            }
            return parseInt(regra.quantidade) - tocou; // Quantas vezes ainda faltam
          };

          const aFalta = precisaVaga(a.id);
          const bFalta = precisaVaga(b.id);
          
          if (aFalta > 0 && bFalta <= 0) return -1; // A precisa da vaga pra bater a meta
          if (bFalta > 0 && aFalta <= 0) return 1;  // B precisa da vaga pra bater a meta
          if (aFalta > 0 && bFalta > 0) return bFalta - aFalta; // Quem precisa de mais vagas agora, ganha

          // 2. PRIORIDADE DE DOBRA: Prioriza quem já está tocando no culto hoje
          const aFazDobra = alocadosNesteDia.some(aloc => aloc.membro && aloc.membro.id === a.id);
          const bFazDobra = alocadosNesteDia.some(aloc => aloc.membro && aloc.membro.id === b.id);
          
          if (aFazDobra && !bFazDobra) return -1; 
          if (!aFazDobra && bFazDobra) return 1;  

          // 3. EMPATE: Desempata por quem tocou menos no mês em geral
          const usoA = contarParticipacoes(a.id, escalaAtual);
          const usoB = contarParticipacoes(b.id, escalaAtual);
          if (usoA === usoB) return Math.random() - 0.5;
          return usoA - usoB; 
        });

        candidatos.push(null); // Opção de ficar vazio

        for (let candidato of candidatos) {
          if (candidato) {
            alocadosNesteDia.push({ vaga: vaga, membro: candidato });
            tentarPreencherDia(vagaIndex + 1, alocadosNesteDia);
            alocadosNesteDia.pop();
          } else {
            alocadosNesteDia.push({ vaga: vaga, membro: { nome: '---' } });
            tentarPreencherDia(vagaIndex + 1, alocadosNesteDia);
            alocadosNesteDia.pop();
          }
        }
      };

      tentarPreencherDia(0, []);
    };

    backtrack(0, {});
  }

  return resultadosObj;
};

const validarRegrasDoDia = (alocadosNesteDia, dataKey, regras, equipa) => {
  const idsNesteDia = alocadosNesteDia.map(a => a.membro && a.membro.id?.toString());
  for (let regra of regras) {
    if (regra.tipo === 'tocar_com') {
      const temMembro1 = idsNesteDia.includes(regra.membro1);
      const temAlvo = idsNesteDia.includes(regra.alvo);
      if ((temMembro1 && !temAlvo) || (!temMembro1 && temAlvo)) return false;
    }
    if (regra.tipo === 'dia_especifico' && regra.alvo === dataKey) {
      if (!idsNesteDia.includes(regra.membro1)) return false;
    }
    if (regra.tipo === 'tocar_com_no_dia' && regra.alvoData === dataKey) {
      const temMembro1 = idsNesteDia.includes(regra.membro1);
      const temAlvo = idsNesteDia.includes(regra.alvo);
      if ((temMembro1 && !temAlvo) || (!temMembro1 && temAlvo)) return false;
    }
  }
  return true;
};