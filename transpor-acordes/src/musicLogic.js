// src/musicLogic.js

const MAPA_NOTAS = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
  "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
  // Simple Enharmonics
  "E#": 5, "B#": 0, "Fb": 4, "Cb": 11
};

const MAPA_VALORES_NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const EXPLICACAO_NOTAS_TEORICAS = {
  "E#": "Mi sustenido (E#) soa igual a Fá (F).",
  "B#": "Si sustenido (B#) soa igual a Dó (C).",
  "Fb": "Fá bemol (Fb) soa igual a Mi (E).",
  "Cb": "Dó bemol (Cb) soa igual a Si (B).",
  "##": "Duplo sustenido (##) aumenta a nota em 1 tom inteiro.",
  "bb": "Duplo bemol (bb) diminui a nota em 1 tom inteiro."
};

// Normalizes strange notes before calculating (e.g., turns C## into D)
const normalizarNota = (notaStr, explicacoesSet) => {
  // Check for Double Sharp
  if (notaStr.endsWith("##")) {
    const base = notaStr.replace("##", ""); // Ex: C
    const valorBase = MAPA_NOTAS[base];
    if (valorBase !== undefined) {
      const novaNota = MAPA_VALORES_NOTAS[(valorBase + 2) % 12];
      explicacoesSet.add(`A nota ${notaStr} é tecnicamente um ${novaNota}.`);
      return novaNota; // Returns D instead of C##
    }
  }
  // Check for Double Flat
  if (notaStr.endsWith("bb")) {
    const base = notaStr.replace("bb", "");
    const valorBase = MAPA_NOTAS[base];
    if (valorBase !== undefined) {
      const novaNota = MAPA_VALORES_NOTAS[(valorBase - 2 + 12) % 12];
      explicacoesSet.add(`A nota ${notaStr} é tecnicamente um ${novaNota}.`);
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

export const calcularSequenciaLocal = (acordes, action, interval) => {
  const semitons = (interval * 2) * (action === 'Aumentar' ? 1 : -1);
  const explicacoes = new Set();
  const transpostos = [];

  acordes.forEach(acordeOriginal => {
    // UPDATED REGEX: Now accepts ## and bb as part of the note
    // Group 1 (Note): [A-G] followed optionally by (##, bb, # or b)
    const match = acordeOriginal.match(/^([A-G](?:##|bb|#|b)?)(.*)$/i);

    if (!match) {
      transpostos.push(`${acordeOriginal}?`);
      return;
    }

    let [, notaFundamental, resto] = match;

    // Step 1: Normalize (Resolve C## to D before transposing)
    const notaNormalizada = normalizarNota(notaFundamental, explicacoes);
    
    // If changed (was C## and became D), use the new note for calculation
    if (notaNormalizada !== notaFundamental) {
        notaFundamental = notaNormalizada;
    } else {
      // Check standard explanations (E#, B#...)
      const notaKey = Object.keys(MAPA_NOTAS).find(k => k.toLowerCase() === notaFundamental.toLowerCase());
      if (notaKey && EXPLICACAO_NOTAS_TEORICAS[notaKey]) {
        explicacoes.add(EXPLICACAO_NOTAS_TEORICAS[notaKey]);
      }
    }

    const novaFundamental = transporNotaIndividual(notaFundamental, semitons);
    let acordeFinal = "";

    if (resto.includes('/')) {
      const partes = resto.split('/');
      const qualidade = partes[0];
      let baixo = partes[1];
      
      // Normalize bass too (e.g., /C##)
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