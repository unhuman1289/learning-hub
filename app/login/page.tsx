import AccountForm from "../account-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string }> }) {
  const params = await searchParams;
  return <AccountForm mode="login" emailVerified={params.verified === "1"} />;
}
