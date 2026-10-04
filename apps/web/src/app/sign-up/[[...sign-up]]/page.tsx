import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <AuthLayout heading="Create your account">
      <SignUp />
    </AuthLayout>
  );
}
