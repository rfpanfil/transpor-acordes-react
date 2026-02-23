import asyncio
import libsql_client

# As suas credenciais do Turso
url = "https://levi-roboto-db-rfpanfil.aws-us-east-2.turso.io"
token = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzE4NjIxODIsImlkIjoiMzZkMGNlYmItZDIwMS00NWU1LWI0ZTgtMDk5MmJhNWUzZTVlIiwicmlkIjoiMzZjYTljZjQtNmE0Ny00MDc4LTk5NWItYzY5YWJiY2FmMjA3In0.ctX09Go_KYD8wUFulZpRm8JSLHHRL1Ou44yualixomTUvSAx2x164BASeB-WfJRatV6JXcKRIF1U4wzCQwF9Cg"

async def ver_banco():
    try:
        print("A conectar ao banco de dados Turso...")
        client = libsql_client.create_client(url=url, auth_token=token)
        print("✅ Conectado!\n")

        # 1. Ver as Funções
        print("--- 🎸 FUNÇÕES CADASTRADAS ---")
        res_funcoes = await client.execute("SELECT id, nome FROM funcoes ORDER BY nome")
        if not res_funcoes.rows:
            print("Nenhuma função cadastrada.")
        else:
            for row in res_funcoes.rows:
                print(f"ID: {row[0]} | Nome: '{row[1]}'")
        print("\n")

        # 2. Ver Membros e as suas funções (Relatório Completo)
        print("--- 👥 MEMBROS E SUAS FUNÇÕES ---")
        query_membros = '''
            SELECT m.nome, m.status, GROUP_CONCAT(f.nome) as funcoes
            FROM membros m
            LEFT JOIN membro_funcoes mf ON m.id = mf.membro_id
            LEFT JOIN funcoes f ON mf.funcao_id = f.id
            GROUP BY m.id
            ORDER BY m.nome
        '''
        res_membros = await client.execute(query_membros)
        if not res_membros.rows:
            print("Nenhum membro cadastrado.")
        else:
            for row in res_membros.rows:
                nome = row[0]
                status = row[1] or "ativo"
                funcoes = row[2] if row[2] else "Nenhuma"
                print(f"👤 {nome} ({status}): {funcoes}")

    except Exception as e:
        print(f"❌ Ocorreu um erro: {e}")
    finally:
        await client.close()
        print("\nConexão fechada.")

if __name__ == "__main__":
    asyncio.run(ver_banco())