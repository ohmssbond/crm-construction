import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  return (
    <main className="p-8 font-mono">
      <h1 className="text-2xl font-bold mb-4">Supabase connection test</h1>
      {error ? (
        <p className="text-red-600">Error: {error.message}</p>
      ) : (
        <p className="text-green-600">
          Connected. Session: {data.session ? "active" : "none (expected)"}
        </p>
      )}
    </main>
  );
}
