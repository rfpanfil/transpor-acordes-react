import os
import asyncio
import libsql_client
from dotenv import load_dotenv

# Carrega as variáveis do seu arquivo .env (Onde estão o TURSO_URL e o TOKEN)
load_dotenv()

TURSO_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

# MUDE AQUI PARA O ID DO SEU NOVO UTILIZADOR SE NECESSÁRIO
TARGET_USER_ID = 3

TABELAS_PARA_VERIFICAR = [
    "membros", 
    "funcoes", 
    "biblioteca_busca", 
    "agitadas1", 
    "agitadas2", 
    "lentas1", 
    "lentas2", 
    "ceia", 
    "infantis",
    "categorias_repertorio"
]

async def main():
    client = libsql_client.create_client(url=TURSO_URL, auth_token=TURSO_TOKEN)
    
    try:
        # 1. Verifica se o utilizador existe
        user_res = await client.execute("SELECT email FROM usuarios WHERE id = ?", [TARGET_USER_ID])
        if not user_res.rows:
            print(f"❌ ERRO: Utilizador com ID {TARGET_USER_ID} não encontrado no banco de dados!")
            return
        
        email_alvo = user_res.rows[0][0]
        print(f"👤 Utilizador Alvo Encontrado: {email_alvo} (ID: {TARGET_USER_ID})\n")
        print("🔍 A ANALISAR O BANCO DE DADOS (Procurando dados órfãos globais)...")
        
        # 2. Gera o Relatório (Dry-Run)
        relatorio = {}
        total_orfao = 0
        
        for tabela in TABELAS_PARA_VERIFICAR:
            try:
                res = await client.execute(f"SELECT COUNT(*) FROM {tabela} WHERE usuario_id IS NULL")
                qtd = res.rows[0][0]
                relatorio[tabela] = qtd
                total_orfao += qtd
            except Exception as e:
                print(f"⚠️ Aviso: Tabela {tabela} ignorada (Erro: {e})")
        
        # Exibe o Relatório
        print("\n📊 --- RELATÓRIO DE DADOS SEM DONO ---")
        for tab, qtd in relatorio.items():
            print(f"  Tabela '{tab}': {qtd} registros a transferir")
        print("---------------------------------------")
        print(f"Total de registros a serem adotados: {total_orfao}\n")
        
        if total_orfao == 0:
            print("✅ Não há dados globais/órfãos para transferir. Está tudo limpo!")
            return
            
        # 3. Interrompe e pede confirmação para o utilizador
        print("⚠️ PAUSA DE SEGURANÇA ⚠️")
        print("Copie o relatório acima e envie para a análise antes de prosseguir, se desejar.")
        resposta = input(f"Deseja atribuir todos estes {total_orfao} registros à conta '{email_alvo}' AGORA? (s/n): ")
        
        # 4. Executa a Migração
        if resposta.strip().lower() == 's':
            print("\n🚀 Iniciando transferência de propriedade...")
            for tab, qtd in relatorio.items():
                if qtd > 0:
                    await client.execute(f"UPDATE {tab} SET usuario_id = ? WHERE usuario_id IS NULL", [TARGET_USER_ID])
                    print(f"   ✅ {qtd} registros atualizados com sucesso em '{tab}'")
            print("\n🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO! O Multiverso agora é seu.")
        else:
            print("\n🛑 Operação cancelada pelo utilizador. Nenhuma alteração foi feita no banco.")

    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())