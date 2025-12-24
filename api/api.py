# api.py
# VERSÃO COMPLETA E CORRIGIDA (Suporte a ## e bb em Sequências E Cifras)

from fastapi import FastAPI, File, UploadFile, Form
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import re
import docx
import io
from typing import List, Optional

# --- Modelos de Dados ---
class TransposeCifraRequest(BaseModel):
    cifra_text: str
    action: str
    interval: float

class TransposeCifraResponse(BaseModel):
    transposed_cifra: str

class TransposeSequenceRequest(BaseModel):
    chords: List[str]
    action: str
    interval: float

class TransposeSequenceResponse(BaseModel):
    original_chords: List[str]
    transposed_chords: List[str]
    explanations: List[str]

# --- Inicialização da App ---
app = FastAPI()

# --- Configuração CORS ---
# Adicione aqui todas as origens que podem acessar sua API
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://transpor-acordes-react.vercel.app", 
    "https://transpositor-react.vercel.app",
    # Adicione a URL do seu app Android no futuro se for webview
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MAPAS E DADOS ---
MAPA_NOTAS = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
    "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
    # Enarmonias Simples
    "E#": 5, "B#": 0, "Fb": 4, "Cb": 11
}
MAPA_VALORES_NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

EXPLICACAO_TEORICA = {
    "E#": "Mi sustenido (E#) soa igual a Fá (F).",
    "B#": "Si sustenido (B#) soa igual a Dó (C).",
    "Fb": "Fá bemol (Fb) soa igual a Mi (E).",
    "Cb": "Dó bemol (Cb) soa igual a Si (B)."
}

# --- FUNÇÕES AUXILIARES ---

def transpor_nota_individual(nota_str, semitons):
    """Calcula a nova nota matemática baseada nos semitons."""
    nota_key = next((key for key in MAPA_NOTAS if key.lower() == nota_str.lower()), None)
    if not nota_key: return nota_str
    
    valor_original = MAPA_NOTAS[nota_key]
    novo_valor = (valor_original + semitons + 12) % 12
    return MAPA_VALORES_NOTAS[novo_valor]

def normalizar_nota(nota_str, explicacoes_set=None):
    """
    Identifica e converte notas 'estranhas' como C## para D.
    Adiciona explicação ao set se ele for fornecido.
    """
    # Verifica Sustenido Duplo (##)
    if nota_str.endswith("##"):
        base = nota_str.replace("##", "")
        base_key = next((k for k in MAPA_NOTAS if k.lower() == base.lower()), None)
        if base_key is not None:
            valor_base = MAPA_NOTAS[base_key]
            novo_valor = (valor_base + 2) % 12
            nova_nota = MAPA_VALORES_NOTAS[novo_valor]
            if explicacoes_set is not None:
                explicacoes_set.add(f"A nota {nota_str} é teoricamente um {nova_nota} (Duplo Sustenido).")
            return nova_nota

    # Verifica Bemol Duplo (bb)
    if nota_str.endswith("bb"):
        base = nota_str.replace("bb", "")
        base_key = next((k for k in MAPA_NOTAS if k.lower() == base.lower()), None)
        if base_key is not None:
            valor_base = MAPA_NOTAS[base_key]
            novo_valor = (valor_base - 2 + 12) % 12
            nova_nota = MAPA_VALORES_NOTAS[novo_valor]
            if explicacoes_set is not None:
                explicacoes_set.add(f"A nota {nota_str} é teoricamente um {nova_nota} (Duplo Bemol).")
            return nova_nota
            
    return nota_str

# --- LÓGICA DE TRANSPOSIÇÃO DE SEQUÊNCIA ---
def transpor_acordes_sequencia(acordes_originais, acao, intervalo):
    intervalo_semitons = int(intervalo * 2)
    semitons_ajuste = intervalo_semitons if acao == 'Aumentar' else -intervalo_semitons
    acordes_transpostos = []
    explicacoes_entrada = set()
    
    for acorde_original in acordes_originais:
        # Regex atualizado para capturar ## e bb
        match = re.match(r"^([A-G](?:##|bb|#|b)?)(.*)", acorde_original, re.IGNORECASE)
        
        if not match:
            acordes_transpostos.append(f"{acorde_original}?")
            continue
        
        nota_bruta, resto = match.groups()
        
        # 1. Normaliza
        nota_fundamental = normalizar_nota(nota_bruta, explicacoes_entrada)
        
        # 2. Explicações padrão (E#, B#...)
        if nota_fundamental == nota_bruta:
            nota_key = next((k for k in EXPLICACAO_TEORICA if k.lower() == nota_fundamental.lower()), None)
            if nota_key:
                explicacoes_entrada.add(EXPLICACAO_TEORICA[nota_key])

        # 3. Transpõe
        nova_fundamental = transpor_nota_individual(nota_fundamental, semitons_ajuste)
        
        # 4. Reconstrói
        if '/' in resto:
            partes = resto.split('/')
            qualidade = partes[0]
            baixo_bruto = partes[1]
            
            # Normaliza e transpõe o baixo também (ex: /C##)
            baixo_normalizado = normalizar_nota(baixo_bruto, explicacoes_entrada)
            novo_baixo = transpor_nota_individual(baixo_normalizado, semitons_ajuste)
            
            acorde_final = f"{nova_fundamental}{qualidade}/{novo_baixo}"
        else:
            acorde_final = f"{nova_fundamental}{resto}"
            
        acordes_transpostos.append(acorde_final)

    return acordes_transpostos, list(explicacoes_entrada)

# --- LÓGICA DE TRANSPOSIÇÃO DE CIFRA COMPLETA (TEXTO) ---
def is_chord_line(line):
    line = line.strip()
    if not line: return False
    # Regex para identificar se a linha parece ser de acordes
    chord_pattern = re.compile(r'^[A-G][b#]?(m|M|dim|aug|sus|add|maj|º|°|/|[-+])?(\d+)?(\(?[^)\s]*\)?)?(/[A-G][b#]?)?$')
    words = line.replace('/:', '').replace('|', '').strip().split()
    if not words: return False
    chord_count = sum(1 for word in words if chord_pattern.match(word))
    return (chord_count / len(words)) >= 0.5

def processar_cifra(texto_cifra, acao, intervalo):
    semitons = int(intervalo * 2) * (1 if acao == 'Aumentar' else -1)
    
    # REGEX ATUALIZADO TAMBÉM AQUI!
    # Antes era [A-G][b#]?, agora aceita (?:##|bb|#|b)?
    padrao_acorde = r'\b([A-G](?:##|bb|#|b)?)([^A-G\s,.\n]*)?(/[A-G](?:##|bb|#|b)?)?\b'
    
    def replacer(match):
        nota, qualidade, baixo = match.groups()
        qualidade = qualidade or ""
        novo_baixo = ""
        
        # Normaliza a nota fundamental (ignora explicações na cifra texto para não poluir)
        nota_norm = normalizar_nota(nota)
        nova_nota = transpor_nota_individual(nota_norm, semitons)

        if baixo:
            # Remove a barra, normaliza e transpõe
            nota_baixo = baixo.replace('/', '')
            nota_baixo_norm = normalizar_nota(nota_baixo)
            novo_baixo = "/" + transpor_nota_individual(nota_baixo_norm, semitons)
        
        return f"{nova_nota}{qualidade}{novo_baixo}"

    linhas = texto_cifra.split('\n')
    linhas_finais = []
    
    for linha in linhas:
        if is_chord_line(linha):
            # Se for linha de acorde, aplica a transposição
            linhas_finais.append(re.sub(padrao_acorde, replacer, linha))
        else:
            # Se for letra de música, mantém igual
            linhas_finais.append(linha)
            
    return "\n".join(linhas_finais)

def ler_conteudo_arquivo(file: UploadFile) -> str:
    content = file.file.read()
    if file.filename.endswith('.docx'):
        try:
            doc = docx.Document(io.BytesIO(content))
            return "\n".join([p.text for p in doc.paragraphs])
        except Exception as e:
            return f"Erro ao ler arquivo .docx: {str(e)}"
    return content.decode("utf-8")

# --- ENDPOINTS ---

@app.post("/transpose-sequence", response_model=TransposeSequenceResponse)
def transpose_sequence_endpoint(request: TransposeSequenceRequest):
    transposed, expl = transpor_acordes_sequencia(request.chords, request.action, request.interval)
    return {
        "original_chords": request.chords,
        "transposed_chords": transposed,
        "explanations": expl
    }

@app.post("/transpose-text", response_model=TransposeCifraResponse)
def transpose_text_endpoint(request: TransposeCifraRequest):
    res = processar_cifra(request.cifra_text, request.action, request.interval)
    return {"transposed_cifra": res}

@app.post("/transpose-file", response_model=TransposeCifraResponse)
def transpose_file_endpoint(file: UploadFile = File(...), action: str = Form(...), interval: float = Form(...)):
    texto = ler_conteudo_arquivo(file)
    res = processar_cifra(texto, action, interval)
    return {"transposed_cifra": res}

# Bloco para rodar localmente (opcional, mas bom ter)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)