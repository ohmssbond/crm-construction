import { redirect } from "next/navigation";

// Role-aware home lives in proxy.ts; this is the render-time fallback.
export default function Home() {
  redirect("/dashboard");
}
