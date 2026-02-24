import sqlite3
import asyncio
import libsql_client

url = "https://levi-roboto-db-rfpanfil.aws-us-east-2.turso.io"
token = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzE4NjIxODIsImlkIjoiMzZkMGNlYmItZDIwMS00NWU1LWI0ZTgtMDk5MmJhNWUzZTVlIiwicmlkIjoiMzZjYTljZjQtNmE0Ny00MDc4LTk5NWItYzY5YWJiY2FmMjA3In0.ctX09Go_KYD8wUFulZpRm8JSLHHRL1Ou44yualixomTUvSAx2x164BASeB-WfJRatV6JXcKRIF1U4wzCQwF9Cg"

tabelas_sorteio = ["agitadas1", "agitadas2", "lentas1", "lentas2", "ceia", "infantis"]

async def migrar():
    print("Iniciando migração das tabelas de sorteio...")
    client_turso = libsql_client.create_client(url=url, auth_token=token)
    conn_local = sqlite3.connect('musicas.db')
    cursor = conn_local.cursor()

    for tabela in tabelas_sorteio:
        try:
            await client_turso.execute(f"CREATE TABLE IF NOT EXISTS {tabela} (id INTEGER PRIMARY KEY AUTOINCREMENT, conteudo TEXT)")
            await client_turso.execute(f"DELETE FROM {tabela}") # Limpa se já existir
            
            cursor.execute(f"SELECT conteudo FROM {tabela}")
            musicas = cursor.fetchall()
            
            for m in musicas:
                await client_turso.execute(f"INSERT INTO {tabela} (conteudo) VALUES (?)", [m[0]])
            
            print(f"✅ Tabela '{tabela}' migrada: {len(musicas)} músicas.")
        except Exception as e:
            print(f"⚠️ Aviso na tabela {tabela}: {e}")

    conn_local.close()
    await client_turso.close()
    print("🚀 Sorteio migrado com sucesso!")

if __name__ == "__main__":
    asyncio.run(migrar())