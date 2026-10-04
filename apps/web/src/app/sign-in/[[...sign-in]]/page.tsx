import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthLayout heading="Sign in">
      <SignIn />
    </AuthLayout>
  );
}
