# api.py (VERSÃO ATUALIZADA COM AS DUAS FUNCIONALIDADES)

from fastapi import FastAPI, File, UploadFile, Form
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import re
import docx
import io
from typing import List, Set

# --- Modelos de Dados (Pydantic) ---
# Para a cifra completa
class TransposeCifraRequest(BaseModel):
    cifra_text: str
    action: str
    interval: float

class TransposeCifraResponse(BaseModel):
    transposed_cifra: str

# NOVO: Para a sequência de acordes
class TransposeSequenceRequest(BaseModel):
    chords: List[str]
    action: str
    interval: float

class TransposeSequenceResponse(BaseModel):
    original_chords: List[str]
    transposed_chords: List[str]
    explanations: List[str]

# --- Instância da Aplicação FastAPI ---
app = FastAPI()

# --- Configuração do CORS ---
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://transpositor-react.vercel.app"  # <-- SUBSTITUA PELA SUA URL DO VERCEL
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# LÓGICA DE TRANSPOSIÇÃO (AGORA COM AS DUAS FUNÇÕES)
# ==============================================================================
MAPA_NOTAS = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
    "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
    "E#": 5, "B#": 0, "Fb": 4, "Cb": 11
}
MAPA_VALORES_NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
EXPLICACAO_NOTAS_TEORICAS_ENTRADA = {
    "E#": "Mi sustenido (E#) é enarmônico a Fá (F).",
    "B#": "Si sustenido (B#) é enarmônico a Dó (C).",
    "Fb": "Fá bemol (Fb) é enarmônico a Mi (E).",
    "Cb": "Dó bemol (Cb) é enarmônico a Si (B)."
}

# --- Lógica para Cifras Completas (sem alteração) ---
# (Funções is_chord_line, transpor_nota_individual, processar_cifra, ler_conteudo_arquivo...)
def is_chord_line(line):
    line = line.strip()
    if not line: return False
    chord_pattern = re.compile(r'^[A-G][b#]?(m|M|dim|aug|sus|add|maj|º|°|/|[-+])?(\d+)?(\(?[^)\s]*\)?)?(/[A-G][b#]?)?$')
    words = line.replace('/:', '').replace('|', '').strip().split()
    if not words: return False
    chord_count = sum(1 for word in words if chord_pattern.match(word))
    return (chord_count / len(words)) >= 0.75

def transpor_nota_individual(nota_str, semitons):
    nota_key = next((key for key in MAPA_NOTAS if key.lower() == nota_str.lower()), None)
    if not nota_key: return nota_str
    valor_original = MAPA_NOTAS[nota_key]
    novo_valor = (valor_original + semitons + 12) % 12
    return MAPA_VALORES_NOTAS[novo_valor]

def processar_cifra(texto_cifra, acao, intervalo):
    semitons = int(intervalo * 2) * (1 if acao == 'Aumentar' else -1)
    padrao_acorde_busca = r'\b([A-G][b#]?)([^A-G\s,.\n]*)?(/[A-G][b#]?)?\b'
    def replacer(match):
        nota, qualidade, baixo = match.groups()
        qualidade = qualidade or ""
        baixo = baixo or ""
        nova_nota = transpor_nota_individual(nota, semitons)
        novo_baixo = "/" + transpor_nota_individual(baixo.replace('/', ''), semitons) if baixo else ""
        return f"{nova_nota}{qualidade}{novo_baixo}"
    linhas_finais = [re.sub(padrao_acorde_busca, replacer, linha) if is_chord_line(linha) else linha for linha in texto_cifra.split('\n')]
    return "\n".join(linhas_finais)

def ler_conteudo_arquivo(file: UploadFile) -> str:
    content_bytes = file.file.read()
    if file.filename.endswith('.docx'):
        doc = docx.Document(io.BytesIO(content_bytes))
        return "\n".join([para.text for para in doc.paragraphs])
    else:
        return content_bytes.decode("utf-8")

# --- NOVO: Lógica para Sequência de Acordes (copiada do seu app_final.py) ---
def transpor_acordes_sequencia(acordes_originais, acao, intervalo):
    intervalo_semitons = int(intervalo * 2)
    semitons_ajuste = intervalo_semitons if acao == 'Aumentar' else -intervalo_semitons
    acordes_transpostos = []
    explicacoes_entrada = set()
    
    for acorde_original in acordes_originais:
        match = re.match(r"([A-G][b#]?)(.*)", acorde_original, re.IGNORECASE)
        if not match:
            acordes_transpostos.append(f"{acorde_original}?")
            continue
        
        nota_fundamental_str, qualidade_acorde = match.groups()
        nota_key = next((key for key in MAPA_NOTAS if key.lower() == nota_fundamental_str.lower()), None)
        
        if not nota_key:
            acordes_transpostos.append(f"{acorde_original}?")
            continue
        
        if nota_key in EXPLICACAO_NOTAS_TEORICAS_ENTRADA:
            explicacoes_entrada.add(EXPLICACAO_NOTAS_TEORICAS_ENTRADA[nota_key])

        nova_nota_fundamental = transpor_nota_individual(nota_key, semitons_ajuste)
        
        if '/' in qualidade_acorde:
            partes = qualidade_acorde.split('/')
            qualidade, baixo_str = partes[0], partes[1]
            novo_baixo = transpor_nota_individual(baixo_str, semitons_ajuste)
            acorde_transposto_final = f"{nova_nota_fundamental}{qualidade}/{novo_baixo}"
        else:
            acorde_transposto_final = f"{nova_nota_fundamental}{qualidade_acorde}"
            
        acordes_transpostos.append(acorde_transposto_final)

    return acordes_transpostos, list(explicacoes_entrada)

# ==============================================================================
# ENDPOINTS DA API (AGORA COM 3)
# ==============================================================================
@app.post("/transpose-text", response_model=TransposeCifraResponse)
def transpose_cifra_endpoint_text(request: TransposeCifraRequest):
    transposed_text = processar_cifra(request.cifra_text, request.action, request.interval)
    return {"transposed_cifra": transposed_text}

@app.post("/transpose-file", response_model=TransposeCifraResponse)
def transpose_cifra_endpoint_file(file: UploadFile = File(...), action: str = Form(...), interval: float = Form(...)):
    cifra_text = ler_conteudo_arquivo(file)
    transposed_text = processar_cifra(cifra_text, action, interval)
    return {"transposed_cifra": transposed_text}

@app.post("/transpose-sequence", response_model=TransposeSequenceResponse)
def transpose_sequence_endpoint(request: TransposeSequenceRequest):
    """NOVO: Endpoint para transpor uma sequência de acordes."""
    transposed_chords, explanations = transpor_acordes_sequencia(request.chords, request.action, request.interval)
    return {
        "original_chords": request.chords,
        "transposed_chords": transposed_chords,
        "explanations": explanations
    }