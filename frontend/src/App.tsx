import {
  type FormEvent,
  type ReactNode,
  useState,
} from "react";

import {
  ApiError,
  buildShortUrl,
  createShortUrl,
  getUrlStats,
  type CreatedUrl,
  type UrlStats,
} from "./api.js";

type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un error inesperado";
}

function normalizeCode(code: string): string {
  return code.trim();
}

function Card({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <p className="text-xs font-semibold tracking-[0.18em] text-indigo-600 uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  ...inputProps
}: {
  id: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {hint === undefined ? null : (
        <span className="ml-2 text-xs text-slate-400">{hint}</span>
      )}
      <input
        {...inputProps}
        id={id}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
      />
    </label>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
      role="alert"
    >
      {message}
    </p>
  );
}

function App() {
  const [originalUrl, setOriginalUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [createState, setCreateState] = useState<AsyncState<CreatedUrl>>({
    status: "idle",
  });
  const [resolveCode, setResolveCode] = useState("");
  const [resolveError, setResolveError] = useState("");
  const [statsCode, setStatsCode] = useState("");
  const [statsState, setStatsState] = useState<AsyncState<UrlStats>>({
    status: "idle",
  });

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateState({ status: "loading" });

    try {
      const result = await createShortUrl(
        originalUrl.trim(),
        alias.trim(),
      );
      setCreateState({ status: "success", data: result });
      setStatsCode(result.code);
    } catch (error) {
      setCreateState({
        status: "error",
        message: getErrorMessage(error),
      });
    }
  }

  function handleResolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normalizeCode(resolveCode);

    if (code.length < 3) {
      setResolveError("Ingresá un código de al menos 3 caracteres");
      return;
    }

    setResolveError("");
    window.open(buildShortUrl(code), "_blank", "noopener,noreferrer");
  }

  async function handleStats(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normalizeCode(statsCode);
    setStatsState({ status: "loading" });

    try {
      const result = await getUrlStats(code);
      setStatsState({ status: "success", data: result });
    } catch (error) {
      setStatsState({
        status: "error",
        message: getErrorMessage(error),
      });
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            <span className="size-2 rounded-full bg-indigo-500" />
            Tiny URL
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            URLs cortas, sin vueltas.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            Creá un enlace, abrí un código existente y consultá sus
            estadísticas desde un solo lugar.
          </p>
        </header>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Card
            eyebrow="Crear"
            title="Generar una URL corta"
            description="Usá un alias propio o dejalo vacío para generar un código automáticamente."
          >
            <form className="space-y-4" onSubmit={handleCreate}>
              <Field
                id="original-url"
                label="URL de destino"
                type="url"
                placeholder="https://example.com/articulo"
                required
                value={originalUrl}
                onChange={(event) => {
                  setOriginalUrl(event.target.value);
                }}
              />
              <Field
                id="alias"
                label="Alias"
                hint="opcional"
                placeholder="mi-enlace"
                minLength={3}
                maxLength={50}
                pattern="[a-zA-Z0-9_-]+"
                value={alias}
                onChange={(event) => {
                  setAlias(event.target.value);
                }}
              />
              <button
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={createState.status === "loading"}
                type="submit"
              >
                {createState.status === "loading"
                  ? "Generando..."
                  : "Generar URL"}
              </button>
            </form>

            {createState.status === "error" ? (
              <ErrorMessage message={createState.message} />
            ) : null}

            {createState.status === "success" ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                  URL creada
                </p>
                <a
                  className="mt-2 block break-all text-sm font-medium text-emerald-950 underline decoration-emerald-300 underline-offset-4"
                  href={createState.data.shortUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {createState.data.shortUrl}
                </a>
              </div>
            ) : null}
          </Card>

          <div className="grid gap-5">
            <Card
              eyebrow="Resolver"
              title="Abrir por código"
              description="Ingresá el código o alias para abrir el destino en otra pestaña."
            >
              <form className="flex gap-3" onSubmit={handleResolve}>
                <input
                  aria-label="Código para abrir"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  placeholder="ejemplo"
                  value={resolveCode}
                  onChange={(event) => {
                    setResolveCode(event.target.value);
                  }}
                />
                <button
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                  type="submit"
                >
                  Abrir
                </button>
              </form>
              {resolveError === "" ? null : (
                <ErrorMessage message={resolveError} />
              )}
            </Card>

            <Card
              eyebrow="Analytics"
              title="Consultar estadísticas"
              description="Revisá el total de clicks y la fecha del último acceso."
            >
              <form className="flex gap-3" onSubmit={handleStats}>
                <input
                  aria-label="Código para estadísticas"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  placeholder="ejemplo"
                  value={statsCode}
                  onChange={(event) => {
                    setStatsCode(event.target.value);
                  }}
                />
                <button
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={statsState.status === "loading"}
                  type="submit"
                >
                  {statsState.status === "loading" ? "Buscando..." : "Ver"}
                </button>
              </form>

              {statsState.status === "error" ? (
                <ErrorMessage message={statsState.message} />
              ) : null}

              {statsState.status === "success" ? (
                <dl className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-100 p-4">
                    <dt className="text-xs font-medium text-slate-500">
                      Total de clicks
                    </dt>
                    <dd className="mt-2 text-3xl font-semibold text-slate-950">
                      {statsState.data.totalClicks}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-4">
                    <dt className="text-xs font-medium text-slate-500">
                      Último acceso
                    </dt>
                    <dd className="mt-2 text-sm font-semibold text-slate-950">
                      {statsState.data.lastClick === null
                        ? "Sin accesos"
                        : new Intl.DateTimeFormat("es-AR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(
                            new Date(statsState.data.lastClick),
                          )}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

export { App };
