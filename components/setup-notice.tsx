import type { SetupProblem } from "@/lib/store";

/** Aparece na Vercel enquanto faltar conectar o Redis e/ou o Blob ao projeto. */
export default function SetupNotice({ problems }: { problems: SetupProblem[] }) {
  return (
    <main className="page setup">
      <h1 className="wordmark">Garimpo</h1>
      <p>
        Falta pouco para funcionar na Vercel. No painel do projeto, abra a aba <strong>Storage</strong> e:
      </p>
      <ol>
        {problems.includes("redis") && (
          <li>
            <strong>Crie um banco Redis</strong> (Upstash ou Redis Cloud, de preferência na região de São Paulo) e conecte
            ao projeto. Isso cria a variável <code>REDIS_URL</code>, onde a lista fica guardada.
          </li>
        )}
        {problems.includes("blob") && (
          <li>
            <strong>Crie um Blob store</strong> e conecte ao projeto, marcando o ambiente Production. Isso cria a variável{" "}
            <code>BLOB_STORE_ID</code> (ou <code>BLOB_READ_WRITE_TOKEN</code>, em stores antigos), onde as fotos ficam guardadas.
          </li>
        )}
        <li>
          Faça um novo deploy (aba Deployments, menu do último deploy, Redeploy) para o app enxergar as variáveis novas.
        </li>
      </ol>
    </main>
  );
}
