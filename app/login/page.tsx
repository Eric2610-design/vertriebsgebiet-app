// app/login/page.tsx
import LoginClient from "./LoginClient";

type SP = {
  next?: string;
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const sp = searchParams ? await searchParams : {};
  const next = sp?.next ?? "/map";
  return <LoginClient nextPath={next} />;
}
