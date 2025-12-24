// src/musicLogic.js

const MAPA_NOTAS = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
  "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
  // Enarmonias
  "E#": 5, "B#": 0, "Fb": 4, "Cb": 11
};

const MAPA_VALORES_NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const EXPLICACAO_NOTAS_TEORICAS = {
  "E#": "Mi sustenido (E#) soa igual a Fá (F).",
  "B#": "Si sustenido (B#) soa igual a Dó (C).",
  "Fb": "Fá bemol (Fb) soa igual a Mi (E).",
  "Cb": "Dó bemol (Cb) soa igual a Si (B)."
};

// --- FUNÇÕES AUXILIARES ---

export const normalizarNota = (notaStr, explicacoesSet = null) => {
  // Verifica Sustenido Duplo (##)
  if (notaStr.endsWith("##")) {
    const base = notaStr.replace("##", "");
    const baseKey = Object.keys(MAPA_NOTAS).find(k => k.toLowerCase() === base.toLowerCase());
    
    if (baseKey) {
      const valorBase = MAPA_NOTAS[baseKey];
      const novoValor = (valorBase + 2) % 12;
      const novaNota = MAPA_VALORES_NOTAS[novoValor];
      if (explicacoesSet) explicacoesSet.add(`A nota ${notaStr} é teoricamente um ${novaNota} (Duplo Sustenido).`);
      return novaNota;
    }
  }

  // Verifica Bemol Duplo (bb)
  if (notaStr.endsWith("bb")) {
    const base = notaStr.replace("bb", "");
    const baseKey = Object.keys(MAPA_NOTAS).find(k => k.toLowerCase() === base.toLowerCase());
    
    if (baseKey) {
      const valorBase = MAPA_NOTAS[baseKey];
      const novoValor = (valorBase - 2 + 12) % 12; // +12 para evitar negativo
      const novaNota = MAPA_VALORES_NOTAS[novoValor];
      if (explicacoesSet) explicacoesSet.add(`A nota ${notaStr} é teoricamente um ${novaNota} (Duplo Bemol).`);
      return novaNota;
    }
  }

  return notaStr;
};

const transporNotaIndividual = (notaStr, semitons) => {
  const notaKey = Object.keys(MAPA_NOTAS).find(key => key.toLowerCase() === notaStr.toLowerCase());
  if (!notaKey) return notaStr;
  
  const valorOriginal = MAPA_NOTAS[notaKey];
  const novoValor = (valorOriginal + semitons) % 12;
  const indiceFinal = novoValor < 0 ? novoValor + 12 : novoValor;
  return MAPA_VALORES_NOTAS[indiceFinal];
};

// --- FUNÇÃO 1: SEQUÊNCIA DE ACORDES ---
export const calcularSequenciaLocal = (acordes, action, interval) => {
  const semitons = (interval * 2) * (action === 'Aumentar' ? 1 : -1);
  const explicacoes = new Set();
  const transpostos = [];

  acordes.forEach(acordeOriginal => {
    // Regex: Nota (Grupo 1) + Resto (Grupo 2)
    const match = acordeOriginal.match(/^([A-G](?:##|bb|#|b)?)(.*)$/i);

    if (!match) {
      transpostos.push(`${acordeOriginal}?`);
      return;
    }

    let [, notaFundamental, resto] = match;

    // 1. Normaliza (C## -> D)
    const notaNormalizada = normalizarNota(notaFundamental, explicacoes);
    if (notaNormalizada !== notaFundamental) notaFundamental = notaNormalizada;
    else {
        // Explicações padrão
        const notaKey = Object.keys(MAPA_NOTAS).find(k => k.toLowerCase() === notaFundamental.toLowerCase());
        if (notaKey && EXPLICACAO_NOTAS_TEORICAS[notaKey]) {
            explicacoes.add(EXPLICACAO_NOTAS_TEORICAS[notaKey]);
        }
    }

    // 2. Transpõe
    const novaFundamental = transporNotaIndividual(notaFundamental, semitons);
    let acordeFinal = "";

    // 3. Reconstrói
    if (resto.includes('/')) {
      const partes = resto.split('/');
      const qualidade = partes[0];
      let baixo = partes[1];
      
      baixo = normalizarNota(baixo, explicacoes);
      const novoBaixo = transporNotaIndividual(baixo, semitons);
      acordeFinal = `${novaFundamental}${qualidade}/${novoBaixo}`;
    } else {
      acordeFinal = `${novaFundamental}${resto}`;
    }

    transpostos.push(acordeFinal);
  });

  return {
    original_chords: acordes,
    transposed_chords: transpostos,
    explanations: Array.from(explicacoes)
  };
};

// --- FUNÇÃO 2: CIFRA COMPLETA (TEXTO) ---

const isChordLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Regex para identificar acordes soltos
  const chordPattern = /^[A-G][b#]?(m|M|dim|aug|sus|add|maj|º|°|\/|[-+])?(\d+)?(\(?[^)\s]*\)?)?(\/[A-G][b#]?)?$/;
  
  const words = trimmed.replace(/\/|\|/g, ' ').trim().split(/\s+/);
  if (words.length === 0) return false;

  let chordCount = 0;
  words.forEach(w => {
    if (chordPattern.test(w)) chordCount++;
  });

  // Se mais de 50% das palavras forem acordes, consideramos uma linha de acordes
  return (chordCount / words.length) >= 0.5;
};

export const processarCifraCompleta = (texto, action, interval) => {
  const semitons = (interval * 2) * (action === 'Aumentar' ? 1 : -1);
  const linhas = texto.split('\n');
  
  // Regex global para encontrar acordes no meio do texto
  // Captura: (Nota)(Qualidade)(/Baixo opcional)
  const regexAcorde = /\b([A-G](?:##|bb|#|b)?)([^A-G\s,.\n\/]*)?(\/[A-G](?:##|bb|#|b)?)?\b/g;

  const linhasProcessadas = linhas.map(linha => {
    if (isChordLine(linha)) {
      return linha.replace(regexAcorde, (match, nota, qualidade, baixo) => {
        // Normaliza nota
        const notaNorm = normalizarNota(nota);
        const novaNota = transporNotaIndividual(notaNorm, semitons);
        
        const qual = qualidade || "";
        let novoBaixoStr = "";
        
        if (baixo) {
          const notaBaixo = baixo.replace('/', '');
          const notaBaixoNorm = normalizarNota(notaBaixo);
          novoBaixoStr = "/" + transporNotaIndividual(notaBaixoNorm, semitons);
        }
        
        return `${novaNota}${qual}${novoBaixoStr}`;
      });
    }
    return linha;
  });

  return linhasProcessadas.join('\n');
};